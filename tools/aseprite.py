"""Minimal Aseprite (.aseprite/.ase) decoder -> flattened RGBA PIL image per frame.

Supports: RGBA/grayscale/indexed colour depth, compressed image cels (type 2),
linked cels (type 1), layer opacity/visibility, normal blend mode.
Enough to recover assets that ship only as Aseprite sources.
"""
import struct, zlib
from PIL import Image


class R:
    def __init__(self, b, o=0):
        self.b = b; self.o = o
    def u8(self):
        v = self.b[self.o]; self.o += 1; return v
    def u16(self):
        v = struct.unpack_from('<H', self.b, self.o)[0]; self.o += 2; return v
    def i16(self):
        v = struct.unpack_from('<h', self.b, self.o)[0]; self.o += 2; return v
    def u32(self):
        v = struct.unpack_from('<I', self.b, self.o)[0]; self.o += 4; return v
    def skip(self, n):
        self.o += n
    def string(self):
        n = self.u16(); s = self.b[self.o:self.o + n]; self.o += n
        return s.decode('utf8', 'replace')


def load(path):
    data = open(path, 'rb').read()
    r = R(data)
    r.u32()                      # file size
    assert r.u16() == 0xA5E0, 'not an aseprite file'
    nframes = r.u16()
    W, H = r.u16(), r.u16()
    depth = r.u16()              # 32 rgba / 16 gray / 8 indexed
    r.u32()                      # flags
    r.u16()                      # deprecated speed
    r.u32(); r.u32()
    transparent_index = r.u8()
    r.skip(3)
    r.u16()                      # ncolors
    r.skip(94)                   # pixel w/h + grid + reserved -> to 128 byte header

    bpp = {32: 4, 16: 2, 8: 1}[depth]
    palette = [(0, 0, 0, 0)] * 256
    layers = []
    frames = []
    tags = []

    for _ in range(nframes):
        fstart = r.o
        fsize = r.u32()
        assert r.u16() == 0xF1FA
        oldn = r.u16()
        duration = r.u16()
        r.skip(2)
        newn = r.u32()
        nchunks = newn if newn else oldn
        cels = []
        for _c in range(nchunks):
            cstart = r.o
            csize = r.u32()
            ctype = r.u16()
            if ctype == 0x2004:              # layer
                flags = r.u16(); ltype = r.u16(); r.u16(); r.u16(); r.u16()
                blend = r.u16(); opacity = r.u8(); r.skip(3); name = r.string()
                layers.append({'visible': bool(flags & 1), 'opacity': opacity,
                               'blend': blend, 'name': name, 'type': ltype})
            elif ctype == 0x2005:            # cel
                li = r.u16(); x = r.i16(); y = r.i16(); op = r.u8()
                ct = r.u16(); r.skip(7)
                if ct in (0, 2):
                    cw, ch = r.u16(), r.u16()
                    raw = r.b[r.o:cstart + csize]
                    if ct == 2:
                        raw = zlib.decompress(raw)
                    cels.append({'layer': li, 'x': x, 'y': y, 'op': op,
                                 'w': cw, 'h': ch, 'raw': raw})
                elif ct == 1:
                    link = r.u16()
                    cels.append({'layer': li, 'link': link, 'x': x, 'y': y, 'op': op})
            elif ctype == 0x2019:            # palette
                r.u32(); first = r.u32(); last = r.u32(); r.skip(8)
                for i in range(first, last + 1):
                    fl = r.u16(); rr = r.u8(); gg = r.u8(); bb = r.u8(); aa = r.u8()
                    if fl & 1:
                        r.string()
                    palette[i] = (rr, gg, bb, aa)
            elif ctype == 0x2018:            # tags
                n = r.u16(); r.skip(8)
                for i in range(n):
                    f0 = r.u16(); f1 = r.u16(); r.u8(); r.skip(8); r.skip(3); r.u8()
                    tags.append({'from': f0, 'to': f1, 'name': r.string()})
            r.o = cstart + csize
        frames.append({'cels': cels, 'duration': duration})
        r.o = fstart + fsize

    def cel_rgba(cel):
        w, h, raw = cel['w'], cel['h'], cel['raw']
        if depth == 32:
            return Image.frombytes('RGBA', (w, h), raw[:w * h * 4])
        if depth == 8:
            out = bytearray(w * h * 4)
            for i, p in enumerate(raw[:w * h]):
                c = (0, 0, 0, 0) if p == transparent_index else palette[p]
                out[i * 4:i * 4 + 4] = bytes(c)
            return Image.frombytes('RGBA', (w, h), bytes(out))
        out = bytearray(w * h * 4)
        for i in range(w * h):
            v = raw[i * 2]; a = raw[i * 2 + 1]
            out[i * 4:i * 4 + 4] = bytes((v, v, v, a))
        return Image.frombytes('RGBA', (w, h), bytes(out))

    imgs = []
    for fi, f in enumerate(frames):
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for cel in f['cels']:
            if 'link' in cel:
                src = frames[cel['link']]
                m = [c for c in src['cels'] if c['layer'] == cel['layer'] and 'raw' in c]
                if not m:
                    continue
                cel = dict(m[0], x=cel['x'], y=cel['y'], op=cel['op'])
            lay = layers[cel['layer']] if cel['layer'] < len(layers) else {'visible': True, 'opacity': 255}
            if not lay['visible']:
                continue
            im = cel_rgba(cel)
            a = int(cel['op']) * int(lay['opacity']) / (255 * 255)
            if a < 0.999:
                al = im.getchannel('A').point(lambda v: int(v * a))
                im.putalpha(al)
            canvas.alpha_composite(im, (cel['x'], cel['y']))
        imgs.append(canvas)
    return {'size': (W, H), 'frames': imgs, 'tags': tags,
            'durations': [f['duration'] for f in frames],
            'layers': [l['name'] for l in layers]}


if __name__ == '__main__':
    import sys
    d = load(sys.argv[1])
    print(d['size'], len(d['frames']), 'frames; layers:', d['layers'], '; tags:', [t['name'] for t in d['tags']])
    if len(sys.argv) > 2:
        d['frames'][0].save(sys.argv[2])

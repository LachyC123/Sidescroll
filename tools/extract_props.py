#!/usr/bin/env python3
"""Find whole decorative objects inside each biome's prop and tile sheets.

Section 7 is explicit that decoration must be composed as landmarks, clusters
and negative space rather than scattered filler, and that "each repeated object
needs a world reason". That is only possible if the game knows about *objects* --
a whole gravestone, barrel, tree or lamp -- rather than about loose 16x16 cells
chopped out of one.

So instead of slicing prop sheets on a grid, this walks the alpha channel and
labels connected components, then classifies each object by size and by whether
its mass sits low (a thing that stands on the ground) or high (a thing that
hangs from a ceiling).

    python3 tools/extract_props.py     # -> game/data/props.json
"""
import json
import os
import sys
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "game", "assets", "env")
OUT = os.path.join(ROOT, "game", "data", "props.json")

MIN_W, MIN_H = 6, 6
MAX_W, MAX_H = 128, 160
MAX_PER_SHEET = 90


def components(im):
    """8-connected components of the opaque pixels."""
    w, h = im.size
    a = im.getchannel("A").load()
    seen = bytearray(w * h)
    out = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or a[sx, sy] < 12:
                continue
            q = deque([(sx, sy)])
            seen[sy * w + sx] = 1
            x0 = x1 = sx
            y0 = y1 = sy
            n = 0
            while q:
                x, y = q.popleft()
                n += 1
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] \
                           and a[nx, ny] >= 12:
                            seen[ny * w + nx] = 1
                            q.append((nx, ny))
            out.append((x0, y0, x1 - x0 + 1, y1 - y0 + 1, n))
    return out


def mass_split(im, box):
    """Fraction of the object's opaque mass in its lower half."""
    x, y, w, h = box
    a = im.crop((x, y, x + w, y + h)).getchannel("A")
    px = a.load()
    lo = hi = 0
    for j in range(h):
        for i in range(w):
            if px[i, j] >= 12:
                if j >= h / 2: lo += 1
                else: hi += 1
    t = lo + hi
    return (lo / t) if t else 0.5


def classify_sheet(path, sheet_ref):
    im = Image.open(path).convert("RGBA")
    objs = []
    for (x, y, w, h, n) in components(im):
        if w < MIN_W or h < MIN_H or w > MAX_W or h > MAX_H:
            continue
        density = n / float(w * h)
        if density < 0.10:            # a stray outline, not an object
            continue
        low = mass_split(im, (x, y, w, h))
        kind = ("standing" if low >= 0.52 else
                "hanging" if low <= 0.36 else "floating")
        # rough size band, so composition can pick a landmark vs a small dressing
        band = ("large" if (w >= 40 or h >= 56) else
                "medium" if (w >= 20 or h >= 24) else "small")
        objs.append({"sheet": sheet_ref, "x": x, "y": y, "w": w, "h": h,
                     "kind": kind, "band": band,
                     "density": round(density, 3)})
    # biggest first, so a truncated list keeps the landmarks
    objs.sort(key=lambda o: -(o["w"] * o["h"]))
    return objs[:MAX_PER_SHEET]


def main():
    out = {}
    for biome in sorted(os.listdir(ASSETS)):
        bdir = os.path.join(ASSETS, biome)
        if not os.path.isdir(bdir):
            continue
        objs = []
        for f in sorted(os.listdir(bdir)):
            if not f.endswith(".png"):
                continue
            if f.startswith("bg") or f == "fg.png":
                continue          # parallax art, not placeable objects
            ref = f"env/{biome}/{f}"
            found = classify_sheet(os.path.join(bdir, f), ref)
            if f == "tiles.png":
                # the tileset's own loose objects are useful, but the ground blob
                # itself is one huge component -- drop anything that big
                found = [o for o in found if o["w"] <= 64 and o["h"] <= 80]
            objs.extend(found)
        objs.sort(key=lambda o: -(o["w"] * o["h"]))
        by_band = {"large": [], "medium": [], "small": []}
        for o in objs:
            by_band[o["band"]].append(o)
        out[biome] = {
            "all": objs[:160],
            "landmark": [o for o in by_band["large"] if o["kind"] == "standing"][:24],
            "standing": [o for o in objs if o["kind"] == "standing"][:90],
            "hanging": [o for o in objs if o["kind"] == "hanging"][:40],
        }
        print(f"  {biome:12} {len(objs):4} objects  "
              f"landmark={len(out[biome]['landmark']):3} "
              f"standing={len(out[biome]['standing']):3} "
              f"hanging={len(out[biome]['hanging']):3}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

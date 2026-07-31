#!/usr/bin/env python3
"""Derive an autotiling map for every biome tileset by alpha profile.

The 15 environment packs do not share a tile layout, so instead of hand-indexing
each one we classify every 16x16 cell by how its alpha is distributed and then
look for the classic "grass cap over solid body" blob. The result is a per-biome
tile role table the runtime autotiler consumes.

    python3 tools/classify_tiles.py            # write game/data/tilesets.json
    python3 tools/classify_tiles.py --preview  # also render verification rooms
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "game", "assets", "env")
OUTFILE = os.path.join(ROOT, "game", "data", "tilesets.json")
T = 16

# Hand-checked corrections. The detector picks the blob it is most confident in;
# where a pack hides a better one (or the auto pick clashes with the chapter's
# material palette) the biome is pinned here after looking at the preview render.
OVERRIDES = {
    # biome: dict(blob=(col, cap row, width, body depth), body=(col,row,w,h))
    # `body` optionally points the interior fill at a different, more uniform
    # patch of the sheet than the blob's own columns.
    "high_forest": dict(blob=(0, 1, 4, 3)),    # grass cap over dirt, not the chest grid
    "prison":      dict(blob=(0, 1, 5, 3)),    # cyan-lit brick, not the cell bars
    "temple":      dict(blob=(1, 1, 4, 1), body=(9, 1, 4, 5)),
    "purple_bay":  dict(blob=(0, 3, 4, 3)),    # coastal rock shelf under grass
    "swamp":       dict(blob=(0, 1, 5, 3)),    # moss cap over root mass
    "monastery":   dict(blob=(0, 1, 5, 5)),    # cornice over diamond wall
    "deep_cave":   dict(blob=(0, 1, 5, 3)),
    "deadwind":    dict(blob=(0, 1, 5, 3)),
    "sewers":      dict(blob=(0, 1, 5, 3)),
    "mansion":     dict(blob=(7, 0, 5, 5)),    # uniform brick mass, not the window row
    "purple_bay":  dict(blob=(0, 3, 4, 2)),    # stop above the campfire row
    # `mine` is deliberately left on auto: the Lonely Mine tileset is forest
    # material, not mining structures (see docs/asset_issues.md), so the dark
    # overgrowth blob the detector finds is the correct ground for that pack.
}


def coverage(img, x, y, w, h):
    a = img.crop((x, y, x + w, y + h)).getchannel("A")
    hist = a.histogram()
    total = w * h
    opaque = sum(hist[200:])
    return opaque / float(total) if total else 0.0


def profile(img, cx, cy):
    """Return the alpha fingerprint of one 16x16 tile."""
    x, y = cx * T, cy * T
    return {
        "all": coverage(img, x, y, T, T),
        "top": coverage(img, x, y, T, 3),
        "bot": coverage(img, x, y + T - 3, T, 3),
        "left": coverage(img, x, y, 3, T),
        "right": coverage(img, x + T - 3, y, 3, T),
        "core": coverage(img, x + 4, y + 4, 8, 8),
    }


def classify(p):
    """Coarse role for one tile from its fingerprint."""
    if p["all"] < 0.04:
        return "empty"
    if p["all"] > 0.93:
        return "solid"
    # a cap has a filled bottom/body and a broken top
    if p["bot"] > 0.85 and p["core"] > 0.7 and p["top"] < 0.75:
        return "cap"
    if p["all"] > 0.55:
        return "chunk"
    return "detail"


def find_blob(grid, cols, rows, require_caps):
    """Find the best 'row of caps sitting on rows of solid body' region.

    Anokolisa consistently places the main ground blob near the top-left of a
    tileset and the decorative grids (chests, pots, mushrooms) further right and
    down, so position is part of the score. Body rows must be genuinely solid --
    that is what stops a row of chests being mistaken for terrain.
    """
    best = None
    for r in range(rows - 1):
        c = 0
        while c < cols:
            if grid[r][c] not in ("cap", "solid"):
                c += 1
                continue
            c2 = c
            while c2 < cols and grid[r][c2] in ("cap", "solid"):
                c2 += 1
            w = c2 - c
            if w >= 3:
                caps = sum(1 for x in range(c, c2) if grid[r][x] == "cap")
                if require_caps and caps < max(2, w // 3):
                    c = c2
                    continue
                # count strictly-solid rows directly beneath the run
                depth = 0
                rr = r + 1
                while rr < rows:
                    solid = sum(1 for x in range(c, c2) if grid[rr][x] == "solid")
                    if solid >= max(2, w - 1):
                        depth += 1
                        rr += 1
                    else:
                        break
                if depth >= 1:
                    score = (w * 2 + depth * 3 + caps * 3) - (c + r) * 1.5
                    if best is None or score > best[0]:
                        best = (score, c, r, w, depth)
            c = c2
    return best


def build(biome, path):
    img = Image.open(path).convert("RGBA")
    W, H = img.size
    cols, rows = W // T, H // T
    grid = [[classify(profile(img, c, r)) for c in range(cols)] for r in range(rows)]

    ov = OVERRIDES.get(biome)
    if ov:
        c, r, w, depth = ov["blob"]
        best = (0, c, r, w, depth)
    else:
        # prefer a blob with a real broken-top cap row; interior brick packs
        # (prison, mansion, sewers) legitimately have flat solid tops, so fall
        # back to allowing those rather than failing the biome.
        best = find_blob(grid, cols, rows, require_caps=True)
        if best is None:
            best = find_blob(grid, cols, rows, require_caps=False)
    if best is None:
        return None, grid, (cols, rows)
    _, c0, r0, w, depth = best

    left, right = c0, c0 + w - 1
    mid = c0 + w // 2
    # a fill row deep enough to be pure interior
    body_r = r0 + 1
    deep_r = r0 + min(depth, 2)
    bot_r = r0 + depth

    def idx(cx, cy):
        return cy * cols + cx

    roles = {
        "cap_left":   idx(left, r0),
        "cap":        idx(mid, r0),
        "cap_right":  idx(right, r0),
        "body_left":  idx(left, body_r),
        "body":       idx(mid, deep_r),
        "body_right": idx(right, body_r),
        "bot_left":   idx(left, bot_r),
        "bot":        idx(mid, bot_r),
        "bot_right":  idx(right, bot_r),
    }
    # extra cap variants across the run give surface variety without new art
    roles["cap_vars"] = [idx(x, r0) for x in range(left, right + 1)
                         if grid[r0][x] in ("cap", "solid")]
    roles["body_vars"] = [idx(x, y) for y in range(body_r, bot_r + 1)
                          for x in range(left + 1, right)
                          if grid[y][x] in ("solid", "chunk")] or [roles["body"]]

    if ov and ov.get("body"):
        # pull the interior fill from a separate uniform patch
        bc, br, bw, bh = ov["body"]
        fill = [idx(x, y) for y in range(br, br + bh) for x in range(bc, bc + bw)
                if grid[y][x] == "solid"]
        if fill:
            roles["body"] = fill[len(fill) // 2]
            roles["body_vars"] = fill
            roles["body_left"] = roles["body_right"] = roles["body"]

    # decorative singles: small detail tiles anywhere outside the blob
    details = [idx(c, r) for r in range(rows) for c in range(cols)
               if grid[r][c] == "detail"
               and not (left <= c <= right and r0 <= r <= bot_r)]

    return {
        "image": f"env/{biome}/tiles.png",
        "cols": cols, "rows": rows, "tile": T,
        "blob": {"col": c0, "row": r0, "w": w, "depth": depth},
        "roles": roles,
        "details": details[:64],
    }, grid, (cols, rows)


def preview(biome, ts, path, out):
    """Render a small room with the derived roles so the pick can be eyeballed."""
    img = Image.open(path).convert("RGBA")
    cols = ts["cols"]

    def tile(i):
        cx, cy = i % cols, i // cols
        return img.crop((cx * T, cy * T, cx * T + T, cy * T + T))

    W, H = 24, 12
    room = Image.new("RGBA", (W * T, H * T), (24, 20, 32, 255))
    R = ts["roles"]
    ground = 8

    def put(i, x, y):
        room.alpha_composite(tile(i), (x * T, y * T))

    for x in range(W):
        role = "cap"
        if x == 0:
            role = "cap_left"
        elif x == W - 1:
            role = "cap_right"
        put(R[role], x, ground)
        for y in range(ground + 1, H - 1):
            put(R["body_left"] if x == 0 else R["body_right"] if x == W - 1 else R["body"], x, y)
        put(R["bot_left"] if x == 0 else R["bot_right"] if x == W - 1 else R["bot"], x, H - 1)
    # a floating ledge, to check cap/left/right read at small scale
    for x in range(6, 11):
        role = "cap_left" if x == 6 else "cap_right" if x == 10 else "cap"
        put(R[role], x, 4)
        put(R["bot_left"] if x == 6 else R["bot_right"] if x == 10 else R["bot"], x, 5)
    room = room.resize((W * T * 3, H * T * 3), Image.NEAREST)
    room.convert("RGB").save(out)


def main():
    do_preview = "--preview" in sys.argv
    out = {}
    pv = os.path.join(ROOT, "build", "tileset_preview")
    if do_preview:
        os.makedirs(pv, exist_ok=True)
    for biome in sorted(os.listdir(ASSETS)):
        path = os.path.join(ASSETS, biome, "tiles.png")
        if not os.path.isfile(path):
            continue
        ts, grid, (cols, rows) = build(biome, path)
        if ts is None:
            print(f"  !! {biome}: no ground blob found")
            continue
        out[biome] = ts
        b = ts["blob"]
        print(f"  {biome:12} {cols}x{rows} tiles  blob=({b['col']},{b['row']}) "
              f"w={b['w']} depth={b['depth']}  details={len(ts['details'])}")
        if do_preview:
            preview(biome, ts, path, os.path.join(pv, biome + ".png"))
    os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)
    with open(OUTFILE, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
    print(f"wrote {OUTFILE} ({len(out)} biomes)")


if __name__ == "__main__":
    main()

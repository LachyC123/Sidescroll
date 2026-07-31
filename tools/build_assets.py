#!/usr/bin/env python3
"""Gate 0 asset pipeline for CROWNLESS.

Reads the untouched collection ZIPs, recovers Aseprite-only art, re-anchors every
character animation onto a shared feet baseline, copies environment art, and
writes the manifest / coverage / issue documents the master plan requires.

    python3 tools/build_assets.py

Source ZIPs are never modified. Everything it writes lands in game/assets and docs/.
"""
import json
import os
import shutil
import sys
import zipfile
from collections import OrderedDict

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aseprite
from packs import PACKS, ENVIRONMENTS, PLAYER, MOBS, HUD, PACK_NOTES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "build", "_source")
OUT = os.path.join(ROOT, "game", "assets")
DOCS = os.path.join(ROOT, "docs")

# Output character cell and the anchor inside it. Every clip is re-composited so
# the character's feet land on ANCHOR and its body centre on ANCHOR_X, which is
# what stops the sprite jumping when clips with different source canvases swap.
CELL_W, CELL_H = 96, 80
ANCHOR_X, ANCHOR_Y = 44, 66

# clip -> (body centre x, feet y) measured in the *source* cell.
PLAYER_ANCHORS = {
    "idle":       (38.5, 64),
    "run":        (44.6, 68),
    "attack1":    (48.5, 64),
    "dead":       (28.0, 48),
    "jump_start": (29.5, 64),
    "jump_all":   (29.5, 64),
    "jump_end":   (29.5, 64),
}

MANIFEST = {"packs": OrderedDict(), "player": {}, "mobs": {}, "environments": {},
            "hud": {}, "generated_by": "tools/build_assets.py"}
ISSUES = []


def log(msg):
    print(msg, flush=True)


# --------------------------------------------------------------------- extract
def extract_all():
    if os.path.isdir(SRC):
        shutil.rmtree(SRC)
    os.makedirs(SRC)
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith(".zip"):
            continue
        stem = name[:-4]
        if stem not in PACKS:
            ISSUES.append(f"ZIP `{name}` is not in the known pack table; skipped.")
            continue
        dest = os.path.join(SRC, stem)
        with zipfile.ZipFile(os.path.join(ROOT, name)) as z:
            z.extractall(dest)
        pid, disp, inner = PACKS[stem]
        root = os.path.join(dest, inner)
        if not os.path.isdir(root):
            # a couple of ZIPs extract flat rather than into an inner folder
            root = dest
        files = sum(len(f) for _, _, f in os.walk(root))
        terms = None
        for cand in ("Terms.txt", "Autor_note.txt", "Author_note.txt"):
            if os.path.isfile(os.path.join(root, cand)):
                terms = cand
                break
        if terms is None:
            ISSUES.append(f"Pack `{disp}` ships no licence/terms text file.")
        MANIFEST["packs"][pid] = {"zip": name, "display": disp, "root": root,
                                  "files": files, "terms_file": terms}
        log(f"  extracted {disp:20} ({files} files, terms={terms})")
    return {pid: m["root"] for pid, m in MANIFEST["packs"].items()}


def read_image(root, rel):
    """Load a PNG, or transparently recover it from its Aseprite source."""
    p = os.path.join(root, rel)
    if os.path.isfile(p):
        return Image.open(p).convert("RGBA")
    ase = os.path.splitext(p)[0] + ".aseprite"
    if os.path.isfile(ase):
        return aseprite.load(ase)["frames"][0]
    return None


# ------------------------------------------------------------------ characters
def slice_frames(sheet, fw, fh):
    W, H = sheet.size
    n = W // fw
    if W % fw:
        ISSUES.append(f"sheet {W}x{H} is not an exact multiple of frame width {fw}")
    return [sheet.crop((i * fw, 0, (i + 1) * fw, min(fh, H))) for i in range(n)]


def reanchor(frames, cx, cy):
    """Re-composite frames into the shared cell so (cx, cy) lands on the anchor."""
    out = []
    dx = int(round(ANCHOR_X - cx))
    dy = int(round(ANCHOR_Y - cy))
    for f in frames:
        cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        cell.alpha_composite(f, (dx, dy))
        out.append(cell)
    return out


def write_strip(frames, path):
    if not frames:
        return None
    w, h = frames[0].size
    strip = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.alpha_composite(f, (i * w, 0))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    strip.save(path)
    return {"file": os.path.relpath(path, OUT).replace(os.sep, "/"),
            "frames": len(frames), "fw": w, "fh": h}


def build_player(roots):
    root = roots["high_forest"]
    clips = {}
    for clip, (rel, fw, fh, fps) in PLAYER.items():
        sheet = read_image(root, rel)
        if sheet is None:
            ISSUES.append(f"player clip `{clip}` missing at {rel}")
            continue
        frames = slice_frames(sheet, fw, fh)
        cx, cy = PLAYER_ANCHORS[clip]
        frames = reanchor(frames, cx, cy)
        meta = write_strip(frames, os.path.join(OUT, "player", clip + ".png"))
        meta.update(fps=fps, loop=clip in ("idle", "run"))
        clips[clip] = meta
        log(f"  player/{clip:11} {meta['frames']} frames @ {fps}fps")

    # The collection has no hurt frames. Section 5 allows a flash/knockback
    # stand-in; make it an explicit derived clip rather than a silent reuse.
    idle = Image.open(os.path.join(OUT, "player", "idle.png")).convert("RGBA")
    f0 = idle.crop((0, 0, CELL_W, CELL_H))
    hurt = Image.new("RGBA", (CELL_W * 2, CELL_H), (0, 0, 0, 0))
    hurt.alpha_composite(f0, (0, 0))
    tinted = f0.copy()
    px = tinted.load()
    for y in range(CELL_H):
        for x in range(CELL_W):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (255, 210, 210, a)
    hurt.alpha_composite(tinted, (CELL_W, 0))
    hurt.save(os.path.join(OUT, "player", "hurt.png"))
    clips["hurt"] = {"file": "player/hurt.png", "frames": 2, "fw": CELL_W,
                     "fh": CELL_H, "fps": 12, "loop": False, "derived": True}
    ISSUES.append("Player has no authored hurt/land/interact/heal frames in the "
                  "collection. `hurt` is a derived flash stand-in (Section 5 "
                  "permits this before final); Appendix B still lists these as "
                  "required before release.")

    MANIFEST["player"] = {"cell": [CELL_W, CELL_H], "anchor": [ANCHOR_X, ANCHOR_Y],
                          "clips": clips}
    return clips


def build_mobs(roots):
    for mid, spec in MOBS.items():
        root = roots[spec["pack"]]
        clips = {}
        for clip, (rel, fw, fh, fps, loop) in spec["clips"].items():
            sheet = read_image(root, rel)
            if sheet is None:
                ISSUES.append(f"mob `{mid}` clip `{clip}` missing at {rel}")
                continue
            frames = slice_frames(sheet, fw, fh)
            # Mobs keep their own cell but are anchored feet-to-cell-bottom so
            # the game can place them by their ground point.
            trimmed = []
            for f in frames:
                trimmed.append(f)
            meta = write_strip(trimmed, os.path.join(OUT, "enemies", mid, clip + ".png"))
            if meta:
                meta.update(fps=fps, loop=loop)
                clips[clip] = meta
        # measure the feet line once per mob from its idle/walk clip
        ref = clips.get("idle") or clips.get("walk") or next(iter(clips.values()))
        img = Image.open(os.path.join(OUT, "enemies", mid, [k for k, v in clips.items()
                                                            if v is ref][0] + ".png"))
        bb = img.getbbox()
        MANIFEST["mobs"][mid] = {"pack": spec["pack"], "clips": clips,
                                 "content_bottom": bb[3] if bb else ref["fh"]}
        log(f"  enemies/{mid:13} {len(clips)} clips")


# ----------------------------------------------------------------- environment
def copy_png(src_img, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    src_img.save(dest)
    return {"file": os.path.relpath(dest, OUT).replace(os.sep, "/"),
            "w": src_img.size[0], "h": src_img.size[1]}


def build_environments(roots):
    for bid, spec in ENVIRONMENTS.items():
        root = roots[bid]
        entry = {"tiles": None, "props": [], "bg": [], "fg": None, "extra": {}}
        img = read_image(root, spec["tiles"])
        if img is None:
            ISSUES.append(f"biome `{bid}` has no tileset at {spec['tiles']}")
        else:
            entry["tiles"] = copy_png(img, os.path.join(OUT, "env", bid, "tiles.png"))
        for i, rel in enumerate(spec.get("props", [])):
            img = read_image(root, rel)
            if img is None:
                ISSUES.append(f"biome `{bid}` prop sheet missing: {rel}")
                continue
            entry["props"].append(copy_png(img, os.path.join(OUT, "env", bid, f"props{i}.png")))
        for i, rel in enumerate(spec.get("bg", [])):
            img = read_image(root, rel)
            if img is None:
                ISSUES.append(f"biome `{bid}` background missing: {rel}")
                continue
            entry["bg"].append(copy_png(img, os.path.join(OUT, "env", bid, f"bg{i}.png")))
        if spec.get("fg"):
            img = read_image(root, spec["fg"])
            if img is not None:
                entry["fg"] = copy_png(img, os.path.join(OUT, "env", bid, "fg.png"))
        for i, rel in enumerate(spec.get("trees", [])):
            img = read_image(root, rel)
            if img is not None:
                entry["extra"][f"tree{i}"] = copy_png(
                    img, os.path.join(OUT, "env", bid, f"tree{i}.png"))
        # Aseprite-only recoveries
        for outname, rel in (spec.get("ase") or {}).items():
            p = os.path.join(root, rel)
            if not os.path.isfile(p):
                ISSUES.append(f"biome `{bid}` expected Aseprite source {rel}, not found")
                continue
            frame = aseprite.load(p)["frames"][0]
            dest = os.path.join(OUT, "env", bid, outname)
            rec = copy_png(frame, dest)
            rec["recovered_from_aseprite"] = rel
            if outname.startswith("bg"):
                entry["bg"].append(rec)
            else:
                entry["extra"][os.path.splitext(outname)[0]] = rec
            ISSUES.append(f"biome `{bid}`: `{rel}` ships only as an Aseprite source; "
                          f"recovered to {outname} by tools/aseprite.py.")
        for note in PACK_NOTES.get(bid, []):
            ISSUES.append(note)
        MANIFEST["environments"][bid] = entry
        log(f"  env/{bid:12} tiles={bool(entry['tiles'])} props={len(entry['props'])} "
            f"bg={len(entry['bg'])} fg={bool(entry['fg'])}")


def build_hud(roots):
    img = read_image(roots[HUD[0]], HUD[1])
    if img is None:
        ISSUES.append("HUD sheet missing from High Forest")
        return
    MANIFEST["hud"] = copy_png(img, os.path.join(OUT, "hud", "base.png"))


# ------------------------------------------------------------------- documents
def write_docs():
    os.makedirs(DOCS, exist_ok=True)
    with open(os.path.join(DOCS, "asset_manifest.json"), "w") as f:
        json.dump(MANIFEST, f, indent=1, sort_keys=True)

    rows = ["source_pack,category,normalized_path,width,height,frames,notes"]

    def row(pack, cat, meta, notes=""):
        rows.append(f"{pack},{cat},{meta.get('file','')},{meta.get('fw', meta.get('w',''))},"
                    f"{meta.get('fh', meta.get('h',''))},{meta.get('frames','')},{notes}")

    for clip, m in MANIFEST["player"]["clips"].items():
        row("high_forest", f"player/{clip}", m, "derived" if m.get("derived") else "")
    for mid, m in MANIFEST["mobs"].items():
        for clip, c in m["clips"].items():
            row(m["pack"], f"enemy/{mid}/{clip}", c)
    for bid, e in MANIFEST["environments"].items():
        if e["tiles"]:
            row(bid, "env/tiles", e["tiles"])
        for p in e["props"]:
            row(bid, "env/props", p)
        for b in e["bg"]:
            row(bid, "env/background", b,
                "recovered from aseprite" if b.get("recovered_from_aseprite") else "")
        if e["fg"]:
            row(bid, "env/foreground", e["fg"])
        for k, x in e["extra"].items():
            row(bid, f"env/{k}", x,
                "recovered from aseprite" if x.get("recovered_from_aseprite") else "")
    with open(os.path.join(DOCS, "asset_manifest.csv"), "w") as f:
        f.write("\n".join(rows) + "\n")

    with open(os.path.join(DOCS, "asset_issues.md"), "w") as f:
        f.write("# Asset issues\n\nGenerated by `tools/build_assets.py` from the local "
                "ZIP contents. Local files outrank storefront descriptions.\n\n")
        for i in sorted(set(ISSUES)):
            f.write(f"- {i}\n")

    with open(os.path.join(DOCS, "pack_coverage.md"), "w") as f:
        f.write("# Pack coverage\n\nAll 17 collection items, checked against the local "
                "ZIPs.\n\n| # | Pack | Files | Terms | Role in CROWNLESS |\n"
                "|---|---|---|---|---|\n")
        from chapters_meta import PACK_ROLE
        for i, (pid, m) in enumerate(MANIFEST["packs"].items(), 1):
            f.write(f"| {i} | {m['display']} | {m['files']} | "
                    f"{m['terms_file'] or '**none**'} | {PACK_ROLE.get(pid, '')} |\n")


def main():
    log("extracting collection ZIPs (originals untouched)…")
    roots = extract_all()
    log("normalising player…")
    build_player(roots)
    log("normalising enemies…")
    build_mobs(roots)
    log("copying environments…")
    build_environments(roots)
    build_hud(roots)
    log("writing docs…")
    write_docs()
    log(f"done. {len(MANIFEST['packs'])} packs, "
        f"{len(MANIFEST['mobs'])} mobs, {len(MANIFEST['environments'])} biomes, "
        f"{len(set(ISSUES))} recorded issues.")


if __name__ == "__main__":
    main()

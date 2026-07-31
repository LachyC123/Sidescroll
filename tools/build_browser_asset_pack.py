#!/usr/bin/env python3
"""Extract browser-usable media from the committed Legacy Fantasy ZIP archives.

The script never overwrites colliding files. It produces a deterministic manifest
and a small HTML asset museum so artwork can be reviewed before game integration.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "browser-assets"
MEDIA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ogg", ".mp3", ".wav", ".json", ".tmx", ".tsx"}


def slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-.")
    return value[:120] or "asset"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    media_dir = OUT / "media"
    media_dir.mkdir(parents=True)

    records: list[dict[str, object]] = []
    errors: list[dict[str, str]] = []
    archives = sorted(ROOT.glob("*.zip"), key=lambda p: p.name.lower())

    for archive in archives:
        pack = slug(archive.stem)
        try:
            with zipfile.ZipFile(archive) as zf:
                for info in sorted(zf.infolist(), key=lambda i: i.filename.lower()):
                    if info.is_dir():
                        continue
                    suffix = Path(info.filename).suffix.lower()
                    if suffix not in MEDIA_EXTENSIONS:
                        continue
                    destination = media_dir / pack / slug(Path(info.filename).name)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    if destination.exists():
                        destination = destination.with_name(f"{destination.stem}-{len(records)}{destination.suffix}")
                    with zf.open(info) as source, destination.open("wb") as target:
                        shutil.copyfileobj(source, target)
                    records.append({
                        "pack": archive.name,
                        "source": info.filename,
                        "path": destination.relative_to(OUT).as_posix(),
                        "type": suffix.lstrip("."),
                        "bytes": destination.stat().st_size,
                        "sha256": sha256(destination),
                    })
        except (zipfile.BadZipFile, OSError) as exc:
            errors.append({"archive": archive.name, "error": str(exc)})

    manifest = {
        "schema": 1,
        "archiveCount": len(archives),
        "assetCount": len(records),
        "errors": errors,
        "assets": records,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    images = [r for r in records if r["type"] in {"png", "jpg", "jpeg", "webp", "gif"}]
    cards = "\n".join(
        f'<figure><img loading="lazy" src="{r["path"]}" alt=""><figcaption>{r["pack"]}<br>{r["source"]}</figcaption></figure>'
        for r in images
    )
    html = f"""<!doctype html><meta charset='utf-8'><title>Legacy Fantasy Asset Museum</title>
<style>body{{margin:0;background:#10151d;color:#e7e2d5;font:14px system-ui}}header{{position:sticky;top:0;background:#10151dee;padding:18px;z-index:2}}main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:12px}}figure{{margin:0;background:#192330;padding:10px;border:1px solid #334455}}img{{width:100%;height:170px;object-fit:contain;image-rendering:pixelated;background:#0b1016}}figcaption{{font-size:11px;overflow-wrap:anywhere;margin-top:8px;color:#bfc9d2}}</style>
<header><strong>Legacy Fantasy Asset Museum</strong> — {len(images)} images from {len(archives)} archives</header><main>{cards}</main>"""
    (OUT / "index.html").write_text(html, encoding="utf-8")
    print(f"Extracted {len(records)} browser assets from {len(archives)} archives into {OUT}")
    if errors:
        raise SystemExit(f"Completed with {len(errors)} archive errors; inspect manifest.json")


if __name__ == "__main__":
    main()

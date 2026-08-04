#!/usr/bin/env python3
"""Gate 0 asset audit for the CROWNLESS project.

Scans every ZIP in the repository without modifying or extracting the originals.
Produces deterministic CSV/JSON manifests and human-readable reports in docs/audit/.
Uses only the Python standard library so it can run locally or in GitHub Actions.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import struct
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable

EXPECTED_PACKS = {
    "Legacy Enemy - Boar Warrior": "enemy",
    "Legacy Enemy - Wild Boar": "enemy",
    "Legacy Fantasy - Blood Mansion": "environment",
    "Legacy Fantasy - Castle Prison": "environment",
    "Legacy Fantasy - Deadwind Pass": "environment",
    "Legacy Fantasy - Deep Cave": "environment",
    "Legacy Fantasy - Dusk Woods": "environment",
    "Legacy Fantasy - Forgotten Cemetery": "environment",
    "Legacy Fantasy - Kingdom Fortress": "environment",
    "Legacy Fantasy - Lonely Mine": "environment",
    "Legacy Fantasy - Sewer Canals": "environment",
    "Legacy Fantay - Lost Glades": "environment",
    "Legacy-Fantasy - High Forest": "environment",
    "Legacy-Fantasy-VL.1 - Strange Temple": "environment",
    "Legacy-Fantasy-VL.3 - Muddy Swamp": "environment",
    "Legacy-Fantasy-VL.3 - Purple Bay": "environment",
    "Legacy-Fantasy-VL.3 - Scarlet Monastery": "environment",
}

LICENSE_WORDS = ("license", "licence", "terms", "copyright", "readme")
IMAGE_EXTENSIONS = {".png", ".gif", ".jpg", ".jpeg", ".webp", ".bmp"}
SOURCE_EXTENSIONS = {".ase", ".aseprite", ".psd", ".kra"}
DATA_EXTENSIONS = {".json", ".xml", ".tmx", ".tsx", ".csv"}
AUDIO_EXTENSIONS = {".wav", ".ogg", ".mp3", ".flac"}


@dataclass(frozen=True)
class AssetRow:
    pack: str
    zip_path: str
    internal_path: str
    extension: str
    category: str
    bytes: int
    compressed_bytes: int
    crc32: str
    sha256: str
    width: int | None
    height: int | None
    likely_license: bool
    likely_hidden: bool


def normalise_pack_name(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"\s+-\s+(?:update|\d+(?:\.\d+)*)$", "", stem, flags=re.I)
    return stem.strip()


def category_for(path: PurePosixPath) -> str:
    ext = path.suffix.lower()
    text = str(path).lower()
    if any(word in text for word in LICENSE_WORDS):
        return "license_or_readme"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in SOURCE_EXTENSIONS:
        return "source_art"
    if ext in DATA_EXTENSIONS:
        return "data_or_map"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    if ext in {".ttf", ".otf", ".woff", ".woff2"}:
        return "font"
    if not ext:
        return "unknown_no_extension"
    return "other"


def png_dimensions(data: bytes) -> tuple[int | None, int | None]:
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    return None, None


def sha256_stream(handle, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    while True:
        chunk = handle.read(chunk_size)
        if not chunk:
            break
        digest.update(chunk)
    return digest.hexdigest()


def inspect_zip(zip_path: Path, repo_root: Path) -> tuple[list[AssetRow], list[str]]:
    rows: list[AssetRow] = []
    problems: list[str] = []
    pack = normalise_pack_name(zip_path.name)
    try:
        with zipfile.ZipFile(zip_path) as archive:
            bad_member = archive.testzip()
            if bad_member:
                problems.append(f"Corrupt member in `{zip_path.name}`: `{bad_member}`")
            for info in sorted(archive.infolist(), key=lambda item: item.filename.lower()):
                if info.is_dir():
                    continue
                internal = PurePosixPath(info.filename)
                ext = internal.suffix.lower()
                try:
                    with archive.open(info) as handle:
                        if ext == ".png":
                            header = handle.read(24)
                            width, height = png_dimensions(header)
                            handle.seek(0)
                        else:
                            width, height = None, None
                        digest = sha256_stream(handle)
                except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
                    problems.append(f"Could not read `{zip_path.name}/{info.filename}`: {exc}")
                    continue
                rows.append(
                    AssetRow(
                        pack=pack,
                        zip_path=zip_path.relative_to(repo_root).as_posix(),
                        internal_path=internal.as_posix(),
                        extension=ext or "[none]",
                        category=category_for(internal),
                        bytes=info.file_size,
                        compressed_bytes=info.compress_size,
                        crc32=f"{info.CRC:08x}",
                        sha256=digest,
                        width=width,
                        height=height,
                        likely_license=any(word in str(internal).lower() for word in LICENSE_WORDS),
                        likely_hidden=any(part.startswith(".") or part == "__MACOSX" for part in internal.parts),
                    )
                )
    except zipfile.BadZipFile as exc:
        problems.append(f"Unreadable ZIP `{zip_path.name}`: {exc}")
    return rows, problems


def write_csv(path: Path, rows: Iterable[AssetRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(AssetRow.__dataclass_fields__)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def write_reports(output: Path, rows: list[AssetRow], problems: list[str], zip_paths: list[Path]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    write_csv(output / "asset_manifest.csv", rows)
    (output / "asset_manifest.json").write_text(
        json.dumps([asdict(row) for row in rows], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    by_pack: dict[str, list[AssetRow]] = defaultdict(list)
    by_hash: dict[str, list[AssetRow]] = defaultdict(list)
    for row in rows:
        by_pack[row.pack].append(row)
        by_hash[row.sha256].append(row)

    duplicates = {digest: matches for digest, matches in by_hash.items() if len(matches) > 1}
    duplicate_lines = ["# Duplicate Asset Report", "", "Files are grouped by identical SHA-256 content. Nothing is deleted automatically.", ""]
    if not duplicates:
        duplicate_lines.append("No byte-identical duplicate files were found.")
    else:
        for digest, matches in sorted(duplicates.items(), key=lambda item: (-len(item[1]), item[0])):
            duplicate_lines.append(f"## {digest} ({len(matches)} copies)")
            duplicate_lines.extend(f"- `{m.zip_path} :: {m.internal_path}`" for m in matches)
            duplicate_lines.append("")
    (output / "duplicate_report.md").write_text("\n".join(duplicate_lines) + "\n", encoding="utf-8")

    coverage_lines = ["# Pack Coverage", "", "Gate 0 inventory status for the 17 expected collection items.", "", "| Expected pack | Type | ZIP found | Files | PNGs | Source art | Licence/readme candidates |", "|---|---:|---:|---:|---:|---:|---:|"]
    discovered_names = {normalise_pack_name(path.name): path.name for path in zip_paths}
    for expected, pack_type in EXPECTED_PACKS.items():
        matching_name = next((name for name in discovered_names if name.lower().startswith(expected.lower())), None)
        pack_rows = by_pack.get(matching_name, []) if matching_name else []
        counts = Counter(row.category for row in pack_rows)
        coverage_lines.append(
            f"| {expected} | {pack_type} | {'Yes' if matching_name else '**NO**'} | {len(pack_rows)} | {counts['image']} | {counts['source_art']} | {counts['license_or_readme']} |"
        )
    (output / "pack_coverage.md").write_text("\n".join(coverage_lines) + "\n", encoding="utf-8")

    issue_lines = ["# Asset Issues", "", "Generated automatically. These findings require human review before normalisation or slicing.", ""]
    if problems:
        issue_lines.extend(f"- {problem}" for problem in problems)
    license_missing = [pack for pack, pack_rows in sorted(by_pack.items()) if not any(row.likely_license for row in pack_rows)]
    if license_missing:
        issue_lines.append("\n## No obvious licence/readme filename found")
        issue_lines.extend(f"- {pack}" for pack in license_missing)
    source_only = [row for row in rows if row.category == "source_art"]
    if source_only:
        issue_lines.append("\n## Source-art files requiring ASEPRITE/Krita/PSD inspection")
        issue_lines.extend(f"- `{row.zip_path} :: {row.internal_path}`" for row in source_only)
    hidden = [row for row in rows if row.likely_hidden]
    if hidden:
        issue_lines.append("\n## Hidden or operating-system metadata")
        issue_lines.extend(f"- `{row.zip_path} :: {row.internal_path}`" for row in hidden[:100])
        if len(hidden) > 100:
            issue_lines.append(f"- …and {len(hidden) - 100} more")
    (output / "asset_issues.md").write_text("\n".join(issue_lines) + "\n", encoding="utf-8")

    summary = {
        "zip_count": len(zip_paths),
        "file_count": len(rows),
        "pack_count": len(by_pack),
        "categories": dict(sorted(Counter(row.category for row in rows).items())),
        "extensions": dict(sorted(Counter(row.extension for row in rows).items())),
        "duplicate_hash_groups": len(duplicates),
        "problems": len(problems),
    }
    (output / "audit_summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Repository root")
    parser.add_argument("--output", type=Path, default=Path("docs/audit"), help="Output directory, relative to root")
    args = parser.parse_args()

    root = args.root.resolve()
    output = args.output if args.output.is_absolute() else root / args.output
    zip_paths = sorted(path for path in root.rglob("*.zip") if ".git" not in path.parts)
    if not zip_paths:
        print("ERROR: No ZIP files found.", file=sys.stderr)
        return 2

    all_rows: list[AssetRow] = []
    all_problems: list[str] = []
    for zip_path in zip_paths:
        print(f"Auditing {zip_path.relative_to(root)}")
        rows, problems = inspect_zip(zip_path, root)
        all_rows.extend(rows)
        all_problems.extend(problems)

    write_reports(output, all_rows, all_problems, zip_paths)
    print(f"Wrote Gate 0 reports to {output.relative_to(root)}")
    print(f"ZIPs: {len(zip_paths)} | Files: {len(all_rows)} | Problems: {len(all_problems)}")
    return 1 if all_problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

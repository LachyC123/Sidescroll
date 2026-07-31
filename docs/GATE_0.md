# Gate 0 — Asset Truth

This repository begins with the original purchased Legacy Fantasy ZIP archives. They are source-of-truth inputs and must never be modified, renamed in place, or deleted to make imports easier.

## Run the audit

From the repository root:

```bash
python tools/audit_assets.py
```

The script uses only Python's standard library. It reads the ZIPs in place and writes:

- `docs/audit/asset_manifest.csv`
- `docs/audit/asset_manifest.json`
- `docs/audit/audit_summary.json`
- `docs/audit/duplicate_report.md`
- `docs/audit/asset_issues.md`
- `docs/audit/pack_coverage.md`

GitHub Actions runs the same audit and uploads the results as the `gate-0-asset-audit` workflow artifact.

## What the audit proves

- Every ZIP is readable.
- Every internal file path, size, CRC and SHA-256 is recorded.
- PNG dimensions are read without altering the image.
- ASEPRITE/PSD/Krita source files are flagged for visual inspection.
- Likely licence/readme files are identified.
- Byte-identical duplicates are grouped, but nothing is deleted.
- Coverage is checked against all 17 expected collection items.

## What it does not prove

The automated audit cannot identify animation frame boundaries, pivots, correct tile slicing, visual duplicates, missing preview art, or whether a source-art layer must be exported. Those require the next Gate 0 step: contact sheets and the in-engine Asset Museum.

## Rules before Gate 1

1. Do not build a campaign level.
2. Do not bulk-extract or normalise assets until the generated reports have been reviewed.
3. Do not infer slicing rules from storefront descriptions.
4. Do not remove apparent duplicates automatically.
5. Record every licence and unresolved source-art file.
6. Stop for approval after the Asset Museum is playable.

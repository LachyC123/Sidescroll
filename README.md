# CROWNLESS

A focused pixel-art action-platformer built from the Legacy Fantasy Complete Collection.

The project follows the staged production contract in `Legacy_Fantasy_Sidescroller_AI_Master_Plan.docx`: asset truth first, then an Asset Museum, controller laboratory, tutorial vertical slice, complete shell, and chapter production.

## Current status

**Gate 0 — Asset Truth**

The repository currently contains the 17 untouched source ZIPs. Automated audit tooling is being added before any gameplay code so the real files—not storefront descriptions—determine slicing, animation and content decisions.

Run locally:

```bash
python tools/audit_assets.py
```

See [`docs/GATE_0.md`](docs/GATE_0.md) for outputs, limitations and approval rules.

## Production rules

- Preserve original archives.
- Inspect before slicing.
- Greybox before decorating.
- Keep pixel rendering nearest-neighbour and grid-consistent.
- Keep the HUD compact.
- End every gate with runnable evidence and review.

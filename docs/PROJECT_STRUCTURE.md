# Planned Repository Structure

The game project will be introduced only after Gate 0 confirms the real asset contents.

```text
assets/
  _archive/                 # Original ZIPs (currently at repository root; relocation requires Git LFS review)
  _source/                  # Local extracted working copies; ignored
  normalized/               # Approved production exports; ignored until reviewed

docs/
  audit/                    # Generated Gate 0 reports
  licences/                 # Reviewed licence ledger

game/
  data/
  scenes/
    core/
    player/
    enemies/
    levels/
    ui/
    dev/asset_museum/
  scripts/

tests/
builds/
```

No gameplay folders are populated during the automated inventory step. The next implementation milestone is the contact-sheet generator and Asset Museum after the audit artifact has been reviewed.

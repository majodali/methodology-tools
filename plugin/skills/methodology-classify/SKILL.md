---
name: methodology-classify
description: Adopt the majodali methodology in the current project — write the Classification, CLAUDE.md Binding block, and the governance documents the declared tier requires, from the methodology's own skeletons. Use when a project has no docs/classification.md and the owner wants it governed.
---

Ask the owner for the four Classification fields (C-tier, S-level,
type, target — definitions in the methodology's `docs/vocabulary.md`),
then scaffold:

```bash
"$CLAUDE_PLUGIN_ROOT/bin/mtool.sh" classify --repo "$CLAUDE_PROJECT_DIR" \
  --tier C1 --slevel S0 --type exploration --target none/local \
  --description "<one line, W-007>"
```

The pin auto-resolves to the corpus's latest release. classify never
overwrites existing files and scaffolds only what the declared
classification's in-play rules require (no empty ceremony, K-005).
Afterwards run `status` and `audit form` — a fresh repo should come out
form-clean in one pass. Fill the placeholders the scaffold leaves.

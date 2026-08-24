---
name: methodology-status
description: Report the current project's standing against the majodali methodology — in-play rules, deviations, version lag, sandbox ages, delta-ratio. Use at session start, before planning work, or when asked "where does this project stand against the methodology".
---

Run the status report and relay it:

```bash
"$CLAUDE_PLUGIN_ROOT/bin/mtool.sh" status --repo "$CLAUDE_PROJECT_DIR"
```

The Classification (`docs/classification.md`) is the config — there is
no tool configuration. If the report shows version lag, the migration
notes for the missed releases live in the methodology's Release
register (`docs/releases.md` in majodali/methodology). Never edit the
Classification to silence a finding: declaration accuracy is a
constitutional MUST (Article 4).

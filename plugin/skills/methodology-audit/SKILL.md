---
name: methodology-audit
description: Run the methodology's deterministic form audit on the current project (Article 9) — existence rules, declaration consistency, link integrity, plan statuses, secret hygiene. Use before committing sizeable work, when asked to audit the project, or to check a delta with --staged / --changed-since.
---

Run the form audit and act on the findings:

```bash
"$CLAUDE_PLUGIN_ROOT/bin/mtool.sh" audit form --repo "$CLAUDE_PROJECT_DIR"
```

- Every finding cites the rule or article it enforces; fix violations
  at the root cause (W-005), never by weakening declarations.
- `--staged` runs the same-commit guard (W-003); `--changed-since
  <ref>` scopes per-file checks to a delta.
- To check whether the result is a state transition worth an Audit-log
  entry, run `audit deliver` (the audit process): it compares the
  finding fingerprint with the project's own `docs/audits.md` baseline
  and drafts the entry when one is due.

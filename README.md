# majodali/methodology-tools

`mtool`: a single CLI that discharges the
[methodology's](https://github.com/majodali/methodology) deterministic
audit duties and makes adoption cheaper than non-adoption.

Relationship to the methodology (its Constitution, Article 3): **the
methodology documents are the spec; where tool and document disagree,
the document is right** — the tool has a bug. Nothing in this repo is
authoritative over the methodology; every check cites the rule ID it
implements, so findings are adjudicable against the documents.

## Status

Governed, not yet building: the founding plan is
[docs/plans/methodology-tools-v1.md](docs/plans/methodology-tools-v1.md)
(status: draft — build begins when the owner green-lights its chunk 1).
Progress lives in [docs/backlog.md](docs/backlog.md); the binding
declaration is [docs/classification.md](docs/classification.md).

## Planned shape

One CLI, three surfaces: git hooks, CI, and Claude Code hooks all invoke
the same `mtool` commands (`status`, `classify`, `links check`,
`audit form`, `census`, `audit semantic`, `links move`). TypeScript/Node,
no framework beyond the platform. The Classification is the config —
`mtool` reads `docs/classification.md` and computes the in-play rule set
by the Constitution's Article 4 procedure, literally.

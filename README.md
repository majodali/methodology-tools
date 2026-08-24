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

Built: the founding plan
([docs/plans/methodology-tools-v1.md](docs/plans/methodology-tools-v1.md))
is closed — all five chunks delivered; the
[Backlog](docs/backlog.md)'s checked entries are the record. The
binding declaration is [docs/classification.md](docs/classification.md).

## Shape

One CLI, three surfaces: git hooks (`mtool hooks install`), CI, and the
Claude Code plugin ([plugin/](plugin/), served from this repo's
marketplace manifest) all invoke the same commands — `status`,
`classify`, `links check`, `links move`, `audit form`, `audit deliver`,
`audit semantic`, `census`, `hooks install`. TypeScript/Node, no
framework beyond the platform; run via `npm run mtool -- <command>`
(package-registry publication pending — the plugin resolves a checkout
via `MTOOL_HOME`). The Classification is the config — `mtool` reads
`docs/classification.md` and computes the in-play rule set by the
Constitution's Article 4 procedure, literally.

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
`audit semantic`, `census`, `hooks install`, `style`, `ir check`. TypeScript/Node, no
framework beyond the platform; run via `npm run mtool -- <command>`
(package-registry publication pending — the plugin resolves a checkout
via `MTOOL_HOME`). The Classification is the config — `mtool` reads
`docs/classification.md` and computes the in-play rule set by the
Constitution's Article 4 procedure, literally.

## `mtool style`

`mtool style [files...] [--repo <path>] [--corpus <path>] [--vocab <path>]`
runs the mechanically checkable part of the methodology's prose rules
(the P- rules, W-008's report shape) over the given markdown files, or
over every one under the repo. The checks are the `lint` column of the
communication pipeline's style specification, ported from its
`scripts/lint.mjs` (`src/style.ts`); each finding cites the methodology
rule it serves (`P-002`, `P-004`, `W-008`, …) and names the
specification row (`SP-nn`) at the end of its message. Output is one
`file:line: SEVERITY rule message` line per finding and a summary
`N file(s); V violation(s), W warning(s)`. Prose findings are warnings
(the P- rules are SHOULD-level in their mechanical part); a report that
lacks or misorders W-008's headings is a violation and the only cause
of exit 1. Vocabulary terms (for the first-use link check) come from
`--vocab` files, else from `docs/vocabulary.md` of the repo and of the
corpus; both the pipeline's table rows and the methodology's list
entries are read. An `.ir.md` file takes the IR checks instead.

## `mtool ir check`

`mtool ir check <file.ir.md>... [--vocab <path>]` runs the IR schema's
mechanical checks CK-01..CK-11 (communication pipeline
`docs/ir-schema.md`, parser and checks ported to `src/ir.ts`) and
prints findings in the same shape as `style`, plus a line
`unratified terms: N` — the terms the IRs propose that have no decided
vocabulary row. Every CK finding is a violation; exit 1 when any is
found.

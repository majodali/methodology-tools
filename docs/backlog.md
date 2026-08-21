# Backlog

The single source of progress truth for this repo (methodology K-003);
entries update in the same commit as the work they describe (W-003).
Chunk entries below are seeded from the founding plan,
[methodology-tools-v1](plans/methodology-tools-v1.md) (status: active
since the owner's build green-light, 2026-08-19).

## Completed

- [x] **Bootstrap** — repo governed under majodali/methodology v1.0.0:
  founding plan imported as
  [plans/methodology-tools-v1.md](plans/methodology-tools-v1.md)
  (status: draft), [Classification](classification.md) declared
  (component/library, C1, S0, package registry, pinned 1.0.0), Binding
  block in `CLAUDE.md`, README stating the Article 3 relationship
  (documents are the spec; the tool has the bug). Cross-registered in
  the methodology's
  [Portfolio register](https://github.com/majodali/methodology/blob/main/docs/registers/portfolio.md)
  (M-001).
- [x] **Migrated to methodology 1.1.0** — pin and Binding block bumped
  (v1.1.0 migration notes: none for either amendment, so the pin bump
  is the whole migration — release process step 5). The 1.1.0 content
  matters here directly: the audit-log register unblocks `mtool
  status` delta-ratio (chunk 1), and M-004 becomes a checkable rule
  for `mtool audit` (chunk 3).

- [x] **Chunk 1 — markdown model, applicability engine, `status`** —
  shipped: line-based markdown model (`src/markdown.ts`),
  Classification parsing with the vocabulary's omission defaults and
  implicit-C0 handling (`src/classification.ts`), rule-corpus parsing
  of applicability tags with Article 5 defaults (`src/rules.ts`), the
  Article 4 stage 1 + stage 2.3 engine over effective constraining
  conditions (`src/applicability.ts`), and `mtool status` with
  `--json`/`--brief` reporting in-play rules, deviations, version lag,
  sandbox ages, and delta-ratio (`src/status.ts`, `src/cli.ts`).
  Delta-ratio reports *unavailable* pending the audit-log register
  amendment — proposed via the standard channel
  ([methodology PR #3](https://github.com/majodali/methodology/pull/3),
  adjudication at a review round), never self-applied (Article 8). Workflow declarations are recognized but unparseable
  until the methodology defines the declaration format (its open
  item); `deployed` stays false with a finding. Gate evidence: 19
  passing tests — implicit-C0 / minimal-C0 / full-C2 fixtures, the
  constitution's own precedence tie-break examples, real-corpus parse
  (21 rules, no findings), and the methodology repo itself reporting
  its 14 in-play rules. **Gate review pending.**

- [x] **Chunk 1 completion: delta-ratio wired to the Audit log** —
  `mtool status` now reads the project's `docs/audits.md` (available
  since methodology 1.1.0): computes the change ratio since the newest
  semantic-audit entry (git numstat over current tracked lines, scoped
  to the repo), or reports honestly "no semantic audit recorded yet" /
  "no Audit log". The stale amendment-pending message is gone. The
  repo's own sandbox scan excludes `fixtures/` (test data is not the
  project's sandbox). Real-corpus tests track the 1.1.0 corpus —
  exact-count assertion replaced by clean-parse + expected-IDs
  including M-004 (owner-approved change to an existing assertion,
  W-002, 2026-08-20).

- [x] **Chunk 2 — `classify` and `links check`** — shipped:
  `mtool links check` (`src/links.ts`) — deterministic link integrity
  (files + GitHub-slug anchors) across a repo, findings citing
  Articles 10/9, nonzero exit on findings; `mtool classify`
  (`src/classify.ts`) — adoption in one run, writing the
  Classification, Binding block, and governance docs from the corpus's
  own `skeletons/`, driven by the declared classification's in-play
  rules (each written file cites the rule requiring it; K-005: no
  empty-ceremony registers; never overwrites; pin auto-resolves to the
  corpus's latest release tag; C0 omits the pin per the omission
  default). Shared git/walker helpers refactored to `src/git.ts` /
  `src/markdown.ts`; `fixtures/` excluded from a repo's own material by
  default. Gate evidence: 27 passing tests — broken-links fixture
  (dangling file + anchor, Article 10 citations), fresh-repo
  classify-to-form-clean (C2 and C0-baseline cases, second run
  overwrites nothing), self- and real-corpus link checks (144 relative
  links, matching the retired ad-hoc script exactly). Closes
  methodology Risk R2 (companion PR there). **Gate review pending.**

- [x] **Chunk 3 — `audit form` and hook installation** — shipped:
  `mtool audit form` (`src/audit.ts`) runs the mechanically checkable
  subset of in-play rules — existence rules (K-002/K-003/K-004/W-007/
  M-001, with the canonical-home check catching root-level Backlogs),
  Binding-block declaration consistency (Article 4 accuracy), K-002
  length, K-004 entry statuses, K-007 plan Status lines (blockquote/
  emphasis dress accepted; TEMPLATE and README exempt), S-001 secret
  hygiene (credential-shaped filenames + key patterns), Article 7
  sandbox ages, Article 10 link integrity, and the Article 8 lag/
  deviation call-outs every audit MUST make. Delta modes `--staged`
  (the W-003 same-commit guard) and `--changed-since`; scoping per the
  proposed delta-scope calibration amendment — per-file content checks
  delta-scoped, repo-wide invariants always full-tree. `mtool hooks
  install` (`src/hooks.ts`) writes the git pre-commit mirror
  (absolute-path embedding documented as a pre-package limitation).
  Gate evidence: 33 tests (fixture audit, classify→audit-clean loop,
  staged W-003 guard both ways, S-001 catches, hook install) and the
  first audit of reality: allegro's findings match its own
  adoption-transition notes exactly (root BACKLOG.md relocation
  pending, 1.0.0 lag, Workflow-format open item), in-real-life shows
  one real W-007 gap (no README), template/ops/org audit clean at
  implicit C0, and both governed repos self-audit clean — after the
  run corrected two tool bugs (blockquoted Status lines are compliant
  dress; the scanner flagged its own test literal). Closes methodology
  Risk R1 (companion PR there). **Gate review pending.**

## Upcoming
- [ ] **Chunk 4 — `census` and `audit semantic` assembly** — gate:
  first real census output adjudicated by owner at a review round.
  Requires the audit-log register amendment. Closes methodology Risk
  R3.
- [ ] **Chunk 5 — `links move` and plugin wiring** — gate:
  plugin-installed project passes a full form audit driven entirely
  through hooks. Documents the external-reference limitation amendment.
  Closes methodology Risk R4.

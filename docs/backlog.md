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

## Upcoming
- [ ] **Chunk 2 — `classify` and `links check`** — gate: a fresh repo
  goes from empty to form-clean in one `classify` run; `links check`
  findings cite rule/article sources. Closes methodology Risk R2.
- [ ] **Chunk 3 — `audit form` and hook installation** — gate: findings
  against allegro, in-real-life, and the template match the known gap
  analysis. Closes methodology Risk R1 (Article 11 transitional
  register updated).
- [ ] **Chunk 4 — `census` and `audit semantic` assembly** — gate:
  first real census output adjudicated by owner at a review round.
  Requires the audit-log register amendment. Closes methodology Risk
  R3.
- [ ] **Chunk 5 — `links move` and plugin wiring** — gate:
  plugin-installed project passes a full form audit driven entirely
  through hooks. Documents the external-reference limitation amendment.
  Closes methodology Risk R4.

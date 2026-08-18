# Backlog

The single source of progress truth for this repo (methodology K-003);
entries update in the same commit as the work they describe (W-003).
Chunk entries below are seeded from the founding plan,
[methodology-tools-v1](plans/methodology-tools-v1.md) (status: draft) —
none starts before the owner green-lights the plan (W-001), which flips
it to `active`.

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

## Upcoming

- [ ] **Chunk 1 — markdown model, applicability engine, `status`** —
  awaits plan activation. Gate: `status` correct against fixtures for
  implicit-C0, minimal-C0, and full C2 Classifications, including
  precedence tie-breaks. Proposes the audit-log register amendment
  (`docs/audits.md`) via the standard channel, motivated by the
  `status` implementation.
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

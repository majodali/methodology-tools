# The project plan

Generated from `orchestration/state.json` by `plan-state render`. Do not edit by hand: edit the state file, or use the service's tools, and run `plan-state render --write`. `plan-state check` fails when this file differs from the rendering.

Reader: the owner, and any session working on the project. The reader
knows the README. Each node is shown as its title, its identifier,
its stage and its outcome. The state file holds the rest.

## Waiting on the owner

Nothing.

## Ready, starting automatically when the loop runs

- Custom-type checker extension point (P1-N016) [identified]
- Workflow declaration parser (P1-N018) [identified]
- Links inside verbatim quotations of foreign text (P1-N020) [identified]
- Deviation parser splits a fielded entry into several entries (P1-N021) [identified]

## In flight

None.

## In progress, children carry the work

None.

## Waiting on a dependency

None.

## Blocked

None.

## The plan

### Repository bootstrap (P1-N001)

Stage: done, done.

repo governed under majodali/methodology v1.0.0: founding plan imported as plans/methodology-tools-v1.md (status: draft), Classification declared (component/library, C1, S0, package registry, pinned 1.0.0), Binding block in CLAUDE.md, README stating the Article 3 relationship (documents are the spec; the tool has the bug).

Documents: [plan](plans/methodology-tools-v1.md).

Note: Completed


### Migrated to methodology 1.1.0 (P1-N002)

Stage: done, done.

pin and Binding block bumped (v1.1.0 migration notes: none for either amendment, so the pin bump is the whole migration — release process step 5).

Note: Completed


### Chunk 1 — markdown model, applicability engine, `status` (P1-N003)

Stage: done, done.

Chunk 1 shipped: a markdown model, Classification parsing with omission defaults, rule-corpus parsing of applicability tags, the Article 4 applicability engine, and `mtool status` reporting in-play rules, deviations, version lag, sandbox ages and delta-ratio.

Note: Completed


### Chunk 1 completion: delta-ratio wired to the Audit log (P1-N004)

Stage: done, done.

Chunk 1 completion: `mtool status` reads the project's Audit log, computing the change ratio since the newest semantic-audit entry, or reporting honestly when no semantic audit or Audit log exists.

Note: Completed


### Chunk 2 — `classify` and `links check` (P1-N005)

Stage: done, done.

Chunk 2 shipped: `mtool links check` for deterministic link integrity across a repo, and `mtool classify`, which writes a project's Classification, Binding block and governance docs from the corpus's skeletons in one run, never overwriting existing files.

Note: Completed


### Migrated to methodology 1.2.0 (P1-N006)

Stage: done, done.

pin and Binding block bumped (v1.2.0 migration notes: none — release process step 5).

Note: Completed


### Chunk 3 — `audit form` and hook installation (P1-N007)

Stage: done, done.

Chunk 3 shipped: `mtool audit form`, running the checkable in-play rules (existence, Binding-block consistency, K-002/K-004/K-007 checks, S-001 secret hygiene, sandbox ages, link integrity, lag/deviation call-outs), with staged and changed-since delta modes; and `mtool hooks install`, writing the git pre-commit mirror.

Note: Completed


### Chunk 4 — `census`, `audit deliver`, `audit semantic` (P1-N008)

Stage: done, done.

Chunk 4 shipped: `mtool census`, reconciling the Portfolio register against observed repositories and local checkouts; `mtool audit deliver`, mechanizing audit delivery by comparing findings against the newest same-kind Audit-log entry; and `mtool audit semantic`, assembling the judgment-free adjudication packet.

Note: Completed


### Chunk 5 — `links move` and plugin wiring (P1-N009)

Stage: done, done.

Chunk 5 shipped: `mtool links move`, moving a document with git following and rewriting inbound links; and a Claude Code plugin injecting `mtool status --brief` at session start, guarding commits with `audit form --staged`, and shelling three skills to mtool.

Note: Completed


### Migrated to 1.3.0 and joined the `methodology` family (P1-N010)

Stage: done, done.

v1.3.0 tagged 2026-08-25 (project families, template type and Q-001, custom definitions by citation, links-move limitation); all four amendments ship migration-note: none, so the pin bump is the whole migration.

Note: Completed


### Migrated to methodology 1.4.0 (P1-N011)

Stage: done, done.

2026-08-30; migration notes none mandatory, so the pin bump is the whole migration.

Note: Completed


### Link checker skips inline code spans (P1-N012)

Stage: done, done.

spans are literal text, not markup; motivating instance: Allegro syntax in prose (applye: Effect) read as two dangling links in allegro's CHANGELOG and concepts.md.

Note: Completed


### S-001 scanner: key headers need a body (P1-N013)

Stage: done, done.

the private-key pattern now requires a base64-shaped body after the header; motivating instance: two false positives on project-orchestrator-service (a runbook documenting a verify command's output; a test placeholder body).

Note: Completed


### Migrated to methodology 1.5.0 (P1-N014)

Stage: done, done.

2026-09-02; the pin bump plus this release's one migration note: CLAUDE.md now carries W-008's prescribed reporting block verbatim, copied from the rule and verified byte-identical.

Note: Completed


### Style and IR checks, W-008 block drift (P1-N015)

Stage: done, done.

`mtool style` runs the P- rules' mechanical checks and W-008's report shape, citing each finding's rule; `mtool ir check` runs the IR schema's CK-01 to CK-11 and counts unratified terms; `mtool audit form` now reports W-008 bootstrap-block drift.

Note: Completed


### Custom-type checker extension point (P1-N016)

Stage: identified, ready, starts automatically.

proposals/custom-type-checker-extension.md: project-orchestrator asks that mtool audit form discover, run, and fold in a checker a defining project declares alongside its Article-7 custom type, so citation-defined types get the same mechanical checking as standard ones.

Note: Completed


### Stale Workflow-format claims in tool output and comments (P1-N017)

Stage: done, done.

the Workflow declared info finding told readers "the declaration format is undefined (methodology backlog open item)", and two source comments said the same.

Note: Upcoming


### Workflow declaration parser (P1-N018)

Stage: identified, ready, starts automatically.

parse the canonical format the v1.4.0 candidate's Workflow-declaration-format amendment defines (stages: a → b → c; live = <stage>; backlog default: checked ⇒ <s1>, unchecked ⇒ <s2>), derive deployed from Classification + Backlog designations, and clear the standing tool-unreadable info finding for conforming declarations (non-conforming declarations keep it).

Note: Upcoming


### W-008 bootstrap-cache drift check (P1-N019)

Stage: done, done.

mtool audit form compares a project's CLAUDE.md copy of W-008's prescribed reporting block against the fenced block in the rule's Required bootstrap text field, and reports any difference as drift.

Note: Upcoming


### Links inside verbatim quotations of foreign text (P1-N020)

Stage: identified, ready, starts automatically.

the link checker resolves every relative link it finds, including links carried inside a blockquote that quotes another repository's document byte-exactly.

Note: Upcoming


### Deviation parser splits a fielded entry into several entries (P1-N021)

Stage: identified, ready, starts automatically.

a deviation recorded as a heading plus labeled field bullets (Rule, Deviating practice, Rationale, Recorded, Disposition) parses as one deviation per bullet, and every bullet whose first line does not carry a rule id draws "deviation entry lacks the rule it overrides".

Note: Upcoming


## Decisions taken

None.

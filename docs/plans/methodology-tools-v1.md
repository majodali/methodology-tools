# methodology-tools v1

Status: closed — all five chunks delivered (2026-08-19 → 2026-08-24);
the Backlog's checked entries supersede this plan as the record
(close-out per K-007)

Outcome under development: a single CLI, `mtool`, that discharges the
methodology's deterministic audit duties and makes adoption cheaper than
non-adoption. Spec: the [constitution](https://github.com/majodali/methodology/blob/main/docs/constitution.md)
and [rule corpus](https://github.com/majodali/methodology/blob/main/docs/rules/README.md)
(Article 3: where tool and
document disagree, the document is right and the tool has a bug).

Everything unmarked in this plan is a live claim of current intent
(K-007).

## Design decisions

- **One CLI, three surfaces.** Git hooks, CI, and Claude Code hooks all
  invoke the same `mtool` commands; no rule is ever implemented twice.
  The Claude Code plugin is wiring, not a second implementation.
- **The Classification is the config.** `mtool` reads
  `docs/classification.md` (implicit-C0 when absent), parses rule-corpus
  applicability tags, and computes the in-play rule set by Article 4's
  two-stage procedure, literally. No tool-specific configuration file
  exists.
- **Every check cites its rule ID.** Findings are adjudicable against
  the documents (Article 3) only if each maps to a rule.
- **Output is JSON findings + human summary**; nonzero exit on MUST
  violations. Surfaces decide severity handling, not the checks.
- **Un-glamorous by intent.** A markdown-model library and a rules
  engine of a few hundred lines; the whole thing is a placeholder for
  its eventual Allegro reimplementation, and the cleaner the model
  layer, the cheaper that port.

## Non-goals

- Semantic judgment: `audit semantic` assembles context and invokes an
  agent; it never adjudicates.
- The broader common toolset (build tools, knowledge management,
  architecture guidance, shared project info) — deliberately deferred
  by owner decision, boundary to be drawn later.
- Enforcement of rules outside the deterministic subset; anything
  needing judgment stays in the semantic pass.

## Chunks

### Chunk 1 — markdown model, applicability engine, `status`
The foundation and the everyday command. Parse documents into
vocabulary types (Documents, Registers, Entries, Status lines, tags,
links); implement Article 4 stages 1–2 over parsed Classifications and
rules; `mtool status` reports in-play rules, deviations, version lag,
sandbox ages, and delta-ratio since last semantic audit, with `--brief`
for SessionStart injection.
Gate: `status` runs correctly against fixtures for implicit-C0,
minimal-C0, and full C2 Classifications, including precedence
tie-breaks from the constitution's own examples.

### Chunk 2 — `classify` and `links check`
Adoption and Article 10. Interactive init writing Classification,
binding block, and skeleton docs from the methodology's skeletons;
deterministic link integrity across the repo.
Gate: a fresh repo goes from empty to form-clean in one `classify` run;
`links check` findings cite rule/article sources.

### Chunk 3 — `audit form` and hook installation
The daily duty (Article 9) and the same-commit guard (W-003), with
`--changed-since` and `--staged` modes; installer for git pre-commit
mirrors. Update the Article 11 transitional register: form-audit
entries close here.
Gate: running against allegro, in-real-life, and the template produces
findings matching the known gap analysis — the tool's first census of
reality against the documents.

### Chunk 4 — `census` and `audit semantic` assembly
Methodology-repo duties (M-001/M-002): enumerate the GitHub account,
reconcile the Portfolio register, refresh summaries, emit spot-check
candidates; assemble semantic-audit packets (changes since last audit,
traceability graph, in-play checklist) for local or headless agent
invocation. Requires the audit-log register amendment (below).
Gate: first real census output adjudicated by owner at a review round.

### Chunk 5 — `links move` and plugin wiring
Move/rename with inbound-link rewrite, heavy-link warning, tombstone
enforcement (external-reference knowledge from the census index; until
then, repo-local with a documented limitation); Claude Code plugin
hooks and skills shelling to `mtool`.
Gate: plugin-installed project passes a full form audit driven entirely
through hooks.

## Amendments this plan will propose (via the standard channel)

1. **Audit-log register** (`docs/audits.md`): the delta-ratio trigger
   needs "time of last semantic audit" machine-readable; motivating
   instance: chunk 1's `status` implementation.
2. **`links move` external-reference limitation** documented until the
   census index exists; motivating instance: chunk 5.

## Risks

- Parsing prose-adjacent markdown is inherently heuristic at the
  edges; mitigated by the vocabulary's uniform Entry/Status-line shapes
  and by treating parse ambiguity as a form finding, not a guess.
- Repo classification: component/library, C1, S0; Portfolio-registered
  at creation (M-001) — see [classification.md](../classification.md).

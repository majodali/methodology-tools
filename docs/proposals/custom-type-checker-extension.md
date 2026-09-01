# A checker extension point for custom types defined by citation

<!-- Carrier's note (methodology-tools maintainer session, 2026-09-01):
     this document is project-orchestrator's proposal, carried here
     unchanged in substance so it can be adjudicated in this repo.
     Two carrier observations, kept out of the proposal's own text:

     1. Its "Evidence" section dates itself 2026-08-26 and says the
        checker's originating chunk is "still open pending one further
        review step". That project's Backlog records the demo gate as
        accepted by the owner on 2026-08-26, so the caveat is stale as
        written; nothing else in the section depends on it.
     2. Its claim about mtool's current behavior is correct: `mtool
        audit form` checks standard document types only and has no
        extension point for custom ones. Verified against src/audit.ts
        at this commit.

     Status below is the proposal's own K-007 line, carried as-is. -->

Status: draft

<!-- K-007 contract: Status transitions draft → delivered (hand-carried
     into an upstream issue or pull request, text unchanged) →
     accepted / amended / rejected, a maintainer disposition this
     document does not itself record (the originating project tracks
     that disposition in its own backlog, not here). Anything unmarked
     here is a live claim of current intent. This file is a standalone
     proposal artifact, not a plan or a specification; it is written
     to be pasted upstream as-is. -->

**To:** the maintainer of methodology-tools (`mtool`).

**From:** the majodali project-orchestrator project, one member
project of the methodology family.

**The ask:** that `mtool audit form` gain one generic capability — the
ability to discover, run, and fold in the results of a checker that a
defining project declares alongside its own Article-7 custom type — so
that custom types get the same mechanical form checking as standard
ones, without `mtool` ever learning any one project's format.

This document states the problem in general terms, proposes a
concrete contract, lists the design questions this project believes
the maintainer needs to settle (each with a recommendation and the
trade-off behind it), offers this project's own checker as one worked
— not required — example, sketches illustratively what that checker
could look like under the proposed contract, and closes with an
explicit ask: accept, amend, or reject, and what this project does
under each answer.

## Problem statement

Article 7 of the methodology's constitution
(https://github.com/majodali/methodology/blob/v1.3.0/docs/constitution.md#article-7--the-c0-baseline-custom-definitions-and-the-sandbox)
lets a defining project publish a document type by citation: any
member project can adopt that type by citing it, without redeclaring
its shape locally. This is the family's growth path — it lets a lead
project publish new document types, and lets other projects extend
the family with types of their own, without every adopting project
hand-rolling the same validation over and over.

`mtool audit form` — the standard mechanical form-check pass — knows
only the vocabulary of the methodology's standard document types. A
custom type defined by citation is invisible to it. Today, the only
way a custom type's invariants get mechanically checked at all is for
the defining project to ship its own checker and run it beside
`mtool`'s pass, never inside it.

That produces three costs, and every family that adopts the citation
pattern for a new type pays all three again from scratch:

- **Findings live outside the delivery pipeline.** An operator has to
  know to look in two places — the standard audit output and whatever
  the custom checker produces — to see the full state of a project's
  forms, and the two are not reconciled anywhere.
- **Invariants are absent from the audit record.** An audit run that
  only reports `mtool`'s own output cannot tell, from that output
  alone, that a custom type went unchecked at all; the gap is
  invisible unless the operator already knows to look for it.
- **Checker infrastructure is duplicated.** Discovery, invocation, and
  reporting are the same shape of problem for every defining project
  that publishes a custom type, and each currently reinvents it.

This proposal is one generic capability meant to close that gap for
every family-defined type, not a special case built around any one
project's needs.

## The proposed capability

Four steps, each a separate point of contact between a defining
project's checker and `mtool`'s own audit pass:

- **Declare.** The defining project's citable type definition gains an
  optional checker declaration alongside it: an entry point to run,
  and the version of the finding-record schema it emits (see
  *Finding schema* below). The declaration lives with the type
  definition itself and is versioned exactly as the type is (see
  *Versioning* below) — it is not a second artifact a consuming
  project maintains.
- **Resolve.** The same citation a consuming project already makes to
  adopt the type is what `mtool` resolves to find the checker
  declaration. There is no second, separate registration step in the
  consuming project beyond the citation it already carries.
- **Invoke.** At the points `mtool` already runs — `mtool audit form`,
  and any programmatic caller of the same pass — it runs each declared
  checker whose type the consuming project has cited, as a subprocess
  against that project's own working tree, subject to the
  availability behavior in *Unavailability* below.
- **Re-enter.** The checker's findings are translated into `mtool`'s
  own result set — same output, same severities as `mtool`'s native
  checks — so that one audit run is complete without a second report
  to read.

## Design questions for the maintainer

Five questions this project believes need settling before the
capability can be built, each with a recommendation and the trade-off
it carries.

### Discovery: declared in the defining project, or registered in the consuming project's Classification?

**Recommendation:** declared in the defining project, resolved purely
through the citation the consuming project already carries. The
citation already names the defining project and a pinned version;
resolving through it avoids a second place — the consuming project's
own Classification — where the same information could drift out of
sync with the citation.

**Trade-off:** this requires `mtool` to be able to read something in
the defining project at audit time (see *Execution and trust* for how
that reach is bounded), rather than reading only the consuming
project's own files. A purely local declaration in the consuming
project's Classification would need no such reach, but it would
duplicate configuration that the citation already carries once, and
that duplicate would need to be kept in step with the citation by
hand.

### Execution and trust: running a checker fetched from another project is a security surface

**Options considered:** vendoring the checker's code into the
consuming project's own tree (audited, version-controlled, no runtime
fetch); restricting execution to checkers that live in a project the
operator has already cloned locally, with no new fetch at audit time;
or an opt-in flag per consuming project that must be set before any
foreign checker runs at all.

**Recommendation:** already-cloned-only, and opt-in per project. No
`mtool` invocation ever fetches new code over the network on the
strength of a citation; a foreign checker only runs if the operator
has already checked out the defining project's code locally, and only
if the consuming project has explicitly opted in.

**Trade-off:** a consuming project that cites a type but has never
checked out the defining project's code gets no mechanical checking of
that type until it does — coverage is not automatic on citation alone.
The alternative, fetching and executing code named by a citation with
no local checkout and no opt-in, would mean every audit run could
execute code the operator never chose to trust, which this proposal
treats as the greater risk.

### Finding schema: mapping a foreign checker's output onto `mtool`'s result kinds and severities

**Recommendation:** checkers emit a small, fixed, checker-schema-
versioned finding record (kind, rule name, path, message) rather than
`mtool`'s own internal result vocabulary directly, and `mtool` maps
that fixed record onto its own kinds and severities by one declared
table, shared across all checkers regardless of which project wrote
them.

**Trade-off:** an intermediate schema adds one translation layer
between every checker and `mtool`'s output, rather than having
checkers emit `mtool`'s native format directly. But requiring every
family's checker to speak `mtool`'s internal vocabulary directly would
make that vocabulary a de facto upstream dependency for every family —
exactly the coupling this proposal exists to avoid on the `mtool` side
of the boundary as well as the consuming-project side.

### Versioning: citations are version-pinned — what happens when checker and type version drift?

**Recommendation:** the checker declaration is versioned together with
the type it checks, in the defining project's own history, so that a
citation pinned to type version N always resolves to version N's
checker. Drift between checker and type version is ruled out by
construction, because the citation is the single pin point for both.

**Trade-off:** a checker bugfix that does not change the type's shape
still has to ride a type version bump to reach consuming projects,
since there is no independent checker-only version channel in this
design. An independent versioning scheme for the checker would allow
faster bugfix delivery, but reopens exactly the drift question this
recommendation is meant to close by construction, and this proposal
prefers the simpler, drift-free design for a first version of the
capability.

### Unavailability: does the audit degrade with a notice, or fail?

**Recommendation:** degrade with a notice, non-blocking. `mtool`'s own
standard-type checks still run and report in full; the fact that a
declared checker could not run — not cloned locally, not opted in,
process failure, or any other cause — is itself surfaced as a finding
for the operator to act on, rather than stopping the rest of the audit
pass.

**Trade-off:** a degraded-coverage notice can go unread the same way
any other finding can, so a project could run for a while without
custom-type coverage while believing it has none missing. The
alternative — failing the whole audit pass when one foreign checker is
unavailable — would make adopting a custom type strictly riskier than
not adopting one, since a single unavailable checker would block every
other check in the same run.

## Evidence: one project's worked example

The majodali project-orchestrator project publishes two Article-7
custom types today — a dependency-ordered register of planned work,
and a per-task cost ledger — and ships its own checker for both: an
executable script that mechanizes the deterministic invariants a form
check should catch — exactly one lifecycle stage recorded per unit of
work; no duplicate or malformed identifiers; structurally consistent
parent/child relationships; referential consistency between the
register and the project's own progress log; cost-ledger row shape and
identifier uniqueness; and a small set of cross-checks between the
register, the cost ledger, and the project's own event log. None of
these invariants are specific to `mtool`; the shape of the problem —
some deterministic structural rules over a family-defined type — is
generic to any custom type a defining project might publish.

The checker has been running since 2026-08-25, when the project
enrolled itself for orchestration and ran the checker against its own
history for the first time: that first run caught four real gaps
between the register and the progress log, all fixed in the same
commit that introduced the checker. Later the same day, a self-hosted
trial exercised the checker end to end and found one incomplete axis
of its own coverage — whether every in-progress unit of work was
either actively tracked, on hold with a declared reason, or neither
(an orphaned state) — and the finding was applied the same day; the
checker's coverage of that axis has been complete since.

As of this writing (2026-08-26), this is self-hosted evidence, not yet
a maintainer- or owner-ratified milestone: the chunk of the
originating project's own plan that shipped the checker is still open
pending one further review step in that project's own process.
Nothing above should be read as claiming that step has already closed;
this section will be revised, not rebuilt, once it does.

The claims above about `mtool`'s own current behavior — that
`mtool audit form` checks only standard document types, and has no
extension point for custom ones — reflect this project's own
understanding from `mtool`'s public documentation and from working
against it, not a reading of `mtool`'s source. If that understanding
is wrong in any respect, this project would welcome the correction.

## Conformance sketch — illustrative only, not runnable

The following is **not working code**. It sketches, at the size of a
declaration, a signature, and one sample finding, what this project's
own checker could look like declared under the contract proposed
above. Field and function names are illustrative placeholders, not a
proposed API.

```
# --- declared alongside the type definition (illustrative) ---
custom-type: plan-register
checker:
  entry-point: python3 plugin/scripts/form_check.py --emit=json
  schema-version: 1

# --- entry-point signature mtool would invoke (illustrative) ---
def check(project_root: Path) -> list[Finding]:
    """Run one audit pass over project_root; return findings in the
    fixed checker-schema (kind, rule, path, message)."""

# --- one sample finding record, as emitted by the checker
#     and before mtool's kind/severity mapping is applied
#     (illustrative) ---
{
  "kind": "violation",
  "rule": "register-structure",
  "path": "docs/plan-register.md",
  "message": "P1-N008: has children but stage is [specified]"
}
```

This project's actual checker, referenced only as evidence above and
not modified by this proposal, is at
https://github.com/majodali/project-orchestrator/blob/e89905a27cfbe42397dd7fb056ba144633004550/plugin/scripts/form_check.py.

## The explicit ask

This project asks the maintainer to decide, for each of the five
design questions above, whether to adopt the recommendation, adopt a
different answer, or decline the capability outright — and, if
adopting some form of it, to say so in enough detail that this or any
other family member project can build its own checker declaration
against the accepted contract.

- **If accepted as recommended, or accepted with amendments:** this
  project will adapt its own checker's declaration and, if needed, its
  finding output to match whatever contract is accepted, and will
  retire its own side-by-side checker run once the accepted capability
  is available to run against.
- **If accepted with a materially different design** (for example, a
  different discovery or trust model than recommended here): this
  project will re-read this document's recommendations against the
  accepted design and adapt to whichever contract actually ships,
  rather than treating its own recommendations as binding on the
  outcome.
- **If rejected:** this project will keep running its own checker
  beside `mtool`'s audit pass indefinitely, as it does today, and will
  say so plainly in its own records rather than treating rejection as
  a reason to keep re-raising the same request.

Questions, corrections to the evidence or to the claims about
`mtool`'s current behavior above, and counter-proposals are all
welcome on whatever channel the maintainer prefers to use for this
kind of proposal.

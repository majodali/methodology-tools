# Plan register

Reader: someone who followed the "type spec" link from
[docs/plan-register.md](../plan-register.md).

The Plan register is a rendering of the state file,
`orchestration/state.json`: one line per node, with its stage. The
orchestration service writes it with every state commit, together
with [docs/plan.md](../plan.md) and the Backlog,
[docs/backlog.md](../backlog.md), and `plan-state check` fails when
any of the three differs from what the renderer produces. Nobody
edits them by hand.

What a node may hold, and the rules the check enforces, are specified
once, in majodali/project-orchestrator's
[state model](https://github.com/majodali/project-orchestrator/blob/main/docs/process/state-model.md):
this project's pilot instance of the orchestration service runs the
same model.

This page exists because the rendered Plan register links it.

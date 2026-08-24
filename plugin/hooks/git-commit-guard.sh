#!/bin/sh
# PreToolUse guard (matcher: Bash): when the tool call is a `git commit`,
# run the staged form audit — the W-003 same-commit guard and Article 9
# staged checks, as a Claude Code hook (the git pre-commit mirror is
# `mtool hooks install`; dual-track per the methodology additions).
# Exit 2 blocks the tool call and shows stderr to the agent.
set -e
PAYLOAD="$(cat)"
COMMAND="$(printf '%s' "$PAYLOAD" | node -e '
let d = "";
process.stdin.on("data", (c) => (d += c));
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d);
    process.stdout.write(String(j.tool_input?.command ?? ""));
  } catch {
    process.stdout.write("");
  }
});
')"
case "$COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac
REPO="${CLAUDE_PROJECT_DIR:-.}"
if OUT="$("$(dirname "$0")/../bin/mtool.sh" audit form --staged --repo "$REPO" 2>&1)"; then
  exit 0
fi
echo "mtool audit form --staged found MUST violations (methodology W-003 / Article 9):" >&2
echo "$OUT" >&2
echo "Fix the findings (or record the exception in the Backlog and rerun with the guard satisfied)." >&2
exit 2

---
description: Run a Grok code review against local git state (read-only / plan mode)
argument-hint: '[--wait|--background] [--json] [--model <model>] [--max-turns <n>] [focus text]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Run a Grok review through the companion. Review-only — do not fix issues yourself in this command.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Your only job is to run the review and return Grok's output verbatim to the user.

Execution mode rules:
- If the raw arguments include `--wait`, do not ask. Run the review in the foreground.
- If the raw arguments include `--background`, do not ask. Run the review in a Claude background task.
- Otherwise, estimate the review size before asking:
  - Start with `git status --short --untracked-files=all`.
  - Also inspect `git diff --shortstat --cached` and `git diff --shortstat`.
  - Treat untracked files as reviewable work even when diff stats are empty.
  - Recommend waiting only when the review is clearly tiny (~1-2 files).
  - In every other case, including unclear size, recommend background.
- Then use `AskUserQuestion` exactly once with two options, putting the recommended option first and suffixing its label with `(Recommended)`:
  - `Wait for results`
  - `Run in background`

Argument handling:
- Preserve the user's arguments exactly.
- Do not strip `--wait` or `--background` yourself beyond choosing foreground vs background Bash.
- If the user needs adversarial framing, they should use `/grok:adversarial-review`.

Foreground flow:
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" review $ARGUMENTS
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.
- Do not fix any issues mentioned in the review output.

Background flow:
- Launch with `Bash` in the background:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" review $ARGUMENTS
```
- After launching, tell the user: "Grok review started in the background. Check `/grok:status` for progress."

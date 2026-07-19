---
description: Run a Grok review that challenges the implementation approach and design choices
argument-hint: '[--wait|--background] [--json] [--model <model>] [--max-turns <n>] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Run an adversarial Grok review through the companion.
Position it as a challenge review that questions the chosen implementation, design choices, tradeoffs, and assumptions — not just a stricter defect pass.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- Review-only. Do not fix issues or apply patches.
- Return Grok's output verbatim.

Execution mode:
- `--wait` → foreground; `--background` → background Bash.
- Otherwise estimate size from git status/diff shortstats and AskUserQuestion once:
  - `Wait for results` / `Run in background` (recommended first when unclear or large).

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" adversarial-review $ARGUMENTS
```

Return stdout verbatim. Do not fix findings.
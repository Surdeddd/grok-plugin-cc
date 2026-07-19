---
description: Run a Grok code review against local git state (read-only / plan mode)
argument-hint: '[--json] [--model <model>] [--max-turns <n>] [focus text]'
allowed-tools: Bash(node:*), Bash(git:*)
---

Run a Grok review through the companion. Review-only — do not fix issues yourself in this command.

Raw slash-command arguments:
`$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" review $ARGUMENTS
```

Return the command stdout verbatim. Do not paraphrase, summarize, or apply fixes.

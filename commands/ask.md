---
description: Free-form read-only question to Grok about the current codebase
argument-hint: '[--json] [--model <model>] [--max-turns <n>] <question>'
allowed-tools: Bash(node:*)
---

Raw slash-command arguments:
`$ARGUMENTS`

If the user did not supply a question, ask what they want Grok to answer.

Otherwise run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" ask $ARGUMENTS
```

Return the command stdout verbatim.

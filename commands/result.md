---
description: Fetch the result of a Grok plugin job
argument-hint: '[job-id] [--json]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" result $ARGUMENTS
```

Return stdout verbatim.

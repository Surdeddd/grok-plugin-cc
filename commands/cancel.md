---
description: Cancel a running Grok plugin job
argument-hint: '[job-id] [--json]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" cancel $ARGUMENTS
```

Return stdout verbatim.

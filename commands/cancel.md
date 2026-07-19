---
description: Cancel a running Grok plugin job (or all running in cwd)
argument-hint: '[job-id|--all] [--cwd] [--json]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" cancel $ARGUMENTS
```

Return stdout verbatim.

Notes:
- `cancel --all` cancels **all running jobs globally**
- `cancel --all --cwd` cancels running jobs only in the current working directory
- bare `cancel` cancels the latest job for this cwd if it is still running

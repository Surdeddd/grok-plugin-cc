---
description: Show Grok plugin job status (default: current cwd)
argument-hint: '[job-id] [--all] [--cwd] [--json]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" status $ARGUMENTS
```

Return stdout verbatim.

Notes:
- default list = jobs for current working directory
- `--all` = global job list
- with a job id = full record for that job

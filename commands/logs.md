---
description: Tail Grok job progress journal (progress.jsonl)
argument-hint: '[job-id] [--follow|-f] [--tail <n>] [--json] [--poll-ms <n>]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" logs $ARGUMENTS
```

Return stdout verbatim.

Notes:
- default shows last 30 progress events for the latest (or given) job
- `--follow` / `-f` streams new events until the job finishes
- alias: companion `follow` implies `--follow`

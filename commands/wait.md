---
description: Wait for a Grok plugin background job to finish, then print its result
argument-hint: '[job-id] [--json] [--follow] [--timeout-seconds <n>] [--poll-ms <n>]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" wait $ARGUMENTS
```

Return stdout verbatim (the final job result). Progress ticks go to stderr while waiting.

Defaults: timeout 900s, poll 1500ms. Without job-id, waits on the latest job for this cwd.
`--follow` streams full progress journal lines while waiting.

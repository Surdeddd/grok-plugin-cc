---
description: Check whether the local Grok Build CLI is ready; optionally toggle the stop-time review gate
argument-hint: '[--json] [--enable-review-gate|--disable-review-gate]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" setup $ARGUMENTS
```

Present the final setup output to the user verbatim.

Notes:
- `--enable-review-gate` makes the plugin Stop hook run a Grok ALLOW/BLOCK review before Claude ends a turn.
- Gate is **off by default** (cheap interactive loops).

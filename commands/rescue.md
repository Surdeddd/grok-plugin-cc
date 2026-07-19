---
description: Delegate investigation or fix work to Grok Build CLI (write-capable)
argument-hint: '[--background|--wait] [--resume|--fresh] [--model <model>] [--max-turns <n>] [task]'
context: fork
allowed-tools: Bash(node:*), AskUserQuestion
---

Route this request to the `grok:grok-rescue` subagent.
The final user-visible response must be Grok companion output verbatim.

Raw user request:
$ARGUMENTS

Execution mode:

- If the request includes `--background`, run the `grok:grok-rescue` subagent in the background.
- If the request includes `--wait`, run the `grok:grok-rescue` subagent in the foreground.
- If neither flag is present, default to foreground.
- Do not forward `--background` / `--wait` into the companion as part of the natural-language task text (the subagent strips routing flags).
- `--resume` and `--fresh` are routing flags; preserve them for the companion.
- If the user did not supply a task and did not pass `--resume`, ask what Grok should do.

Operating rules:

- The subagent is a thin forwarder only.
- Return companion stdout verbatim — no paraphrase, no extra commentary.

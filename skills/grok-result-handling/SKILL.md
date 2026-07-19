---
name: grok-result-handling
description: Internal guidance for presenting Grok helper output back to the user
user-invocable: false
---

# Grok Result Handling

When the helper returns Grok output:
- Preserve the helper's structure: verdict, summary, findings, next steps.
- For review output, present findings first, ordered by severity.
- Use file paths and line numbers exactly as the helper reports them.
- Preserve evidence boundaries. If Grok marked something as inference or uncertainty, keep that distinction.
- If there are no findings, say that explicitly and keep residual risk brief.
- If Grok made edits, say so explicitly and list touched files when provided.
- For `grok:grok-rescue`, do not turn a failed or incomplete Grok run into a Claude-side implementation attempt. Report the failure and stop.
- For `grok:grok-rescue`, if Grok was never successfully invoked, do not generate a substitute answer at all.
- CRITICAL after reviews: STOP. Do not auto-apply fixes. Ask the user which findings to fix before touching files.
- If setup/auth is required, direct the user to `/grok:setup` and do not invent alternate auth flows.

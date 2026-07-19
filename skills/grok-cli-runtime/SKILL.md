---
name: grok-cli-runtime
description: Internal helper contract for calling the grok-companion runtime from Claude Code
user-invocable: false
---

# Grok Runtime

Use this skill only inside the `grok:grok-rescue` subagent.

Primary helper:
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" task "<raw arguments>"`

Execution rules:
- The rescue subagent is a forwarder, not an orchestrator. Invoke `task` once and return that stdout unchanged.
- Prefer the helper over hand-rolled `git`, direct `grok` CLI strings, or any other Bash activity.
- Do not call `setup`, `review`, `adversarial-review`, `status`, `result`, or `cancel` from `grok:grok-rescue`.
- Use `task` for every rescue request: diagnosis, planning, research, and explicit fix requests.
- You may use the `grok-prompting` skill to tighten the user's request into a better Grok prompt before the single `task` call.
- That prompt drafting is the only Claude-side work allowed. Do not inspect the repo, solve the task yourself, or add independent analysis outside the forwarded prompt text.
- Leave model unset by default. Add `--model` only when the user explicitly asks for one.
- Default to a write-capable Grok run (companion defaults to write). Pass `--readonly` only when the user wants review/diagnosis without edits.

Command selection:
- Exactly one `task` invocation per rescue handoff.
- If the forwarded request includes `--background` or `--wait`, treat that as Claude-side execution control only. Strip it before calling `task` when you will background the Bash tool yourself; otherwise pass `--background` through to the companion for detached jobs.
- If the forwarded request includes `--resume`, strip that token and add `--resume-last`.
- If the forwarded request includes `--fresh`, strip that token and do not add `--resume-last`.
- `--resume-last`: for "continue", "keep going", "resume", "apply the top fix", or "dig deeper" after a previous rescue run.

Safety rules:
- Default to write-capable work in `grok:grok-rescue` unless the user explicitly asks for read-only behavior.
- Preserve the user's task text as-is apart from stripping routing flags.

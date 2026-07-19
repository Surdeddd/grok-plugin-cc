---
name: grok-prompting
description: Internal guidance for composing tight Grok prompts for coding, review, diagnosis, and rescue tasks
user-invocable: false
---

# Grok Prompting

Use when `grok:grok-rescue` needs to hand work to Grok Build.

Prompt Grok like an operator, not a collaborator. Keep prompts compact and block-structured with XML tags. State the task, done criteria, and verification rules.

Core rules:
- One clear task per Grok run. Split unrelated asks.
- Tell Grok what done looks like.
- Add verification for debugging/implementation.
- Prefer better prompt contracts over longer prose.

Default recipe:
- `<task>`: concrete job + relevant failure/context
- `<done_when>`: acceptance criteria
- `<verification>`: commands to run (tests, typecheck, build)
- `<constraints>`: scope limits, do-not-touch areas, style match
- `<output>`: what to report back (files changed, commands run, residual risk)

Working rules:
- Prefer explicit contracts over vague nudges.
- For write tasks: smallest correct change, no speculative refactors.
- For resume: send only the delta instruction, not a full restatement.

# Changelog

## 0.3.0

Codex-parity surface for Claude Code discovery and rescue:

- `task` primary runtime entry (write by default; `--readonly` opt-in)
- `task-resume-candidate` for resume/fresh routing in `/grok:rescue`
- `/grok:adversarial-review`
- Skills: `grok-cli-runtime`, `grok-result-handling`, `grok-prompting`
- Agent `grok:grok-rescue` description includes RU/EN triggers so Claude can spawn from natural language («вызови grok», «grok-агент», …)
- Rescue command mirrors Codex resume-candidate + AskUserQuestion flow
- Review command mirrors Codex wait/background estimation flow

## 0.2.0

- Optional Stop review gate (`ALLOW`/`BLOCK`)
- Setup gate toggles

## 0.1.0

- Initial setup / review / ask / rescue + job tracking

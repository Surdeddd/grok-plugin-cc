# grok-plugin-cc

Use [Grok Build CLI](https://x.ai) from [Claude Code](https://claude.ai/code) as a second agent — Codex-shaped companion for review, adversarial review, ask, rescue/task, and optional stop-time gate.

Architecture mirrors OpenAI's [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc): thin slash-command shell + skills + `grok:grok-rescue` subagent + local companion that spawns headless `grok -p`.

## Requirements

- **Grok Build CLI** on PATH (or `~/.grok/bin/grok`), authenticated
- **Node.js** ≥ 18
- **Claude Code** with plugins enabled

## Install

```bash
/plugin marketplace add Surdeddd/grok-plugin-cc
/plugin install grok@grok-marketplace
/reload-plugins
/grok:setup
```

Local:

```bash
claude plugin marketplace add ~/Projects/Personal/grok-plugin-cc
claude plugin install grok@grok-marketplace
```

## Natural-language spawn (from Claude context)

Claude can spawn the agent without a slash command when you say things like:

- «вызови grok» / «вызови грок» / «grok-агент» / «подними grok»
- "call grok" / "spawn grok agent" / "use grok" / "ask grok to …"

That routes to subagent **`grok:grok-rescue`** → companion `task` → headless `grok -p`.

Slash form still works: `/grok:rescue <task>`.

## Commands

| Command | Mode | What |
|---|---|---|
| `/grok:setup` | — | Probe binary + auth; toggle review gate |
| `/grok:review` | plan | Working-tree review |
| `/grok:adversarial-review` | plan | Challenge design/approach |
| `/grok:ask` | plan | Free-form Q&A |
| `/grok:rescue` | write (`task`) | Delegate real work via subagent |
| `/grok:status` / `result` / `cancel` | — | Job control |

Rescue flags: `--background`, `--wait`, `--resume`, `--fresh`, `--model`, `--max-turns`.

Companion primary entry is **`task`** (Codex parity). `rescue` is a write-forced alias.

### Optional stop-time review gate

```bash
/grok:setup --enable-review-gate
```

## How it works

```
User: "вызови grok, почини flaky test"
  └─ Claude spawns grok:grok-rescue
       └─ node scripts/grok-companion.mjs task "…"
            └─ grok -p … --output-format json \
                   --permission-mode bypassPermissions --always-approve
```

Review / ask / stop-gate use `--permission-mode plan`.

State: `~/.grok-plugin-cc/`

## Env

| Var | Purpose |
|---|---|
| `GROK_PLUGIN_CC_GROK_BIN` | Absolute path to `grok` |
| `GROK_PLUGIN_CC_STATE_DIR` | Override state directory |

## Gap vs Codex (honest)

Still lighter than `codex-plugin-cc`:

- no app-server broker / native structured review schema enforcement
- no session lifecycle SessionStart/End hooks
- stop-gate is opt-in and uses plan-mode Grok (not a separate native reviewer)

Close enough for daily multi-model rescue + natural-language spawn.

## License

MIT

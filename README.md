# grok-plugin-cc

Use [Grok Build CLI](https://x.ai) from [Claude Code](https://claude.ai/code) as a second agent — review, ask, rescue, optional stop-time gate.

Pattern mirrors OpenAI's `codex-plugin-cc` and community `kimi-plugin-cc`: thin slash-command shell + local companion that spawns headless `grok -p`.

## Requirements

- **Grok Build CLI** on PATH (or `~/.grok/bin/grok`), authenticated
- **Node.js** ≥ 18
- **Claude Code** with plugins enabled

## Install

### From GitHub

```bash
/plugin marketplace add Surdeddd/grok-plugin-cc
/plugin install grok@grok-marketplace
/reload-plugins
/grok:setup
```

### From local clone

```bash
claude plugin marketplace add ~/Projects/Personal/grok-plugin-cc
claude plugin install grok@grok-marketplace
```

Or one-shot for a session:

```bash
claude --plugin-dir ~/Projects/Personal/grok-plugin-cc
```

## Commands

| Command | Mode | What it does |
|---|---|---|
| `/grok:setup` | — | Probe binary + auth; toggle review gate |
| `/grok:review [focus]` | plan (read-only) | Review working tree |
| `/grok:ask <q>` | plan (read-only) | Free-form Q&A |
| `/grok:rescue [task]` | write | Delegate real work |
| `/grok:status` / `result` / `cancel` | — | Job control |

Rescue flags: `--background`, `--resume`, `--fresh`, `--model`, `--max-turns`.

### Optional stop-time review gate

```bash
/grok:setup --enable-review-gate
/grok:setup --disable-review-gate
```

When enabled, a Claude Code `Stop` hook runs Grok in plan mode. Grok must answer with:

```
ALLOW: <reason>
# or
BLOCK: <reason>
```

`BLOCK` keeps Claude from ending the turn until issues are fixed (or the gate is disabled).

## How it works

```
/grok:rescue "fix the flaky test"
    └─ node scripts/grok-companion.mjs rescue ...
         └─ grok -p "<prompt>" --output-format json \
                --permission-mode bypassPermissions --always-approve
```

Review/ask/stop-gate use `--permission-mode plan` so Grok cannot mutate the tree.

Job state: `~/.grok-plugin-cc/jobs/`  
Config: `~/.grok-plugin-cc/config.json`

## Env overrides

| Var | Purpose |
|---|---|
| `GROK_PLUGIN_CC_GROK_BIN` | Absolute path to `grok` |
| `GROK_PLUGIN_CC_STATE_DIR` | Override state directory |

## Status

v0.2.0 — setup/review/ask/rescue + job tracking + optional stop-time review gate.

## License

MIT

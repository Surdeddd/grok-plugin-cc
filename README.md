# grok-plugin-cc

Use [Grok Build CLI](https://x.ai) from [Claude Code](https://claude.ai/code) as a second agent — **Codex-shaped** companion for review, adversarial review, ask, rescue/task, and optional stop-time gate.

```
Claude Code  ──slash / NL──►  grok:grok-rescue / commands
                              └─ node scripts/grok-companion.mjs
                                   └─ grok -p --output-format json
```

## Install (60 seconds)

```bash
# Claude Code
/plugin marketplace add Surdeddd/grok-plugin-cc
/plugin install grok@grok-marketplace
/reload-plugins
/grok:setup
```

Requires: **Grok Build CLI** authenticated (`~/.grok/bin/grok`), Node ≥ 18.

Local dev:

```bash
claude plugin marketplace add ~/Projects/Personal/grok-plugin-cc
claude plugin install grok@grok-marketplace
npm --prefix ~/Projects/Personal/grok-plugin-cc run check
```

## Natural-language spawn

Say things like:

- «вызови grok» / «grok-агент» / «подними grok»
- "call grok" / "spawn grok" / "ask grok to fix …"

→ Claude spawns **`grok:grok-rescue`** → companion `task` → headless Grok (write by default).

Slash: `/grok:rescue <task>`.

## Commands

| Command | Mode | What |
|---|---|---|
| `/grok:setup` | — | Probe binary + auth; toggle review gate; show cwd resume |
| `/grok:review` | plan + **schema** | Structured review (`--scope` / `--base`) |
| `/grok:adversarial-review` | plan + **schema** | Challenge design/approach |
| `/grok:ask` | plan | Free-form Q&A |
| `/grok:rescue` | write (`task`) | Delegate work via subagent |
| `/grok:status` / `result` / `cancel` | — | Job control (status default = cwd) |
| `/grok:wait` | — | Block until job finishes (`--follow` for live log) |
| `/grok:logs` | — | Tail progress journal (`--follow`) |

Flags: `--background`, `--wait`, `--resume` / `--fresh`, `--scope`, `--base`, `--best-of-n`, `--check`, `--model`, `--max-turns`, `--dry-run`, `--stream`.

### Structured review

Reviews use Grok `--json-schema` with Codex-compatible shape:

`verdict` · `summary` · `findings[]` · `next_steps[]`

Human output is markdown; `--json` returns the full job envelope (includes `structured`).

Scopes:

```bash
/grok:review --scope working-tree
/grok:review --scope branch --base main
/grok:adversarial-review --scope auto
```

### Resume (per workspace)

Task sessions are indexed per cwd under `~/.grok-plugin-cc/cwd-index/`.

- `/grok:rescue --resume` → last task session **for this repo**
- if no stored session id → falls back to `grok --continue` for the cwd

### Stop-time review gate (optional)

```bash
/grok:setup --enable-review-gate
/grok:setup --disable-review-gate
```

When enabled, Stop hook runs Grok plan-mode; first line must be `ALLOW:` or `BLOCK:`.
Skips pure setup/status turns; notes running background jobs.

## Companion CLI

```bash
node scripts/grok-companion.mjs setup --json
node scripts/grok-companion.mjs review --dry-run
node scripts/grok-companion.mjs task --resume-last "continue"
node scripts/grok-companion.mjs task-resume-candidate
node scripts/grok-companion.mjs status
node scripts/grok-companion.mjs cancel --all
node scripts/grok-companion.mjs prune --keep 50
node scripts/grok-companion.mjs wait <job-id> --follow
node scripts/grok-companion.mjs logs <job-id> --follow
node scripts/grok-companion.mjs review --best-of-n 3 --scope working-tree
node scripts/grok-companion.mjs task --check "fix flaky test"
node scripts/grok-companion.mjs doctor
```

### Progress

Background/foreground task & ask jobs write:

`~/.grok-plugin-cc/jobs/<id>.progress.jsonl`

- `status` — short progress summary  
- `logs --follow` — live journal  
- `wait --follow` — block + stream until done  

### Best-of-N / check

```bash
/grok:review --best-of-n 3 --scope working-tree
/grok:rescue --check "implement the fix and verify"
```

Uses Grok CLI `--best-of-n` / `--check` (more tokens; quality over speed).

## Tests & demo

```bash
npm test          # unit + dry-run smoke (no Grok tokens)
npm run check     # syntax + tests
npm run demo      # printable dry-run walkthrough
```

See [DEMO.md](./DEMO.md). CI: GitHub Actions on `main` / PRs.

## Env

| Var | Purpose |
|---|---|
| `GROK_PLUGIN_CC_GROK_BIN` | Absolute path to `grok` |
| `GROK_PLUGIN_CC_STATE_DIR` | Override state dir (default `~/.grok-plugin-cc`) |

## Layout

```
agents/grok-rescue.md     # NL-discoverable subagent
commands/                 # slash commands
skills/                   # forwarder contracts
scripts/grok-companion.mjs
scripts/lib/              # cwd-index, review-render
schemas/review-output.schema.json
hooks/hooks.json          # optional Stop gate
```

## Gap vs Codex (honest)

Still lighter than `codex-plugin-cc`: no app-server broker, no native review-service path. Close enough for daily multi-model rescue + structured reviews.

## License

MIT

# Demo — grok-plugin-cc

60-second story for Claude Code + Grok Build.

## Install

```bash
/plugin marketplace add Surdeddd/grok-plugin-cc
/plugin install grok@grok-marketplace
/reload-plugins
/grok:setup
```

Expected:

```
Status:          ready
Authenticated:   yes
Plugin version:  0.6.x
```

## Natural language

In Claude Code:

```
вызови grok, кратко опиши структуру этого репо
```

Claude spawns `grok:grok-rescue` → companion `task` → headless `grok -p`.

## Structured review

```bash
/grok:review --scope working-tree
# or
node scripts/grok-companion.mjs review --scope branch --base main
```

Output shape:

```markdown
# Grok review

**Verdict:** needs-attention

## Findings
### [high] ...
`src/file.ts:12-18` · confidence 0.8
...
```

## Background + wait

```bash
node scripts/grok-companion.mjs task --background "list top 3 TODOs in the repo"
# → job: <uuid>
node scripts/grok-companion.mjs status
node scripts/grok-companion.mjs wait <uuid>
```

Progress journal: `~/.grok-plugin-cc/jobs/<id>.progress.jsonl`

## Dry-run (no tokens)

```bash
npm run demo
# or
node scripts/grok-companion.mjs review --dry-run --scope working-tree
node scripts/grok-companion.mjs task --dry-run --readonly "ping"
```

## Record an asciinema (optional)

```bash
asciinema rec /tmp/grok-plugin-cc.cast
npm run demo
# Ctrl-D
asciinema upload /tmp/grok-plugin-cc.cast
```

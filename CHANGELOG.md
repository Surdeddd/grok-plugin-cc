# Changelog

## 0.4.0

Polish pass toward Codex daily-use quality:

- **Structured reviews** — `review` / `adversarial-review` force Grok `--json-schema` (`schemas/review-output.schema.json`) and render markdown findings
- **Per-cwd resume index** — `~/.grok-plugin-cc/cwd-index/<hash>.json` so `--resume-last` is workspace-scoped (falls back to `grok --continue`)
- **Stop-gate polish** — notes running jobs; skips non-edit turns (setup/status heuristics)
- **`--dry-run`** on review/ask/task for CI without burning tokens
- **Tests** — `npm test` / `npm run check` (render, cwd-index, smoke dry-run)
- Setup reports cwd resume session + running jobs

## 0.3.0

Codex-parity surface: `task`, `task-resume-candidate`, adversarial-review, skills, NL spawn triggers.

## 0.2.0

Optional Stop review gate (`ALLOW`/`BLOCK`).

## 0.1.0

Initial setup / review / ask / rescue + job tracking.

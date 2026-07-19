# Changelog

## 0.5.0

Next polish layer:

- **Review scopes** — `--scope auto|working-tree|branch` and `--base <ref>` with richer git context
- **Empty-scope short-circuit** — no token burn when nothing to review
- **Session lifecycle hooks** — SessionStart exports Claude session id; SessionEnd cancels jobs tagged with that session
- **Status UX** — default list is current cwd; `--all` for global; shows scope column
- **Cancel** — `cancel --all` for bulk stop; jobs tagged with `claudeSessionId`
- **Prune** — `prune [--keep N]` drops old finished job records (default keep 50)
- **Result meta header** — job id / scope / tokens line above markdown
- **GitHub Actions** — `npm run check` on push/PR

## 0.4.0

Structured reviews, per-cwd resume, dry-run tests, stop-gate polish.

## 0.3.0

Codex-parity surface: `task`, `task-resume-candidate`, adversarial-review, skills, NL spawn.

## 0.2.0

Optional Stop review gate.

## 0.1.0

Initial companion.

# Changelog

## 0.6.0

Live ops + demo:

- **Streaming progress** — task/ask default to `streaming-json`; journal `*.progress.jsonl` with heartbeats
- **`wait`** — poll background job until done, print result (`--timeout-seconds`, `--poll-ms`)
- **Doctor** — `setup`/`doctor` checks node, schema, state writable, hooks; shows running job progress
- **Status** — shows live progress summary for running jobs
- **DEMO.md** + `npm run demo` (token-free dry-run walkthrough)

## 0.5.0

Review scopes, session lifecycle, status/cancel UX, prune, GitHub Actions CI.

## 0.4.0

Structured reviews, per-cwd resume, dry-run tests, stop-gate polish.

## 0.3.0

Codex-parity surface: task, resume-candidate, adversarial-review, skills, NL spawn.

## 0.2.0

Optional Stop review gate.

## 0.1.0

Initial companion.

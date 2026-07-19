# Changelog

## 0.7.0

Live ops polish:

- **`logs` / `follow`** — tail `*.progress.jsonl` (`--tail`, `--follow`)
- **`wait --follow`** — stream progress lines while blocking on a job
- **`--best-of-n <n>`** — parallel Grok runs, pick best (review + task; disables stream)
- **`--check`** — Grok headless self-verification loop on task/rescue
- Doctor/setup unchanged; smoke tests cover new flags

## 0.6.0

Streaming progress, wait, doctor, demo.

## 0.5.0

Review scopes, session lifecycle, status/cancel UX, prune, CI.

## 0.4.0

Structured reviews, per-cwd resume, dry-run tests.

## 0.3.0

Codex-parity surface + NL spawn.

## 0.2.0

Stop review gate.

## 0.1.0

Initial companion.

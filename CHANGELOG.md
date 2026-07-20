# Changelog

## 0.7.1

Reliability fixes:

- **Stop gate fails open** — infra failures (missing binary, no auth, timeout,
  non-zero exit, empty/unexpected output) now warn and allow the stop; only an
  explicit `BLOCK:` finding blocks. Previously a broken Grok setup could trap
  the session in an unstoppable turn.
- **Stop gate loop guard** — respects `stop_hook_active`; never blocks twice in
  a row.
- **Cancel no longer races to "failed"** — `cancel` (and SessionEnd cleanup)
  marks the job cancelled *before* killing, and both foreground and background
  finalizers preserve the cancelled status instead of overwriting it.
- **Graceful termination** — SIGTERM with a short grace period before SIGKILL
  (cancel + SessionEnd), instead of immediate SIGKILL.
- **`prune` removes `*.progress.jsonl`** — progress journals no longer leak.
- **`status`/`result`/`wait` skip dry-run artifacts** when resolving the latest
  job.
- Dead code cleanup: unused `splitArgs().idArg`, no-op `--stream` conditions.

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

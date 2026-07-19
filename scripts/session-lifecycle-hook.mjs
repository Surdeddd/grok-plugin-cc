#!/usr/bin/env node
/**
 * Lightweight SessionStart/SessionEnd hooks for grok-plugin-cc.
 * - SessionStart: export GROK_PLUGIN_CC_CLAUDE_SESSION_ID when CLAUDE_ENV_FILE is set
 * - SessionEnd: mark/kill running jobs that belong to this cwd (best-effort cleanup)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const STATE_DIR = process.env.GROK_PLUGIN_CC_STATE_DIR
  || path.join(os.homedir(), ".grok-plugin-cc");
const JOBS_DIR = path.join(STATE_DIR, "jobs");
const SESSION_ENV = "GROK_PLUGIN_CC_CLAUDE_SESSION_ID";

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function appendEnvVar(name, value) {
  if (!process.env.CLAUDE_ENV_FILE || value == null || value === "") return;
  fs.appendFileSync(
    process.env.CLAUDE_ENV_FILE,
    `export ${name}=${shellEscape(value)}\n`,
    "utf8",
  );
}

function listJobs() {
  try {
    if (!fs.existsSync(JOBS_DIR)) return [];
    return fs.readdirSync(JOBS_DIR)
      .filter((f) => /^[0-9a-f-]{36}\.json$/i.test(f))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), "utf8"));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeJob(job) {
  fs.writeFileSync(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2));
}

function handleSessionStart(input) {
  if (input.session_id) appendEnvVar(SESSION_ENV, input.session_id);
}

function handleSessionEnd(input) {
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const resolved = path.resolve(cwd);
  const sessionId = input.session_id || process.env[SESSION_ENV] || null;
  let killed = 0;

  for (const job of listJobs()) {
    if (job.status !== "running") continue;
    const sameCwd = path.resolve(job.cwd || "") === resolved;
    const sameSession = sessionId && job.claudeSessionId && job.claudeSessionId === sessionId;
    // Only auto-kill if we tagged the job with this Claude session; otherwise leave detached tasks alone
    if (!sameSession) continue;
    if (!sameCwd && job.cwd) continue;
    if (job.pid) {
      try { process.kill(job.pid, "SIGTERM"); } catch { /* ignore */ }
      try { process.kill(job.pid, "SIGKILL"); } catch { /* ignore */ }
    }
    job.status = "cancelled";
    job.finishedAt = new Date().toISOString();
    job.error = "cancelled on Claude SessionEnd";
    writeJob(job);
    killed += 1;
  }

  if (killed > 0) {
    process.stderr.write(`grok-plugin-cc: cancelled ${killed} running job(s) on SessionEnd\n`);
  }
}

const event = process.argv[2] || "SessionStart";
const input = readHookInput();

if (event === "SessionStart") handleSessionStart(input);
else if (event === "SessionEnd") handleSessionEnd(input);

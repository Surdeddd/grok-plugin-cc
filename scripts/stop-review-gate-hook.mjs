#!/usr/bin/env node
/**
 * Optional Claude Code Stop hook: ask Grok to ALLOW/BLOCK before the turn ends.
 * Enabled via: /grok:setup --enable-review-gate
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const STATE_DIR = process.env.GROK_PLUGIN_CC_STATE_DIR
  || path.join(os.homedir(), ".grok-plugin-cc");
const CONFIG_PATH = path.join(STATE_DIR, "config.json");
const JOBS_DIR = path.join(STATE_DIR, "jobs");
const STOP_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_TURNS = 8;

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function emitDecision(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function logNote(message) {
  if (message) process.stderr.write(`${message}\n`);
}

function getConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { stopReviewGate: false };
    return { stopReviewGate: false, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { stopReviewGate: false };
  }
}

function listRunningJobs(cwd) {
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
      .filter((j) => j && j.status === "running")
      .filter((j) => !cwd || path.resolve(j.cwd || "") === path.resolve(cwd));
  } catch {
    return [];
  }
}

function resolveGrokBin() {
  if (process.env.GROK_PLUGIN_CC_GROK_BIN) return process.env.GROK_PLUGIN_CC_GROK_BIN;
  const home = path.join(os.homedir(), ".grok", "bin", "grok");
  if (fs.existsSync(home)) return home;
  const r = spawnSync("bash", ["-lc", "command -v grok"], { encoding: "utf8" });
  return (r.stdout || "").trim() || null;
}

function authPresent() {
  const auth = path.join(os.homedir(), ".grok", "auth.json");
  try {
    return fs.existsSync(auth) && fs.readFileSync(auth, "utf8").length > 10;
  } catch {
    return false;
  }
}

function looksNonEditableTurn(message) {
  const t = String(message || "").trim();
  if (!t) return true;
  // setup/status/result dumps and pure Q&A without edit claims
  if (/^grok-plugin-cc setup/i.test(t)) return true;
  if (/^job:\s+/m.test(t) && /status:\s+/m.test(t) && t.length < 2000) return true;
  if (/Grok (task|rescue|review) started in background/i.test(t)) return true;
  return false;
}

function buildPrompt(input = {}) {
  const templatePath = path.join(ROOT_DIR, "prompts", "stop-review-gate.md");
  let template = fs.readFileSync(templatePath, "utf8");
  const last = String(input.last_assistant_message ?? "").trim();
  const block = last
    ? ["Previous Claude response:", last].join("\n")
    : "";
  return template.replaceAll("{{CLAUDE_RESPONSE_BLOCK}}", block);
}

function parseStopReviewOutput(rawOutput) {
  const text = String(rawOutput ?? "").trim();
  if (!text) {
    return {
      ok: false,
      reason:
        "The stop-time Grok review returned no final output. Run /grok:review manually or bypass the gate.",
    };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("ALLOW:")) return { ok: true, reason: null };
    if (line.startsWith("BLOCK:")) {
      const reason = line.slice("BLOCK:".length).trim() || text;
      return {
        ok: false,
        reason: `Grok stop-time review found issues that still need fixes before ending: ${reason}`,
      };
    }
  }

  if (/\bALLOW\b/i.test(text) && !/\bBLOCK\b/i.test(text)) {
    return { ok: true, reason: null };
  }

  return {
    ok: false,
    reason:
      "The stop-time Grok review returned an unexpected answer. Run /grok:review manually or bypass the gate.",
  };
}

function runStopReview(cwd, input = {}) {
  const grok = resolveGrokBin();
  if (!grok) {
    return {
      ok: false,
      reason: "Grok binary not found for stop-time review. Run /grok:setup.",
    };
  }
  if (!authPresent()) {
    return {
      ok: false,
      reason: "Grok is not authenticated for stop-time review. Run /grok:setup.",
    };
  }

  const prompt = buildPrompt(input);
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--permission-mode", "plan",
    "--max-turns", String(DEFAULT_MAX_TURNS),
    "--cwd", cwd,
  ];

  const result = spawnSync(grok, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: STOP_REVIEW_TIMEOUT_MS,
  });

  if (result.error?.code === "ETIMEDOUT") {
    return {
      ok: false,
      reason:
        "The stop-time Grok review timed out after 15 minutes. Run /grok:review manually or bypass the gate.",
    };
  }

  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    return {
      ok: false,
      reason: detail
        ? `The stop-time Grok review failed: ${detail.slice(0, 500)}`
        : "The stop-time Grok review failed. Run /grok:review manually or bypass the gate.",
    };
  }

  let text = result.stdout || "";
  try {
    const obj = JSON.parse(String(result.stdout || "").trim());
    text = obj.text ?? text;
  } catch {
    // plain text fallback
  }

  return parseStopReviewOutput(text);
}

function main() {
  const input = readHookInput();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const config = getConfig();

  const running = listRunningJobs(cwd);
  const runningNote = running.length
    ? `Grok job(s) still running: ${running.map((j) => `${j.id.slice(0, 8)}(${j.kind})`).join(", ")}. Check /grok:status or /grok:cancel.`
    : null;

  if (!config.stopReviewGate) {
    logNote(runningNote);
    return;
  }

  // Skip expensive gate on pure status/setup turns
  if (looksNonEditableTurn(input.last_assistant_message)) {
    logNote(runningNote);
    logNote("stop-review-gate: skipped (non-edit turn heuristic)");
    return;
  }

  const review = runStopReview(cwd, input);
  if (!review.ok) {
    emitDecision({
      decision: "block",
      reason: runningNote ? `${runningNote} ${review.reason}` : review.reason,
    });
    return;
  }

  logNote(runningNote);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

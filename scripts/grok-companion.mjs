#!/usr/bin/env node
/**
 * Thin companion for grok-plugin-cc (Codex-shaped).
 * Spawns local `grok` CLI headless and tracks jobs with per-cwd resume index.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { recordJobInCwdIndex, readCwdIndex } from "./lib/cwd-index.mjs";
import { renderReviewMarkdown, tryParseReviewPayload } from "./lib/review-render.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const STATE_DIR = process.env.GROK_PLUGIN_CC_STATE_DIR
  || path.join(os.homedir(), ".grok-plugin-cc");
const JOBS_DIR = path.join(STATE_DIR, "jobs");
const LATEST_PATH = path.join(STATE_DIR, "latest.json");
const CONFIG_PATH = path.join(STATE_DIR, "config.json");
const REVIEW_SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "review-output.schema.json");
const PLUGIN_VERSION = "0.4.0";
const TASK_KINDS = new Set(["task", "rescue"]);
const REVIEW_KINDS = new Set(["review", "adversarial-review"]);

const DEFAULT_MAX_TURNS_REVIEW = 12;
const DEFAULT_MAX_TURNS_ASK = 16;
const DEFAULT_MAX_TURNS_RESCUE = 40;
const DEFAULT_MAX_TURNS_ADVERSARIAL = 16;

function usage() {
  console.log(`Usage:
  node scripts/grok-companion.mjs setup [--json] [--enable-review-gate|--disable-review-gate]
  node scripts/grok-companion.mjs review [--json] [--dry-run] [--model <m>] [--max-turns <n>] [focus]
  node scripts/grok-companion.mjs adversarial-review [--json] [--dry-run] [--model <m>] [--max-turns <n>] [focus]
  node scripts/grok-companion.mjs ask [--json] [--dry-run] [--model <m>] [--max-turns <n>] [question]
  node scripts/grok-companion.mjs task [--json] [--dry-run] [--background] [--write|--readonly] [--resume-last|--resume|--fresh] [--model <m>] [--max-turns <n>] [prompt]
  node scripts/grok-companion.mjs rescue ...   (alias of task --write)
  node scripts/grok-companion.mjs task-resume-candidate [--json]
  node scripts/grok-companion.mjs status [job-id] [--json] [--all]
  node scripts/grok-companion.mjs result [job-id] [--json]
  node scripts/grok-companion.mjs cancel [job-id] [--json]`);
}

function getConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { stopReviewGate: false };
    return { stopReviewGate: false, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { stopReviewGate: false };
  }
}

function setConfig(patch) {
  ensureDirs();
  const next = { ...getConfig(), ...patch, updatedAt: nowIso() };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDirs() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

function jobPath(id) {
  return path.join(JOBS_DIR, `${id}.json`);
}

function writeJob(job) {
  ensureDirs();
  fs.writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2));
  fs.writeFileSync(
    LATEST_PATH,
    JSON.stringify({ id: job.id, kind: job.kind, cwd: job.cwd, updatedAt: nowIso() }, null, 2),
  );
  try {
    recordJobInCwdIndex(STATE_DIR, job);
  } catch { /* non-fatal */ }
  return job;
}

function readJob(id) {
  const p = jobPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listJobs() {
  ensureDirs();
  return fs.readdirSync(JOBS_DIR)
    .filter((f) => /^[0-9a-f-]{36}\.json$/i.test(f))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((j) => j && j.id && j.kind)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

function jobsForCwd(cwd = process.cwd()) {
  const resolved = path.resolve(cwd);
  return listJobs().filter((j) => path.resolve(j.cwd || "") === resolved);
}

function resolveLatestJobId() {
  const cwdJobs = jobsForCwd();
  if (cwdJobs[0]?.id) return cwdJobs[0].id;
  if (fs.existsSync(LATEST_PATH)) {
    try {
      const latest = JSON.parse(fs.readFileSync(LATEST_PATH, "utf8"));
      if (latest?.id && readJob(latest.id)) return latest.id;
    } catch { /* fall through */ }
  }
  return listJobs()[0]?.id ?? null;
}

function resolveJobId(arg) {
  if (arg) return arg;
  return resolveLatestJobId();
}

function which(bin) {
  const r = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  const p = (r.stdout || "").trim();
  return p || null;
}

function resolveGrokBin() {
  if (process.env.GROK_PLUGIN_CC_GROK_BIN) return process.env.GROK_PLUGIN_CC_GROK_BIN;
  const home = path.join(os.homedir(), ".grok", "bin", "grok");
  if (fs.existsSync(home)) return home;
  return which("grok");
}

function authPresent() {
  const auth = path.join(os.homedir(), ".grok", "auth.json");
  if (!fs.existsSync(auth)) return false;
  try {
    return fs.readFileSync(auth, "utf8").length > 10;
  } catch {
    return false;
  }
}

function loadPrompt(name, vars) {
  const p = path.join(ROOT_DIR, "prompts", `${name}.md`);
  let text = fs.readFileSync(p, "utf8");
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, v ?? "");
  }
  return text;
}

function gitContext() {
  const opts = { encoding: "utf8", cwd: process.cwd() };
  const status = spawnSync("git", ["status", "--short", "--untracked-files=all"], opts);
  const diffCached = spawnSync("git", ["diff", "--stat", "--cached"], opts);
  const diff = spawnSync("git", ["diff", "--stat"], opts);
  const parts = [];
  if (status.status === 0 && status.stdout.trim()) parts.push("status:\n" + status.stdout.trim());
  if (diffCached.status === 0 && diffCached.stdout.trim()) parts.push("staged:\n" + diffCached.stdout.trim());
  if (diff.status === 0 && diff.stdout.trim()) parts.push("unstaged:\n" + diff.stdout.trim());
  if (!parts.length) {
    const log = spawnSync("git", ["log", "-5", "--oneline"], opts);
    if (log.status === 0 && log.stdout.trim()) parts.push("recent commits:\n" + log.stdout.trim());
  }
  return parts.join("\n\n") || "(no git context)";
}

function splitArgs(argv) {
  const flags = new Set();
  const kv = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.add("json");
    else if (a === "--background") flags.add("background");
    else if (a === "--wait") flags.add("wait");
    else if (a === "--resume") flags.add("resume");
    else if (a === "--resume-last") flags.add("resume-last");
    else if (a === "--fresh") flags.add("fresh");
    else if (a === "--all") flags.add("all");
    else if (a === "--dry-run") flags.add("dry-run");
    else if (a === "--enable-review-gate") flags.add("enable-review-gate");
    else if (a === "--disable-review-gate") flags.add("disable-review-gate");
    else if (a === "--write") flags.add("write");
    else if (a === "--readonly" || a === "--read-only") flags.add("readonly");
    else if (a === "--model" || a === "-m") kv.model = argv[++i];
    else if (a === "--max-turns") kv.maxTurns = Number(argv[++i]);
    else if (a === "--session") kv.session = argv[++i];
    else if (a === "--effort") kv.effort = argv[++i];
    else if (a.startsWith("--")) positionals.push(a);
    else positionals.push(a);
  }
  return { flags, kv, text: positionals.join(" ").trim() };
}

function createJob({ kind, prompt, mode, model, maxTurns, resumeSession, resumeContinue, jsonSchemaPath }) {
  const id = randomUUID();
  const job = {
    id,
    kind,
    status: "running",
    prompt,
    mode,
    model: model || null,
    maxTurns: maxTurns || null,
    resumeSession: resumeSession || null,
    resumeContinue: Boolean(resumeContinue),
    jsonSchemaPath: jsonSchemaPath || null,
    sessionId: null,
    startedAt: nowIso(),
    finishedAt: null,
    exitCode: null,
    error: null,
    cwd: process.cwd(),
    pid: null,
    outputPath: path.join(JOBS_DIR, `${id}.out.json`),
    logPath: path.join(JOBS_DIR, `${id}.log`),
    text: null,
    structured: null,
  };
  return writeJob(job);
}

function parseGrokJson(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { text: "", sessionId: null, raw };
  try {
    const obj = JSON.parse(trimmed);
    return {
      text: obj.text ?? obj.message ?? trimmed,
      sessionId: obj.sessionId ?? obj.session_id ?? null,
      usage: obj.usage ?? null,
      stopReason: obj.stopReason ?? null,
      raw: obj,
    };
  } catch {
    const lines = trimmed.split("\n").filter(Boolean);
    let text = "";
    let sessionId = null;
    let last = null;
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        last = ev;
        if (ev.type === "text" && typeof ev.data === "string") text += ev.data;
        if (ev.type === "end") sessionId = ev.sessionId ?? sessionId;
      } catch { /* ignore */ }
    }
    return { text: text || trimmed, sessionId, raw: last ?? trimmed };
  }
}

function buildGrokArgs(job) {
  const args = [
    "-p", job.prompt,
    "--output-format", "json",
    "--cwd", job.cwd || process.cwd(),
  ];
  if (job.maxTurns) args.push("--max-turns", String(job.maxTurns));
  if (job.model) args.push("--model", job.model);

  if (job.jsonSchemaPath) {
    // Path form: grok accepts schema string; pass file contents as JSON string
    const schemaText = fs.readFileSync(job.jsonSchemaPath, "utf8");
    args.push("--json-schema", schemaText);
  }

  if (job.mode === "write") {
    args.push("--permission-mode", "bypassPermissions");
    args.push("--always-approve");
  } else {
    args.push("--permission-mode", "plan");
  }

  if (job.resumeSession) {
    args.push("--resume", job.resumeSession);
  } else if (job.resumeContinue) {
    args.push("--continue");
  }

  return args;
}

function finalizeJob(job, { exitCode, stdout, stderr, error }) {
  const parsed = parseGrokJson(stdout || "");
  job.exitCode = exitCode;
  job.finishedAt = nowIso();
  job.status = exitCode === 0 ? "completed" : "failed";
  job.sessionId = parsed.sessionId || job.sessionId;
  job.text = parsed.text || null;
  job.error = error || (exitCode === 0 ? null : (stderr || `exit ${exitCode}`).slice(0, 2000));
  job.usage = parsed.usage || null;

  // structured review extraction
  if (REVIEW_KINDS.has(job.kind)) {
    const structured = tryParseReviewPayload(parsed.raw) || tryParseReviewPayload(parsed.text);
    job.structured = structured;
    if (structured && !job.text) {
      job.text = JSON.stringify(structured);
    }
  }

  try {
    fs.writeFileSync(job.outputPath, JSON.stringify(parsed.raw ?? { text: stdout }, null, 2));
  } catch { /* ignore */ }
  if (stderr) {
    try { fs.appendFileSync(job.logPath, stderr); } catch { /* ignore */ }
  }
  return writeJob(job);
}

function formatJobOutput(job, flags) {
  if (flags.has("json")) return JSON.stringify(job, null, 2);

  if (REVIEW_KINDS.has(job.kind)) {
    const structured = job.structured
      || tryParseReviewPayload(job.text)
      || tryParseReviewPayload(job.raw);
    const md = renderReviewMarkdown(structured, {
      title: job.kind === "adversarial-review" ? "Grok adversarial review" : "Grok review",
    });
    if (md) return md;
  }

  return job.text || job.error || renderJobHuman(job);
}

function runGrokForeground(job) {
  const grok = resolveGrokBin();
  if (!grok) {
    job.status = "failed";
    job.error = "grok binary not found. Install Grok Build CLI or set GROK_PLUGIN_CC_GROK_BIN.";
    job.finishedAt = nowIso();
    writeJob(job);
    return Promise.resolve(job);
  }

  const args = buildGrokArgs(job);
  const outChunks = [];
  const errChunks = [];

  return new Promise((resolve) => {
    const child = spawn(grok, args, {
      cwd: job.cwd || process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    job.pid = child.pid;
    writeJob(job);

    child.stdout.on("data", (d) => outChunks.push(d));
    child.stderr.on("data", (d) => {
      errChunks.push(d);
      try { fs.appendFileSync(job.logPath, d); } catch { /* ignore */ }
    });

    child.on("error", (err) => {
      resolve(finalizeJob(job, {
        exitCode: 1,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
        error: String(err),
      }));
    });

    child.on("close", (code) => {
      resolve(finalizeJob(job, {
        exitCode: code ?? 1,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
      }));
    });
  });
}

function runGrokBackground(job) {
  const grok = resolveGrokBin();
  if (!grok) {
    job.status = "failed";
    job.error = "grok binary not found";
    job.finishedAt = nowIso();
    writeJob(job);
    return job;
  }

  const args = buildGrokArgs(job);
  const runner = `
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const jobPath = ${JSON.stringify(jobPath(job.id))};
const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
const args = ${JSON.stringify(args)};
const child = spawn(${JSON.stringify(grok)}, args, {
  cwd: job.cwd,
  env: process.env,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
job.pid = child.pid;
fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
const out = [];
const err = [];
child.stdout.on("data", (d) => out.push(d));
child.stderr.on("data", (d) => {
  err.push(d);
  try { fs.appendFileSync(job.logPath, d); } catch {}
});
child.on("close", (code) => {
  const stdout = Buffer.concat(out).toString("utf8");
  let text = stdout;
  let sessionId = null;
  let usage = null;
  let raw = stdout;
  try {
    const obj = JSON.parse(stdout.trim());
    text = obj.text ?? stdout;
    sessionId = obj.sessionId ?? null;
    usage = obj.usage ?? null;
    raw = obj;
  } catch {}
  job.exitCode = code ?? 1;
  job.status = code === 0 ? "completed" : "failed";
  job.finishedAt = new Date().toISOString();
  job.sessionId = sessionId;
  job.text = text;
  job.usage = usage;
  job.error = code === 0 ? null : Buffer.concat(err).toString("utf8").slice(0, 2000);
  try { fs.writeFileSync(job.outputPath, JSON.stringify(raw, null, 2)); } catch {}
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
  try {
    const stateDir = ${JSON.stringify(STATE_DIR)};
    const key = crypto.createHash("sha256").update(path.resolve(job.cwd || process.cwd())).digest("hex").slice(0, 24);
    const idxPath = path.join(stateDir, "cwd-index", key + ".json");
    fs.mkdirSync(path.dirname(idxPath), { recursive: true });
    let prev = {};
    try { prev = JSON.parse(fs.readFileSync(idxPath, "utf8")); } catch {}
    const entry = { jobId: job.id, sessionId: job.sessionId, status: job.status, finishedAt: job.finishedAt, startedAt: job.startedAt };
    const next = {
      ...prev,
      cwd: job.cwd,
      lastJobId: job.id,
      lastKind: job.kind,
      byKind: { ...(prev.byKind || {}), [job.kind]: entry },
      updatedAt: new Date().toISOString(),
    };
    if (job.sessionId && (job.kind === "task" || job.kind === "rescue")) {
      next.lastTaskSessionId = job.sessionId;
      next.lastTaskJobId = job.id;
    }
    fs.writeFileSync(idxPath, JSON.stringify(next, null, 2));
  } catch {}
  process.exit(0);
});
child.unref();
`;

  const child = spawn(process.execPath, ["-e", runner], {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
    env: process.env,
  });
  child.unref();
  job.status = "running";
  writeJob(job);
  return job;
}

function renderSetup(argv) {
  const { flags } = splitArgs(argv);
  if (flags.has("enable-review-gate") && flags.has("disable-review-gate")) {
    console.error("Choose either --enable-review-gate or --disable-review-gate.");
    process.exit(2);
  }

  let config = getConfig();
  if (flags.has("enable-review-gate")) {
    config = setConfig({ stopReviewGate: true });
  } else if (flags.has("disable-review-gate")) {
    config = setConfig({ stopReviewGate: false });
  }

  const grok = resolveGrokBin();
  let version = null;
  if (grok) {
    const r = spawnSync(grok, ["--version"], { encoding: "utf8" });
    version = (r.stdout || r.stderr || "").trim() || null;
  }
  const cwdIndex = readCwdIndex(STATE_DIR, process.cwd());
  const running = jobsForCwd().filter((j) => j.status === "running");
  const payload = {
    ok: Boolean(grok && authPresent()),
    grokBin: grok,
    version,
    authenticated: authPresent(),
    stateDir: STATE_DIR,
    pluginRoot: ROOT_DIR,
    pluginVersion: PLUGIN_VERSION,
    reviewGateEnabled: Boolean(config.stopReviewGate),
    cwd: process.cwd(),
    cwdResume: cwdIndex
      ? {
          lastTaskSessionId: cwdIndex.lastTaskSessionId || null,
          lastTaskJobId: cwdIndex.lastTaskJobId || null,
          lastJobId: cwdIndex.lastJobId || null,
        }
      : null,
    runningJobs: running.map((j) => j.id),
  };
  if (flags.has("json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const lines = [
    "grok-plugin-cc setup",
    "",
    `Status:          ${payload.ok ? "ready" : "not ready"}`,
    `Grok binary:     ${payload.grokBin || "(missing)"}`,
    `Version:         ${payload.version || "(unknown)"}`,
    `Authenticated:   ${payload.authenticated ? "yes" : "no — run: grok  (or complete OAuth)"}`,
    `Review gate:     ${payload.reviewGateEnabled ? "enabled" : "disabled"}`,
    `State dir:       ${payload.stateDir}`,
    `Plugin version:  ${payload.pluginVersion}`,
    `Cwd resume:      ${payload.cwdResume?.lastTaskSessionId || "(none yet)"}`,
    `Running jobs:    ${payload.runningJobs.length ? payload.runningJobs.join(", ") : "none"}`,
    "",
  ];
  if (payload.ok) {
    lines.push("Next: /grok:review, /grok:adversarial-review, /grok:ask, /grok:rescue");
    if (!payload.reviewGateEnabled) {
      lines.push("Optional: /grok:setup --enable-review-gate  (Stop hook blocks on BLOCK: findings)");
    }
  } else if (!grok) {
    lines.push("Install Grok Build CLI, or set GROK_PLUGIN_CC_GROK_BIN.");
  } else {
    lines.push("Authenticate Grok Build, then re-run /grok:setup.");
  }
  console.log(lines.join("\n"));
}

function renderJobHuman(job) {
  const lines = [
    `job:        ${job.id}`,
    `kind:       ${job.kind}`,
    `status:     ${job.status}`,
    `started:    ${job.startedAt}`,
    `finished:   ${job.finishedAt || "-"}`,
    `session:    ${job.sessionId || "-"}`,
    `cwd:        ${job.cwd}`,
  ];
  if (job.error) lines.push(`error:      ${job.error}`);
  if (job.text) lines.push("", "---", "", job.text);
  return lines.join("\n");
}

function lastResumableTaskJob(cwd = process.cwd()) {
  const idx = readCwdIndex(STATE_DIR, cwd);
  if (idx?.lastTaskJobId) {
    const j = readJob(idx.lastTaskJobId);
    if (j && TASK_KINDS.has(j.kind) && j.sessionId && j.status === "completed") return j;
  }
  if (idx?.lastTaskSessionId) {
    const match = jobsForCwd(cwd).find(
      (j) => TASK_KINDS.has(j.kind) && j.sessionId === idx.lastTaskSessionId && j.status === "completed",
    );
    if (match) return match;
  }
  return jobsForCwd(cwd).find(
    (j) => TASK_KINDS.has(j.kind) && j.sessionId && j.status === "completed",
  ) || null;
}

function lastResumableSession(cwd = process.cwd()) {
  const job = lastResumableTaskJob(cwd);
  if (job?.sessionId) return job.sessionId;
  const idx = readCwdIndex(STATE_DIR, cwd);
  return idx?.lastTaskSessionId || null;
}

function emitJobResult(job, flags, { backgroundNote } = {}) {
  if (backgroundNote && !flags.has("json")) {
    console.log(backgroundNote);
    return;
  }
  console.log(formatJobOutput(job, flags));
}

async function cmdReview(argv, {
  kind = "review",
  promptName = "review",
  maxTurnsDefault = DEFAULT_MAX_TURNS_REVIEW,
} = {}) {
  const { flags, kv, text } = splitArgs(argv);
  const prompt = loadPrompt(promptName, {
    FOCUS: text ? `Extra focus from user:\n${text}` : "",
    USER_FOCUS: text || "(none)",
    TARGET_LABEL: "working-tree / recent git state",
    GIT_CONTEXT: gitContext(),
    REVIEW_COLLECTION_GUIDANCE:
      "Use git status/diff of the working tree. Prefer concrete file:line findings.",
  });

  const job = createJob({
    kind,
    prompt,
    mode: "readonly",
    model: kv.model,
    maxTurns: kv.maxTurns || maxTurnsDefault,
    jsonSchemaPath: REVIEW_SCHEMA_PATH,
  });

  if (flags.has("dry-run")) {
    const args = buildGrokArgs(job);
    const payload = {
      dryRun: true,
      jobId: job.id,
      kind,
      grokBin: resolveGrokBin(),
      argsPreview: args.map((a, i) => (i > 0 && args[i - 1] === "--json-schema" ? "<schema>" : a)),
      schema: REVIEW_SCHEMA_PATH,
    };
    job.status = "cancelled";
    job.error = "dry-run";
    job.finishedAt = nowIso();
    writeJob(job);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const done = await runGrokForeground(job);
  emitJobResult(done, flags);
  process.exit(done.status === "completed" ? 0 : 1);
}

async function cmdAsk(argv) {
  const { flags, kv, text } = splitArgs(argv);
  if (!text) {
    console.error("Usage: ask [question]");
    process.exit(2);
  }
  const prompt = loadPrompt("ask", { TASK: text });
  const job = createJob({
    kind: "ask",
    prompt,
    mode: "readonly",
    model: kv.model,
    maxTurns: kv.maxTurns || DEFAULT_MAX_TURNS_ASK,
  });

  if (flags.has("dry-run")) {
    console.log(JSON.stringify({
      dryRun: true,
      jobId: job.id,
      kind: "ask",
      argsPreview: buildGrokArgs(job).map((a) => (a.length > 80 ? a.slice(0, 80) + "…" : a)),
    }, null, 2));
    job.status = "cancelled";
    job.error = "dry-run";
    job.finishedAt = nowIso();
    writeJob(job);
    return;
  }

  const done = await runGrokForeground(job);
  emitJobResult(done, flags);
  process.exit(done.status === "completed" ? 0 : 1);
}

async function cmdTask(argv, { forceWrite = false, kind = "task" } = {}) {
  const { flags, kv, text } = splitArgs(argv);
  const wantsResume = flags.has("resume") || flags.has("resume-last");
  const wantsFresh = flags.has("fresh");
  if (wantsResume && wantsFresh) {
    console.error("Choose either --resume/--resume-last or --fresh.");
    process.exit(2);
  }
  if (!text && !wantsResume) {
    console.error("Usage: task [--background] [--write|--readonly] [--resume-last|--fresh] [prompt]");
    process.exit(2);
  }

  let resumeSession = null;
  let resumeContinue = false;
  if (wantsResume || kv.session) {
    resumeSession = kv.session || lastResumableSession();
    if (!resumeSession) {
      // fall back to grok's native --continue for this cwd
      resumeContinue = true;
    }
  }

  const write = forceWrite || flags.has("write") || !flags.has("readonly");
  const taskText = text || "Continue the previous Grok task. Apply the next concrete step.";
  const prompt = loadPrompt(write ? "rescue" : "ask", { TASK: taskText });

  const job = createJob({
    kind,
    prompt,
    mode: write ? "write" : "readonly",
    model: kv.model,
    maxTurns: kv.maxTurns || DEFAULT_MAX_TURNS_RESCUE,
    resumeSession,
    resumeContinue,
  });

  if (flags.has("dry-run")) {
    console.log(JSON.stringify({
      dryRun: true,
      jobId: job.id,
      kind,
      mode: job.mode,
      resumeSession,
      resumeContinue,
      argsPreview: buildGrokArgs(job).map((a) => (a.length > 100 ? a.slice(0, 100) + "…" : a)),
    }, null, 2));
    job.status = "cancelled";
    job.error = "dry-run";
    job.finishedAt = nowIso();
    writeJob(job);
    return;
  }

  if (flags.has("background")) {
    runGrokBackground(job);
    emitJobResult(job, flags, {
      backgroundNote:
        `Grok task started in background.\njob: ${job.id}\nCheck /grok:status or /grok:result ${job.id}`,
    });
    return;
  }

  const done = await runGrokForeground(job);
  emitJobResult(done, flags);
  process.exit(done.status === "completed" ? 0 : 1);
}

function cmdTaskResumeCandidate(_argv) {
  const job = lastResumableTaskJob();
  const sessionId = job?.sessionId || lastResumableSession();
  const running = jobsForCwd().filter((j) => j.status === "running");
  const payload = sessionId
    ? {
        available: true,
        jobId: job?.id || null,
        sessionId,
        kind: job?.kind || "task",
        finishedAt: job?.finishedAt || null,
        cwd: process.cwd(),
        runningJobs: running.map((j) => ({ id: j.id, kind: j.kind })),
      }
    : {
        available: false,
        cwd: process.cwd(),
        runningJobs: running.map((j) => ({ id: j.id, kind: j.kind })),
      };
  console.log(JSON.stringify(payload, null, 2));
}

function refreshRunningJob(job) {
  if (job.status === "running" && job.pid) {
    try {
      process.kill(job.pid, 0);
    } catch {
      if (!job.finishedAt) {
        job.status = "failed";
        job.error = job.error || "process exited without finalizing job record";
        job.finishedAt = nowIso();
        writeJob(job);
      }
    }
  }
  return job;
}

function cmdStatus(argv) {
  const { flags } = splitArgs(argv);
  const idArg = argv.find((a) => !a.startsWith("--"));
  if (flags.has("all")) {
    const jobs = listJobs().map(refreshRunningJob);
    if (flags.has("json")) console.log(JSON.stringify(jobs, null, 2));
    else if (!jobs.length) console.log("No jobs.");
    else {
      for (const j of jobs) {
        const id = String(j.id || "?").slice(0, 8);
        const status = String(j.status || "?").padEnd(10);
        const kind = String(j.kind || "?").padEnd(18);
        console.log(`${id}  ${status}  ${kind}  ${j.startedAt || "-"}`);
      }
    }
    return;
  }
  const id = resolveJobId(idArg);
  if (!id) {
    console.log("No jobs yet.");
    return;
  }
  let job = readJob(id);
  if (!job) {
    console.error(`Job not found: ${id}`);
    process.exit(1);
  }
  job = refreshRunningJob(job);
  if (flags.has("json")) console.log(JSON.stringify(job, null, 2));
  else console.log(renderJobHuman(job));
}

function cmdResult(argv) {
  const { flags } = splitArgs(argv);
  const idArg = argv.find((a) => !a.startsWith("--"));
  const id = resolveJobId(idArg);
  if (!id) {
    console.error("No jobs yet.");
    process.exit(1);
  }
  const job = readJob(id);
  if (!job) {
    console.error(`Job not found: ${id}`);
    process.exit(1);
  }
  console.log(formatJobOutput(job, flags));
  process.exit(job.status === "completed" ? 0 : 1);
}

function cmdCancel(argv) {
  const { flags } = splitArgs(argv);
  const idArg = argv.find((a) => !a.startsWith("--"));
  const id = resolveJobId(idArg);
  if (!id) {
    console.error("No jobs to cancel.");
    process.exit(1);
  }
  const job = readJob(id);
  if (!job) {
    console.error(`Job not found: ${id}`);
    process.exit(1);
  }
  if (job.status !== "running") {
    if (flags.has("json")) console.log(JSON.stringify(job, null, 2));
    else console.log(`Job ${job.id} is already ${job.status}.`);
    return;
  }
  if (job.pid) {
    try { process.kill(job.pid, "SIGTERM"); } catch { /* ignore */ }
    try { process.kill(job.pid, "SIGKILL"); } catch { /* ignore */ }
  }
  job.status = "cancelled";
  job.finishedAt = nowIso();
  job.error = "cancelled by user";
  writeJob(job);
  if (flags.has("json")) console.log(JSON.stringify(job, null, 2));
  else console.log(`Cancelled ${job.id}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(cmd ? 0 : 2);
  }

  ensureDirs();

  switch (cmd) {
    case "setup":
      renderSetup(rest);
      break;
    case "review":
      await cmdReview(rest, { kind: "review", promptName: "review" });
      break;
    case "adversarial-review":
      await cmdReview(rest, {
        kind: "adversarial-review",
        promptName: "adversarial-review",
        maxTurnsDefault: DEFAULT_MAX_TURNS_ADVERSARIAL,
      });
      break;
    case "ask":
      await cmdAsk(rest);
      break;
    case "task":
      await cmdTask(rest, { kind: "task" });
      break;
    case "rescue":
      await cmdTask(rest, { forceWrite: true, kind: "rescue" });
      break;
    case "task-resume-candidate":
      cmdTaskResumeCandidate(rest);
      break;
    case "status":
      cmdStatus(rest);
      break;
    case "result":
      cmdResult(rest);
      break;
    case "cancel":
      cmdCancel(rest);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

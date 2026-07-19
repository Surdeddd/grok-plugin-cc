#!/usr/bin/env node
/**
 * Thin companion for grok-plugin-cc.
 * Spawns local `grok` CLI headless (-p / --output-format json) and tracks jobs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const STATE_DIR = process.env.GROK_PLUGIN_CC_STATE_DIR
  || path.join(os.homedir(), ".grok-plugin-cc");
const JOBS_DIR = path.join(STATE_DIR, "jobs");
const LATEST_PATH = path.join(STATE_DIR, "latest.json");
const CONFIG_PATH = path.join(STATE_DIR, "config.json");
const PLUGIN_VERSION = "0.2.0";

const DEFAULT_MAX_TURNS_REVIEW = 12;
const DEFAULT_MAX_TURNS_ASK = 16;
const DEFAULT_MAX_TURNS_RESCUE = 40;

function usage() {
  console.log(`Usage:
  node scripts/grok-companion.mjs setup [--json] [--enable-review-gate|--disable-review-gate]
  node scripts/grok-companion.mjs review [--json] [--model <m>] [--max-turns <n>] [focus]
  node scripts/grok-companion.mjs ask [--json] [--model <m>] [--max-turns <n>] [question]
  node scripts/grok-companion.mjs rescue [--json] [--background] [--resume|--fresh] [--model <m>] [--max-turns <n>] [task]
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
  fs.writeFileSync(LATEST_PATH, JSON.stringify({ id: job.id, kind: job.kind, updatedAt: nowIso() }, null, 2));
  return job;
}

function readJob(id) {
  const p = jobPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listJobs() {
  ensureDirs();
  // Job records are `<uuid>.json`. Skip sidecar files like `<uuid>.out.json`.
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

function resolveLatestJobId() {
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
    const raw = fs.readFileSync(auth, "utf8");
    return raw.length > 10;
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
    // branch tip as weak fallback
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
    else if (a === "--fresh") flags.add("fresh");
    else if (a === "--all") flags.add("all");
    else if (a === "--enable-review-gate") flags.add("enable-review-gate");
    else if (a === "--disable-review-gate") flags.add("disable-review-gate");
    else if (a === "--model" || a === "-m") kv.model = argv[++i];
    else if (a === "--max-turns") kv.maxTurns = Number(argv[++i]);
    else if (a === "--session") kv.session = argv[++i];
    else if (a.startsWith("--")) {
      // unknown flag: keep as positional text so user intent survives
      positionals.push(a);
    } else positionals.push(a);
  }
  return { flags, kv, text: positionals.join(" ").trim() };
}

function createJob({ kind, prompt, mode, model, maxTurns, resumeSession }) {
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
  };
  return writeJob(job);
}

function parseGrokJson(raw) {
  const trimmed = raw.trim();
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
    // streaming-json fallback: last end event + concatenated text
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

function buildGrokArgs({ prompt, mode, model, maxTurns, resumeSession }) {
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--cwd", process.cwd(),
  ];
  if (maxTurns) args.push("--max-turns", String(maxTurns));
  if (model) args.push("--model", model);

  if (mode === "write") {
    args.push("--permission-mode", "bypassPermissions");
    args.push("--always-approve");
  } else {
    // read-only / plan-only for review + ask
    args.push("--permission-mode", "plan");
  }

  if (resumeSession) {
    args.push("--resume", resumeSession);
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
  try {
    fs.writeFileSync(job.outputPath, JSON.stringify(parsed.raw ?? { text: stdout }, null, 2));
  } catch { /* ignore */ }
  if (stderr) {
    try { fs.appendFileSync(job.logPath, stderr); } catch { /* ignore */ }
  }
  return writeJob(job);
}

function runGrokForeground(job) {
  const grok = resolveGrokBin();
  if (!grok) {
    job.status = "failed";
    job.error = "grok binary not found. Install Grok Build CLI or set GROK_PLUGIN_CC_GROK_BIN.";
    job.finishedAt = nowIso();
    writeJob(job);
    return job;
  }

  const args = buildGrokArgs(job);
  const outChunks = [];
  const errChunks = [];

  return new Promise((resolve) => {
    const child = spawn(grok, args, {
      cwd: process.cwd(),
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

  const runner = `
import { spawn } from "node:child_process";
import fs from "node:fs";
const jobPath = ${JSON.stringify(jobPath(job.id))};
const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
const args = ${JSON.stringify(buildGrokArgs(job))};
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
  const payload = {
    ok: Boolean(grok && authPresent()),
    grokBin: grok,
    version,
    authenticated: authPresent(),
    stateDir: STATE_DIR,
    pluginRoot: ROOT_DIR,
    pluginVersion: PLUGIN_VERSION,
    reviewGateEnabled: Boolean(config.stopReviewGate),
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
    "",
  ];
  if (payload.ok) {
    lines.push("Next: /grok:review, /grok:ask, /grok:rescue");
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
  if (job.text) {
    lines.push("", "---", "", job.text);
  }
  return lines.join("\n");
}

function lastResumableSession(kind) {
  const jobs = listJobs().filter((j) => j.kind === kind && j.sessionId && j.status === "completed");
  return jobs[0]?.sessionId || null;
}

async function cmdReview(argv) {
  const { flags, kv, text } = splitArgs(argv);
  const prompt = loadPrompt("review", {
    FOCUS: text ? `Extra focus from user:\n${text}` : "",
    GIT_CONTEXT: gitContext(),
  });
  const job = createJob({
    kind: "review",
    prompt,
    mode: "readonly",
    model: kv.model,
    maxTurns: kv.maxTurns || DEFAULT_MAX_TURNS_REVIEW,
  });
  const done = await runGrokForeground(job);
  if (flags.has("json")) console.log(JSON.stringify(done, null, 2));
  else console.log(done.text || done.error || renderJobHuman(done));
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
  const done = await runGrokForeground(job);
  if (flags.has("json")) console.log(JSON.stringify(done, null, 2));
  else console.log(done.text || done.error || renderJobHuman(done));
  process.exit(done.status === "completed" ? 0 : 1);
}

async function cmdRescue(argv) {
  const { flags, kv, text } = splitArgs(argv);
  if (!text && !flags.has("resume")) {
    console.error("Usage: rescue [--background] [--resume|--fresh] [task]");
    process.exit(2);
  }

  let resumeSession = null;
  if (flags.has("resume") || (!flags.has("fresh") && kv.session)) {
    resumeSession = kv.session || lastResumableSession("rescue");
  }

  const taskText = text || "Continue the previous rescue task.";
  const prompt = loadPrompt("rescue", { TASK: taskText });
  const job = createJob({
    kind: "rescue",
    prompt,
    mode: "write",
    model: kv.model,
    maxTurns: kv.maxTurns || DEFAULT_MAX_TURNS_RESCUE,
    resumeSession,
  });

  if (flags.has("background")) {
    runGrokBackground(job);
    if (flags.has("json")) console.log(JSON.stringify(job, null, 2));
    else {
      console.log(`Grok rescue started in background.\njob: ${job.id}\nCheck /grok:status or /grok:result ${job.id}`);
    }
    return;
  }

  const done = await runGrokForeground(job);
  if (flags.has("json")) console.log(JSON.stringify(done, null, 2));
  else console.log(done.text || done.error || renderJobHuman(done));
  process.exit(done.status === "completed" ? 0 : 1);
}

function cmdStatus(argv) {
  const { flags } = splitArgs(argv);
  const idArg = argv.find((a) => !a.startsWith("--"));
  if (flags.has("all")) {
    const jobs = listJobs();
    if (flags.has("json")) console.log(JSON.stringify(jobs, null, 2));
    else {
      if (!jobs.length) console.log("No jobs.");
      else {
        for (const j of jobs) {
          const id = String(j.id || "?").slice(0, 8);
          const status = String(j.status || "?").padEnd(10);
          const kind = String(j.kind || "?").padEnd(7);
          console.log(`${id}  ${status}  ${kind}  ${j.startedAt || "-"}`);
        }
      }
    }
    return;
  }
  const id = resolveJobId(idArg);
  if (!id) {
    console.log("No jobs yet.");
    process.exit(0);
  }
  const job = readJob(id);
  if (!job) {
    console.error(`Job not found: ${id}`);
    process.exit(1);
  }
  // refresh running process liveness
  if (job.status === "running" && job.pid) {
    try {
      process.kill(job.pid, 0);
    } catch {
      // process gone but job not finalized — mark stale
      if (!job.finishedAt) {
        job.status = "failed";
        job.error = job.error || "process exited without finalizing job record";
        job.finishedAt = nowIso();
        writeJob(job);
      }
    }
  }
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
  if (flags.has("json")) console.log(JSON.stringify(job, null, 2));
  else console.log(job.text || job.error || renderJobHuman(job));
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
      await cmdReview(rest);
      break;
    case "ask":
      await cmdAsk(rest);
      break;
    case "rescue":
      await cmdRescue(rest);
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

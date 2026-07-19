/**
 * Per-cwd session/job index so resume is scoped to the workspace, not global last job.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function cwdKey(cwd) {
  const normalized = path.resolve(cwd || process.cwd());
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

export function cwdIndexPath(stateDir, cwd) {
  return path.join(stateDir, "cwd-index", `${cwdKey(cwd)}.json`);
}

export function readCwdIndex(stateDir, cwd) {
  const p = cwdIndexPath(stateDir, cwd);
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function writeCwdIndex(stateDir, cwd, patch) {
  const dir = path.join(stateDir, "cwd-index");
  fs.mkdirSync(dir, { recursive: true });
  const p = cwdIndexPath(stateDir, cwd);
  const prev = readCwdIndex(stateDir, cwd) || {
    cwd: path.resolve(cwd || process.cwd()),
    byKind: {},
  };
  const next = {
    ...prev,
    ...patch,
    byKind: { ...(prev.byKind || {}), ...(patch.byKind || {}) },
    updatedAt: new Date().toISOString(),
  };
  // deep-merge kind entries
  if (patch.byKind) {
    for (const [k, v] of Object.entries(patch.byKind)) {
      next.byKind[k] = { ...(prev.byKind?.[k] || {}), ...v };
    }
  }
  fs.writeFileSync(p, JSON.stringify(next, null, 2));
  return next;
}

export function recordJobInCwdIndex(stateDir, job) {
  if (!job?.cwd) return;
  const entry = {
    jobId: job.id,
    sessionId: job.sessionId || null,
    status: job.status,
    finishedAt: job.finishedAt || null,
    startedAt: job.startedAt || null,
  };
  const patch = {
    lastJobId: job.id,
    lastKind: job.kind,
    byKind: { [job.kind]: entry },
  };
  if (job.sessionId && (job.kind === "task" || job.kind === "rescue")) {
    patch.lastTaskSessionId = job.sessionId;
    patch.lastTaskJobId = job.id;
  }
  return writeCwdIndex(stateDir, job.cwd, patch);
}

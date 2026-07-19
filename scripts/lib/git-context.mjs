/**
 * Collect git context for review scopes (working-tree / branch / auto).
 */
import { spawnSync } from "node:child_process";

function runGit(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd });
  return {
    ok: r.status === 0,
    out: (r.stdout || "").trim(),
    err: (r.stderr || "").trim(),
  };
}

function detectDefaultBase(cwd) {
  for (const candidate of ["main", "master", "origin/main", "origin/master"]) {
    const r = runGit(["rev-parse", "--verify", candidate], cwd);
    if (r.ok) return candidate;
  }
  // upstream of current branch
  const up = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  if (up.ok && up.out) return up.out;
  return "HEAD~1";
}

function workingTreeParts(cwd) {
  const parts = [];
  const status = runGit(["status", "--short", "--untracked-files=all"], cwd);
  const cached = runGit(["diff", "--stat", "--cached"], cwd);
  const unstaged = runGit(["diff", "--stat"], cwd);
  const nameOnly = runGit(["diff", "--name-only", "HEAD"], cwd);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], cwd);

  if (status.ok && status.out) parts.push("status:\n" + status.out);
  if (cached.ok && cached.out) parts.push("staged:\n" + cached.out);
  if (unstaged.ok && unstaged.out) parts.push("unstaged:\n" + unstaged.out);
  if (nameOnly.ok && nameOnly.out) parts.push("changed files vs HEAD:\n" + nameOnly.out);
  if (untracked.ok && untracked.out) parts.push("untracked:\n" + untracked.out);

  const empty = !parts.length;
  if (empty) {
    const log = runGit(["log", "-5", "--oneline"], cwd);
    if (log.ok && log.out) parts.push("recent commits:\n" + log.out);
  }

  const fileHints = [
    ...(nameOnly.ok && nameOnly.out ? nameOnly.out.split("\n") : []),
    ...(untracked.ok && untracked.out ? untracked.out.split("\n") : []),
  ].filter(Boolean);

  return {
    text: parts.join("\n\n") || "(no git context)",
    empty,
    fileCount: new Set(fileHints).size,
    label: "working-tree (status + staged + unstaged)",
  };
}

function branchParts(cwd, base) {
  const resolvedBase = base || detectDefaultBase(cwd);
  const parts = [];
  const range = `${resolvedBase}...HEAD`;
  const stat = runGit(["diff", "--stat", range], cwd);
  const names = runGit(["diff", "--name-only", range], cwd);
  const log = runGit(["log", "--oneline", `${resolvedBase}..HEAD`], cwd);
  const status = runGit(["status", "--short", "--untracked-files=all"], cwd);

  parts.push(`base: ${resolvedBase}`);
  parts.push(`range: ${range}`);
  if (log.ok && log.out) parts.push("commits:\n" + log.out);
  if (stat.ok && stat.out) parts.push("diff stat:\n" + stat.out);
  if (names.ok && names.out) parts.push("files:\n" + names.out);
  if (status.ok && status.out) parts.push("extra working-tree dirty:\n" + status.out);

  const fileCount = names.ok && names.out ? names.out.split("\n").filter(Boolean).length : 0;
  const empty = fileCount === 0 && !(status.ok && status.out);

  return {
    text: parts.join("\n\n") || "(no branch diff)",
    empty,
    fileCount,
    label: `branch vs ${resolvedBase}`,
    base: resolvedBase,
  };
}

/**
 * @param {{ scope?: 'auto'|'working-tree'|'branch', base?: string, cwd?: string }} opts
 */
export function collectGitContext(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  let scope = opts.scope || "auto";
  if (!["auto", "working-tree", "branch"].includes(scope)) scope = "auto";

  const wt = workingTreeParts(cwd);

  if (scope === "working-tree") {
    return { scope: "working-tree", ...wt, base: null };
  }

  if (scope === "branch") {
    const br = branchParts(cwd, opts.base);
    return { scope: "branch", ...br };
  }

  // auto: prefer working tree when dirty, else branch
  if (!wt.empty) {
    return { scope: "working-tree", ...wt, base: null };
  }
  const br = branchParts(cwd, opts.base);
  return { scope: "branch", ...br };
}

export function estimateReviewSize(ctx) {
  const n = ctx.fileCount || 0;
  if (n <= 2 && !ctx.empty) return "tiny";
  if (n <= 8) return "small";
  return "large";
}

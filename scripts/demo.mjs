#!/usr/bin/env node
/**
 * Token-free demo of companion surface (dry-run + setup + resume candidate).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const companion = path.join(root, "scripts", "grok-companion.mjs");

function run(label, args) {
  console.log(`\n▸ ${label}`);
  console.log(`$ node scripts/grok-companion.mjs ${args.join(" ")}`);
  const r = spawnSync(process.execPath, [companion, ...args], {
    encoding: "utf8",
    cwd: root,
    env: process.env,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`(exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

console.log("grok-plugin-cc demo (no Grok tokens; dry-run + setup)");
run("setup", ["setup"]);
run("review dry-run + best-of-n", ["review", "--dry-run", "--scope", "working-tree", "--best-of-n", "2"]);
run("task dry-run + check", ["task", "--dry-run", "--readonly", "--check", "demo ping"]);
run("resume candidate", ["task-resume-candidate"]);
run("status", ["status"]);
run("logs (latest)", ["logs", "--tail", "5"]);
console.log("\n✓ demo complete — install plugin and try /grok:rescue for a live run");

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const companion = path.join(root, "scripts", "grok-companion.mjs");
const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

function run(args) {
  return spawnSync(process.execPath, [companion, ...args], {
    encoding: "utf8",
    cwd: root,
    env: {
      ...process.env,
      GROK_PLUGIN_CC_STATE_DIR: path.join(root, ".tmp-test-state"),
    },
  });
}

const setup = run(["setup", "--json"]);
assert.equal(setup.status, 0, setup.stderr);
const setupJson = JSON.parse(setup.stdout);
assert.equal(setupJson.pluginVersion, pkgVersion);
assert.ok("reviewGateEnabled" in setupJson);
assert.ok(setupJson.checks?.schemaOk);

// CI checkout is often a clean tree — dry-run must still return parseable JSON
const review = run(["review", "--dry-run", "--scope", "working-tree", "--best-of-n", "2"]);
assert.equal(review.status, 0, review.stderr + review.stdout);
let reviewJson;
try {
  reviewJson = JSON.parse(review.stdout);
} catch (e) {
  assert.fail(`review --dry-run must emit JSON even on clean tree; got:\n${review.stdout}`);
}
assert.equal(reviewJson.dryRun, true);
assert.equal(reviewJson.kind, "review");
assert.ok(reviewJson.git);
assert.equal(typeof reviewJson.git.empty, "boolean");
assert.equal(reviewJson.bestOfN, 2);
assert.ok(reviewJson.argsPreview.includes("--best-of-n"));
assert.ok(reviewJson.argsPreview.includes("--json-schema") || reviewJson.schema);

const adv = run(["adversarial-review", "--dry-run"]);
assert.equal(adv.status, 0, adv.stderr);
assert.equal(JSON.parse(adv.stdout).kind, "adversarial-review");

const task = run(["task", "--dry-run", "--readonly", "--check", "ping"]);
assert.equal(task.status, 0, task.stderr);
const taskJson = JSON.parse(task.stdout);
assert.equal(taskJson.dryRun, true);
assert.equal(taskJson.mode, "readonly");
assert.equal(taskJson.check, true);
assert.ok(taskJson.argsPreview.includes("--check"));

const candidate = run(["task-resume-candidate", "--json"]);
assert.equal(candidate.status, 0, candidate.stderr);
const cand = JSON.parse(candidate.stdout);
assert.ok("available" in cand);

const logs = run(["logs", "--tail", "5"]);
assert.equal(logs.status, 0, logs.stderr + logs.stdout);
assert.doesNotMatch(logs.stderr + logs.stdout, /Job not found: 5/);

const help = run(["--help"]);
assert.equal(help.status, 0);
assert.match(help.stdout, /best-of-n/);
assert.match(help.stdout, /logs\|follow/);

console.log("smoke-dry-run.test.mjs: ok");

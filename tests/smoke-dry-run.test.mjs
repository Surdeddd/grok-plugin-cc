import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const companion = path.join(root, "scripts", "grok-companion.mjs");

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
assert.equal(setupJson.pluginVersion, "0.6.0");
assert.ok("reviewGateEnabled" in setupJson);
assert.ok(setupJson.checks?.schemaOk);

const review = run(["review", "--dry-run", "--scope", "working-tree"]);
assert.equal(review.status, 0, review.stderr + review.stdout);
const reviewJson = JSON.parse(review.stdout);
assert.equal(reviewJson.dryRun, true);
assert.equal(reviewJson.kind, "review");
assert.ok(reviewJson.git);
assert.ok(reviewJson.argsPreview.includes("--json-schema") || reviewJson.schema);

const adv = run(["adversarial-review", "--dry-run"]);
assert.equal(adv.status, 0, adv.stderr);
assert.equal(JSON.parse(adv.stdout).kind, "adversarial-review");

const task = run(["task", "--dry-run", "--readonly", "ping"]);
assert.equal(task.status, 0, task.stderr);
const taskJson = JSON.parse(task.stdout);
assert.equal(taskJson.dryRun, true);
assert.equal(taskJson.mode, "readonly");

const candidate = run(["task-resume-candidate", "--json"]);
assert.equal(candidate.status, 0, candidate.stderr);
const cand = JSON.parse(candidate.stdout);
assert.ok("available" in cand);

const help = run(["--help"]);
assert.equal(help.status, 0);

console.log("smoke-dry-run.test.mjs: ok");

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectGitContext, estimateReviewSize } from "../scripts/lib/git-context.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grok-plugin-git-"));
const run = (args) => spawnSync("git", args, { cwd: tmp, encoding: "utf8" });

run(["init"]);
run(["config", "user.email", "t@example.com"]);
run(["config", "user.name", "t"]);
fs.writeFileSync(path.join(tmp, "a.txt"), "one\n");
run(["add", "a.txt"]);
run(["commit", "-m", "init"]);

// dirty working tree
fs.writeFileSync(path.join(tmp, "a.txt"), "two\n");
fs.writeFileSync(path.join(tmp, "b.txt"), "new\n");

const auto = collectGitContext({ cwd: tmp, scope: "auto" });
assert.equal(auto.scope, "working-tree");
assert.equal(auto.empty, false);
assert.ok(auto.fileCount >= 1);
assert.ok(["tiny", "small", "large"].includes(estimateReviewSize(auto)));

const wt = collectGitContext({ cwd: tmp, scope: "working-tree" });
assert.match(wt.text, /status:/);

// clean + branch commit
run(["add", "-A"]);
run(["commit", "-m", "change"]);
const branch = collectGitContext({ cwd: tmp, scope: "branch", base: "HEAD~1" });
assert.equal(branch.scope, "branch");
assert.ok(branch.fileCount >= 1);
assert.match(branch.label, /branch vs/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("git-context.test.mjs: ok");

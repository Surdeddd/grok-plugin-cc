import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cwdKey,
  readCwdIndex,
  recordJobInCwdIndex,
  writeCwdIndex,
} from "../scripts/lib/cwd-index.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grok-plugin-cc-cwd-"));
const cwdA = path.join(tmp, "proj-a");
const cwdB = path.join(tmp, "proj-b");
fs.mkdirSync(cwdA);
fs.mkdirSync(cwdB);

assert.notEqual(cwdKey(cwdA), cwdKey(cwdB));

writeCwdIndex(tmp, cwdA, { lastTaskSessionId: "sess-a", byKind: { task: { jobId: "j1" } } });
const a = readCwdIndex(tmp, cwdA);
assert.equal(a.lastTaskSessionId, "sess-a");
assert.equal(a.byKind.task.jobId, "j1");

recordJobInCwdIndex(tmp, {
  id: "job-2",
  kind: "rescue",
  cwd: cwdA,
  sessionId: "sess-a2",
  status: "completed",
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
});
const a2 = readCwdIndex(tmp, cwdA);
assert.equal(a2.lastTaskSessionId, "sess-a2");
assert.equal(a2.lastTaskJobId, "job-2");
assert.equal(a2.byKind.rescue.jobId, "job-2");

// B stays empty
assert.equal(readCwdIndex(tmp, cwdB), null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("cwd-index.test.mjs: ok");

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendProgress,
  createStreamAggregator,
  formatProgressHuman,
  readLastProgress,
} from "../scripts/lib/progress.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grok-prog-"));
const p = path.join(tmp, "p.jsonl");

appendProgress(p, { type: "created" });
appendProgress(p, { type: "heartbeat", progress: { toolCalls: 2, textChars: 10 } });
const last = readLastProgress(p, 5);
assert.equal(last.length, 2);
assert.equal(last[1].type, "heartbeat");

const agg = createStreamAggregator();
agg.onLine(JSON.stringify({ type: "thought", data: "hmm" }));
agg.onLine(JSON.stringify({ type: "text", data: "hello " }));
agg.onLine(JSON.stringify({ type: "text", data: "world" }));
agg.onLine(JSON.stringify({ type: "tool_call", name: "Read" }));
agg.onLine(JSON.stringify({ type: "end", sessionId: "sess-1", usage: { total_tokens: 9 } }));
const fin = agg.finish("");
assert.equal(fin.text, "hello world");
assert.equal(fin.sessionId, "sess-1");
assert.equal(fin.progress.toolCalls, 1);
assert.match(formatProgressHuman(fin.progress), /tools=1/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("progress.test.mjs: ok");

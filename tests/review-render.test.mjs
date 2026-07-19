import assert from "node:assert/strict";
import { renderReviewMarkdown, tryParseReviewPayload } from "../scripts/lib/review-render.mjs";

const sample = {
  verdict: "needs-attention",
  summary: "Auth refresh path looks unsafe.",
  findings: [
    {
      severity: "high",
      title: "JWT expiry not checked",
      body: "Refresh runs every request on slow clocks.",
      file: "src/auth.ts",
      line_start: 42,
      line_end: 47,
      confidence: 0.86,
      recommendation: "Check exp before refresh.",
    },
  ],
  next_steps: ["Add unit test for expired token"],
};

const parsed = tryParseReviewPayload(JSON.stringify(sample));
assert.equal(parsed.verdict, "needs-attention");
assert.equal(parsed.findings.length, 1);

const md = renderReviewMarkdown(parsed);
assert.match(md, /Verdict:\*\* needs-attention/);
assert.match(md, /src\/auth\.ts:42-47/);
assert.match(md, /JWT expiry not checked/);
assert.match(md, /Next steps/);

// nested in grok envelope text
const nested = tryParseReviewPayload({ text: JSON.stringify(sample) });
assert.equal(nested.verdict, "needs-attention");

// fenced
const fenced = tryParseReviewPayload("here:\n```json\n" + JSON.stringify(sample) + "\n```\n");
assert.equal(fenced.findings[0].severity, "high");

// approve empty findings
const ok = tryParseReviewPayload({
  verdict: "approve",
  summary: "clean",
  findings: [],
  next_steps: [],
});
const okMd = renderReviewMarkdown(ok);
assert.match(okMd, /No material findings/);

console.log("review-render.test.mjs: ok");

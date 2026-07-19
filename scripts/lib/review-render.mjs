/**
 * Render structured review JSON (codex-shaped) to markdown.
 */

export function tryParseReviewPayload(textOrObj) {
  if (textOrObj && typeof textOrObj === "object" && !Array.isArray(textOrObj)) {
    if (textOrObj.verdict && Array.isArray(textOrObj.findings)) return textOrObj;
    // grok envelope sometimes nests in text
    if (typeof textOrObj.text === "string") {
      return tryParseReviewPayload(textOrObj.text);
    }
    return null;
  }
  const raw = String(textOrObj ?? "").trim();
  if (!raw) return null;

  // direct JSON
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.verdict && Array.isArray(obj.findings)) return obj;
    if (obj && typeof obj.text === "string") return tryParseReviewPayload(obj.text);
  } catch { /* fall through */ }

  // fenced ```json ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const obj = JSON.parse(fence[1].trim());
      if (obj && obj.verdict && Array.isArray(obj.findings)) return obj;
    } catch { /* ignore */ }
  }

  // first {...} blob
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(raw.slice(start, end + 1));
      if (obj && obj.verdict && Array.isArray(obj.findings)) return obj;
    } catch { /* ignore */ }
  }
  return null;
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export function renderReviewMarkdown(review, { title = "Grok review" } = {}) {
  if (!review) return null;
  const findings = Array.isArray(review.findings)
    ? [...review.findings].sort(
        (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9),
      )
    : [];

  const lines = [
    `# ${title}`,
    "",
    `**Verdict:** ${review.verdict}`,
    "",
    review.summary || "",
    "",
  ];

  if (!findings.length) {
    lines.push("## Findings", "", "_No material findings._", "");
  } else {
    lines.push("## Findings", "");
    for (const f of findings) {
      const loc = f.file
        ? `${f.file}:${f.line_start ?? "?"}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ""}`
        : "(unknown location)";
      const conf = typeof f.confidence === "number" ? ` · confidence ${f.confidence}` : "";
      lines.push(`### [${f.severity || "?"}] ${f.title || "finding"}`);
      lines.push("");
      lines.push(`\`${loc}\`${conf}`);
      lines.push("");
      if (f.body) lines.push(f.body, "");
      if (f.recommendation) lines.push(`**Recommendation:** ${f.recommendation}`, "");
    }
  }

  if (Array.isArray(review.next_steps) && review.next_steps.length) {
    lines.push("## Next steps", "");
    for (const s of review.next_steps) lines.push(`- ${s}`);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

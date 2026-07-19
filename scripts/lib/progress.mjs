/**
 * Job progress journal (jsonl) + lightweight stream event parsing.
 */
import fs from "node:fs";

export function appendProgress(progressPath, event) {
  if (!progressPath) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...event,
  });
  try {
    fs.appendFileSync(progressPath, line + "\n");
  } catch { /* ignore */ }
}

export function readLastProgress(progressPath, limit = 20) {
  try {
    if (!progressPath || !fs.existsSync(progressPath)) return [];
    const lines = fs.readFileSync(progressPath, "utf8").split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return { raw: l }; }
    });
  } catch {
    return [];
  }
}

/**
 * Incremental NDJSON (streaming-json) line handler.
 * Returns aggregated { text, sessionId, eventCounts, lastType }.
 */
export function createStreamAggregator() {
  const state = {
    text: "",
    sessionId: null,
    eventCounts: Object.create(null),
    lastType: null,
    toolCalls: 0,
    thoughtChars: 0,
    textChars: 0,
  };

  function onLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return null;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      return null;
    }
    const type = ev.type || ev.event || "unknown";
    state.eventCounts[type] = (state.eventCounts[type] || 0) + 1;
    state.lastType = type;

    if (type === "text" && typeof ev.data === "string") {
      state.text += ev.data;
      state.textChars += ev.data.length;
    } else if (type === "thought" && typeof ev.data === "string") {
      state.thoughtChars += ev.data.length;
    } else if (type === "tool_call" || type === "tool" || type === "tool_use") {
      state.toolCalls += 1;
    } else if (type === "end") {
      state.sessionId = ev.sessionId || state.sessionId;
      if (ev.usage) state.usage = ev.usage;
    } else if (ev.sessionId) {
      state.sessionId = ev.sessionId;
    }
    return { type, state: snapshot() };
  }

  function snapshot() {
    return {
      textChars: state.textChars,
      thoughtChars: state.thoughtChars,
      toolCalls: state.toolCalls,
      lastType: state.lastType,
      eventCounts: { ...state.eventCounts },
      sessionId: state.sessionId,
    };
  }

  function finish(rawStdout) {
    // Prefer aggregated stream text; fall back to whole stdout parse
    let text = state.text;
    let sessionId = state.sessionId;
    let usage = state.usage || null;
    let raw = null;
    if (!text) {
      try {
        const obj = JSON.parse(String(rawStdout || "").trim());
        text = obj.text ?? "";
        sessionId = obj.sessionId ?? sessionId;
        usage = obj.usage ?? usage;
        raw = obj;
      } catch {
        text = String(rawStdout || "");
      }
    } else {
      raw = {
        text,
        sessionId,
        usage,
        stopReason: "EndTurn",
        stream: true,
      };
    }
    return { text, sessionId, usage, raw, progress: snapshot() };
  }

  return { onLine, snapshot, finish, state };
}

export function formatProgressHuman(p) {
  if (!p) return "…";
  const bits = [];
  if (p.toolCalls) bits.push(`tools=${p.toolCalls}`);
  if (p.textChars) bits.push(`text=${p.textChars}ch`);
  if (p.thoughtChars) bits.push(`think=${p.thoughtChars}ch`);
  if (p.lastType) bits.push(`last=${p.lastType}`);
  return bits.join(" ") || "running";
}

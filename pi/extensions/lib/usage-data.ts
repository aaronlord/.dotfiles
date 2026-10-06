/// <reference path="../../types/pi-runtime.d.ts" />

/**
 * usage-data — shared JSONL-parsing / session-stats cache
 *
 * Single module-level cache, populated by loadAllSessions(), queried via
 * getPeriodStats()/getDayStats(). Used by both footer.ts and usage.ts so
 * the ~/.pi/agent/sessions/ tree is walked once per session_start, not
 * once per extension.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelStats {
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DayStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byModel: Record<string, ModelStats>;
}

// ---------------------------------------------------------------------------
// In-memory cache   date (YYYY-MM-DD) → DayStats
// ---------------------------------------------------------------------------

const statsCache = new Map<string, DayStats>();

// dedupe: skip reload if same session_start emission as last call
let lastEvent: unknown = null;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function tsToDateKey(ts: string | number): string {
  if (typeof ts === "number") return new Date(ts).toISOString().slice(0, 10);
  return String(ts).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cache operations
// ---------------------------------------------------------------------------

function addToCache(
  dateKey: string,
  model: string,
  tokens: number,
  cost: number,
  inputTokens = 0,
  outputTokens = 0,
): void {
  let day = statsCache.get(dateKey);
  if (!day) {
    day = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      byModel: {},
    };
    statsCache.set(dateKey, day);
  }
  day.totalTokens += tokens;
  day.inputTokens += inputTokens;
  day.outputTokens += outputTokens;
  day.costUsd += cost;
  if (!day.byModel[model]) {
    day.byModel[model] = {
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }
  day.byModel[model].tokens += tokens;
  day.byModel[model].inputTokens += inputTokens;
  day.byModel[model].outputTokens += outputTokens;
  day.byModel[model].costUsd += cost;
}

// ---------------------------------------------------------------------------
// Session file loading
// ---------------------------------------------------------------------------

function parseJsonlFile(filePath: string, skipFile?: string): void {
  if (skipFile && filePath === skipFile) return;
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (!msg) continue;

      const ts = entry.timestamp;
      if (!ts) continue;
      const dateKey = tsToDateKey(ts);

      if (msg.role === "assistant") {
        const cost = msg.usage?.cost?.total;
        if (cost == null) continue;
        const model = msg.model ?? "unknown";
        const tokens =
          msg.usage.totalTokens ??
          (msg.usage.input ?? 0) +
            (msg.usage.output ?? 0) +
            (msg.usage.cacheRead ?? 0) +
            (msg.usage.cacheWrite ?? 0);
        addToCache(
          dateKey,
          model,
          tokens,
          cost,
          msg.usage.input ?? 0,
          msg.usage.output ?? 0,
        );
        continue;
      }

      // subagent processes run with --no-session (no JSONL of their own) — their
      // full usage rolls up into this toolResult message on the parent instead,
      // which is the only place that cost is ever recorded
      if (msg.role === "toolResult" && msg.toolName === "subagent") {
        const results = msg.details?.results;
        if (!Array.isArray(results)) continue;
        for (const r of results) {
          const cost = r?.usage?.cost;
          if (!cost) continue;
          const u = r.usage;
          const tokens =
            (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
          // subagent model is stored as "provider/model" (agent frontmatter form),
          // unlike the bare model id on normal assistant turns — strip to match
          const model = String(r.model ?? "unknown").split("/").pop() || "unknown";
          addToCache(
            dateKey,
            model,
            tokens,
            cost,
            u.input ?? 0,
            u.output ?? 0,
          );
        }
      }
    } catch {
      /* skip malformed lines */
    }
  }
}

export function loadAllSessions(
  skipFile: string | undefined,
  sessionStartEvent: unknown,
): void {
  if (sessionStartEvent === lastEvent) return;
  lastEvent = sessionStartEvent;
  statsCache.clear();
  const sessionsDir = join(homedir(), ".pi", "agent", "sessions");
  if (!existsSync(sessionsDir)) return;

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith(".jsonl")) {
          parseJsonlFile(full, skipFile);
        }
      } catch {
        /* skip */
      }
    }
  }

  walk(sessionsDir);
}

// ---------------------------------------------------------------------------
// Query API
// ---------------------------------------------------------------------------

export function getPeriodStats(
  fromKey: string,
  toKeyExclusive?: string,
): {
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
} {
  let tokens = 0,
    inputTokens = 0,
    outputTokens = 0,
    costUsd = 0;
  for (const [date, day] of statsCache) {
    if (date >= fromKey && (toKeyExclusive == null || date < toKeyExclusive)) {
      tokens += day.totalTokens;
      inputTokens += day.inputTokens;
      outputTokens += day.outputTokens;
      costUsd += day.costUsd;
    }
  }
  return { tokens, inputTokens, outputTokens, costUsd };
}

export function getDayStats(dateKey: string): DayStats | undefined {
  return statsCache.get(dateKey);
}

// all-time cost/tokens per model, across every cached day
export function getAllTimeByModel(): Record<string, ModelStats> {
  const byModel: Record<string, ModelStats> = {};
  for (const day of statsCache.values()) {
    for (const [model, stats] of Object.entries(day.byModel)) {
      if (!byModel[model]) {
        byModel[model] = {
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
      }
      byModel[model].tokens += stats.tokens;
      byModel[model].inputTokens += stats.inputTokens;
      byModel[model].outputTokens += stats.outputTokens;
      byModel[model].costUsd += stats.costUsd;
    }
  }
  return byModel;
}

// per-model cost/tokens for days >= fromKey
export function getByModelSince(fromKey: string): Record<string, ModelStats> {
  const byModel: Record<string, ModelStats> = {};
  for (const [date, day] of statsCache) {
    if (date < fromKey) continue;
    for (const [model, stats] of Object.entries(day.byModel)) {
      if (!byModel[model]) {
        byModel[model] = {
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
      }
      byModel[model].tokens += stats.tokens;
      byModel[model].inputTokens += stats.inputTokens;
      byModel[model].outputTokens += stats.outputTokens;
      byModel[model].costUsd += stats.costUsd;
    }
  }
  return byModel;
}

// live update: fold a just-completed turn into today's cache immediately
export function recordTurn(
  dateKey: string,
  model: string,
  tokens: number,
  cost: number,
  inputTokens = 0,
  outputTokens = 0,
): void {
  addToCache(dateKey, model, tokens, cost, inputTokens, outputTokens);
}

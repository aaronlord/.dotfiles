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
  costUsd: number;
}

export interface DayStats {
  totalTokens: number;
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
): void {
  let day = statsCache.get(dateKey);
  if (!day) {
    day = { totalTokens: 0, costUsd: 0, byModel: {} };
    statsCache.set(dateKey, day);
  }
  day.totalTokens += tokens;
  day.costUsd += cost;
  if (!day.byModel[model]) day.byModel[model] = { tokens: 0, costUsd: 0 };
  day.byModel[model].tokens += tokens;
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
      if (!msg || msg.role !== "assistant") continue;
      const cost = msg.usage?.cost?.total;
      if (cost == null) continue;

      const ts = entry.timestamp;
      if (!ts) continue;

      const dateKey = tsToDateKey(ts);
      const model = msg.model ?? "unknown";
      const tokens =
        msg.usage.totalTokens ??
        (msg.usage.input ?? 0) +
          (msg.usage.output ?? 0) +
          (msg.usage.cacheRead ?? 0) +
          (msg.usage.cacheWrite ?? 0);

      addToCache(dateKey, model, tokens, cost);
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

export function getPeriodStats(fromKey: string): {
  tokens: number;
  costUsd: number;
} {
  let tokens = 0,
    costUsd = 0;
  for (const [date, day] of statsCache) {
    if (date >= fromKey) {
      tokens += day.totalTokens;
      costUsd += day.costUsd;
    }
  }
  return { tokens, costUsd };
}

export function getDayStats(dateKey: string): DayStats | undefined {
  return statsCache.get(dateKey);
}

// live update: fold a just-completed turn into today's cache immediately
export function recordTurn(
  dateKey: string,
  model: string,
  tokens: number,
  cost: number,
): void {
  addToCache(dateKey, model, tokens, cost);
}

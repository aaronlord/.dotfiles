/**
 * usage — Token & cost tracker for Pi
 *
 * Registers /usage command with 7-day history table.
 * Tracks tokens + cost per day, filtered by model.
 *
 * Data source: Pi's session JSONL files at ~/.pi/agent/sessions/
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Box,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelStats {
  tokens: number;
  costUsd: number;
}

interface DayStats {
  totalTokens: number;
  costUsd: number;
  byModel: Record<string, ModelStats>;
}

interface UsageRow {
  dateKey: string;
  tokens: number;
  costUsd: number;
  isToday: boolean;
  isMax: boolean;
  byModel: Record<string, { tokens: number; costUsd: number }>;
}

interface UsageReport {
  rows: UsageRow[];
  maxCost: number;
  maxTokens: number;
  week: { tokens: number; costUsd: number };
  month: { tokens: number; costUsd: number };
  allTime: { tokens: number; costUsd: number };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const statsCache = new Map<string, DayStats>();

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStartKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function monthStartKey(): string {
  return new Date().toISOString().slice(0, 8) + "01";
}

function tsToDateKey(ts: string | number): string {
  if (typeof ts === "number") return new Date(ts).toISOString().slice(0, 10);
  return String(ts).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cache ops
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

function periodStats(fromKey: string): {
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

function loadAllSessions(skipFile?: string): void {
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
// Formatters
// ---------------------------------------------------------------------------

function fmtTok(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

function fmtDate(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function shortModel(model: string): string {
  const name = model.split("/").pop() ?? model;
  const stripped = name.replace(
    /^(claude|gpt|gemini|llama|mistral|qwen)-/,
    "",
  );
  return stripped.length > 0 ? stripped : name;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // -------------------------------------------------------------------------
  // Message renderer for /usage output
  // -------------------------------------------------------------------------

  pi.registerMessageRenderer("usage-report", (message, _options, theme) => {
    const report = message.details as UsageReport;
    const { rows, maxCost, maxTokens, week, month, allTime } = report;
    const BAR_W = 24;
    const LABEL_W = 40;

    function costBar(cost: number, isMax: boolean): string {
      if (maxCost === 0) return theme.fg("dim", "░".repeat(BAR_W));
      const filled = Math.round((cost / maxCost) * BAR_W);
      const fillColor = isMax ? "accent" : cost > 0 ? "borderAccent" : "dim";
      return (
        theme.fg(fillColor, "█".repeat(filled)) +
        theme.fg("dim", "░".repeat(BAR_W - filled))
      );
    }

    function tokCol(tokens: number): string {
      return (
        theme.fg("success", fmtTok(tokens).padStart(7)) +
        theme.fg("dim", " tok")
      );
    }

    function costCol(costUsd: number): string {
      return theme.fg("syntaxNumber", `$${costUsd.toFixed(3)}`.padStart(8));
    }

    const lines: string[] = [];

    // Title
    lines.push(
      theme.fg("accent", "═══") +
        theme.fg("muted", " Token & Cost Usage — last 7 days ") +
        theme.fg("accent", "═══"),
    );
    lines.push("");

    // Per-day rows
    for (const row of rows) {
      const label = fmtDate(row.dateKey).padEnd(LABEL_W);
      const datePart = row.isToday
        ? theme.fg("accent", label)
        : theme.fg("muted", label);

      const todayMarker = row.isToday
        ? "  " + theme.fg("accent", "◀ today")
        : "";

      lines.push(
        `  ${datePart}  ${costBar(row.costUsd, row.isMax)}  ${tokCol(row.tokens)}  ${costCol(row.costUsd)}${todayMarker}`,
      );

      // Per-model breakdown
      const models = Object.entries(row.byModel).sort(
        ([, a], [, b]) => b.costUsd - a.costUsd,
      );
      if (models.length > 1) {
        for (const [model, stats] of models) {
          const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
          lines.push(
            `  ${theme.fg("dim", subLabel)}  ${" ".repeat(BAR_W)}  ${tokCol(stats.tokens)}  ${costCol(stats.costUsd)}`,
          );
        }
      }
    }

    // Totals
    lines.push("");
    lines.push(theme.fg("dim", "─".repeat(70)));

    for (const [label, stats] of [
      ["This week", week],
      ["This month", month],
      ["All time", allTime],
    ] as const) {
      lines.push(
        `  ${theme.fg("muted", label.padEnd(LABEL_W))}  ${" ".repeat(BAR_W)}  ${tokCol(stats.tokens)}  ${costCol(stats.costUsd)}`,
      );
    }

    const box = new Box(1, 1);
    box.addChild(new Text(lines.join("\n"), 0, 0));
    return box;
  });

  // -------------------------------------------------------------------------
  // Session start: load cache
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    statsCache.clear();
    const currentFile = ctx.sessionManager.getSessionFile() ?? undefined;
    loadAllSessions(currentFile);
  });

  // -------------------------------------------------------------------------
  // Turn end: add to cache
  // -------------------------------------------------------------------------

  pi.on("turn_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const m = event.message as AssistantMessage & { model?: string };
    const cost = m.usage?.cost?.total;
    if (cost == null) return;

    const dateKey = todayKey();
    const model = m.model ?? ctx.model?.id ?? "unknown";
    const u = m.usage as typeof m.usage & { totalTokens?: number };
    const tokens =
      u.totalTokens ??
      (u.input ?? 0) +
        (u.output ?? 0) +
        (u.cacheRead ?? 0) +
        (u.cacheWrite ?? 0);

    addToCache(dateKey, model, tokens, cost);
  });

  // -------------------------------------------------------------------------
  // /usage command
  // -------------------------------------------------------------------------

  pi.registerCommand("usage", {
    description: "Show token & cost usage by day (last 7 days)",
    handler: async (_args, _ctx) => {
      const today = todayKey();
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }

      const rows: UsageRow[] = days.map((dateKey) => {
        const day = statsCache.get(dateKey);
        return {
          dateKey,
          tokens: day?.totalTokens ?? 0,
          costUsd: day?.costUsd ?? 0,
          isToday: dateKey === today,
          isMax: false,
          byModel: day?.byModel ?? {},
        };
      });

      const maxCost = Math.max(...rows.map((r) => r.costUsd), 0.001);
      const maxTokens = Math.max(...rows.map((r) => r.tokens), 1);
      for (const r of rows) r.isMax = r.costUsd === maxCost && r.costUsd > 0;

      const report: UsageReport = {
        rows,
        maxCost,
        maxTokens,
        week: periodStats(weekStartKey()),
        month: periodStats(monthStartKey()),
        allTime: periodStats("2000-01-01"),
      };

      pi.sendMessage({
        customType: "usage-report",
        content: "Token & Cost Usage Report",
        display: true,
        details: report,
      });
    },
  });
}

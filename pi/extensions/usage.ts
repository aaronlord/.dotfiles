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
import {
  Box,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  getDayStats,
  getPeriodStats,
  loadAllSessions,
  recordTurn,
} from "./lib/usage-data";
import { resolveRepoRoot, getBranchCostsForRepo } from "./lib/branch-costs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageRow {
  dateKey: string;
  tokens: number;
  costUsd: number;
  isToday: boolean;
  isMax: boolean;
  byModel: Record<string, { tokens: number; costUsd: number }>;
}

interface UsageReportBranchRow {
  branch: string;
  tokens: number;
  cost: number;
}

interface UsageReport {
  rows: UsageRow[];
  maxCost: number;
  maxTokens: number;
  week: { tokens: number; costUsd: number };
  month: { tokens: number; costUsd: number };
  allTime: { tokens: number; costUsd: number };
  branchRows: UsageReportBranchRow[];
}

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
    const { rows, maxCost, maxTokens, week, month, allTime, branchRows } = report;
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

    // cap avoids unbounded old-branch clutter; other repos' branches aren't comparable so excluded
    if (branchRows.length > 0) {
      lines.push("");
      lines.push(theme.fg("dim", "─".repeat(70)));
      lines.push(
        theme.fg("accent", "═══") +
          theme.fg("muted", " By Branch (this repo, most recent 15) ") +
          theme.fg("accent", "═══"),
      );
      lines.push("");
      const maxBranchCost = Math.max(...branchRows.map((r) => r.cost), 0.001);
      for (const row of branchRows) {
        const label = row.branch.padEnd(LABEL_W);
        lines.push(
          `  ${theme.fg("muted", label)}  ${costBar(row.cost, row.cost === maxBranchCost)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}`,
        );
      }
    }

    const box = new Box(1, 1);
    box.addChild(new Text(lines.join("\n"), 0, 0));
    return box;
  });

  // -------------------------------------------------------------------------
  // Session start: load cache
  // -------------------------------------------------------------------------

  pi.on("session_start", async (event, ctx) => {
    const currentFile = ctx.sessionManager.getSessionFile() ?? undefined;
    loadAllSessions(currentFile, event);
  });

  // live update: fold each completed turn into today's cache immediately,
  // so /usage's "today" figures don't lag until next session_start reload
  pi.on("turn_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const m = event.message as AssistantMessage & { model?: string };
    const cost = m.usage?.cost?.total;
    if (cost == null) return;

    const model = m.model ?? ctx.model?.id ?? "unknown";
    const u = m.usage as typeof m.usage & { totalTokens?: number };
    const tokens =
      u.totalTokens ??
      (u.input ?? 0) +
        (u.output ?? 0) +
        (u.cacheRead ?? 0) +
        (u.cacheWrite ?? 0);

    recordTurn(todayKey(), model, tokens, cost);
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
        const day = getDayStats(dateKey);
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

      const repoRoot = resolveRepoRoot(process.cwd());
      const branchRows: UsageReportBranchRow[] = getBranchCostsForRepo(repoRoot)
        .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
        .slice(0, 15)
        .map((entry) => ({ branch: entry.branch, tokens: entry.tokens, cost: entry.cost }));

      const report: UsageReport = {
        rows,
        maxCost,
        maxTokens,
        week: getPeriodStats(weekStartKey()),
        month: getPeriodStats(monthStartKey()),
        allTime: getPeriodStats("2000-01-01"),
        branchRows,
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

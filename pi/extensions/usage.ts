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
  getByModelSince,
  getDayStats,
  getPeriodStats,
  loadAllSessions,
  recordTurn,
} from "./lib/usage-data";
import {
  resolveRepoRoot,
  getBranchCostsForRepo,
  getCurrentBranch,
} from "./lib/branch-costs";
import { getFeatureCostsForRepo, resolveFeatureName } from "./lib/feature-costs";
import { getSkillCostsForRepo } from "./lib/skill-costs";

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
  isCurrent: boolean;
  byModel: Record<string, { tokens: number; cost: number }>;
}

interface UsageReportModelRow {
  model: string;
  tokens: number;
  cost: number;
}

interface UsageReportFeatureRow {
  feature: string;
  tokens: number;
  cost: number;
  isCurrent: boolean;
  byModel: Record<string, { tokens: number; cost: number }>;
}

interface UsageReportSkillRow {
  skill: string;
  tokens: number;
  cost: number;
  byModel: Record<string, { tokens: number; cost: number }>;
}

interface UsageReport {
  rows: UsageRow[];
  maxCost: number;
  maxTokens: number;
  week: { tokens: number; costUsd: number };
  month: { tokens: number; costUsd: number };
  prevWeek: { tokens: number; costUsd: number };
  prevMonth: { tokens: number; costUsd: number };
  branchRows: UsageReportBranchRow[];
  branchCostStats: { meanUsd: number; medianUsd: number };
  featureRows: UsageReportFeatureRow[];
  modelRows: UsageReportModelRow[];
  skillRows: UsageReportSkillRow[];
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

function prevWeekStartKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return d.toISOString().slice(0, 10);
}

// same elapsed-day window as this month so far (MTD vs MTD, not MTD vs full month)
function prevMonthRange(): [string, string] {
  const now = new Date();
  const elapsedDays = now.getDate();
  const start = new Date(now);
  start.setDate(1);
  start.setMonth(start.getMonth() - 1);
  const startKey = start.toISOString().slice(0, 10);
  const end = new Date(start);
  end.setDate(1 + elapsedDays);
  const endKey = end.toISOString().slice(0, 10);
  return [startKey, endKey];
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

function fmtDelta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "±0%" : "new";
  const pct = ((current - previous) / previous) * 100;
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "±";
  return `${arrow}${Math.abs(pct).toFixed(0)}%`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  return (lo + hi) / 2;
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
    const {
      rows,
      maxCost,
      maxTokens,
      week,
      month,
      prevWeek,
      prevMonth,
      branchRows,
      branchCostStats,
      featureRows,
      modelRows,
      skillRows,
    } = report;
    const BAR_W = 24;
    const LABEL_W = 40;

    function costBar(cost: number, isMax: boolean, max: number = maxCost): string {
      if (max === 0) return theme.fg("dim", "░".repeat(BAR_W));
      const filled = Math.max(0, Math.min(BAR_W, Math.round((cost / max) * BAR_W)));
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

    for (const [label, stats, prev] of [
      ["This week", week, prevWeek],
      ["This month (MTD)", month, prevMonth],
    ] as const) {
      const delta = theme.fg("dim", ` (${fmtDelta(stats.costUsd, prev.costUsd)} vs prev)`);
      lines.push(
        `  ${theme.fg("muted", label.padEnd(LABEL_W))}  ${" ".repeat(BAR_W)}  ${tokCol(stats.tokens)}  ${costCol(stats.costUsd)}${delta}`,
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
      lines.push(
        `  ${theme.fg("muted", "avg cost/branch".padEnd(LABEL_W))}  ${theme.fg("dim", "mean")} ${costCol(branchCostStats.meanUsd)}  ${theme.fg("dim", "median")} ${costCol(branchCostStats.medianUsd)}`,
      );
      const maxBranchCost = Math.max(...branchRows.map((r) => r.cost), 0.001);
      for (const row of branchRows) {
        const label = row.branch.padEnd(LABEL_W);
        const branchPart = row.isCurrent
          ? theme.fg("accent", label)
          : theme.fg("muted", label);
        const currentMarker = row.isCurrent
          ? "  " + theme.fg("accent", "◀ current")
          : "";
        lines.push(
          `  ${branchPart}  ${costBar(row.cost, row.cost === maxBranchCost, maxBranchCost)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}${currentMarker}`,
        );
        const models = Object.entries(row.byModel).sort(
          ([, a], [, b]) => b.cost - a.cost,
        );
        if (models.length > 1) {
          for (const [model, stats] of models) {
            const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
            lines.push(
              `  ${theme.fg("dim", subLabel)}  ${" ".repeat(BAR_W)}  ${tokCol(stats.tokens)}  ${costCol(stats.cost)}`,
            );
          }
        }
      }
    }

    if (featureRows.length > 0) {
      lines.push("");
      lines.push(theme.fg("dim", "─".repeat(70)));
      lines.push(
        theme.fg("accent", "═══") +
          theme.fg("muted", " By Feature (this repo) ") +
          theme.fg("accent", "═══"),
      );
      lines.push("");
      const maxFeatureCost = Math.max(...featureRows.map((r) => r.cost), 0.001);
      for (const row of featureRows) {
        const label = row.feature.padEnd(LABEL_W);
        const featurePart = row.isCurrent
          ? theme.fg("accent", label)
          : theme.fg("muted", label);
        const currentMarker = row.isCurrent
          ? "  " + theme.fg("accent", "◀ current")
          : "";
        lines.push(
          `  ${featurePart}  ${costBar(row.cost, row.cost === maxFeatureCost, maxFeatureCost)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}${currentMarker}`,
        );
        const models = Object.entries(row.byModel).sort(
          ([, a], [, b]) => b.cost - a.cost,
        );
        if (models.length > 1) {
          for (const [model, stats] of models) {
            const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
            lines.push(
              `  ${theme.fg("dim", subLabel)}  ${" ".repeat(BAR_W)}  ${tokCol(stats.tokens)}  ${costCol(stats.cost)}`,
            );
          }
        }
      }
    }

    if (modelRows.length > 0) {
      lines.push("");
      lines.push(theme.fg("dim", "─".repeat(70)));
      lines.push(
        theme.fg("accent", "═══") +
          theme.fg("muted", " By Model (last 7 days) ") +
          theme.fg("accent", "═══"),
      );
      lines.push("");
      const maxModelCost = Math.max(...modelRows.map((r) => r.cost), 0.001);
      for (const row of modelRows) {
        const label = shortModel(row.model).padEnd(LABEL_W);
        lines.push(
          `  ${theme.fg("muted", label)}  ${costBar(row.cost, row.cost === maxModelCost, maxModelCost)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}`,
        );
      }
    }

    if (skillRows.length > 0) {
      lines.push("");
      lines.push(theme.fg("dim", "─".repeat(70)));
      lines.push(
        theme.fg("accent", "═══") +
          theme.fg("muted", " By Skill (this repo — heuristic) ") +
          theme.fg("accent", "═══"),
      );
      lines.push("");
      const maxSkillCost = Math.max(...skillRows.map((r) => r.cost), 0.001);
      for (const row of skillRows) {
        const label = row.skill.padEnd(LABEL_W);
        lines.push(
          `  ${theme.fg("muted", label)}  ${costBar(row.cost, row.cost === maxSkillCost, maxSkillCost)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}`,
        );
        const models = Object.entries(row.byModel).sort(
          ([, a], [, b]) => b.cost - a.cost,
        );
        if (models.length > 1) {
          for (const [model, stats] of models) {
            const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
            lines.push(
              `  ${theme.fg("dim", subLabel)}  ${" ".repeat(BAR_W)}  ${tokCol(stats.tokens)}  ${costCol(stats.cost)}`,
            );
          }
        }
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
      const currentBranch = getCurrentBranch(process.cwd());
      const allBranchEntries = getBranchCostsForRepo(repoRoot).sort((a, b) =>
        b.lastUpdated.localeCompare(a.lastUpdated),
      );
      let topBranchEntries = allBranchEntries.slice(0, 15);
      // current branch may have aged out of the top 15 — pin it in so it's never silently dropped
      if (
        currentBranch &&
        !topBranchEntries.some((entry) => entry.branch === currentBranch)
      ) {
        const currentEntry = allBranchEntries.find(
          (entry) => entry.branch === currentBranch,
        );
        if (currentEntry) {
          topBranchEntries = [currentEntry, ...topBranchEntries.slice(0, 14)];
        }
      }
      const branchRows: UsageReportBranchRow[] = topBranchEntries.map(
        (entry) => ({
          branch: entry.branch,
          tokens: entry.tokens,
          cost: entry.cost,
          isCurrent: entry.branch === currentBranch,
          byModel: Object.fromEntries(
            Object.entries(entry.byModel ?? {}).map(([model, stats]) => [
              model,
              { tokens: stats.tokens, cost: stats.cost },
            ]),
          ),
        }),
      );
      const branchCostValues = allBranchEntries.map((entry) => entry.cost);
      const branchCostStats = {
        meanUsd:
          branchCostValues.length > 0
            ? branchCostValues.reduce((sum, value) => sum + value, 0) /
              branchCostValues.length
            : 0,
        medianUsd: median(branchCostValues),
      };

      const modelRows: UsageReportModelRow[] = Object.entries(getByModelSince(weekStartKey()))
        .map(([model, stats]) => ({ model, tokens: stats.tokens, cost: stats.costUsd }))
        .sort((a, b) => b.cost - a.cost);

      const currentFeature = resolveFeatureName(process.cwd());
      const featureRows: UsageReportFeatureRow[] = getFeatureCostsForRepo(repoRoot)
        .sort((a, b) => b.cost - a.cost)
        .map((entry) => ({
          feature: entry.feature,
          tokens: entry.tokens,
          cost: entry.cost,
          isCurrent: entry.feature === currentFeature,
          byModel: Object.fromEntries(
            Object.entries(entry.byModel ?? {}).map(([model, stats]) => [
              model,
              { tokens: stats.tokens, cost: stats.cost },
            ]),
          ),
        }));

      const skillRows: UsageReportSkillRow[] = getSkillCostsForRepo(repoRoot)
        .sort((a, b) => b.cost - a.cost)
        .map((entry) => ({
          skill: entry.skill,
          tokens: entry.tokens,
          cost: entry.cost,
          byModel: Object.fromEntries(
            Object.entries(entry.byModel ?? {}).map(([model, stats]) => [
              model,
              { tokens: stats.tokens, cost: stats.cost },
            ]),
          ),
        }));

      const report: UsageReport = {
        rows,
        maxCost,
        maxTokens,
        week: getPeriodStats(weekStartKey()),
        month: getPeriodStats(monthStartKey()),
        prevWeek: getPeriodStats(prevWeekStartKey(), weekStartKey()),
        prevMonth: getPeriodStats(...prevMonthRange()),
        branchRows,
        branchCostStats,
        featureRows,
        modelRows,
        skillRows,
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

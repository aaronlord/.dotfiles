/// <reference path="../types/pi-runtime.d.ts" />

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
  getDefaultBranch,
} from "./lib/branch-costs";
import { getFeatureCostsForRepo, resolveFeatureName } from "./lib/feature-costs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageRow {
  dateKey: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  isToday: boolean;
  isMax: boolean;
  byModel: Record<string, { tokens: number; inputTokens: number; outputTokens: number; costUsd: number }>;
}

interface TokenStats {
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface GroupStats {
  count: number;
  sumCost: number;
  sumTokens: number;
  meanCost: number;
  medianCost: number;
}

interface UsageReportBranchRow {
  branch: string;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
  cost: number;
  isCurrent: boolean;
  byModel: Record<string, { tokens: number; inputTokens?: number; outputTokens?: number; cost: number }>;
}

interface UsageReportModelRow {
  model: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface UsageReportFeatureRow {
  feature: string;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
  cost: number;
  isCurrent: boolean;
  byModel: Record<string, { tokens: number; inputTokens?: number; outputTokens?: number; cost: number }>;
}

interface UsageReport {
  rows: UsageRow[];
  maxTokens: number;
  week: TokenStats;
  month: TokenStats;
  prevWeek: TokenStats;
  prevMonth: TokenStats;
  branchRows: UsageReportBranchRow[];
  branchStatsAll: GroupStats;
  featureRows: UsageReportFeatureRow[];
  featureStatsAll: GroupStats;
  modelRows: UsageReportModelRow[];
  showAll: boolean;
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  return (lo + hi) / 2;
}

// shared shown/all-tracked footer math for model/feature/branch sections
function computeGroupStats(entries: { cost: number; tokens: number }[]): GroupStats {
  const count = entries.length;
  const sumCost = entries.reduce((sum, e) => sum + e.cost, 0);
  const sumTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
  return {
    count,
    sumCost,
    sumTokens,
    meanCost: count > 0 ? sumCost / count : 0,
    medianCost: median(entries.map((e) => e.cost)),
  };
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
      maxTokens,
      week,
      month,
      prevWeek,
      prevMonth,
      branchRows,
      branchStatsAll,
      featureRows,
      featureStatsAll,
      modelRows,
      showAll,
    } = report;
    const BAR_W = 32;
    const LABEL_W = 44;
    const FOOTER_LABEL_W = 20; // footer labels ("top 9 shown", "7 models") are short — LABEL_W is sized for row names, not this

    function tokenBar(tokens: number, isMax: boolean, max: number = maxTokens): string {
      if (max === 0) return theme.fg("dim", "░".repeat(BAR_W));
      const filled = Math.max(0, Math.min(BAR_W, Math.round((tokens / max) * BAR_W)));
      const fillColor = isMax ? "accent" : tokens > 0 ? "borderAccent" : "dim";
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

    function tokColDim(tokens: number): string {
      return theme.fg("dim", fmtTok(tokens).padStart(7) + " tok");
    }

    function costCol(costUsd: number): string {
      return theme.fg("syntaxNumber", `$${costUsd.toFixed(3)}`.padStart(8));
    }

    function costColDim(costUsd: number): string {
      return theme.fg("dim", `$${costUsd.toFixed(3)}`.padStart(8));
    }

    const titleLine =
      theme.fg("accent", "═══") +
      theme.fg("muted", " Token & Cost Usage — last 7 days ") +
      theme.fg("accent", "═══");

    function fitCell(text: string, width: number): string {
      const displayWidth = visibleWidth(text);
      if (displayWidth > width) return truncateToWidth(text, width, "…");
      return text + " ".repeat(Math.max(0, width - displayWidth));
    }

    function mergeColumns(left: string[], right: string[], leftWidth: number, rightWidth: number, gap = 4): string[] {
      const rows: string[] = [];
      const maxRows = Math.max(left.length, right.length);
      for (let i = 0; i < maxRows; i++) {
        const hasLeft = i < left.length;
        const hasRight = i < right.length;
        // only skip once BOTH columns have run out — an intentional blank line
        // that's still within an array's bounds must still render as a blank row,
        // otherwise it silently disappears once the other (shorter) column ends
        if (!hasLeft && !hasRight) continue;
        const leftText = hasLeft ? left[i] : "";
        const rightText = hasRight ? right[i] : "";
        rows.push(
          fitCell(leftText, leftWidth) + " ".repeat(gap) + fitCell(rightText, rightWidth),
        );
      }
      return rows;
    }

    function statsLine(label: string, stats: GroupStats): string {
      return (
        `  ${theme.fg("muted", label.padEnd(FOOTER_LABEL_W))}  ${theme.fg("dim", "Σ")} ${costCol(stats.sumCost)} ${tokCol(stats.sumTokens)}` +
        `   ${theme.fg("dim", "mean")} ${costCol(stats.meanCost)}  ${theme.fg("dim", "median")} ${costCol(stats.medianCost)}`
      );
    }

    const dailyLines: string[] = [];
    // Per-day rows
    for (const row of rows) {
      const label = fmtDate(row.dateKey).padEnd(LABEL_W);
      const datePart = row.isToday
        ? theme.fg("accent", label)
        : theme.fg("muted", label);

      dailyLines.push(
        `  ${datePart}  ${tokenBar(row.tokens, row.isMax)}  ${tokCol(row.tokens)}  ${costCol(row.costUsd)}`,
      );

      // Per-model breakdown
      const models = Object.entries(row.byModel).sort(
        ([, a], [, b]) => b.tokens - a.tokens || b.costUsd - a.costUsd,
      );
      if (models.length > 1) {
        for (const [model, stats] of models) {
          const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
          dailyLines.push(
            `  ${theme.fg("dim", subLabel)}  ${" ".repeat(BAR_W)}  ${tokColDim(stats.tokens)}  ${costColDim(stats.costUsd)}`,
          );
        }
      }
    }

    // Totals
    dailyLines.push("");
    dailyLines.push(theme.fg("dim", "─".repeat(70)));

    for (const [label, stats, prevLabel, prev] of [
      ["This week", week, "Last week", prevWeek],
      ["This month (MTD)", month, "Last month (MTD)", prevMonth],
    ] as const) {
      dailyLines.push(
        `  ${theme.fg("muted", label.padEnd(LABEL_W))}  ${" ".repeat(BAR_W)}  ${tokCol(stats.tokens)}  ${costCol(stats.costUsd)}`,
      );
      dailyLines.push(
        `  ${theme.fg("dim", ("↳ " + prevLabel).padEnd(LABEL_W))}  ${" ".repeat(BAR_W)}  ${tokColDim(prev.tokens)}  ${costColDim(prev.costUsd)}`,
      );
    }

    const activeDays = rows.filter((r) => r.costUsd > 0).length;
    if (activeDays > 0) {
      const avgPerActiveDay = week.costUsd / activeDays;
      dailyLines.push(
        `  ${theme.fg("muted", `avg/active day (${activeDays}d)`.padEnd(LABEL_W))}  ${" ".repeat(BAR_W)}  ${" ".repeat(11)}  ${costCol(avgPerActiveDay)}`,
      );
    }

    // rows and footer often want different natural widths (a long top-model
    // name can make the footer wider than every plain row) — size the whole
    // block, including its rule, to whichever is widest so nothing overhangs
    function finalizeBlock(header: string, rowLines: string[], footerLines: string[]): string[] {
      if (footerLines.length === 0) return [header, ...rowLines];
      const targetWidth = Math.max(
        ...rowLines.map((l) => visibleWidth(l)),
        ...footerLines.map((l) => visibleWidth(l)),
        1,
      );
      return [
        header,
        ...rowLines.map((l) => fitCell(l, targetWidth)),
        theme.fg("dim", "─".repeat(targetWidth)),
        ...footerLines.map((l) => fitCell(l, targetWidth)),
      ];
    }

    const rightBlocks: string[][] = [];
    if (modelRows.length > 0) {
      const modelHeader =
        theme.fg("accent", "═══") +
        theme.fg("muted", " By Model (last 7 days) ") +
        theme.fg("accent", "═══");
      const modelRowLines: string[] = [];
      const maxModelTokens = Math.max(...modelRows.map((r) => r.tokens), 1);
      for (const row of modelRows) {
        const label = shortModel(row.model).padEnd(LABEL_W);
        modelRowLines.push(
          `  ${theme.fg("muted", label)}  ${tokenBar(row.tokens, row.tokens === maxModelTokens, maxModelTokens)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}`,
        );
      }
      const modelStats = computeGroupStats(modelRows.map((r) => ({ cost: r.cost, tokens: r.tokens })));
      const topModel = modelRows[0];
      const modelFooterLines = [
        statsLine(`${modelStats.count} models`, modelStats) +
          (topModel && modelStats.sumCost > 0
            ? `  ${theme.fg("dim", "top")} ${shortModel(topModel.model)} (${Math.round((topModel.cost / modelStats.sumCost) * 100)}%)`
            : ""),
      ];
      rightBlocks.push(finalizeBlock(modelHeader, modelRowLines, modelFooterLines));
    }

    if (featureRows.length > 0) {
      const topFeatureRows = featureRows.slice(0, 5);
      if (topFeatureRows.length > 0) {
        const featureHeader =
          theme.fg("accent", "═══") +
          theme.fg("muted", showAll
            ? " By Feature (this repo, top 5) "
            : " By Feature (current) ") +
          theme.fg("accent", "═══");
        const featureRowLines: string[] = [];
        const maxFeatureTokens = Math.max(...topFeatureRows.map((r) => r.tokens), 1);
        for (const row of topFeatureRows) {
          const label = row.feature.padEnd(LABEL_W);
          const featurePart = row.isCurrent
            ? theme.fg("accent", label)
            : theme.fg("muted", label);
          featureRowLines.push(
            `  ${featurePart}  ${tokenBar(row.tokens, row.tokens === maxFeatureTokens, maxFeatureTokens)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}`,
          );
          const models = Object.entries(row.byModel).sort(
            ([, a], [, b]) => b.tokens - a.tokens || b.cost - a.cost,
          );
          if (models.length > 1) {
            for (const [model, stats] of models) {
              const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
              featureRowLines.push(
                `  ${theme.fg("dim", subLabel)}  ${" ".repeat(BAR_W)}  ${tokColDim(stats.tokens)}  ${costColDim(stats.cost)}`,
              );
            }
          }
        }
        const shownStats = computeGroupStats(topFeatureRows.map((r) => ({ cost: r.cost, tokens: r.tokens })));
        const featureFooterLines = [statsLine(`top ${topFeatureRows.length} shown`, shownStats)];
        if (featureStatsAll.count > topFeatureRows.length) {
          featureFooterLines.push(statsLine(`all ${featureStatsAll.count} features`, featureStatsAll));
        }
        rightBlocks.push(finalizeBlock(featureHeader, featureRowLines, featureFooterLines));
      }
    }

    if (branchRows.length > 0) {
      const topBranchRows = branchRows.slice(0, 5);
      if (topBranchRows.length > 0) {
        const branchHeader =
          theme.fg("accent", "═══") +
          theme.fg("muted", showAll
            ? " By Branch (this repo, top 5 by tokens) "
            : " By Branch (current) ") +
          theme.fg("accent", "═══");
        const branchRowLines: string[] = [];
        const maxBranchTokens = Math.max(...topBranchRows.map((r) => r.tokens), 1);
        for (const row of topBranchRows) {
          const label = row.branch.padEnd(LABEL_W);
          const branchPart = row.isCurrent
            ? theme.fg("accent", label)
            : theme.fg("muted", label);
          branchRowLines.push(
            `  ${branchPart}  ${tokenBar(row.tokens, row.tokens === maxBranchTokens, maxBranchTokens)}  ${tokCol(row.tokens)}  ${costCol(row.cost)}`
          );
          const models = Object.entries(row.byModel).sort(
            ([, a], [, b]) => b.tokens - a.tokens || b.cost - a.cost,
          );
          if (models.length > 1) {
            for (const [model, stats] of models) {
              const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
              branchRowLines.push(
                `  ${theme.fg("dim", subLabel)}  ${" ".repeat(BAR_W)}  ${tokColDim(stats.tokens)}  ${costColDim(stats.cost)}`,
              );
            }
          }
        }
        const shownStats = computeGroupStats(topBranchRows.map((r) => ({ cost: r.cost, tokens: r.tokens })));
        const branchFooterLines = [statsLine(`top ${topBranchRows.length} shown`, shownStats)];
        if (branchStatsAll.count > topBranchRows.length) {
          branchFooterLines.push(statsLine(`all ${branchStatsAll.count} branches`, branchStatsAll));
        }
        rightBlocks.push(finalizeBlock(branchHeader, branchRowLines, branchFooterLines));
      }
    }

    // rule only between distinct sections, never leading the first or splitting a
    // section's own rows from its footer (that's a blank line instead, see above)
    const rightPanel: string[] = [];
    rightBlocks.forEach((block, i) => {
      if (i > 0) rightPanel.push("");
      rightPanel.push(...block);
    });

    // Text/Box only learn the real column budget at render(width) time — guessing
    // it upfront (e.g. via process.stdout.columns) doesn't match what Box actually
    // hands the child, so pre-built wide lines silently got word-wrapped mid-row.
    // Building layout inside render(width) uses the real budget, so nothing wraps.
    const layout = {
      render(width: number): string[] {
        const gap = 4;
        const wide = width >= 190 && rightPanel.length > 0;
        if (!wide) {
          return [titleLine, "", ...dailyLines, ...rightPanel];
        }
        // size columns to actual content, not a flat guess — avoids both a dead
        // gap between columns (left too wide) and clipped text (right too narrow)
        const available = width - gap;
        const naturalLeftWidth = Math.max(...dailyLines.map((line) => visibleWidth(line)), 1);
        const naturalRightWidth = Math.max(...rightPanel.map((line) => visibleWidth(line)), 1);
        const leftWidth = Math.max(60, Math.min(naturalLeftWidth, available - 70));
        const rightWidth = Math.max(70, Math.min(naturalRightWidth, available - leftWidth));
        // title rides in the left column's row 0 so it lines up with the right
        // column's first header instead of sitting alone a row above both
        return mergeColumns(
          [titleLine, ...dailyLines],
          rightPanel,
          leftWidth,
          rightWidth,
          gap,
        );
      },
    };

    const box = new Box(1, 1);
    box.addChild(layout);
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

    recordTurn(
      todayKey(),
      model,
      tokens,
      cost,
      u.input ?? 0,
      u.output ?? 0,
    );
  });

  // -------------------------------------------------------------------------
  // /usage command
  // -------------------------------------------------------------------------

  pi.registerCommand("usage", {
    description: "Show usage by day; use --all for more branches/features",
    handler: async (args, _ctx) => {
      const showAll = args.trim() === "--all" || args.trim() === "all";
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
          inputTokens: day?.inputTokens ?? 0,
          outputTokens: day?.outputTokens ?? 0,
          costUsd: day?.costUsd ?? 0,
          isToday: dateKey === today,
          isMax: false,
          byModel: day?.byModel ?? {},
        };
      });

      const maxTokens = Math.max(...rows.map((r) => r.tokens), 1);
      for (const r of rows) r.isMax = r.tokens === maxTokens && r.tokens > 0;

      const repoRoot = resolveRepoRoot(process.cwd());
      const currentBranch = getCurrentBranch(process.cwd());
      const defaultBranch = getDefaultBranch(process.cwd());
      const allBranchEntries = getBranchCostsForRepo(repoRoot)
        .filter((entry) => entry.branch !== defaultBranch)
        .sort((a, b) => b.tokens - a.tokens || b.cost - a.cost);
      let topBranchEntries = showAll ? allBranchEntries.slice(0, 5) : [];
      const currentBranchEntry = currentBranch
        ? allBranchEntries.find((entry) => entry.branch === currentBranch)
        : undefined;
      if (currentBranchEntry) {
        if (showAll && !topBranchEntries.some((entry) => entry.branch === currentBranch)) {
          topBranchEntries = [currentBranchEntry, ...topBranchEntries.slice(0, 4)];
        } else if (!showAll) {
          topBranchEntries = [currentBranchEntry];
        }
      }
      const branchRows: UsageReportBranchRow[] = topBranchEntries.map(
        (entry) => ({
          branch: entry.branch,
          tokens: entry.tokens,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          cost: entry.cost,
          isCurrent: entry.branch === currentBranch,
          byModel: Object.fromEntries(
            Object.entries(entry.byModel ?? {}).map(([model, stats]) => [
              model,
              {
                tokens: stats.tokens,
                inputTokens: stats.inputTokens,
                outputTokens: stats.outputTokens,
                cost: stats.cost,
              },
            ]),
          ),
        }),
      );
      const branchStatsAll = computeGroupStats(
        allBranchEntries.map((entry) => ({ cost: entry.cost, tokens: entry.tokens })),
      );

      const modelRows: UsageReportModelRow[] = Object.entries(getByModelSince(weekStartKey()))
        .map(([model, stats]) => ({
          model,
          tokens: stats.tokens,
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          cost: stats.costUsd,
        }))
        .sort((a, b) => b.tokens - a.tokens || b.cost - a.cost);

      const currentFeature = resolveFeatureName(process.cwd());
      const featureEntries = getFeatureCostsForRepo(repoRoot).sort(
        (a, b) => b.tokens - a.tokens || b.cost - a.cost,
      );
      let topFeatureEntries = showAll ? featureEntries.slice(0, 5) : [];
      const currentFeatureEntry = currentFeature
        ? featureEntries.find((entry) => entry.feature === currentFeature)
        : undefined;
      if (currentFeatureEntry) {
        if (showAll && !topFeatureEntries.some((entry) => entry.feature === currentFeature)) {
          topFeatureEntries = [currentFeatureEntry, ...topFeatureEntries.slice(0, 4)];
        } else if (!showAll) {
          topFeatureEntries = [currentFeatureEntry];
        }
      }
      const featureRows: UsageReportFeatureRow[] = topFeatureEntries.map((entry) => ({
        feature: entry.feature,
        tokens: entry.tokens,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cost: entry.cost,
        isCurrent: entry.feature === currentFeature,
        byModel: Object.fromEntries(
          Object.entries(entry.byModel ?? {}).map(([model, stats]) => [
            model,
            {
              tokens: stats.tokens,
              inputTokens: stats.inputTokens,
              outputTokens: stats.outputTokens,
              cost: stats.cost,
            },
          ]),
        ),
      }));
      const featureStatsAll = computeGroupStats(
        featureEntries.map((entry) => ({ cost: entry.cost, tokens: entry.tokens })),
      );

      const report: UsageReport = {
        rows,
        maxTokens,
        week: getPeriodStats(weekStartKey()),
        month: getPeriodStats(monthStartKey()),
        prevWeek: getPeriodStats(prevWeekStartKey(), weekStartKey()),
        prevMonth: getPeriodStats(...prevMonthRange()),
        branchRows,
        branchStatsAll,
        featureRows,
        featureStatsAll,
        modelRows,
        showAll,
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

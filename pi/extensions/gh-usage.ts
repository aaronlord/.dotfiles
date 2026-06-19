/**
 * gh-usage — GitHub Copilot AI Credits tracker for Pi
 *
 * - Replaces Pi's footer row with an enhanced version that includes
 *   today's and this week's AIC (AI Credits) inline.
 * - Registers /usage for a 7-day drill-down with horizontal bar charts.
 *
 * AIC formula (per GitHub AIC spec v1.4.0):
 *   1 AIC = $0.01 USD   →   aic = cost_usd / 0.01
 *
 * Data source: Pi's session JSONL files at ~/.pi/agent/sessions/
 * All historical sessions are backfilled on startup. No separate DB needed.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Box, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

// ---------------------------------------------------------------------------
// In-memory cache   date (YYYY-MM-DD) → DayStats
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
// Cache operations
// ---------------------------------------------------------------------------

function addToCache(dateKey: string, model: string, tokens: number, cost: number): void {
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

function periodStats(fromKey: string): { tokens: number; costUsd: number; aic: number } {
  let tokens = 0, costUsd = 0;
  for (const [date, day] of statsCache) {
    if (date >= fromKey) {
      tokens += day.totalTokens;
      costUsd += day.costUsd;
    }
  }
  return { tokens, costUsd, aic: costUsd / 0.01 };
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

function fmtAic(aic: number): string {
  if (aic < 10) return aic.toFixed(2);
  if (aic < 100) return aic.toFixed(1);
  return Math.round(aic).toString();
}

function fmtCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;
  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const rel = relative(resolvedHome, resolvedCwd);
  const inside =
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  if (!inside) return cwd;
  return rel === "" ? "~" : `~${sep}${rel}`;
}

function fmtDate(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Usage report data shape (passed via sendMessage details)
// ---------------------------------------------------------------------------

interface UsageRow {
  dateKey: string;
  tokens: number;
  costUsd: number;
  aic: number;
  isToday: boolean;
  isMax: boolean;
  byModel: Record<string, { tokens: number; costUsd: number }>;
}

interface UsageReport {
  rows: UsageRow[];
  maxAic: number;
  week: { tokens: number; costUsd: number; aic: number };
  month: { tokens: number; costUsd: number; aic: number };
  allTime: { tokens: number; costUsd: number; aic: number };
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {

  // -------------------------------------------------------------------------
  // Coloured /usage message renderer
  // -------------------------------------------------------------------------

  pi.registerMessageRenderer("gh-usage", (message, _options, theme) => {
    const report = message.details as UsageReport;
    const { rows, maxAic, week, month, allTime } = report;
    const BAR_W = 20;
    const LABEL_W = 14;

    function coloredBar(aic: number, isMax: boolean): string {
      if (maxAic === 0) return theme.fg("dim", "░".repeat(BAR_W));
      const filled = Math.round((aic / maxAic) * BAR_W);
      const fillColor = isMax ? "accent" : aic > 0 ? "borderAccent" : "dim";
      return (
        theme.fg(fillColor, "█".repeat(filled)) +
        theme.fg("dim", "░".repeat(BAR_W - filled))
      );
    }

    function subBar(aic: number): string {
      if (maxAic === 0) return theme.fg("dim", "░".repeat(BAR_W));
      const filled = Math.round((aic / maxAic) * BAR_W);
      return (
        theme.fg("syntaxFunction", "▪".repeat(filled)) +
        theme.fg("dim", "░".repeat(BAR_W - filled))
      );
    }

    // Shorten model names to fit in LABEL_W - 2 chars (leaves room for "↳ ")
    function shortModel(model: string): string {
      const name = model.split("/").pop() ?? model;
      const stripped = name.replace(/^(claude|gpt|gemini|llama|mistral|qwen)-/, "");
      const candidate = stripped.length > 0 ? stripped : name;
      const maxLen = LABEL_W - 2;
      return candidate.length <= maxLen ? candidate : candidate.slice(0, maxLen);
    }

    function aicCol(aic: number): string {
      return (
        theme.fg("borderAccent", fmtAic(aic).padStart(7)) +
        theme.fg("dim", " AIC")
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
      theme.fg("muted", " AI Credits Usage — last 7 days ") +
      theme.fg("accent", "═══")
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
        `  ${datePart}  ${coloredBar(row.aic, row.isMax)}  ${aicCol(row.aic)}  ${tokCol(row.tokens)}  ${costCol(row.costUsd)}${todayMarker}`
      );

      // Per-model sub-rows — same column positions, label replaced by "↳ model"
      const models = Object.entries(row.byModel).sort(
        ([, a], [, b]) => b.costUsd - a.costUsd
      );
      if (models.length > 1) {
        for (const [model, stats] of models) {
          const modelAic = stats.costUsd / 0.01;
          const subLabel = ("↳ " + shortModel(model)).padEnd(LABEL_W);
          lines.push(
            `  ${theme.fg("dim", subLabel)}  ${subBar(modelAic)}  ${aicCol(modelAic)}`
          );
        }
      }
    }

    // Totals
    lines.push("");
    lines.push(theme.fg("dim", "─".repeat(62)));

    for (const [label, stats] of [
      ["This week", week],
      ["This month", month],
      ["All time", allTime],
    ] as const) {
      lines.push(
        `  ${theme.fg("muted", label.padEnd(LABEL_W))}  ${" ".repeat(BAR_W)}  ${aicCol(stats.aic)}  ${tokCol(stats.tokens)}  ${costCol(stats.costUsd)}`
      );
    }

    lines.push("");
    lines.push(
      theme.fg("dim", "  1 AIC = $0.01 USD  (GitHub AIC spec v1.4.0)")
    );

    const box = new Box(1, 1);
    box.addChild(new Text(lines.join("\n"), 0, 0));
    return box;
  });

  // -------------------------------------------------------------------------
  // On session start: clear cache and reload all historical data
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    statsCache.clear();
    const currentFile = ctx.sessionManager.getSessionFile() ?? undefined;
    // Load all sessions except the current one (avoid double-counting in-progress turns)
    loadAllSessions(currentFile);

    // Set up custom footer (TUI only)
    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // --- Cumulative session token stats (mirrors Pi's built-in logic) ---
          let totalInput = 0,
            totalOutput = 0,
            totalCacheRead = 0,
            totalCacheWrite = 0,
            totalCost = 0;
          let latestCacheHitRate: number | undefined;

          for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type === "message" && entry.message.role === "assistant") {
              const m = entry.message as AssistantMessage;
              totalInput += m.usage.input;
              totalOutput += m.usage.output;
              totalCacheRead += m.usage.cacheRead;
              totalCacheWrite += m.usage.cacheWrite;
              totalCost += m.usage.cost.total;
              const promptTotal =
                m.usage.input + m.usage.cacheRead + m.usage.cacheWrite;
              latestCacheHitRate =
                promptTotal > 0
                  ? (m.usage.cacheRead / promptTotal) * 100
                  : undefined;
            }
          }

          // --- Context usage ---
          const contextUsage = ctx.getContextUsage();
          const contextWindow =
            contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const pctVal = contextUsage?.percent ?? 0;
          const pctStr = contextUsage?.percent != null ? pctVal.toFixed(1) : "?";
          const ctxDisplay =
            pctStr === "?"
              ? `?/${fmtTok(contextWindow)}`
              : `${pctStr}%/${fmtTok(contextWindow)}`;

          // --- CWD line ---
          let pwd = fmtCwd(ctx.sessionManager.getCwd());
          const branch = footerData.getGitBranch();
          if (branch) pwd = `${pwd} (${branch})`;
          const sessionName = ctx.sessionManager.getSessionName();
          if (sessionName) pwd = `${pwd} • ${sessionName}`;

          // --- Historical AIC (from cache) ---
          const today = periodStats(todayKey());
          const week = periodStats(weekStartKey());

          // --- Build left stats parts ---
          const parts: string[] = [];

          if (totalInput)
            parts.push(theme.fg("syntaxFunction", `↑${fmtTok(totalInput)}`));
          if (totalOutput)
            parts.push(theme.fg("success", `↓${fmtTok(totalOutput)}`));
          if (totalCacheRead)
            parts.push(theme.fg("borderAccent", `R${fmtTok(totalCacheRead)}`));
          if (totalCacheWrite)
            parts.push(theme.fg("warning", `W${fmtTok(totalCacheWrite)}`));
          if (
            (totalCacheRead > 0 || totalCacheWrite > 0) &&
            latestCacheHitRate !== undefined
          ) {
            parts.push(
              theme.fg("bashMode", `CH${latestCacheHitRate.toFixed(1)}%`)
            );
          }

          // Session cost
          const usingSubscription = ctx.model
            ? ctx.modelRegistry.isUsingOAuth(ctx.model)
            : false;
          if (totalCost || usingSubscription) {
            parts.push(
              theme.fg(
                "syntaxNumber",
                `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`
              )
            );
          }

          // Historical AIC separator + session + today + week
          if (totalCost > 0 || today.aic > 0 || week.aic > 0) {
            parts.push(theme.fg("dim", "│"));
            parts.push(theme.fg("success", `s:${fmtAic(totalCost / 0.01)}`));
            parts.push(theme.fg("borderAccent", `d:${fmtAic(today.aic)}`));
            parts.push(theme.fg("accent", `w:${fmtAic(week.aic)}`));
            parts.push(theme.fg("dim", "AIC"));
          }

          // Context % with colour thresholds, behind its own pipe
          parts.push(theme.fg("dim", "│"));
          let ctxStyled: string;
          if (pctVal > 90) ctxStyled = theme.fg("error", ctxDisplay);
          else if (pctVal > 70) ctxStyled = theme.fg("warning", ctxDisplay);
          else ctxStyled = theme.fg("muted", ctxDisplay);
          parts.push(ctxStyled);

          const statsLeft = parts.join(" ");

          // --- Right side: model (+ thinking level), coloured per-part ---
          const modelName = ctx.model?.id || "no-model";
          const thinkingLevel = pi.getThinkingLevel();

          // Thinking level colour matches Pi's built-in theme tokens
          const thinkingColor =
            !ctx.model?.reasoning ? null
            : thinkingLevel === "minimal" ? "thinkingMinimal"
            : thinkingLevel === "low"     ? "thinkingLow"
            : thinkingLevel === "medium"  ? "thinkingMedium"
            : thinkingLevel === "high"    ? "thinkingHigh"
            : thinkingLevel === "xhigh"   ? "thinkingXhigh"
            : "thinkingOff"; // "off" or unset

          const thinkingLabel =
            thinkingColor === null ? ""
            : theme.fg("dim", " \u2022 ") +
              theme.fg(thinkingColor, thinkingLevel === "off" || !thinkingLevel ? "thinking off" : thinkingLevel);

          // Build right side without provider first
          let rightStyled = theme.fg("syntaxType", modelName) + thinkingLabel;

          // Optionally prepend provider when multiple providers available
          if (
            footerData.getAvailableProviderCount() > 1 &&
            ctx.model
          ) {
            const withProv =
              theme.fg("dim", `(${ctx.model.provider}) `) + rightStyled;
            if (visibleWidth(statsLeft) + 2 + visibleWidth(withProv) <= width) {
              rightStyled = withProv;
            }
          }

          // --- Assemble stats line ---
          const lw = visibleWidth(statsLeft);
          const rw = visibleWidth(rightStyled);
          let statsLine: string;
          if (lw + 2 + rw <= width) {
            statsLine =
              statsLeft + " ".repeat(width - lw - rw) + rightStyled;
          } else {
            const avail = width - lw - 2;
            if (avail > 0) {
              const tRight = truncateToWidth(rightStyled, avail, "");
              statsLine =
                statsLeft +
                " ".repeat(Math.max(0, width - lw - visibleWidth(tRight))) +
                tRight;
            } else {
              statsLine = truncateToWidth(statsLeft, width, "...");
            }
          }

          // --- CWD line (pwd in accent colour up to first space, rest muted) ---
          const spaceIdx = pwd.indexOf(" ");
          const pwdStyled =
            spaceIdx > 0
              ? theme.fg("accent", pwd.slice(0, spaceIdx)) +
                theme.fg("muted", pwd.slice(spaceIdx))
              : theme.fg("accent", pwd);
          const pwdLine = truncateToWidth(
            pwdStyled,
            width,
            theme.fg("dim", "...")
          );

          // --- Extension status lines ---
          const lines = [pwdLine, statsLine];
          const extStatuses = footerData.getExtensionStatuses();
          if (extStatuses.size > 0) {
            const statusLine = [...extStatuses.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([, t]) => t.replace(/[\r\n\t]/g, " ").trim())
              .join(" ");
            lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
          }

          return lines;
        },
      };
    });
  });

  // -------------------------------------------------------------------------
  // On turn end: add current turn to cache
  // -------------------------------------------------------------------------

  pi.on("turn_end", async (event, _ctx) => {
    if (event.message.role !== "assistant") return;
    const m = event.message as AssistantMessage & { model?: string };
    const cost = m.usage?.cost?.total;
    if (cost == null) return;

    const dateKey = todayKey();
    const model = m.model ?? ctx.model?.id ?? "unknown";
    const u = m.usage as typeof m.usage & { totalTokens?: number };
    const tokens =
      u.totalTokens ??
      (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);

    addToCache(dateKey, model, tokens, cost);
  });

  // -------------------------------------------------------------------------
  // /usage command — 7-day table with horizontal bar chart
  // -------------------------------------------------------------------------

  pi.registerCommand("usage", {
    description: "Show AI credits usage by day (last 7 days)",
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
          aic: day ? day.costUsd / 0.01 : 0,
          isToday: dateKey === today,
          isMax: false,
          byModel: day?.byModel ?? {},
        };
      });

      const maxAic = Math.max(...rows.map((r) => r.aic), 0.001);
      for (const r of rows) r.isMax = r.aic === maxAic && r.aic > 0;

      const report: UsageReport = {
        rows,
        maxAic,
        week: periodStats(weekStartKey()),
        month: periodStats(monthStartKey()),
        allTime: periodStats("2000-01-01"),
      };

      pi.sendMessage({
        customType: "gh-usage",
        content: "AI Credits Usage Report",
        display: true,
        details: report,
      });
    },
  });
}

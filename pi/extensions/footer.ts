/**
 * footer — Enhanced Pi footer with token & cost stats
 *
 * - Replaces Pi's footer row with session token + cost breakdown.
 * - Shows today's and this week's stats.
 *
 * Data source: Pi's session JSONL files at ~/.pi/agent/sessions/
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import "./usage";

// ---------------------------------------------------------------------------
// Feature / branch cost tracking
// ---------------------------------------------------------------------------

const FEATURE_COSTS_FILE = join(homedir(), ".pi", "agent", "feature-costs.json");

/** Accumulated cost (USD) per git branch across all sessions. */
export const featureCosts = new Map<string, number>();

/** The git branch active at the time of the last turn / branch change. */
export let currentBranch: string | undefined;

export function loadFeatureCosts(): void {
  try {
    const raw = JSON.parse(readFileSync(FEATURE_COSTS_FILE, "utf8")) as Record<string, number>;
    featureCosts.clear();
    for (const [branch, cost] of Object.entries(raw)) {
      if (typeof cost === "number") featureCosts.set(branch, cost);
    }
  } catch {
    // File absent or malformed — start fresh
  }
}

export function saveFeatureCosts(): void {
  try {
    mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
    const data: Record<string, number> = {};
    for (const [branch, cost] of featureCosts) data[branch] = cost;
    writeFileSync(FEATURE_COSTS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch { /* ignore write errors */ }
}

export function addBranchCost(branch: string, cost: number): void {
  featureCosts.set(branch, (featureCosts.get(branch) ?? 0) + cost);
}

/** Last path segment of a branch name, e.g. "feat/my-thing" → "my-thing" */
function shortBranch(branch: string): string {
  return branch.split("/").pop() ?? branch;
}

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
  aic: number;
} {
  let tokens = 0,
    costUsd = 0;
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
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // -------------------------------------------------------------------------
  // On session start: clear cache and reload all historical data
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    statsCache.clear();
    const currentFile = ctx.sessionManager.getSessionFile() ?? undefined;
    // Load all sessions except the current one (avoid double-counting in-progress turns)
    loadAllSessions(currentFile);
    loadFeatureCosts();

    // Set up custom footer (TUI only)
    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      // Keep currentBranch in sync so turn_end can attribute costs correctly
      currentBranch = footerData.getGitBranch() ?? undefined;
      const unsub = footerData.onBranchChange(() => {
        currentBranch = footerData.getGitBranch() ?? undefined;
        tui.requestRender();
      });

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
            if (
              entry.type === "message" &&
              entry.message.role === "assistant"
            ) {
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
          const pctStr =
            contextUsage?.percent != null ? pctVal.toFixed(1) : "?";
          const ctxDisplay =
            pctStr === "?"
              ? `?/${fmtTok(contextWindow)}`
              : `${pctStr}% (${fmtTok(contextWindow)})`;

          // --- Historical stats (from cache) ---
          const today = periodStats(todayKey());
          const week = periodStats(weekStartKey());

          // --- Extension statuses (read early for inline injection) ---
          const extStatuses = footerData.getExtensionStatuses();

          // --- Build left stats parts ---
          const parts: string[] = [];

          // Context % with colour thresholds
          const ctxColor =
            pctVal > 90 ? "error" : pctVal > 70 ? "warning" : "accent";
          parts.push(theme.fg(ctxColor, ctxDisplay));

          parts.push(theme.fg("muted", "/"));

          parts.push(
            theme.fg("syntaxFunction", `↑${fmtTok(totalInput)}`) +
              theme.fg("dim", " ") +
              theme.fg("syntaxFunction", `↓${fmtTok(totalOutput)}`),
          );

          if (totalCacheRead > 0 || totalCacheWrite > 0) {
            parts.push(theme.fg("muted", "/"));

            const cacheRead = theme.fg("success", fmtTok(totalCacheRead));
            const cacheWrite = theme.fg("success", fmtTok(totalCacheWrite));
            const cacheHit =
              latestCacheHitRate == null
                ? ""
                : theme.fg("success", ` (${latestCacheHitRate.toFixed(1)}%)`);
            parts.push(
              `${cacheRead}${theme.fg("dim", " ")}${cacheWrite}${cacheHit}`,
            );
          }

          // Headroom compression savings
          const headroomStatus = extStatuses.get("headroom");
          if (headroomStatus) {
            parts.push(theme.fg("muted", "/"));
            parts.push(theme.fg("warning", headroomStatus));
          }

          // RTK command-rewrite savings
          const rtkStatus = extStatuses.get("rtk");
          if (rtkStatus) {
            parts.push(theme.fg("muted", "/"));
            parts.push(theme.fg("bashMode", rtkStatus));
          }

          // Token and cost for today and week
          if (totalCost > 0 || today.tokens > 0 || week.tokens > 0) {
            parts.push(theme.fg("dim", "│"));

            const usingSubscription = ctx.model
              ? ctx.modelRegistry.isUsingOAuth(ctx.model)
              : false;

            parts.push(
              theme.fg("syntaxFunction", `${fmtTok(totalInput + totalOutput)}`),
            );
            parts.push(
              theme.fg(
                "syntaxNumber",
                `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`,
              ),
            );

            if (today.tokens > 0) {
              parts.push(theme.fg("muted", "/"));
              parts.push(theme.fg("syntaxFunction", `${fmtTok(today.tokens)}`));
              parts.push(
                theme.fg("syntaxNumber", `$${today.costUsd.toFixed(3)}`),
              );
            }
            if (
              week.tokens > 0 &&
              (today.tokens === 0 || week.tokens > today.tokens)
            ) {
              parts.push(theme.fg("muted", "/"));
              parts.push(theme.fg("syntaxFunction", `${fmtTok(week.tokens)}`));
              parts.push(
                theme.fg("syntaxNumber", `$${week.costUsd.toFixed(3)}`),
              );
            }

            // Branch / feature cost (cumulative across all sessions on this branch)
            const branch = currentBranch;
            if (branch) {
              const branchCost = featureCosts.get(branch) ?? 0;
              if (branchCost > 0) {
                parts.push(theme.fg("muted", "/"));
                parts.push(
                  theme.fg("dim", "\u2387 ") +
                  theme.fg("dim", shortBranch(branch) + " ") +
                  theme.fg("syntaxNumber", `$${branchCost.toFixed(3)}`),
                );
              }
            }
          }

          const statsLeft = parts.join(" ");

          // --- Right side: model (+ thinking level), coloured per-part ---
          const modelName = ctx.model?.id || "no-model";
          const thinkingLevel = pi.getThinkingLevel();

          // Thinking level colour matches Pi's built-in theme tokens
          const thinkingColor = !ctx.model?.reasoning
            ? null
            : thinkingLevel === "minimal"
              ? "thinkingMinimal"
              : thinkingLevel === "low"
                ? "thinkingLow"
                : thinkingLevel === "medium"
                  ? "thinkingMedium"
                  : thinkingLevel === "high"
                    ? "thinkingHigh"
                    : thinkingLevel === "xhigh"
                      ? "thinkingXhigh"
                      : "thinkingOff"; // "off" or unset

          const thinkingLabel =
            thinkingColor === null
              ? ""
              : theme.fg("dim", " \u2022 ") +
                theme.fg(
                  thinkingColor,
                  thinkingLevel === "off" || !thinkingLevel
                    ? "thinking off"
                    : thinkingLevel,
                );

          // Build right side without provider first
          const presetStatus = extStatuses.get("preset");
          let rightStyled = theme.fg("accent", modelName) + thinkingLabel;
          if (presetStatus) {
            rightStyled = rightStyled + theme.fg("dim", " · ") + presetStatus;
          }

          // Optionally prepend provider when multiple providers available
          if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
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
            statsLine = statsLeft + " ".repeat(width - lw - rw) + rightStyled;
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

          return [statsLine];
        },
      };
    });
  });

  // Accumulate cost for the active git branch each turn
  pi.on("turn_end", async (event) => {
    if (event.message.role !== "assistant") return;
    const m = event.message as AssistantMessage;
    const cost = m.usage?.cost?.total;
    if (cost == null || !currentBranch) return;
    addBranchCost(currentBranch, cost);
    saveFeatureCosts();
  });
}

/**
 * footer — Enhanced Pi footer with token & cost stats
 *
 * - Replaces Pi's footer row with session token + cost breakdown.
 * - Shows today's and this week's stats.
 *
 * Data source: Pi's session JSONL files at ~/.pi/agent/sessions/
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  addBranchCost,
  deleteLegacyFeatureCosts,
  getBranchCost,
  resolveRepoRoot,
} from "./lib/branch-costs";
import { addFeatureCost, resolveFeatureName } from "./lib/feature-costs";
import {
  addSkillCost,
  extractSkillName,
  extractSkillNameFromCommand,
} from "./lib/skill-costs";
import { getPeriodStats, loadAllSessions } from "./lib/usage-data";
import "./usage";

/** The git branch active at the time of the last turn / branch change. */
export let currentBranch: string | undefined;

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

let currentRepoRoot: string | undefined;
let currentBranchCostUsd = 0;
let currentFeature: string | undefined;
/** Last-active skill this session (heuristic) — read by subagent/index.ts to attribute subagent spend. */
export let currentSkill: string | undefined;

export default function (pi: ExtensionAPI) {
  // -------------------------------------------------------------------------
  // On session start: clear cache and reload all historical data
  // -------------------------------------------------------------------------

  pi.on("session_start", async (event, ctx) => {
    const currentFile = ctx.sessionManager.getSessionFile() ?? undefined;
    // Load all sessions except the current one (avoid double-counting in-progress turns)
    loadAllSessions(currentFile, event);
    currentRepoRoot = resolveRepoRoot(process.cwd());
    currentFeature = resolveFeatureName(process.cwd());
    currentSkill = undefined; // reset per session — no skill active until one loads
    deleteLegacyFeatureCosts(); // one-time cleanup, no-op once file is gone

    // Set up custom footer (TUI only)
    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      // Keep currentBranch in sync so turn_end can attribute costs correctly
      currentBranch = footerData.getGitBranch() ?? undefined;
      currentBranchCostUsd =
        currentRepoRoot && currentBranch
          ? (getBranchCost(currentRepoRoot, currentBranch)?.cost ?? 0)
          : 0;
      const unsub = footerData.onBranchChange(() => {
        currentBranch = footerData.getGitBranch() ?? undefined;
        currentBranchCostUsd =
          currentRepoRoot && currentBranch
            ? (getBranchCost(currentRepoRoot, currentBranch)?.cost ?? 0)
            : 0;
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
            } else if (
              entry.type === "message" &&
              (entry.message as any).role === "toolResult" &&
              (entry.message as any).toolName === "subagent"
            ) {
              // subagent processes run with --no-session, so their cost never
              // shows up as an "assistant" entry of this session — it only rolls
              // up into this toolResult's nested details. Fold it in here too,
              // so "session $X" matches the same main+sub total "branch $X" uses.
              const results = (entry.message as any).details?.results;
              if (Array.isArray(results)) {
                for (const r of results) {
                  const u = r?.usage;
                  if (!u) continue;
                  totalInput += u.input ?? 0;
                  totalOutput += u.output ?? 0;
                  totalCacheRead += u.cacheRead ?? 0;
                  totalCacheWrite += u.cacheWrite ?? 0;
                  totalCost += u.cost ?? 0;
                }
              }
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

          // Total session cost and branch cost
          if (totalCost > 0 || (currentBranch && currentBranchCostUsd > 0)) {
            parts.push(theme.fg("dim", "│"));

            parts.push(
              theme.fg("syntaxFunction", "session ") +
                theme.fg("syntaxNumber", `$${totalCost.toFixed(3)}`),
            );

            if (currentBranch && currentBranchCostUsd > 0) {
              parts.push(theme.fg("muted", "/"));
              parts.push(
                theme.fg("syntaxFunction", "branch ") +
                  theme.fg("syntaxNumber", `$${currentBranchCostUsd.toFixed(3)}`),
              );
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

  // Detect skill activation: reading a SKILL.md is the normal progressive-
  // disclosure path; explicit `/skill:name` is the other. Either switches
  // attribution — cost accrues to whichever skill activated most recently.
  pi.on("tool_call", async (event) => {
    if (!isToolCallEventType("read", event)) return;
    const name = extractSkillName(event.input.path);
    if (name) currentSkill = name;
  });

  pi.on("input", async (event) => {
    const name = extractSkillNameFromCommand(event.text);
    if (name) currentSkill = name;
  });

  // Accumulate cost for the active git branch (and active feature/skill, if any) each turn
  pi.on("turn_end", async (event) => {
    if (event.message.role !== "assistant") return;
    const m = event.message as AssistantMessage & { model?: string };
    const cost = m.usage?.cost?.total;
    if (cost == null || !currentRepoRoot) return;
    const tokens =
      m.usage.input + m.usage.output + m.usage.cacheRead + m.usage.cacheWrite;
    if (currentBranch) {
      addBranchCost(
        currentRepoRoot,
        currentBranch,
        cost,
        tokens,
        m.model,
        m.usage.input,
        m.usage.output,
      );
      currentBranchCostUsd += cost;
    }
    if (currentFeature) {
      addFeatureCost(
        currentRepoRoot,
        currentFeature,
        cost,
        tokens,
        m.model,
        m.usage.input,
        m.usage.output,
      );
    }
    if (currentSkill) {
      addSkillCost(currentRepoRoot, currentSkill, cost, tokens, m.model);
    }
  });
}

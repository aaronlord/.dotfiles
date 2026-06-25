// RTK Pi extension — rewrites bash commands to use rtk for token savings.
// Requires: rtk >= 0.23.0 in PATH.
//
// This is a thin delegating extension: all rewrite logic lives in `rtk rewrite`,
// which is the single source of truth (src/discover/registry.rs).
// To add or change rewrite rules, edit the Rust registry — not this file.
//
// Exit code contract for `rtk rewrite`:
//   0 + stdout  Rewrite found → mutate command
//   1           No RTK equivalent → pass through unchanged
//   3 + stdout  Rewrite (advisory) → mutate command

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const REWRITE_TIMEOUT_MS = 2_000;
const GAIN_TIMEOUT_MS = 3_000;
const MIN_SUPPORTED_RTK_MINOR = 23;

// Session-scoped savings tracking
let baselineSaved = 0;
let sessionSaved = 0;
let sessionRewrites = 0;

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function formatStatus(): string {
  if (sessionRewrites === 0) return "0x ↓0";
  return `${sessionRewrites}x ↓${fmtK(sessionSaved)}`;
}

async function queryProjectSaved(
  pi: ExtensionAPI,
  cwd: string,
): Promise<number> {
  const result = await pi.exec("rtk", ["gain", "-p", "--format", "json"], {
    timeout: GAIN_TIMEOUT_MS,
    cwd,
  });
  if (result.code !== 0) return 0;
  try {
    const data = JSON.parse(result.stdout);
    return data?.summary?.total_saved ?? 0;
  } catch {
    return 0;
  }
}

// Parse "X.Y.Z" semver, return [major, minor, patch] or null.
function parseSemver(raw: string): [number, number, number] | null {
  const m = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

// Calls `rtk rewrite`; returns the rewritten command or null (pass through).
async function rewriteCommand(
  pi: ExtensionAPI,
  cmd: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await pi.exec("rtk", ["rewrite", cmd], {
    timeout: REWRITE_TIMEOUT_MS,
    signal,
  });
  if (result.killed) return null;
  if (result.code !== 0 && result.code !== 3) return null;
  return result.stdout.trim() || null;
}

export default async function (pi: ExtensionAPI) {
  // Probe rtk version at load time; disables extension if missing or too old.
  const ver = await pi.exec("rtk", ["--version"], {
    timeout: REWRITE_TIMEOUT_MS,
  });
  if (ver.code !== 0) {
    console.warn("[rtk] rtk binary not found in PATH — extension disabled");
    return;
  }

  // Warn and bail if rtk predates 0.23.0 (when `rtk rewrite` was introduced).
  const parsed = parseSemver(ver.stdout.replace(/^rtk\s+/, ""));
  if (parsed) {
    const [major, minor] = parsed;
    if (major === 0 && minor < MIN_SUPPORTED_RTK_MINOR) {
      console.warn(
        `[rtk] rtk ${ver.stdout.trim()} is too old (need >= 0.23.0) — extension disabled`,
      );
      return;
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    sessionRewrites = 0;
    sessionSaved = 0;
    baselineSaved = await queryProjectSaved(pi, ctx.cwd);
    ctx.ui.setStatus("rtk", formatStatus());
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (sessionRewrites === 0) return;
    const current = await queryProjectSaved(pi, ctx.cwd);
    sessionSaved = Math.max(0, current - baselineSaved);
    ctx.ui.setStatus("rtk", formatStatus());
  });

  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return;

      const cmd = event.input.command;
      if (typeof cmd !== "string" || cmd.trim() === "") return;

      if (cmd.startsWith("rtk ")) return;
      if (process.env.RTK_DISABLED === "1") return;

      // Delegate to RTK.
      const rewritten = await rewriteCommand(pi, cmd, ctx.signal);
      if (rewritten && rewritten !== cmd) {
        event.input.command = rewritten;
        sessionRewrites += 1;
        ctx.ui.setStatus("rtk", formatStatus());
      }
    } catch (err) {
      // Fail open: never block execution on an unexpected error.
      console.warn(
        "[rtk] unexpected error in tool_call handler; passing through command",
        err,
      );
      return;
    }
  });
}

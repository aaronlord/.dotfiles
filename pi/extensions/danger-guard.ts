/**
 * Danger Guard Extension
 *
 * Intercepts tool calls that look dangerous and asks for confirmation
 * before allowing them to execute. Blocks silently in non-interactive mode.
 *
 * Covers:
 *   - Destructive bash patterns (rm -rf, dd, mkfs, etc.)
 *   - Privilege escalation (sudo, su, pkexec)
 *   - Pipe-to-shell download idioms (curl | sh, wget | bash)
 *   - Unsafe git operations (force push, reset --hard, clean -fd)
 *   - Dangerous SQL (DROP TABLE/DATABASE, TRUNCATE)
 *   - Process/service manipulation (kill -9, systemctl stop/disable)
 *   - Reads or writes to sensitive files (.env, secrets, prod config, /etc/*)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Danger rules for bash commands
// ---------------------------------------------------------------------------

interface DangerRule {
  pattern: RegExp;
  label: string;      // short human name shown in the prompt
  severity: "warn" | "critical";
}

const BASH_DANGER_RULES: DangerRule[] = [
  // Recursive / forced delete
  {
    pattern: /\brm\s+(-[^\s]*f[^\s]*|-[^\s]*r[^\s]*|--force|--recursive)/i,
    label: "recursive/forced rm",
    severity: "critical",
  },
  // Overwrite a device or disk
  {
    pattern: /\bdd\b.*\bof=/i,
    label: "dd with output file (disk overwrite risk)",
    severity: "critical",
  },
  // Format a filesystem
  {
    pattern: /\bmkfs\b/i,
    label: "mkfs (filesystem format)",
    severity: "critical",
  },
  // Privilege escalation
  {
    pattern: /\b(sudo|su|pkexec|doas)\b/i,
    label: "privilege escalation (sudo/su/pkexec)",
    severity: "critical",
  },
  // Pipe internet content directly into a shell — classic supply-chain attack vector
  {
    pattern: /\b(curl|wget)\b[^|]*\|.*\b(ba?sh|sh|zsh|fish|python\d*|ruby|node)\b/i,
    label: "pipe remote content into shell",
    severity: "critical",
  },
  // Nuke everything from /
  {
    pattern: /\brm\s+.*\s+\/\s*$/,
    label: "rm targeting root /",
    severity: "critical",
  },
  // chmod world-write
  {
    pattern: /\bchmod\b.*\b(777|a\+w|o\+w)/i,
    label: "chmod world-writable (777 / a+w / o+w)",
    severity: "warn",
  },
  // Force push to git remote
  {
    pattern: /\bgit\b.*\bpush\b.*\s(-f|--force|--force-with-lease)/i,
    label: "git force push",
    severity: "warn",
  },
  // Hard reset — destroys uncommitted changes
  {
    pattern: /\bgit\b.*\breset\b.*--hard/i,
    label: "git reset --hard (destroys uncommitted changes)",
    severity: "warn",
  },
  // git clean — deletes untracked files
  {
    pattern: /\bgit\b.*\bclean\b.*-[^\s]*[fd]/i,
    label: "git clean -fd (deletes untracked files)",
    severity: "warn",
  },
  // SQL table/database drops
  {
    pattern: /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i,
    label: "destructive SQL (DROP / TRUNCATE)",
    severity: "critical",
  },
  // Kill process
  {
    pattern: /\bkill\b.*-9\b/i,
    label: "kill -9 (SIGKILL)",
    severity: "warn",
  },
  // Stop / disable system services
  {
    pattern: /\b(systemctl|service)\b.*\b(stop|disable|mask)\b/i,
    label: "systemctl stop/disable/mask",
    severity: "warn",
  },
  // Wipe /tmp wholesale
  {
    pattern: /\brm\b.*\/(tmp|temp)\b/i,
    label: "rm inside /tmp",
    severity: "warn",
  },
  // Overwrite /etc
  {
    pattern: /\b(tee|cp|mv|>\s*)\s*\/etc\//i,
    label: "write to /etc/",
    severity: "critical",
  },
];

// ---------------------------------------------------------------------------
// Sensitive paths for write / edit tools
// ---------------------------------------------------------------------------

const SENSITIVE_PATH_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/etc\//,                   label: "/etc/ system config" },
  { pattern: /(^|\/|\\)\.env$/,           label: ".env (secrets)" },
  { pattern: /(^|\/|\\)\.env\./,          label: ".env.* (secrets)" },
  { pattern: /\/secrets?\//i,             label: "secrets directory" },
  { pattern: /\/(prod|production)\//i,    label: "production directory" },
  { pattern: /id_(rsa|ecdsa|ed25519)$/,   label: "SSH private key" },
  { pattern: /\.pem$/,                    label: ".pem (certificate/key)" },
  { pattern: /\.key$/,                    label: ".key file" },
  { pattern: /\.p12$/,                    label: ".p12 (PKCS12 keystore)" },
  { pattern: /\.pfx$/,                    label: ".pfx (certificate)" },
  { pattern: /\/\.ssh\//,                 label: "~/.ssh directory" },
  { pattern: /\/\.aws\//,                 label: "~/.aws credentials" },
  { pattern: /credentials$/,              label: "credentials file" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchingBashRules(command: string): DangerRule[] {
  return BASH_DANGER_RULES.filter((r) => r.pattern.test(command));
}

function matchingSensitivePaths(path: string): string[] {
  return SENSITIVE_PATH_PATTERNS
    .filter((p) => p.pattern.test(path))
    .map((p) => p.label);
}

function severity(rules: DangerRule[]): "warn" | "critical" {
  return rules.some((r) => r.severity === "critical") ? "critical" : "warn";
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {

  pi.on("tool_call", async (event, ctx) => {

    // ── Bash guard ──────────────────────────────────────────────────────────
    if (event.toolName === "bash") {
      const command = (event.input as { command: string }).command;
      const matches = matchingBashRules(command);

      if (matches.length === 0) return undefined;

      const sev = severity(matches);
      const labels = matches.map((m) => `  • ${m.label}`).join("\n");
      const icon = sev === "critical" ? "🚨" : "⚠️";

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Blocked by danger-guard (${sev}): ${matches.map((m) => m.label).join(", ")}`,
        };
      }

      const preview =
        command.length > 200 ? command.slice(0, 200) + "…" : command;

      const choice = await ctx.ui.select(
        `${icon} Danger guard — ${sev === "critical" ? "CRITICAL" : "WARNING"}\n\nCommand:\n  ${preview}\n\nRisk${matches.length > 1 ? "s" : ""}:\n${labels}\n\nAllow?`,
        ["Yes, run it", "No, block it"],
      );

      if (choice !== "Yes, run it") {
        return { block: true, reason: "Blocked by user via danger-guard" };
      }

      return undefined;
    }

    // ── Read guard ───────────────────────────────────────────────────────────
    if (event.toolName === "read") {
      const path = (event.input as { path: string }).path;
      const matched = matchingSensitivePaths(path);

      if (matched.length === 0) return undefined;

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Blocked read of sensitive path "${path}" (${matched.join(", ")})`,
        };
      }

      const labels = matched.map((l) => `  • ${l}`).join("\n");
      const choice = await ctx.ui.select(
        `🔒 Danger guard — sensitive file read\n\nPath: ${path}\n\nReason${matched.length > 1 ? "s" : ""}:\n${labels}\n\nAllow?`,
        ["Yes, read it", "No, block it"],
      );

      if (choice !== "Yes, read it") {
        return { block: true, reason: "Blocked by user via danger-guard (sensitive path)" };
      }

      return undefined;
    }

    // ── Write / edit guard ───────────────────────────────────────────────────
    if (event.toolName === "write" || event.toolName === "edit") {
      const path = (event.input as { path: string }).path;
      const matched = matchingSensitivePaths(path);

      if (matched.length === 0) return undefined;

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Blocked write to sensitive path "${path}" (${matched.join(", ")})`,
        };
      }

      const labels = matched.map((l) => `  • ${l}`).join("\n");
      const choice = await ctx.ui.select(
        `🔒 Danger guard — sensitive file write\n\nPath: ${path}\n\nReason${matched.length > 1 ? "s" : ""}:\n${labels}\n\nAllow?`,
        ["Yes, write it", "No, block it"],
      );

      if (choice !== "Yes, write it") {
        return { block: true, reason: "Blocked by user via danger-guard (sensitive path)" };
      }

      return undefined;
    }

    return undefined;
  });
}

/**
 * Secret Scan Guard Extension
 *
 * Complements danger-guard.ts (which blocks access to known sensitive *paths*
 * like .env, id_rsa, credentials files) by scanning actual *content* for
 * secret-shaped strings, regardless of which file they land in. Catches the
 * case danger-guard can't: a hardcoded API key or password inside an
 * otherwise ordinary source file.
 *
 * Covers:
 *   - write/edit tool content, before it hits disk
 *   - `git commit` — scans the full staged diff before the commit is allowed
 *
 * Does not duplicate danger-guard's path rules, destructive-command rules,
 * or force-push/reset rules — those stay there.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

interface SecretRule {
  pattern: RegExp;
  label: string;
}

const SECRET_RULES: SecretRule[] = [
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS access key ID" },
  { pattern: /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9\/+=]{40}['"]?/i, label: "AWS secret access key" },
  { pattern: /-----BEGIN\s+(RSA|EC|OPENSSH|DSA|PGP)?\s*PRIVATE KEY-----/, label: "private key block" },
  { pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/, label: "Slack token" },
  { pattern: /gh[pousr]_[A-Za-z0-9]{36,}/, label: "GitHub token" },
  { pattern: /sk_live_[0-9A-Za-z]{16,}/, label: "Stripe live secret key" },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, label: "Google API key" },
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, label: "JWT-shaped token" },
  { pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, label: "generic credential-shaped assignment" },
];

function findSecrets(content: string): string[] {
  const found = new Set<string>();
  for (const rule of SECRET_RULES) {
    if (rule.pattern.test(content)) found.add(rule.label);
  }
  return [...found];
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // ── write / edit content scan ──────────────────────────────────────────
    if (event.toolName === "write" || event.toolName === "edit") {
      const input = event.input as {
        path?: string;
        content?: string;
        edits?: Array<{ newText?: string }>;
      };

      const content =
        input.content ??
        (input.edits ?? []).map((e) => e.newText ?? "").join("\n");

      const matched = findSecrets(content);
      if (matched.length === 0) return undefined;

      const labels = matched.map((m) => `  • ${m}`).join("\n");
      const path = input.path ?? "(unknown path)";

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Blocked by secret-scan-guard: possible secret in content written to ${path} (${matched.join(", ")})`,
        };
      }

      const choice = await ctx.ui.select(
        `🔑 Secret scan — possible credential in content\n\nTarget: ${path}\n\nMatched:\n${labels}\n\nWrite anyway?`,
        ["Yes, write it", "No, block it"],
      );

      if (choice !== "Yes, write it") {
        return { block: true, reason: "Blocked by user via secret-scan-guard" };
      }

      return undefined;
    }

    // ── git commit staged-diff scan ────────────────────────────────────────
    if (event.toolName === "bash") {
      const command = (event.input as { command: string }).command;
      if (!/\bgit\s+commit\b/.test(command)) return undefined;

      let diff = "";
      try {
        diff = execSync("git diff --cached", {
          cwd: ctx.cwd,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch {
        // Not a git repo, or nothing staged — nothing to scan, let it proceed.
        return undefined;
      }

      if (!diff) return undefined;

      // Only scan added lines — a secret already present unchanged isn't this commit's doing.
      const addedLines = diff
        .split("\n")
        .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
        .join("\n");

      const matched = findSecrets(addedLines);
      if (matched.length === 0) return undefined;

      const labels = matched.map((m) => `  • ${m}`).join("\n");

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Blocked by secret-scan-guard: staged diff contains possible secret(s) (${matched.join(", ")})`,
        };
      }

      const choice = await ctx.ui.select(
        `🔑 Secret scan — staged diff contains possible credential(s)\n\nMatched:\n${labels}\n\nCommit anyway?`,
        ["Yes, commit it", "No, block it"],
      );

      if (choice !== "Yes, commit it") {
        return { block: true, reason: "Blocked by user via secret-scan-guard (staged diff)" };
      }

      return undefined;
    }

    return undefined;
  });
}

/**
 * Path-Specific Instructions Extension
 *
 * Reads `.github/instructions/*.instructions.md` files — the GitHub Copilot
 * path-specific custom instructions format — and injects matching instruction
 * blocks into the conversation when `write` or `edit` tool calls target files
 * that match the `applyTo:` glob pattern in each file's frontmatter.
 *
 * File format:
 *   .github/instructions/typescript.instructions.md
 *   ---
 *   applyTo: "**\/*.ts"
 *   ---
 *   Always use strict TypeScript. Prefer `const` over `let`.
 *
 * See: https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface PathInstruction {
  patterns: string[];
  content: string;
  /** The filename, used as a dedup key */
  source: string;
}

/** Minimal YAML parser — only handles the `applyTo` field. */
function parseFrontmatter(raw: string): { applyTo: string[] | null; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { applyTo: null, body: raw };

  const yaml = match[1];
  const body = match[2].trim();

  // applyTo: "glob"  OR  applyTo: ["glob1", "glob2"]
  const scalar = yaml.match(/^applyTo:\s*"([^"]+)"\s*$/m);
  if (scalar) return { applyTo: [scalar[1]], body };

  const scalarSingle = yaml.match(/^applyTo:\s*'([^']+)'\s*$/m);
  if (scalarSingle) return { applyTo: [scalarSingle[1]], body };

  const unquoted = yaml.match(/^applyTo:\s*([^\[\s][^\n]*)\s*$/m);
  if (unquoted) return { applyTo: [unquoted[1].trim()], body };

  // Inline array: applyTo: ["*.ts", "*.tsx"]
  const inlineArr = yaml.match(/^applyTo:\s*\[([^\]]+)\]\s*$/m);
  if (inlineArr) {
    const items = inlineArr[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    return { applyTo: items, body };
  }

  return { applyTo: null, body };
}

/**
 * Convert a glob pattern to a RegExp.
 * Handles `**` (any path), `*` (any segment), `?` (any char).
 */
function globToRegex(glob: string): RegExp {
  // Escape regex metacharacters (excluding glob chars * ? which we handle)
  let p = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Replace ** before * so we can distinguish them
  p = p.replace(/\*\*/g, "\x00");
  p = p.replace(/\*/g, "[^/]*");
  p = p.replace(/\x00/g, ".*");
  p = p.replace(/\?/g, "[^/]");
  // Match anywhere in the path (Copilot globs are relative to repo root)
  return new RegExp(`(^|/)${p}($|/)`);
}

function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((p) => globToRegex(p).test(normalized));
}

function loadInstructions(cwd: string): PathInstruction[] {
  const dir = path.join(cwd, ".github", "instructions");
  if (!fs.existsSync(dir)) return [];

  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".instructions.md"))
      .flatMap((file) => {
        const raw = fs.readFileSync(path.join(dir, file), "utf-8");
        const { applyTo, body } = parseFrontmatter(raw);
        if (!applyTo || !body) return [];
        return [{ patterns: applyTo, content: body, source: file }];
      });
  } catch {
    return [];
  }
}

export default function (pi: ExtensionAPI) {
  let instructions: PathInstruction[] = [];
  const injectedThisSession = new Set<string>();

  pi.on("session_start", async (_event, ctx) => {
    instructions = loadInstructions(ctx.cwd);
    injectedThisSession.clear();

    if (instructions.length > 0 && ctx.hasUI) {
      ctx.ui.notify(
        `Path instructions: ${instructions.length} rule${instructions.length === 1 ? "" : "s"} loaded`,
        "info",
      );
    }
  });

  pi.on("tool_call", async (event, _ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const filePath = (event.input as { path?: string }).path;
    if (!filePath) return;

    for (const instruction of instructions) {
      if (injectedThisSession.has(instruction.source)) continue;
      if (!matchesAnyGlob(filePath, instruction.patterns)) continue;

      injectedThisSession.add(instruction.source);

      pi.sendMessage(
        {
          customType: "path-instructions",
          content: [
            `**Path instructions** (\`${instruction.patterns.join("`, `")}\`)`,
            "",
            instruction.content,
          ].join("\n"),
          display: true,
        },
        { deliverAs: "steer" },
      );
    }
  });
}

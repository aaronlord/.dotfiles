/**
 * Model Matrix Extension
 *
 * Surfaces the model-tier reference doc (weight/orientation axes, authority
 * ladder, reviewer rules — general.md) plus the concrete model roster
 * (model-matrix.md) via a `/model-matrix` command for humans and a
 * `model_matrix` tool for the LLM to self-serve in any chat.
 *
 * Roster resolution: a repo-local `{repo root}/.agents/model-matrix.md` (found
 * by walking up from cwd for a `.git`) wins if present; otherwise falls back
 * to the per-machine `~/.pi/agent/model-matrix.md`. Repo root is found fresh
 * per call, not cached, since a single session can span multiple cwds.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const GENERAL_PATH = path.join(__dirname, "general.md");
const GLOBAL_MODELS_PATH = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "model-matrix.md",
);

function readOrNote(filePath: string, missingNote: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return missingNote;
  }
}

function findRepoRoot(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function resolveModelsPath(cwd: string): string {
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot) {
    const repoLocal = path.join(repoRoot, ".agents", "model-matrix.md");
    if (fs.existsSync(repoLocal)) return repoLocal;
  }
  return GLOBAL_MODELS_PATH;
}

function buildContent(cwd: string): string {
  const general = readOrNote(
    GENERAL_PATH,
    `_(general.md missing at ${GENERAL_PATH})_`,
  );
  const modelsPath = resolveModelsPath(cwd);
  const models = readOrNote(
    modelsPath,
    `_(no model roster at ${modelsPath} — framework only)_`,
  );
  return [general, "---", models].join("\n\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("model-matrix", {
    description: "Show model tier framework + current model roster",
    handler: async (_args, ctx) => {
      pi.sendMessage({
        customType: "model-matrix",
        content: buildContent(ctx.cwd),
        display: true,
      });
    },
  });

  pi.registerTool({
    name: "model_matrix",
    label: "Model Matrix",
    description:
      "Reference doc for model weight/orientation tiers, the authority ladder, and the " +
      "current model roster (names, cost, strengths) — repo-local `.agents/model-matrix.md` " +
      "if present, else the per-machine default. Use when picking a model, comparing model " +
      "strengths/cost, or choosing a model/thinkingLevel for the subagent tool.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      return {
        content: [{ type: "text", text: buildContent(ctx.cwd) }],
        details: {},
      };
    },
  });
}

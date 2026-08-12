/**
 * Model Matrix Extension
 *
 * Surfaces the model-tier reference doc (weight/orientation axes, authority
 * ladder, reviewer rules — general.md) plus this machine's concrete model
 * roster (model-matrix.md, per-machine, not versioned) via a `/model-matrix`
 * command for humans and a `model_matrix` tool for the LLM to self-serve in
 * any chat.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const GENERAL_PATH = path.join(__dirname, "general.md");
const MODELS_PATH = path.join(os.homedir(), ".pi", "agent", "model-matrix.md");

function readOrNote(filePath: string, missingNote: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return missingNote;
  }
}

function buildContent(): string {
  const general = readOrNote(
    GENERAL_PATH,
    `_(general.md missing at ${GENERAL_PATH})_`,
  );
  const models = readOrNote(
    MODELS_PATH,
    `_(no machine-specific model roster at ${MODELS_PATH} — framework only)_`,
  );
  return [general, "---", models].join("\n\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("model-matrix", {
    description: "Show model tier framework + this machine's model roster",
    handler: async (_args, _ctx) => {
      pi.sendMessage({
        customType: "model-matrix",
        content: buildContent(),
        display: true,
      });
    },
  });

  pi.registerTool({
    name: "model_matrix",
    label: "Model Matrix",
    description:
      "Reference doc for model weight/orientation tiers, the authority ladder, and this " +
      "machine's current model roster (names, cost, strengths). Use when picking a model, " +
      "comparing model strengths/cost, or choosing a model/thinkingLevel for the subagent tool.",
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{ type: "text", text: buildContent() }],
        details: {},
      };
    },
  });
}

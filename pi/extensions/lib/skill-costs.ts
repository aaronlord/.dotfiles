/**
 * skill-costs — per-(repo, skill) cost store
 *
 * Heuristic: a skill becomes "active" when its SKILL.md is read (progressive
 * disclosure — the normal path) or explicitly invoked via `/skill:name`.
 * Stays active until a different skill activates or the session ends — there's
 * no real "skill turn" boundary, so cost keeps accruing to the last-active
 * skill across however many turns/tool-calls follow. Multiple skills in one
 * chat are handled by switching attribution at each new activation.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SkillCostEntry {
  version: number;
  repoRoot: string;
  skill: string;
  cost: number;
  tokens: number;
  lastUpdated: string;
  byModel?: Record<string, { cost: number; tokens: number }>;
}

const SKILL_COSTS_DIR = join(homedir(), ".pi", "agent", "skill-costs");

function entryFilePath(repoRoot: string, skill: string): string {
  const key = `${repoRoot}::${skill}`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return join(SKILL_COSTS_DIR, `${hash}.json`);
}

function readEntry(filePath: string): SkillCostEntry | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as SkillCostEntry;
  } catch {
    return undefined;
  }
}

// matches ".../skills/<name>/SKILL.md" (standard) and ".../skills/<name>.md"
// (flat root-level skill file) — anything else (references/, scripts/, etc.) is ignored
export function extractSkillName(filePath: string): string | undefined {
  const parts = filePath.split(/[\\/]/).filter((p) => p.length > 0);
  const skillsIdx = parts.lastIndexOf("skills");
  if (skillsIdx === -1 || skillsIdx >= parts.length - 1) return undefined;

  const next = parts[skillsIdx + 1];
  if (!next) return undefined;

  // .../skills/<name>/SKILL.md
  if (parts[skillsIdx + 2] === "SKILL.md" && skillsIdx + 2 === parts.length - 1) {
    return next;
  }

  // .../skills/<name>.md (flat file, directly under a skills/ dir)
  if (skillsIdx + 1 === parts.length - 1 && /\.md$/i.test(next) && next.toUpperCase() !== "SKILL.MD") {
    return next.slice(0, -3);
  }

  return undefined;
}

// explicit `/skill:name` (or `/skill:name args...`) invocation text
export function extractSkillNameFromCommand(text: string): string | undefined {
  const match = /^\/skill:([a-z0-9-]+)/i.exec(text.trim());
  return match?.[1];
}

export function addSkillCost(
  repoRoot: string,
  skill: string,
  cost: number,
  tokens: number,
  model?: string,
): void {
  try {
    const filePath = entryFilePath(repoRoot, skill);
    const existing = readEntry(filePath);
    const byModel = { ...existing?.byModel };
    if (model) {
      const prev = byModel[model] ?? { cost: 0, tokens: 0 };
      byModel[model] = { cost: prev.cost + cost, tokens: prev.tokens + tokens };
    }
    const entry: SkillCostEntry = {
      version: 1,
      repoRoot,
      skill,
      cost: (existing?.cost ?? 0) + cost,
      tokens: (existing?.tokens ?? 0) + tokens,
      lastUpdated: new Date().toISOString(),
      byModel,
    };
    mkdirSync(SKILL_COSTS_DIR, { recursive: true });
    writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf8");
  } catch {
    /* ignore write errors — never let cost tracking interrupt the session */
  }
}

export function getSkillCostsForRepo(
  repoRoot: string,
  since?: string | Date,
): SkillCostEntry[] {
  let files: string[];
  try {
    files = existsSync(SKILL_COSTS_DIR) ? readdirSync(SKILL_COSTS_DIR) : [];
  } catch {
    return [];
  }

  const sinceMs = since == null ? undefined : new Date(since).getTime();
  const entries: SkillCostEntry[] = [];
  for (const file of files) {
    const entry = readEntry(join(SKILL_COSTS_DIR, file));
    if (!entry || entry.repoRoot !== repoRoot) continue;
    if (sinceMs != null && new Date(entry.lastUpdated).getTime() < sinceMs) continue;
    entries.push(entry);
  }
  return entries;
}

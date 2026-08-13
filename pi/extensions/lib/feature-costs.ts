/**
 * feature-costs — per-(repo, feature) cost store
 *
 * Mirrors branch-costs.ts but keyed by the active `.feature` symlink
 * (see my-feature skill: `.feature` -> `.features/{name}`) instead of the
 * git branch. Lets /usage break down spend by feature slice, since one
 * feature often spans several branches/worktrees.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export interface FeatureCostEntry {
  version: number;
  repoRoot: string;
  feature: string;
  cost: number;
  tokens: number;
  lastUpdated: string;
  byModel?: Record<string, { cost: number; tokens: number }>;
}

const FEATURE_COSTS_DIR = join(homedir(), ".pi", "agent", "feature-costs");

function entryFilePath(repoRoot: string, feature: string): string {
  const key = `${repoRoot}::${feature}`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return join(FEATURE_COSTS_DIR, `${hash}.json`);
}

function readEntry(filePath: string): FeatureCostEntry | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as FeatureCostEntry;
  } catch {
    return undefined;
  }
}

// worktree's own dir (not git-common-dir) — the `.feature` symlink lives in
// the checked-out working tree, which differs per worktree
function worktreeToplevel(cwd: string): string | undefined {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

// resolves `.feature` symlink at the worktree root to a feature name, only
// if it points inside `.features/` — anything else is ignored
export function resolveFeatureName(cwd: string): string | undefined {
  const toplevel = worktreeToplevel(cwd);
  if (!toplevel) return undefined;
  const linkPath = join(toplevel, ".feature");
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return undefined;
    const target = readlinkSync(linkPath);
    const resolvedTarget = resolve(toplevel, target);
    const featuresDir = resolve(toplevel, ".features");
    if (!resolvedTarget.startsWith(featuresDir + "/")) return undefined;
    return basename(resolvedTarget);
  } catch {
    return undefined;
  }
}

export function addFeatureCost(
  repoRoot: string,
  feature: string,
  cost: number,
  tokens: number,
  model?: string,
): void {
  try {
    const filePath = entryFilePath(repoRoot, feature);
    const existing = readEntry(filePath);
    const byModel = { ...existing?.byModel };
    if (model) {
      const prev = byModel[model] ?? { cost: 0, tokens: 0 };
      byModel[model] = { cost: prev.cost + cost, tokens: prev.tokens + tokens };
    }
    const entry: FeatureCostEntry = {
      version: 1,
      repoRoot,
      feature,
      cost: (existing?.cost ?? 0) + cost,
      tokens: (existing?.tokens ?? 0) + tokens,
      lastUpdated: new Date().toISOString(),
      byModel,
    };
    mkdirSync(FEATURE_COSTS_DIR, { recursive: true });
    writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf8");
  } catch {
    /* ignore write errors — never let cost tracking interrupt the session */
  }
}

export function getFeatureCostsForRepo(repoRoot: string): FeatureCostEntry[] {
  let files: string[];
  try {
    files = existsSync(FEATURE_COSTS_DIR) ? readdirSync(FEATURE_COSTS_DIR) : [];
  } catch {
    return [];
  }

  const entries: FeatureCostEntry[] = [];
  for (const file of files) {
    const entry = readEntry(join(FEATURE_COSTS_DIR, file));
    if (entry && entry.repoRoot === repoRoot) entries.push(entry);
  }
  return entries;
}

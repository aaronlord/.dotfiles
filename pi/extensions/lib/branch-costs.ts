/**
 * branch-costs — per-(repo, branch) cost store
 *
 * Owns ~/.pi/agent/branch-costs/: one JSON file per (repoRoot, branch) pair.
 * Fixes the old feature-costs.json bug (bare branch name only, no repo
 * dimension, single file rewritten wholesale on every write — clobbers
 * concurrent sessions). Filename is an opaque hash; repoRoot/branch live
 * inside the file content, which is the readable source of truth.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BranchCostEntry {
  version: number;
  repoRoot: string;
  branch: string;
  cost: number;
  tokens: number;
  lastUpdated: string;
  byModel?: Record<string, { cost: number; tokens: number }>;
}

// ---------------------------------------------------------------------------
// Paths / key hashing
// ---------------------------------------------------------------------------

const BRANCH_COSTS_DIR = join(homedir(), ".pi", "agent", "branch-costs");
const LEGACY_FEATURE_COSTS_FILE = join(
  homedir(),
  ".pi",
  "agent",
  "feature-costs.json",
);

// Opaque filename by design — repoRoot/branch fields inside the file are the readable source.
function entryFilePath(repoRoot: string, branch: string): string {
  const key = `${repoRoot}::${branch}`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return join(BRANCH_COSTS_DIR, `${hash}.json`);
}

function readEntry(filePath: string): BranchCostEntry | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as BranchCostEntry;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// --git-common-dir is shared by every worktree of a repo (unlike --show-toplevel,
// which returns the worktree's own dir) — the key that keeps branch costs unified.
function absoluteGitCommonDir(cwd: string): string | undefined {
  try {
    const raw = execSync("git rev-parse --git-common-dir", {
      cwd,
      encoding: "utf8",
    }).trim();
    return isAbsolute(raw) ? raw : join(cwd, raw);
  } catch {
    return undefined;
  }
}

export function resolveRepoRoot(cwd: string): string {
  const commonDir = absoluteGitCommonDir(cwd);
  if (commonDir) {
    const resolved = resolve(commonDir);
    return resolved.endsWith(`${sep}.git`) ? resolved.slice(0, -5) : resolved;
  }
  try {
    // Not a git repo, or git too old for --git-common-dir — fall back to toplevel.
    return execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    // Not a git repo, or git unavailable — fall back to raw cwd.
    return cwd;
  }
}

export function getCurrentBranch(cwd: string): string | undefined {
  try {
    const branch = execSync("git branch --show-current", {
      cwd,
      encoding: "utf8",
    }).trim();
    return branch.length > 0 ? branch : undefined;
  } catch {
    return undefined;
  }
}

export function addBranchCost(
  repoRoot: string,
  branch: string,
  cost: number,
  tokens: number,
  model?: string,
): void {
  try {
    const filePath = entryFilePath(repoRoot, branch);
    const existing = readEntry(filePath);
    const byModel = { ...existing?.byModel };
    if (model) {
      const prev = byModel[model] ?? { cost: 0, tokens: 0 };
      byModel[model] = { cost: prev.cost + cost, tokens: prev.tokens + tokens };
    }
    const entry: BranchCostEntry = {
      version: 1,
      repoRoot,
      branch,
      cost: (existing?.cost ?? 0) + cost,
      tokens: (existing?.tokens ?? 0) + tokens,
      lastUpdated: new Date().toISOString(),
      byModel,
    };
    mkdirSync(BRANCH_COSTS_DIR, { recursive: true });
    writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf8");
  } catch {
    /* ignore write errors — never let cost tracking interrupt the session */
  }
}

export function getBranchCost(
  repoRoot: string,
  branch: string,
): BranchCostEntry | undefined {
  return readEntry(entryFilePath(repoRoot, branch));
}

export function getBranchCostsForRepo(repoRoot: string): BranchCostEntry[] {
  let files: string[];
  try {
    files = existsSync(BRANCH_COSTS_DIR) ? readdirSync(BRANCH_COSTS_DIR) : [];
  } catch {
    return [];
  }

  const entries: BranchCostEntry[] = [];
  for (const file of files) {
    const entry = readEntry(join(BRANCH_COSTS_DIR, file));
    if (entry && entry.repoRoot === repoRoot) entries.push(entry);
  }
  return entries;
}

export function deleteLegacyFeatureCosts(): void {
  try {
    if (existsSync(LEGACY_FEATURE_COSTS_FILE)) {
      unlinkSync(LEGACY_FEATURE_COSTS_FILE);
    }
  } catch {
    /* ignore — best-effort cleanup */
  }
}

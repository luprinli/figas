#!/usr/bin/env node
/* eslint-env node */
/**
 * detect-changed-suites.js
 *
 * Detects files changed vs the PR base branch (or origin/main) and maps them
 * to the test suites defined in trigger-map.json. Outputs the test suite paths
 * to stdout and optionally runs them when --run flag is passed.
 *
 * Usage:
 *   node scripts/ci/detect-changed-suites.js          # print suites
 *   node scripts/ci/detect-changed-suites.js --run    # run suites via vitest
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const TRIGGER_MAP_PATH = resolve(__dirname, "trigger-map.json");

function getChangedFiles() {
  try {
    // Try to get the diff against the PR base first, fall back to origin/main
    let base = "origin/main";
    try {
      execSync("git rev-parse --verify origin/main", { cwd: ROOT, stdio: "pipe" });
    } catch {
      try {
        execSync("git rev-parse --verify origin/develop", { cwd: ROOT, stdio: "pipe" });
        base = "origin/develop";
      } catch {
        base = "HEAD~1";
      }
    }

    const output = execSync(`git diff --name-only ${base}...HEAD`, {
      cwd: ROOT,
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    // In CI with fetch-depth: 0, this should always work.
    // Fallback: all files changed in the last commit.
    try {
      const output = execSync("git diff --name-only HEAD~1 HEAD", {
        cwd: ROOT,
        encoding: "utf-8",
      });
      return output.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}

function loadTriggerMap() {
  if (!existsSync(TRIGGER_MAP_PATH)) {
    console.error(`trigger-map.json not found at ${TRIGGER_MAP_PATH}`);
    return {};
  }
  return JSON.parse(readFileSync(TRIGGER_MAP_PATH, "utf-8"));
}

function matchesPattern(filePath, pattern) {
  // Convert glob-like pattern to regex
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "___GLOBSTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___GLOBSTAR___/g, ".*");
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath.replace(/\\/g, "/"));
}

function detectSuites(changedFiles, triggerMap) {
  const suites = new Set();

  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, "/");

    for (const [pattern, testSuites] of Object.entries(triggerMap)) {
      if (matchesPattern(normalized, pattern)) {
        if (testSuites.includes("__ALL__")) {
          // Schema or migration change — run everything
          return ["__ALL__"];
        }
        for (const suite of testSuites) {
          suites.add(suite);
        }
      }
    }
  }

  return [...suites].sort();
}

function main() {
  const run = process.argv.includes("--run");
  const changedFiles = getChangedFiles();
  const triggerMap = loadTriggerMap();
  const suites = detectSuites(changedFiles, triggerMap);

  if (suites.length === 0) {
    console.log("No affected test suites detected.");
    process.exit(0);
  }

  if (suites.includes("__ALL__")) {
    console.log("Schema or migration change detected — running ALL tests.");
    if (run) {
      execSync("npx vitest run", {
        cwd: ROOT,
        encoding: "utf-8",
        stdio: "inherit",
      });
    }
    process.exit(0);
  }

  console.log(`Changed files: ${changedFiles.length}`);
  console.log(`Affected test suites: ${suites.length}`);
  for (const suite of suites) {
    console.log(`  ${suite}`);
  }

  if (run) {
    for (const suite of suites) {
      console.log(`\n=== Running: ${suite} ===`);
      try {
        execSync(`npx vitest run ${suite}`, {
          cwd: ROOT,
          encoding: "utf-8",
          stdio: "inherit",
        });
      } catch {
        console.error(`Tests failed for suite: ${suite}`);
        process.exit(1);
      }
    }
  }
}

main();

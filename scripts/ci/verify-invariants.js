#!/usr/bin/env node
/* eslint-env node */
/**
 * verify-invariants.js
 *
 * Verifies all FIGAS business rule invariants across two dimensions:
 *
 *   1. Content-based constraints — specific patterns that MUST or MUST NOT
 *      exist in source files (e.g., SQL clause must be absent)
 *   2. Test coverage constraints — a test file must exist and contain
 *      patterns proving the invariant is tested
 *
 * Invariants are sourced from:
 *   - docs/business-rules.md (RULE 1–18)
 *   - .agents/skills/code-integrity/SKILL.md (CI-1 through CI-7, AG-1 through AG-4)
 *
 * Usage:
 *   node scripts/ci/verify-invariants.js
 *
 * Exit codes:
 *   0 — all invariants pass
 *   1 — one or more invariants fail
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// Content-based invariants
//
// Each invariant specifies:
//   file       — path relative to repo root
//   mustContain — array of patterns; ALL must be found
//   mustNotContain — array of patterns; NONE may be found
//   description — human-readable explanation for failure output
// ─────────────────────────────────────────────────────────────────────────────

const CONTENT_INVARIANTS = [
  {
    id: "CI-1",
    name: "Unassigned pool query must not check bl.flight_id IS NULL (RULE 15)",
    file: "app/utils/repositories/booking-leg-passenger.ts",
    mustContain: ["blp.flight_leg_id IS NULL"],
    mustNotContain: [],
    // Only check within the findUnassignedByDate function scope.
    // bl.flight_id IS NULL is legitimate in UPDATE/other functions.
    checkFunctionScope: true,
    functionName: "findUnassignedByDate",
    functionEndMarker: /^export /,
    forbiddenInFunction: ["bl.flight_id IS NULL"],
    requiredInFunction: ["blp.flight_leg_id IS NULL"],
    description: "The findUnassignedByDate query must filter by blp.flight_leg_id IS NULL only. Adding bl.flight_id IS NULL causes sibling passengers to disappear from the unassigned pool (RULE 15 violation).",
  },
  {
    id: "CI-2",
    name: "Manifest queries must not filter by flight_leg_id IS NOT NULL (RULE 16)",
    files: [
      "app/utils/schedule-handlers.server.ts",
    ],
    mustContain: [],
    mustNotContain: [],
    // Special multi-pattern check: no line containing "bl.flight_id" should
    // be within 5 lines of "blp.flight_leg_id IS NOT NULL" on the same query
    checkMultiPattern: true,
    multiPatternA: /blp.flight_leg_id IS NOT NULL/,
    multiPatternB: /bl.flight_id\s*=/,
    multiPatternMaxLines: 5,
    description: "Manifest queries (RULE 16) use bl.flight_id. They must NOT also filter by blp.flight_leg_id IS NOT NULL, which would exclude sibling-propagated passengers (those with flight_leg_id = NULL).",
  },
  {
    id: "CI-3",
    name: "Optimistic state must use per-passenger key, not booking_leg_id (RULE 17)",
    file: "app/routes/operations.schedule._index/route.tsx",
    mustContain: [],
    // All calls to setOptimisticAssignedIds must use .id (blp.id) or bookingLegPassengerId,
    // not .booking_leg_id
    mustNotContain: [
      "add(booking.booking_leg_id",
    ],
    description: "All setOptimisticAssignedIds calls must hide by booking.id (blp.id), not booking.booking_leg_id. Using booking_leg_id hides all passengers sharing that leg (RULE 17 violation).",
  },
  {
    id: "CI-4",
    name: "Schema column name contracts — booking_leg_passengers (RULE 10)",
    files: [
      "scripts/seed-e2e-drag-test.ts",
      "scripts/seed-full.ts",
      "scripts/seed-comprehensive.ts",
      "prisma/seed-realistic-bookings.ts",
    ],
    mustContain: [],
    // In files that reference booking_leg_passengers, the column is clothed_weight_kg
    // (not clothed_body_weight_kg which is on booking_passengers)
    checkColumnPerFile: true,
    perFileMustNotContain: [
      // booking_leg_passengers column must be clothed_weight_kg, not clothed_body_weight_kg
      { pattern: "booking_leg_passengers.*clothed_body_weight_kg", description: "clothed_body_weight_kg on booking_leg_passengers table (correct column is clothed_weight_kg)" },
      // booking_passengers column must be clothed_body_weight_kg, not clothed_weight_kg
      { pattern: "booking_passengers.*clothed_weight_kg[^_]", description: "clothed_weight_kg on booking_passengers table (correct column is clothed_body_weight_kg)" },
    ],
    description: "RULE 10 column name contracts. booking_leg_passengers uses clothed_weight_kg; booking_passengers uses clothed_body_weight_kg. Transposition causes Prisma P2010 errors.",
  },
  {
    id: "CI-5",
    name: "pendingAssignAfterCreateRef must include bookingLegPassengerId (RULE 17)",
    file: "app/routes/operations.schedule._index/route.tsx",
    mustContain: [
      "bookingLegPassengerId?: number",
      "bookingLegPassengerId: booking.id",
      "b.bookingLegPassengerId",
    ],
    mustNotContain: [],
    description: "The buffer type, push, and replay loop must all include bookingLegPassengerId. Missing it causes whole-leg assignment when create-flight response arrives (RULE 17 violation).",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Test-coverage invariants
//
// Each invariant specifies:
//   testFile       — path relative to repo root
//   searchPatterns — patterns that must appear in the test file
// ─────────────────────────────────────────────────────────────────────────────

const TEST_COVERAGE_INVARIANTS = [
  // --- Existing invariants (1-10, unchanged) ---
  {
    id: 1,
    name: "No-Fly Day Enforcement",
    testFile: "tests/integration/scheduling/auto-build.test.ts",
    searchPatterns: ["no-fly", "noFly", "no_fly"],
  },
  {
    id: 2,
    name: "Approve Requires Flights with Bookings",
    testFile: "tests/integration/scheduling/schedule-status-flow.test.ts",
    searchPatterns: ["approve"],
  },
  {
    id: 3,
    name: "Publish Requires Captain Assignment",
    testFile: "tests/integration/scheduling/schedule-status-flow.test.ts",
    searchPatterns: ["publish"],
  },
  {
    id: 4,
    name: "Pilot Constraints",
    testFile: "tests/integration/scheduling/auto-build.test.ts",
    searchPatterns: ["pilot", "duty", "rest"],
  },
  {
    id: 5,
    name: "Weight & Balance Validation",
    testFile: "tests/unit/scheduling/flight-validation.test.ts",
    searchPatterns: ["weight", "balance", "MTOW", "MLW"],
  },
  {
    id: 6,
    name: "Empty Flight Cleanup",
    testFile: "tests/integration/scheduling/unassign-booking.test.ts",
    searchPatterns: ["last booking", "empty flight", "delete"],
  },
  {
    id: 7,
    name: "Route Insertion Integrity",
    testFile: "tests/integration/scheduling/assign-booking.test.ts",
    searchPatterns: ["assign", "route"],
  },
  {
    id: 8,
    name: "Status Transition Validity",
    testFile: "tests/integration/scheduling/schedule-status-flow.test.ts",
    searchPatterns: ["transition", "status"],
  },
  {
    id: 9,
    name: "Audit Trail Preservation",
    testFile: "tests/integration/scheduling/schedule-status-flow.test.ts",
    searchPatterns: ["audit", "approved_by", "cancelled_by"],
  },
  {
    id: 10,
    name: "Permission Enforcement",
    testFile: "tests/integration/scheduling/permissions.test.ts",
    searchPatterns: ["permission", "forbidden", "403"],
  },
  // --- New invariants (11-12, from RULE 15 and RULE 10) ---
  {
    id: 11,
    name: "Per-Passenger Assignment Isolation Tests (RULE 15)",
    testFile: "tests/integration/scheduling/unassigned-by-date.test.ts",
    searchPatterns: ["flight_leg_id", "blp.flight_leg_id", "sibling"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Verification logic
// ─────────────────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

console.log("═══════════════════════════════════════════════════════");
console.log("  FIGAS Invariant Verification");
console.log("═══════════════════════════════════════════════════════\n");

// ── Content invariants ─────────────────────────────────────────────────────

console.log("── Content-Based Invariants ──\n");

for (const inv of CONTENT_INVARIANTS) {
  const filesToCheck = inv.files || (inv.file ? [inv.file] : []);
  let invFailed = false;

  for (const relPath of filesToCheck) {
    const filePath = resolve(ROOT, relPath);

    if (!existsSync(filePath)) {
      console.error(`  ❌ ${inv.id}: File not found — ${relPath}`);
      invFailed = true;
      continue;
    }

    const content = readFileSync(filePath, "utf-8");

    // Check mustContain patterns
    if (inv.mustContain && inv.mustContain.length > 0) {
      for (const pattern of inv.mustContain) {
        if (!content.includes(pattern)) {
          console.error(`  ❌ ${inv.id}: Required pattern NOT found — "${pattern}" in ${relPath}`);
          invFailed = true;
        }
      }
    }

    // Check mustNotContain patterns
    if (inv.mustNotContain && inv.mustNotContain.length > 0) {
      for (const pattern of inv.mustNotContain) {
        if (content.includes(pattern)) {
          console.error(`  ❌ ${inv.id}: Forbidden pattern FOUND — "${pattern}" in ${relPath}`);
          console.error(`     ${inv.description}`);
          invFailed = true;
        }
      }
    }

    // Check multi-pattern proximity (CI-2: manifest query filter check)
    if (inv.checkMultiPattern && inv.multiPatternA && inv.multiPatternB) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (inv.multiPatternA.test(lines[i])) {
          // Search nearby lines for the second pattern
          const start = Math.max(0, i - inv.multiPatternMaxLines);
          const end = Math.min(lines.length, i + inv.multiPatternMaxLines + 1);
          for (let j = start; j < end; j++) {
            if (j !== i && inv.multiPatternB.test(lines[j])) {
              console.error(`  ❌ ${inv.id}: Proximity violation in ${relPath}:`);
              console.error(`     Line ${i + 1}: ${lines[i].trim()}`);
              console.error(`     Line ${j + 1}: ${lines[j].trim()}`);
              console.error(`     ${inv.description}`);
              invFailed = true;
            }
          }
        }
      }
    }

    // Check per-file column contracts
    if (inv.checkColumnPerFile && inv.perFileMustNotContain) {
      for (const pf of inv.perFileMustNotContain) {
        const regex = new RegExp(pf.pattern, "i");
        if (regex.test(content)) {
          const match = content.match(regex);
          console.error(`  ❌ ${inv.id}: Column contract violation in ${relPath}:`);
          console.error(`     "${match?.[0]?.trim()}" — ${pf.description}`);
          console.error(`     ${inv.description}`);
          invFailed = true;
        }
      }
    }

    // Check function-scoped patterns (CI-1: findUnassignedByDate must not
    // contain bl.flight_id IS NULL within the function body, but it's valid
    // elsewhere in the file for UPDATE operations)
    if (inv.checkFunctionScope && inv.functionName) {
      const funcRegex = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${inv.functionName}\\b`);
      const funcMatch = content.match(funcRegex);
      if (funcMatch && funcMatch.index !== undefined) {
        const funcStart = funcMatch.index;
        let funcEnd = content.length;
        if (inv.functionEndMarker) {
          const rest = content.slice(funcStart + funcMatch[0].length);
          const endMatch = rest.match(inv.functionEndMarker);
          if (endMatch && endMatch.index !== undefined) {
            funcEnd = funcStart + funcMatch[0].length + endMatch.index;
          }
        }
        const funcBody = content.slice(funcStart, funcEnd);

        if (inv.forbiddenInFunction) {
          for (const pattern of inv.forbiddenInFunction) {
            if (funcBody.includes(pattern)) {
              console.error(`  ❌ ${inv.id}: Forbidden pattern in ${inv.functionName}() — "${pattern}" in ${relPath}`);
              console.error(`     ${inv.description}`);
              invFailed = true;
            }
          }
        }
        if (inv.requiredInFunction) {
          for (const pattern of inv.requiredInFunction) {
            if (!funcBody.includes(pattern)) {
              console.error(`  ❌ ${inv.id}: Required pattern missing from ${inv.functionName}() — "${pattern}" in ${relPath}`);
              console.error(`     ${inv.description}`);
              invFailed = true;
            }
          }
        }
      }
    }
  }

  if (invFailed) {
    failCount++;
  } else {
    console.log(`  ✅ ${inv.id}: ${inv.name}`);
    passCount++;
  }
}

// ── Test coverage invariants ───────────────────────────────────────────────

console.log("\n── Test Coverage Invariants ──\n");

for (const inv of TEST_COVERAGE_INVARIANTS) {
  const filePath = resolve(ROOT, inv.testFile);

  if (!existsSync(filePath)) {
    console.error(`  ❌ Invariant ${inv.id} (${inv.name}): Test file not found: ${inv.testFile}`);
    failCount++;
    continue;
  }

  const content = readFileSync(filePath, "utf-8");
  const found = inv.searchPatterns.some((pattern) =>
    content.toLowerCase().includes(pattern.toLowerCase()),
  );

  if (found) {
    console.log(`  ✅ Invariant ${inv.id} (${inv.name}): Covered in ${inv.testFile}`);
    passCount++;
  } else {
    console.error(
      `  ❌ Invariant ${inv.id} (${inv.name}): No test matching [${inv.searchPatterns.join(", ")}] in ${inv.testFile}`,
    );
    failCount++;
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`  Results: ${passCount} passed, ${failCount} failed`);
console.log(`═══════════════════════════════════════════════════════\n`);

if (failCount > 0) {
  console.error("Some invariants failed. Fix before merging.");
  console.error("See .agents/skills/code-integrity/SKILL.md for remediation guidance.\n");
  process.exit(1);
}

console.log("All invariants verified. ✅\n");
process.exit(0);

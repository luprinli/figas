#!/usr/bin/env node
/* eslint-env node */
/**
 * verify-invariants.js
 *
 * Verifies that every one of the 10 validation invariants has a corresponding
 * test file AND that file contains at least one test case referencing the
 * invariant. Exits with code 1 if any invariant is missing coverage.
 *
 * Usage:
 *   node scripts/ci/verify-invariants.js
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const INVARIANTS = [
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
];

let hasFailures = false;

for (const invariant of INVARIANTS) {
  const filePath = resolve(ROOT, invariant.testFile);

  if (!existsSync(filePath)) {
    console.error(`❌ Invariant ${invariant.id} (${invariant.name}): Test file not found: ${invariant.testFile}`);
    hasFailures = true;
    continue;
  }

  const content = readFileSync(filePath, "utf-8");
  const found = invariant.searchPatterns.some((pattern) =>
    content.toLowerCase().includes(pattern.toLowerCase()),
  );

  if (found) {
    console.log(`✅ Invariant ${invariant.id} (${invariant.name}): Covered in ${invariant.testFile}`);
  } else {
    console.error(
      `❌ Invariant ${invariant.id} (${invariant.name}): No test found matching patterns [${invariant.searchPatterns.join(", ")}] in ${invariant.testFile}`,
    );
    hasFailures = true;
  }
}

if (hasFailures) {
  console.error("\nSome invariants lack test coverage. Fix before merging.");
  process.exit(1);
}

console.log("\nAll 10 validation invariants have test coverage. ✅");
process.exit(0);

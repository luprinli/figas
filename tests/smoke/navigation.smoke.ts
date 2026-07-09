/**
 * navigation.smoke.ts
 * Guardian smoke test — verifies all route modules can be imported without errors.
 * A broken route module is caught immediately rather than at runtime.
 */

import { describe, test, expect } from "vitest";

const ROUTES = [
  // Auth
  "_auth.login",
  "_auth.logout",
  "_auth.signup",
  "_auth",
  "_index",
  // Admin
  "admin._index",
  "admin.users",
  "admin.aircraft",
  "admin.aerodromes",
  "admin.fares",
  "admin.fuel-rules",
  "admin.settings",
  "admin",
  // Booking
  "bookings._index",
  "bookings.new",
  "bookings",
  // Check-in
  "checkin._index",
  "checkin.counter",
  "checkin",
  // Finance
  "finance._index",
  "finance.invoices",
  "finance.payments",
  "finance.reconciliation",
  "finance",
  // Operations
  "operations._index",
  "operations",
  // Pilot
  "pilot._index",
  "pilot.flights",
  "pilot.schedule",
  "pilot",
  // Engineer
  "engineer._index",
  "engineer",
  // Shared
  "profile",
  "settings",
];

describe("Navigation smoke — all route modules import", () => {
  for (const route of ROUTES) {
    test(`route ~/routes/${route} imports without error`, async () => {
      await expect(import(`~/routes/${route}`)).resolves.toBeDefined();
    });
  }
});

describe("Core utilities import", () => {
  test("db.server imports", async () => {
    const db = await import("~/utils/db.server");
    expect(db.db).toBeDefined();
  });

  test("auth.server imports", async () => {
    const auth = await import("~/utils/auth.server");
    expect(auth).toBeDefined();
  });

  test("constants imports", async () => {
    const constants = await import("~/utils/constants");
    expect(constants).toBeDefined();
  });

  test("dates utility imports", async () => {
    const dates = await import("~/utils/dates");
    expect(dates).toBeDefined();
  });

  test("permissions.server imports", async () => {
    const perms = await import("~/utils/permissions.server");
    expect(perms).toBeDefined();
  });
});

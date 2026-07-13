import { test, expect } from "@playwright/test";
import { kdb } from "../../app/utils/db.server.kysely";
import { sql } from "kysely";

test.describe("Test Data Cleanup Verification", () => {
  test("no orphaned records violate referential integrity", async () => {
    const checks = [
      { table: "booking_legs", fk: "booking_id", ref: "bookings", refCol: "id" },
      { table: "booking_passengers", fk: "booking_id", ref: "bookings", refCol: "id" },
      { table: "booking_leg_passengers", fk: "booking_leg_id", ref: "booking_legs", refCol: "id" },
      { table: "booking_leg_passengers", fk: "booking_passenger_id", ref: "booking_passengers", refCol: "id" },
      { table: "flights", fk: "schedule_id", ref: "schedules", refCol: "id" },
      { table: "flight_legs", fk: "flight_id", ref: "flights", refCol: "id" },
      { table: "pilot_assignments", fk: "flight_id", ref: "flights", refCol: "id" },
      { table: "aircraft_assignments", fk: "flight_id", ref: "flights", refCol: "id" },
      { table: "weight_balance_snapshots", fk: "flight_leg_id", ref: "flight_legs", refCol: "id" },
      { table: "payments", fk: "booking_id", ref: "bookings", refCol: "id" },
      { table: "invoices", fk: "booking_id", ref: "bookings", refCol: "id" },
    ];

    let orphansFound = 0;
    for (const { table, fk, ref, refCol } of checks) {
      await test.step(`${table}.${fk} → ${ref}.${refCol}`, async () => {
        const result = await sql`
          SELECT COUNT(*)::int AS cnt
          FROM ${sql.raw(table)} t
          LEFT JOIN ${sql.raw(ref)} r ON r.${sql.raw(refCol)} = t.${sql.raw(fk)}
          WHERE t.${sql.raw(fk)} IS NOT NULL AND r.${sql.raw(refCol)} IS NULL
        `.execute(kdb);

        const count = Number((result.rows[0] as { cnt: number })?.cnt ?? 0);
        if (count > 0) {
          orphansFound += count;
          console.warn(`  ⚠️  ${count} orphans in ${table}.${fk}`);
        }
      });
    }

    expect(orphansFound).toBe(0);
  });

  test("auth state file is functional after global setup", async ({ page }) => {
    // If we're here, auth-state.json loaded and we're logged in
    await page.goto("/operations/schedule");
    await page.waitForLoadState("networkidle");

    // Verify we're authenticated (no redirect to login)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("/login");
  });
});

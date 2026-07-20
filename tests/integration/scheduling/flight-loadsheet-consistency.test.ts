import { describe, it, expect } from "vitest";
import { db } from "~/utils/db.server";
import { sql } from "kysely";
import { handleAssignBooking } from "~/utils/schedule-handlers.server";
import { createLoadsheetFromFlight } from "~/utils/loadsheet/create-loadsheet.server";
import { findManifestsByFlightId } from "~/utils/repositories/booking-leg-passenger";
import { loadsheetRepository } from "~/utils/loadsheet/loadsheet-repository.server";
import { dateOnly } from "../../fixtures/helpers";
import {
  createTestSchedule,
  createTestFlight,
  createTestFlightLeg,
  createTestBookingLeg,
  createTestBookingPassenger,
  createTestBookingLegPassengerLink,
} from "../../fixtures/factories";
import { MOCK_USER_IDS } from "../../fixtures/seed-data";

/**
 * Integration test: verify that after a booking is dragged onto a flight
 * (simulated via handleAssignBooking), the loadsheet shows the same
 * passenger count and names as the canonical findManifestsByFlightId query.
 *
 * This catches the filter-divergence bug where createLoadsheetFromFlight
 * built routeStops from legs-only, excluding passengers whose origin/dest
 * codes appeared only at flight-level endpoints.
 */
describe("flight-loadsheet passenger consistency", () => {
  const created = { schedules: [] as number[], flights: [] as number[], flightLegs: [] as number[], bookingLegs: [] as number[], loadsheets: [] as string[] };

  it("assign booking via handleAssignBooking → loadsheet matches manifests", async () => {
    // ── Setup: create schedule, flight, flight legs, unassigned booking ──
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 7, 21), // Tuesday (safe from no-fly)
      created_by: MOCK_USER_IDS.ops,
      status: "building",
    });
    created.schedules.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `FCS-${Date.now().toString(36).slice(-6)}`,
      origin_code: "STY",
      destination_code: "STY",
    });
    created.flights.push(flight.id);

    // Create flight legs: STY → PHD → ALB → DGS → CHR → STY
    // (matching the user's reported route)
    const legRoutes = [
      ["STY", "PHD"],
      ["PHD", "ALB"],
      ["ALB", "DGS"],
      ["DGS", "CHR"],
      ["CHR", "STY"],
    ];
    for (let i = 0; i < legRoutes.length; i++) {
      const leg = await createTestFlightLeg(flight.id, {
        origin_code: legRoutes[i][0],
        destination_code: legRoutes[i][1],
        leg_number: i + 1,
      });
      created.flightLegs.push(leg.id);
    }

    // Create 3 booking legs with different origin/destination pairs
    const bookings = [
      { origin: "STY", dest: "CHR", name: "First", lname: "Bailey", weight: 93 },
      { origin: "STY", dest: "DGS", name: "Second", lname: "Edwards", weight: 98 },
      { origin: "PHD", dest: "ALB", name: "Third", lname: "Clarke", weight: 95 },
    ];

    for (const bk of bookings) {
      const leg = await createTestBookingLeg({
        booking_id: 1,
        origin_code: bk.origin,
        destination_code: bk.dest,
        leg_date: dateOnly(2026, 7, 21),
        leg_sequence: 1,
        flight_id: null,
      });
      created.bookingLegs.push(leg.id);

      const pax = await createTestBookingPassenger({
        booking_id: 1,
        first_name: bk.name,
        last_name: bk.lname,
        clothed_body_weight_kg: bk.weight,
      });

      await createTestBookingLegPassengerLink({
        booking_leg_id: leg.id,
        booking_passenger_id: pax.id,
        clothed_weight_kg: bk.weight,
      });

      // Assign the booking to the flight via handleAssignBooking
      const result = await handleAssignBooking(leg.id, flight.id);
      expect("success" in result && result.success, `Failed to assign ${bk.name}: ${JSON.stringify(result)}`).toBe(true);
    }

    // ── Verify: findManifestsByFlightId should return all 3 ──
    const manifests = await findManifestsByFlightId([flight.id]);
    expect(manifests.length, "findManifestsByFlightId returns all 3 passengers").toBe(3);

    // Verify each passenger appears
    for (const bk of bookings) {
      const found = manifests.find((m: any) =>
        m.passenger_name?.includes(bk.name) && m.passenger_name?.includes(bk.lname)
      );
      expect(found, `${bk.name} ${bk.lname} found in manifests`).toBeTruthy();
      expect(Number(found.body_weight_kg), `${bk.name} weight matches`).toBe(bk.weight);
    }

    // ── Verify: loadsheet shows all 3 ──
    // Clean any stale loadsheet first
    await loadsheetRepository.deleteByFlightId(flight.id);
    const lsId = await createLoadsheetFromFlight(flight.id);
    expect(lsId, "loadsheet created").toBeTruthy();
    created.loadsheets.push(String(lsId));

    // Read back from loadsheet_passengers table
    const lsRows = await loadsheetRepository.findPassengers(lsId!);
    expect(lsRows.length, "loadsheet has same passenger count as manifests").toBe(3);

    const ls = await loadsheetRepository.findById(lsId!);
    expect(ls?.total_pax, "loadsheet.total_pax matches").toBe(3);

    // Verify each passenger's weight appears in loadsheet (via seated passengers)
    const lsWeights = lsRows.map((p: any) => Number(p.clothed_weight_kg)).sort();
    const manifestWeights = manifests.map((m: any) => Number(m.body_weight_kg)).sort();
    expect(lsWeights, "loadsheet weights match manifest weights").toEqual(manifestWeights);

    console.log("  ✅ All 3 passengers present in both findManifestsByFlightId and loadsheet");
  });

  // Cleanup
  afterAll(async () => {
    for (const id of created.flights) {
      await loadsheetRepository.deleteByFlightId(id).catch(() => {});
    }
    for (const id of created.bookingLegs) {
      await db.deleteFrom("booking_legs").where("id", "=", id).execute().catch(() => {});
    }
    for (const id of created.flightLegs) {
      await db.deleteFrom("flight_legs").where("id", "=", id).execute().catch(() => {});
    }
    for (const id of created.flights) {
      await db.deleteFrom("flights").where("id", "=", id).execute().catch(() => {});
    }
    for (const id of created.schedules) {
      await db.deleteFrom("schedules").where("id", "=", id).execute().catch(() => {});
    }
  });
});

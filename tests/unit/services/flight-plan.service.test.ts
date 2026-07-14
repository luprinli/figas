import { describe, it, expect, vi, beforeEach } from "vitest";

const { sqlExecute } = vi.hoisted(() => {
  const sqlExecute = vi.fn(() => ({ rows: [] }));
  return { sqlExecute };
});

vi.mock("~/utils/db.server.kysely", () => ({
  get kdb() { return {}; },
}));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return { ...actual, sql: () => ({ execute: sqlExecute }) };
});

import {
  getFlightPlanDetails,
  getVerificationStatus,
  verifyFlightPlan,
} from "~/utils/services/flight-plan.service";

function flightRow() {
  return {
    id: 10, flight_number: "FIG-20260713-001", departure_time: "2026-07-13T08:00:00Z",
    arrival_time: "2026-07-13T09:30:00Z", origin_code: "STY", destination_code: "MPA",
    aircraft_registration: "VP-FBZ",
  };
}

function legRow() {
  return { leg_number: 1, origin_code: "STY", destination_code: "MPA", distance_nm: "45.0", heading: "270.0", etd: "2026-07-13T08:00:00Z", eta: "2026-07-13T08:30:00Z" };
}

function wbRow() {
  return { fuel_weight_kg: "200", required_fuel_kg: "180", minimum_fuel_kg: "35", starting_fuel_kg: "200", reserve_fuel_kg: "35", fuel_state: "green", fuel_rule_applied: "StandardDayVFR" };
}

beforeEach(() => {
  vi.clearAllMocks();
  (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [] });
});

// ---------------------------------------------------------------------------
describe("getFlightPlanDetails()", () => {
  it("throws when flight not found", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValueOnce({ rows: [] });
    await expect(getFlightPlanDetails(999)).rejects.toThrow("Flight not found");
  });

  it("returns plan with legs, fuel, and weather for a single-leg flight", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ rows: [flightRow()] })     // flight query
      .mockReturnValueOnce({ rows: [legRow()] })         // legs query
      .mockReturnValueOnce({ rows: [wbRow()] });         // W&B query
    const plan = await getFlightPlanDetails(10);
    expect(plan.flightNumber).toBe("FIG-20260713-001");
    expect(plan.originCode).toBe("STY");
    expect(plan.destinationCode).toBe("MPA");
    expect(plan.aircraftRegistration).toBe("VP-FBZ");
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0].distanceNm).toBe(45);
    expect(plan.legs[0].heading).toBe(270);
    expect(plan.fuelBreakdown).not.toBeNull();
    expect(plan.fuelBreakdown!.startingFuelKg).toBe(200);
    expect(plan.fuelBreakdown!.reserveFuelKg).toBe(35);
    expect(plan.weather.length).toBeGreaterThanOrEqual(1);
  });

  it("handles multi-leg flights", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ rows: [flightRow()] })
      .mockReturnValueOnce({ rows: [
        { ...legRow(), leg_number: 1 },
        { ...legRow(), leg_number: 2, origin_code: "MPA", destination_code: "STY", distance_nm: "48.0", heading: "90.0" },
      ] })
      .mockReturnValueOnce({ rows: [wbRow()] });
    const plan = await getFlightPlanDetails(10);
    expect(plan.legs).toHaveLength(2);
    expect(plan.legs[1].originCode).toBe("MPA");
    expect(plan.legs[1].destinationCode).toBe("STY");
  });

  it("returns null fuel breakdown when no W&B snapshot exists", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ rows: [flightRow()] })
      .mockReturnValueOnce({ rows: [legRow()] })
      .mockReturnValueOnce({ rows: [] });
    const plan = await getFlightPlanDetails(10);
    expect(plan.fuelBreakdown).toBeNull();
  });

  it("uses required_fuel_kg as fallback for starting fuel", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ rows: [flightRow()] })
      .mockReturnValueOnce({ rows: [legRow()] })
      .mockReturnValueOnce({ rows: [{ fuel_weight_kg: "0", required_fuel_kg: "250", minimum_fuel_kg: "40", starting_fuel_kg: null, reserve_fuel_kg: null, fuel_state: null, fuel_rule_applied: null }] });
    const plan = await getFlightPlanDetails(10);
    expect(plan.fuelBreakdown!.startingFuelKg).toBe(250);
    expect(plan.fuelBreakdown!.reserveFuelKg).toBe(40);
  });

  it("defaults to 45 starting fuel when all values are zero", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ rows: [flightRow()] })
      .mockReturnValueOnce({ rows: [legRow()] })
      .mockReturnValueOnce({ rows: [{ fuel_weight_kg: "0", required_fuel_kg: null, minimum_fuel_kg: null, starting_fuel_kg: null, reserve_fuel_kg: null, fuel_state: null, fuel_rule_applied: null }] });
    const plan = await getFlightPlanDetails(10);
    expect(plan.fuelBreakdown!.startingFuelKg).toBe(45);
  });
});

// ---------------------------------------------------------------------------
describe("getVerificationStatus()", () => {
  it("returns pending when no sign-off exists", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [] });
    const status = await getVerificationStatus(10, 42);
    expect(status.verified).toBe(false);
    expect(status.status).toBe("pending");
    expect(status.verifiedAt).toBeNull();
  });

  it("returns verified when sign-off exists without discrepancy", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({
      rows: [{ signed_at: "2026-07-13T08:05:00Z", certification_statement: "Flight plan verified by pilot" }],
    });
    const status = await getVerificationStatus(10, 42);
    expect(status.verified).toBe(true);
    expect(status.status).toBe("verified");
    expect(status.verifiedAt).toBe("2026-07-13T08:05:00Z");
  });

  it("returns discrepancy when sign-off has DISCREPANCY prefix", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({
      rows: [{ signed_at: "2026-07-13T08:10:00Z", certification_statement: "DISCREPANCY: Fuel calculation differs from plan" }],
    });
    const status = await getVerificationStatus(10, 42);
    expect(status.verified).toBe(false);
    expect(status.status).toBe("discrepancy");
    expect(status.notes).toBe("Fuel calculation differs from plan");
  });
});

// ---------------------------------------------------------------------------
describe("verifyFlightPlan()", () => {
  it("inserts verified sign-off", async () => {
    await verifyFlightPlan(10, 42, "verified");
    expect(sqlExecute).toHaveBeenCalled();
  });

  it("inserts discrepancy sign-off with notes", async () => {
    await verifyFlightPlan(10, 42, "discrepancy", "Route deviation detected");
    expect(sqlExecute).toHaveBeenCalled();
  });

  it("uses default discrepancy message when no notes provided", async () => {
    await verifyFlightPlan(10, 42, "discrepancy");
    expect(sqlExecute).toHaveBeenCalled();
  });
});

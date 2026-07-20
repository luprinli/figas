/**
 * Unit tests for loadsheet calculation integrity.
 *
 * Tests verify the core loadsheet data pipeline:
 *   computeLoadsheetCalculations() — pure calculation logic
 *   - Weight arithmetic (empty + crew + pax + baggage + fuel)
 *   - MTOW status derivation (ok / warning / violation)
 *   - Fuel cascade across sectors
 *   - CG calculation with seat assignments
 *   - Edge cases: zero passengers, zero distance, missing aircraft data
 */
import { describe, it, expect, vi } from "vitest";

// ── Mock CSV distance map (avoid file I/O) ──────────────────────────────────

vi.mock("~/utils/scheduling/distance-lookup", () => ({
  loadCSVDistanceMap: vi.fn().mockResolvedValue(
    new Map([
      ["STY→WPI", 42],
      ["WPI→STY", 42],
      ["WPI→RYC", 28],
      ["RYC→WPI", 28],
      ["RYC→PST", 35],
      ["PST→RYC", 35],
      ["PST→STY", 55],
      ["STY→PST", 55],
    ]),
  ),
}));

import { computeLoadsheetCalculations } from "~/utils/loadsheet/loadsheet-calculations.server";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAircraft(overrides?: {
  empty_weight_kg?: number;
  max_takeoff_weight_kg?: number;
  max_landing_weight_kg?: number;
}) {
  return {
    empty_weight_kg: overrides?.empty_weight_kg ?? 1627,
    max_takeoff_weight_kg: overrides?.max_takeoff_weight_kg ?? 2994,
    max_landing_weight_kg: overrides?.max_landing_weight_kg ?? 2994,
  };
}

function makePassenger(
  id: number,
  overrides?: {
    bookingLegId?: number;
    origin_code?: string;
    destination_code?: string;
    clothedWeightKg?: number;
    baggageWeightKg?: number;
    freightWeightKg?: number;
  },
) {
  return {
    id,
    bookingLegId: overrides?.bookingLegId ?? id,
    origin_code: overrides?.origin_code ?? "STY",
    destination_code: overrides?.destination_code ?? "WPI",
    clothedWeightKg: overrides?.clothedWeightKg ?? 75,
    baggageWeightKg: overrides?.baggageWeightKg ?? 15,
    freightWeightKg: overrides?.freightWeightKg ?? 0,
  };
}

function makeLeg(
  legNumber: number,
  origin: string,
  dest: string,
  distanceNm: number | null = null,
  overrides?: { id?: number },
) {
  return {
    id: overrides?.id ?? legNumber,
    leg_number: legNumber,
    origin_code: origin,
    destination_code: dest,
    distance_nm: distanceNm,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("computeLoadsheetCalculations", () => {
  // ── 1. Basic single-leg flight ──────────────────────────────────────────

  it("should compute correct takeoff weight for a single-leg with 2 pax", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 1,
      legs: [makeLeg(1, "STY", "WPI", 42)],
      passengers: [
        makePassenger(1, { clothedWeightKg: 80, baggageWeightKg: 20 }),
        makePassenger(2, { clothedWeightKg: 65, baggageWeightKg: 10 }),
      ],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    expect(result.sectors).toHaveLength(1);
    const s = result.sectors[0];

    // fuelBurn = Math.round(flightTimeMin * burnRateKgPerMin)
    // burnRateKgPerMin = DEFAULT_BN2_BURN_RATE_KG_PER_HOUR / 60 = 45 / 60 = 0.75
    // flightTimeMin = computeFlightTime(42, 140, 0) = Math.round((42/140)*60 + 0) = 18
    const fuelBurn = Math.round(18 * 0.75); // = 14
    const startingFuel = fuelBurn + 35 + 3; // burn + reserve + taxi
    // TOW = empty(1627) + pilot(80) + pax(145) + baggage(30) + freight(0) + startingFuel
    const expectedTow = 1627 + 80 + 145 + 30 + startingFuel;

    expect(s.takeoffWeightKg).toBe(expectedTow);
    expect(s.landingWeightKg).toBe(expectedTow - fuelBurn);
    expect(s.towStatus).toBe("ok");
    expect(s.towReason).toBeNull();
    expect(s.originCode).toBe("STY");
    expect(s.destinationCode).toBe("WPI");
    expect(s.distanceNm).toBe(42);
    expect(s.plannedTimeMin).toBe(18);
    expect(s.fuelOnBoardKg).toBe(startingFuel);
    expect(s.fuelBurnKg).toBe(fuelBurn);
    expect(s.fuelRemainingKg).toBe(startingFuel - fuelBurn);
    expect(result.startingFuelKg).toBe(startingFuel);
    expect(result.totalBurnKg).toBe(fuelBurn);
    expect(result.reserveFuelKg).toBe(35);
  });

  // ── 2. Multi-leg fuel cascade ───────────────────────────────────────────

  it("should cascade fuel correctly across multiple legs", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 2,
      legs: [
        makeLeg(1, "STY", "WPI", 42),
        makeLeg(2, "WPI", "RYC", 28),
        makeLeg(3, "RYC", "PST", 35),
      ],
      passengers: [
        makePassenger(1, { clothedWeightKg: 80, baggageWeightKg: 15, origin_code: "STY", destination_code: "PST" }),
      ],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    expect(result.sectors).toHaveLength(3);
    const [s0, s1, s2] = result.sectors;

    // Fuel flows: each sector's remaining = next sector's on-board
    expect(s1.fuelOnBoardKg).toBe(s0.fuelRemainingKg);
    expect(s2.fuelOnBoardKg).toBe(s1.fuelRemainingKg);

    // TOW decreases as fuel burns off
    expect(s1.takeoffWeightKg).toBe(s0.landingWeightKg);
    expect(s2.takeoffWeightKg).toBe(s1.landingWeightKg);

    // Final fuel remaining should be ≥ 0
    expect(s2.fuelRemainingKg).toBeGreaterThanOrEqual(0);
  });

  // ── 3. MTOW violation ──────────────────────────────────────────────────

  it("should detect MTOW violation when takeoff weight exceeds MTOW", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 3,
      legs: [makeLeg(1, "STY", "WPI", 42)],
      passengers: [
        makePassenger(1, { clothedWeightKg: 1200, baggageWeightKg: 500 }),
      ],
      aircraft: makeAircraft({ max_takeoff_weight_kg: 2500 }),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    const s = result.sectors[0];
    expect(s.towStatus).toBe("violation");
    expect(s.towReason).toContain("exceeded");
    expect(s.takeoffWeightKg).toBeGreaterThan(2500);
  });

  // ── 4. MTOW warning ────────────────────────────────────────────────────

  it("should warn when takeoff weight is within 5% of MTOW", async () => {
    const mtow = 2000;
    // empty(1627) + pilot(80) + pax(100+98) + fuel(45) = 1950
    // 1950 / 2000 = 97.5%  →  warning
    const result = await computeLoadsheetCalculations({
      flightId: 4,
      legs: [makeLeg(1, "STY", "WPI", 42)],
      passengers: [
        makePassenger(1, {
          clothedWeightKg: 100,
          baggageWeightKg: 98,
          freightWeightKg: 0,
        }),
      ],
      aircraft: makeAircraft({
        max_takeoff_weight_kg: mtow,
        max_landing_weight_kg: mtow,
      }),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    const s = result.sectors[0];
    const pct = (s.takeoffWeightKg / mtow) * 100;
    expect(pct).toBeGreaterThanOrEqual(95);
    expect(pct).toBeLessThan(100);
    expect(s.towStatus).toBe("warning");
    expect(s.towReason).toContain("Within 5%");
  });

  // ── 5. Zero passengers ─────────────────────────────────────────────────

  it("should produce valid sectors with zero passengers", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 5,
      legs: [makeLeg(1, "STY", "WPI", 42)],
      passengers: [],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    expect(result.sectors).toHaveLength(1);
    // fuelBurn=14, startingFuel = 14 + 35 + 3 = 52
    // TOW = empty(1627) + pilot(80) + 0 + 52
    expect(result.sectors[0].takeoffWeightKg).toBe(1627 + 80 + 52);
    expect(result.sectors[0].towStatus).toBe("ok");
    expect(result.seatAssignments).toHaveLength(0);
  });

  // ── 6. CG in valid range ───────────────────────────────────────────────

  it("should compute CG within valid range for balanced passengers", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 6,
      legs: [makeLeg(1, "STY", "WPI", 42)],
      passengers: [
        makePassenger(1, { clothedWeightKg: 80, baggageWeightKg: 20 }),
        makePassenger(2, { clothedWeightKg: 75, baggageWeightKg: 15 }),
        makePassenger(3, { clothedWeightKg: 70, baggageWeightKg: 10 }),
        makePassenger(4, { clothedWeightKg: 85, baggageWeightKg: 25 }),
      ],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    const s = result.sectors[0];
    expect(s.cogMm).toBeGreaterThan(0);
    expect(s.cogStatus).toMatch(/ok|warning|violation/);
  });

  // ── 7. Seat assignments match passengers ───────────────────────────────

  it("should assign seats to all passengers", async () => {
    const pax = [
      makePassenger(1, { clothedWeightKg: 80, baggageWeightKg: 20 }),
      makePassenger(2, { clothedWeightKg: 75, baggageWeightKg: 15 }),
      makePassenger(3, { clothedWeightKg: 70, baggageWeightKg: 10 }),
    ];

    const result = await computeLoadsheetCalculations({
      flightId: 7,
      legs: [makeLeg(1, "STY", "WPI", 42)],
      passengers: pax,
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    expect(result.seatAssignments).toHaveLength(pax.length);
    const assignedIds = result.seatAssignments
      .map((sa) => sa.passengerId)
      .sort();
    const inputIds = pax.map((p) => p.id).sort();
    expect(assignedIds).toEqual(inputIds);
  });

  // ── 8. Zero distance ───────────────────────────────────────────────────

  it("should handle zero distance gracefully", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 8,
      legs: [makeLeg(1, "STY", "STY", 0)],
      passengers: [makePassenger(1)],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    const s = result.sectors[0];
    expect(s.distanceNm).toBe(0);
    expect(s.plannedTimeMin).toBe(0);
    expect(s.fuelBurnKg).toBe(0);
    expect(s.fuelOnBoardKg).toBe(35 + 3); // only reserve + taxi
  });

  // ── 9. Missing distance resolves from CSV ──────────────────────────────

  it("should resolve distance from CSV when leg distance is null", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 9,
      legs: [makeLeg(1, "WPI", "RYC", null)],
      passengers: [makePassenger(1)],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    // Mock CSV has WPI→RYC = 28nm
    expect(result.sectors[0].distanceNm).toBe(28);
  });

  // ── 10. Data integrity: LWD = TOW - fuel burn ─────────────────────────

  it("should satisfy LWD = TOW - fuelBurn for every sector", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 10,
      legs: [
        makeLeg(1, "STY", "WPI", 42),
        makeLeg(2, "WPI", "RYC", 28),
        makeLeg(3, "RYC", "PST", 35),
      ],
      passengers: [
        makePassenger(1, { clothedWeightKg: 80, baggageWeightKg: 15 }),
        makePassenger(2, { clothedWeightKg: 65, baggageWeightKg: 10 }),
      ],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    for (const sector of result.sectors) {
      expect(sector.landingWeightKg).toBe(
        sector.takeoffWeightKg - sector.fuelBurnKg,
      );
    }
  });

  // ── 11. Starting fuel = totalBurn + reserve + taxi ─────────────────────

  it("should compute startingFuel as totalBurn + reserve + taxi", async () => {
    const result = await computeLoadsheetCalculations({
      flightId: 11,
      legs: [
        makeLeg(1, "STY", "WPI", 42),
        makeLeg(2, "WPI", "RYC", 28),
      ],
      passengers: [makePassenger(1)],
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    expect(result.startingFuelKg).toBe(result.totalBurnKg + 35 + 3);
  });

  // ── 12. 9-passenger stress test ────────────────────────────────────────

  it("should handle 9 passengers within MTOW", async () => {
    const pax = Array.from({ length: 9 }, (_, i) =>
      makePassenger(i + 1, { clothedWeightKg: 85, baggageWeightKg: 20 }),
    );

    const result = await computeLoadsheetCalculations({
      flightId: 12,
      legs: [makeLeg(1, "STY", "WPI", 42)],
      passengers: pax,
      aircraft: makeAircraft(),
      pilotWeightKg: 80,
      date: "2026-06-20",
    });

    const s = result.sectors[0];
    // fuelBurn=14, startingFuel = 14 + 35 + 3 = 52
    // 9 pax * (85+20) = 945 + empty(1627) + pilot(80) + 52 = 2704
    expect(s.takeoffWeightKg).toBe(1627 + 80 + 945 + 52);
    // 2704 / 2994 ≈ 90%  →  ok
    expect(s.towStatus).toBe("ok");
  });
});

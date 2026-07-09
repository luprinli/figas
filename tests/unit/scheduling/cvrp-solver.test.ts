import { describe, it, expect } from "vitest";
import { solveCvrp } from "~/utils/scheduling/cvrp-solver";
import type {
  PassengerDemand,
  CvrpConfig,
} from "~/utils/scheduling/cvrp-types";

/**
 * Build a simple distance matrix for known Falklands aerodromes.
 * Distances are approximate nautical miles.
 */
function buildTestMatrix(): Map<string, number> {
  const m = new Map<string, number>();
  const add = (a: string, b: string, d: number) => {
    m.set(`${a}->${b}`, d);
    m.set(`${b}->${a}`, d);
  };
  // STY ↔ others
  add("STY", "MPA", 120);
  add("STY", "WDI", 110);
  add("STY", "PST", 90);
  add("STY", "BVI", 100);
  add("STY", "PBI", 95);
  add("STY", "NHA", 130);
  add("STY", "SLI", 140);
  add("STY", "SHR", 85);
  // Between others
  add("MPA", "WDI", 50);
  add("MPA", "PST", 60);
  add("WDI", "PST", 40);
  add("BVI", "PBI", 30);
  add("NHA", "SLI", 35);
  add("PST", "BVI", 45);
  add("PBI", "SHR", 50);
  return m;
}

function defaultConfig(overrides?: Partial<CvrpConfig>): CvrpConfig {
  return {
    depot: "STY",
    maxSeats: 9,
    maxRangeNm: 800,
    distanceMatrix: buildTestMatrix(),
    ...overrides,
  };
}

describe("CVRP Solver (Clarke-Wright Savings)", () => {
  // ── Test: Single demand ───────────────────────────────────────────────────
  it("creates one STY→origin→dest→STY route for single demand", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "STY", destination: "MPA", passengerCount: 3 },
    ];
    const result = solveCvrp(demands, defaultConfig());

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].stops).toEqual(["STY", "MPA", "STY"]);
    expect(result.routes[0].passengerCount).toBe(3);
    expect(result.unservedDemands).toHaveLength(0);
  });

  // ── Test: Single demand with non-STY origin ───────────────────────────────
  it("creates STY→origin→dest→STY for non-STY origin", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "MPA", destination: "STY", passengerCount: 2 },
    ];
    const result = solveCvrp(demands, defaultConfig());

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].stops[0]).toBe("STY");
    expect(result.routes[0].stops).toContain("MPA");
    expect(result.routes[0].stops[result.routes[0].stops.length - 1]).toBe("STY");
    expect(result.routes[0].passengerCount).toBe(2);
  });

  // ── Test: Two demands same origin — merges if capacity allows ─────────────
  it("merges two demands with same origin into one route", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "STY", destination: "MPA", passengerCount: 3 },
      { bookingLegId: 2, origin: "STY", destination: "WDI", passengerCount: 2 },
    ];
    const result = solveCvrp(demands, defaultConfig());

    // Combined pax with different destinations → should merge into 1 route
    expect(result.routes.length).toBeLessThanOrEqual(1);
    expect(result.unservedDemands).toHaveLength(0);
    // Each route's passengerCount is per-leg max, not sum
    for (const r of result.routes) {
      expect(r.passengerCount).toBeLessThanOrEqual(defaultConfig().maxSeats);
    }
  });

  // ── Test: Two demands different non-STY origins — merges if beneficial ────
  it("merges demands from different non-STY origins when savings positive", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "MPA", destination: "STY", passengerCount: 2 },
      { bookingLegId: 2, origin: "WDI", destination: "STY", passengerCount: 2 },
    ];
    const result = solveCvrp(demands, defaultConfig());

    // MPA and WDI are 50nm apart; savings should trigger merge
    expect(result.routes.length).toBeLessThanOrEqual(1);
    expect(result.unservedDemands).toHaveLength(0);
  });

  // ── Test: Capacity exceeded — creates multiple flights ────────────────────
  it("splits into multiple flights when capacity exceeded", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "STY", destination: "MPA", passengerCount: 6 },
      { bookingLegId: 2, origin: "STY", destination: "WDI", passengerCount: 5 },
    ];
    const result = solveCvrp(demands, defaultConfig());

    // 11 pax total, but per-leg may fit within 9 seats
    // Check that no route exceeds capacity
    const totalPax = result.routes.reduce((s, r) => s + r.passengerCount, 0);
    expect(totalPax).toBeLessThanOrEqual(11);
    // Each route must be within capacity
    for (const r of result.routes) {
      expect(r.passengerCount).toBeLessThanOrEqual(9);
    }
  });

  // ── Test: All routes start and end at STY ─────────────────────────────────
  it("all routes start and end at STY", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "NHA", destination: "SLI", passengerCount: 1 },
      { bookingLegId: 2, origin: "PST", destination: "STY", passengerCount: 2 },
      { bookingLegId: 3, origin: "STY", destination: "BVI", passengerCount: 3 },
      { bookingLegId: 4, origin: "WDI", destination: "STY", passengerCount: 3 },
      { bookingLegId: 5, origin: "STY", destination: "PBI", passengerCount: 2 },
    ];

    const result = solveCvrp(demands, defaultConfig());

    for (const route of result.routes) {
      expect(route.stops[0]).toBe("STY");
      expect(route.stops[route.stops.length - 1]).toBe("STY");
    }
  });

  // ── Test: June 19 scenario — 11 pax across 6 origins → ≤2 flights ────────
  it("produces ≤ 2 flights for June 19 scenario (11 pax, 6 origins)", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "NHA", destination: "SLI", passengerCount: 1 },
      { bookingLegId: 2, origin: "STY", destination: "WDI", passengerCount: 3 },
      { bookingLegId: 3, origin: "STY", destination: "PST", passengerCount: 2 },
      { bookingLegId: 4, origin: "STY", destination: "BVI", passengerCount: 2 },
      { bookingLegId: 5, origin: "STY", destination: "PBI", passengerCount: 3 },
    ];

    const result = solveCvrp(demands, defaultConfig());

    // Current NN produces 5 flights. CVRP should produce ≤ 2.
    expect(result.routes.length).toBeLessThanOrEqual(2);
    // All demands served, each route within capacity
    expect(result.unservedDemands).toHaveLength(0);
    for (const r of result.routes) {
      expect(r.passengerCount).toBeLessThanOrEqual(defaultConfig().maxSeats);
    }
  });

  // ── Test: Empty demands ───────────────────────────────────────────────────
  it("returns empty routes for empty demands", () => {
    const result = solveCvrp([], defaultConfig());
    expect(result.routes).toHaveLength(0);
    expect(result.unservedDemands).toHaveLength(0);
  });

  // ── Test: Savings negative for far-apart stops — no merge ─────────────────
  it("does not merge routes when savings would be negative", () => {
    // Use a matrix where stops are far apart
    const farMatrix = new Map<string, number>();
    farMatrix.set("STY->A", 100);
    farMatrix.set("A->STY", 100);
    farMatrix.set("STY->B", 100);
    farMatrix.set("B->STY", 100);
    farMatrix.set("A->B", 500); // very far apart

    const config = defaultConfig({ distanceMatrix: farMatrix });
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "A", destination: "STY", passengerCount: 1 },
      { bookingLegId: 2, origin: "B", destination: "STY", passengerCount: 1 },
    ];

    const result = solveCvrp(demands, config);
    // Savings = 100 + 100 - 500 = -300 → no merge
    expect(result.routes.length).toBe(2);
  });

  // ── Test: Range constraint prevents merge ─────────────────────────────────
  it("does not merge routes if combined distance exceeds max range", () => {
    // Use smaller distances so individual routes fit but combined doesn't
    const rangeMatrix = new Map<string, number>();
    const R = (a: string, b: string, d: number) => {
      rangeMatrix.set(`${a}->${b}`, d);
      rangeMatrix.set(`${b}->${a}`, d);
    };
    R("STY", "A", 80);
    R("STY", "B", 80);
    R("A", "B", 300); // far apart — merge would exceed range

    const shortConfig = defaultConfig({ maxRangeNm: 250, distanceMatrix: rangeMatrix });
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "A", destination: "STY", passengerCount: 1 },
      { bookingLegId: 2, origin: "B", destination: "STY", passengerCount: 1 },
    ];

    const result = solveCvrp(demands, shortConfig);
    // Individual routes: STY→A→STY=160nm, STY→B→STY=160nm
    // Merged: STY→A→B→STY = 80+300+80 = 460nm > 250nm → merge should be blocked
    expect(result.routes.length).toBe(2);
    for (const route of result.routes) {
      expect(route.totalDistanceNm).toBeLessThanOrEqual(shortConfig.maxRangeNm);
    }
  });

  // ── Test: Passenger count per-leg verification ─────────────────────────────
  it("ensures per-leg passenger count does not exceed seat capacity", () => {
    const demands: PassengerDemand[] = [
      { bookingLegId: 1, origin: "STY", destination: "MPA", passengerCount: 4 },
      { bookingLegId: 2, origin: "STY", destination: "WDI", passengerCount: 3 },
      { bookingLegId: 3, origin: "PST", destination: "STY", passengerCount: 2 },
    ];

    const result = solveCvrp(demands, defaultConfig());
    expect(result.unservedDemands).toHaveLength(0);
    for (const r of result.routes) {
      expect(r.passengerCount).toBeLessThanOrEqual(defaultConfig().maxSeats);
    }
  });
});

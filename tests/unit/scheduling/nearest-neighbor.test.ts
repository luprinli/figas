import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRoute, clearRouteCaches } from "~/utils/scheduling/nearest-neighbor";
import type { ClusterResult } from "~/utils/scheduling/types";
import type { FlightRow } from "~/utils/repositories/flight";

// Mock the db module so we don't hit a real database
vi.mock("~/utils/db.server", () => ({
  db: {
    aerodrome_distances: {
      findMany: vi.fn().mockResolvedValue([
        { origin_code: "PSY", destination_code: "MPA", distance_nm: 135 },
        { origin_code: "PSY", destination_code: "SHR", distance_nm: 80 },
        { origin_code: "PSY", destination_code: "PPS", distance_nm: 95 },
        { origin_code: "PSY", destination_code: "SAU", distance_nm: 110 },
        { origin_code: "MPA", destination_code: "SHR", distance_nm: 60 },
        { origin_code: "MPA", destination_code: "PPS", distance_nm: 75 },
        { origin_code: "MPA", destination_code: "SAU", distance_nm: 90 },
        { origin_code: "SHR", destination_code: "PPS", distance_nm: 30 },
        { origin_code: "SHR", destination_code: "SAU", distance_nm: 25 },
        { origin_code: "PPS", destination_code: "SAU", distance_nm: 15 },
      ]),
    },
    aerodrome_headings: {
      findMany: vi.fn().mockResolvedValue([
        { origin_code: "PSY", destination_code: "MPA", heading_degrees: 270 },
        { origin_code: "PSY", destination_code: "SHR", heading_degrees: 240 },
        { origin_code: "PSY", destination_code: "PPS", heading_degrees: 220 },
        { origin_code: "PSY", destination_code: "SAU", heading_degrees: 230 },
        { origin_code: "MPA", destination_code: "SHR", heading_degrees: 200 },
        { origin_code: "MPA", destination_code: "PPS", heading_degrees: 180 },
        { origin_code: "MPA", destination_code: "SAU", heading_degrees: 190 },
        { origin_code: "SHR", destination_code: "PPS", heading_degrees: 160 },
        { origin_code: "SHR", destination_code: "SAU", heading_degrees: 150 },
        { origin_code: "PPS", destination_code: "SAU", heading_degrees: 140 },
      ]),
    },
  },
}));

function makeCluster(originCodes: string[], destCodes: string[]): ClusterResult {
  return {
    date: "2026-06-15",
    legs: originCodes.map((origin, i) => ({
      id: i + 1,
      booking_id: i + 1,
      flight_id: null,
      origin_code: origin,
      destination_code: destCodes[i] ?? "PSY",
      leg_date: "2026-06-15",
      departure_date: null,
      preferred_time: null,
      preferred_time_start: null,
      preferred_time_end: null,
      leg_sequence: 1,
      status: "pending",
      created_at: "2026-06-14T10:00:00.000Z",
      updated_at: "2026-06-14T10:00:00.000Z",
    })),
    origin: originCodes[0] ?? "PSY",
    destination: destCodes[0] ?? "MPA",
    passengerCount: originCodes.length,
  };
}

function makeFlight(overrides: Partial<FlightRow> = {}): FlightRow {
  return {
    id: 1,
    flight_number: "TST-101",
    aircraft_id: 1,
    origin_aerodrome_id: 1,
    destination_aerodrome_id: 2,
    departure_time: "2026-06-15T10:00:00.000Z",
    arrival_time: "2026-06-15T10:45:00.000Z",
    intermediate_stops: null,
    total_passenger_weight_kg: null,
    total_baggage_weight_kg: null,
    total_freight_weight_kg: null,
    total_fuel_weight_kg: null,
    status: "scheduled",
    pilot_id: null,
    pilot_approved_at: null,
    created_at: "2026-06-14T10:00:00.000Z",
    updated_at: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildRoute()", () => {
  beforeEach(() => {
    clearRouteCaches();
  });

  it("returns optimized route for 3+ stops", async () => {
    const cluster = makeCluster(["PSY", "PSY", "PSY"], ["SHR", "PPS", "SAU"]);
    const flight = makeFlight();

    const result = await buildRoute(cluster, flight);

    // Route should start at PSY, visit all stops, and return to PSY
    expect(result.stops.length).toBeGreaterThanOrEqual(3);
    expect(result.stops[0].aerodromeCode).not.toBe("PSY"); // First stop after PSY
    expect(result.stops[result.stops.length - 1].aerodromeCode).toBe("PSY"); // Returns to PSY
    expect(result.totalDistanceNm).toBeGreaterThan(0);
    expect(result.estimatedFlightTimeHours).toBeGreaterThan(0);
    expect(result.flight).toEqual(flight);
  });

  it("handles 2-stop route (no optimization needed)", async () => {
    const cluster = makeCluster(["PSY"], ["MPA"]);
    const flight = makeFlight();

    const result = await buildRoute(cluster, flight);

    // PSY → MPA → PSY
    expect(result.stops).toHaveLength(2);
    expect(result.stops[0].aerodromeCode).toBe("MPA");
    expect(result.stops[1].aerodromeCode).toBe("PSY");
    expect(result.totalDistanceNm).toBe(270); // 135 + 135
  });

  it("handles single stop", async () => {
    const cluster = makeCluster(["PSY"], ["SHR"]);
    const flight = makeFlight();

    const result = await buildRoute(cluster, flight);

    // PSY → SHR → PSY
    expect(result.stops).toHaveLength(2);
    expect(result.stops[0].aerodromeCode).toBe("SHR");
    expect(result.stops[1].aerodromeCode).toBe("PSY");
    expect(result.totalDistanceNm).toBe(160); // 80 + 80
  });

  it("handles empty stops list", async () => {
    const cluster = makeCluster([], []);
    const flight = makeFlight();

    const result = await buildRoute(cluster, flight);

    // No stops to visit, just return to PSY
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].aerodromeCode).toBe("PSY");
    expect(result.totalDistanceNm).toBe(0);
  });

  it("returns valid route structure with distances", async () => {
    const cluster = makeCluster(["PSY", "PSY"], ["SHR", "PPS"]);
    const flight = makeFlight();

    const result = await buildRoute(cluster, flight);

    // Each stop should have a legSequence, distanceNm, heading, and aerodromeCode
    for (const stop of result.stops) {
      expect(stop.aerodromeCode).toBeDefined();
      expect(typeof stop.aerodromeCode).toBe("string");
      expect(stop.legSequence).toBeGreaterThan(0);
      expect(stop.distanceNm).toBeGreaterThanOrEqual(0);
      expect(typeof stop.heading).toBe("number");
    }

    // Total distance should be sum of all leg distances
    const sumOfLegDistances = result.stops.reduce((sum, s) => sum + s.distanceNm, 0);
    expect(result.totalDistanceNm).toBe(sumOfLegDistances);
  });
});

import { describe, it, expect, vi } from "vitest";
import { insertPassengerRoute, type RouteLeg } from "~/utils/scheduling/insert-passenger-route";

// Mock the getDistance function from suggest-route.server
vi.mock("~/utils/scheduling/suggest-route.server", () => ({
  getDistance: vi.fn(async (a: string, b: string) => {
    // Return mock distances for known Falklands aerodrome pairs
    const distances: Record<string, Record<string, number>> = {
      PSY: { MPA: 135, SHR: 80, PPS: 95, SAU: 110 },
      MPA: { PSY: 135, SHR: 60, PPS: 75, SAU: 90 },
      SHR: { PSY: 80, MPA: 60, PPS: 30, SAU: 25 },
      PPS: { PSY: 95, MPA: 75, SHR: 30, SAU: 15 },
      SAU: { PSY: 110, MPA: 90, SHR: 25, PPS: 15 },
    };
    return distances[a]?.[b] ?? distances[b]?.[a] ?? 999;
  }),
}));

describe("insertPassengerRoute()", () => {
  const existingLegs: RouteLeg[] = [
    { leg_sequence: 1, origin_code: "PSY", destination_code: "MPA" },
    { leg_sequence: 2, origin_code: "MPA", destination_code: "PSY" },
  ];

  it("returns already_on_route when both stops exist consecutively", async () => {
    const result = await insertPassengerRoute(existingLegs, "PSY", "MPA");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("already_on_route");
    expect(result.legs).toEqual(existingLegs);
  });

  it("inserts destination when origin exists but destination does not", async () => {
    const result = await insertPassengerRoute(existingLegs, "MPA", "SHR");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("destination_exists");
    // The destination SHR should be inserted somewhere in the stop sequence
    const stopCodes = result.legs.map((l) => l.origin_code);
    stopCodes.push(result.legs[result.legs.length - 1].destination_code);
    expect(stopCodes).toContain("MPA");
    expect(stopCodes).toContain("SHR");
  });

  it("inserts origin when destination exists but origin does not", async () => {
    const result = await insertPassengerRoute(existingLegs, "SHR", "PSY");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("origin_exists");
    const stopCodes = result.legs.map((l) => l.origin_code);
    stopCodes.push(result.legs[result.legs.length - 1].destination_code);
    expect(stopCodes).toContain("SHR");
    expect(stopCodes).toContain("PSY");
  });

  it("inserts both stops when neither exists", async () => {
    const result = await insertPassengerRoute(existingLegs, "SHR", "PPS");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("both_inserted");
    const stopCodes = result.legs.map((l) => l.origin_code);
    stopCodes.push(result.legs[result.legs.length - 1].destination_code);
    expect(stopCodes).toContain("SHR");
    expect(stopCodes).toContain("PPS");
  });

  it("returns invalid when origin equals destination", async () => {
    const result = await insertPassengerRoute(existingLegs, "PSY", "PSY");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("invalid");
    expect(result.legs).toEqual(existingLegs);
  });
});

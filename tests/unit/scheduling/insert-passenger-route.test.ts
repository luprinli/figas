import { describe, it, expect, vi } from "vitest";
import { insertPassengerRoute, type RouteLeg } from "~/utils/scheduling/insert-passenger-route";

// Mock the getDistance function from suggest-route.server
vi.mock("~/utils/scheduling/suggest-route.server", () => ({
  getDistance: vi.fn(async (a: string, b: string) => {
    // Return mock distances for known Falklands aerodrome pairs
    const distances: Record<string, Record<string, number>> = {
      STY: { MPA: 135, PBI: 80, SDI: 95, SAU: 110 },
      MPA: { STY: 135, PBI: 60, SDI: 75, SAU: 90 },
      PBI: { STY: 80, MPA: 60, SDI: 30, SAU: 25 },
      SDI: { STY: 95, MPA: 75, PBI: 30, SAU: 15 },
      SAU: { STY: 110, MPA: 90, PBI: 25, SDI: 15 },
    };
    return distances[a]?.[b] ?? distances[b]?.[a] ?? 999;
  }),
}));

describe("insertPassengerRoute()", () => {
  const existingLegs: RouteLeg[] = [
    { leg_sequence: 1, origin_code: "STY", destination_code: "MPA" },
    { leg_sequence: 2, origin_code: "MPA", destination_code: "STY" },
  ];

  it("returns already_on_route when both stops exist consecutively", async () => {
    const result = await insertPassengerRoute(existingLegs, "STY", "MPA");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("already_on_route");
    expect(result.legs).toEqual(existingLegs);
  });

  it("inserts destination when origin exists but destination does not", async () => {
    const result = await insertPassengerRoute(existingLegs, "MPA", "PBI");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("destination_exists");
    // The destination PBI should be inserted somewhere in the stop sequence
    const stopCodes = result.legs.map((l) => l.origin_code);
    stopCodes.push(result.legs[result.legs.length - 1].destination_code);
    expect(stopCodes).toContain("MPA");
    expect(stopCodes).toContain("PBI");
  });

  it("inserts origin when destination exists but origin does not", async () => {
    const result = await insertPassengerRoute(existingLegs, "PBI", "STY");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("origin_exists");
    const stopCodes = result.legs.map((l) => l.origin_code);
    stopCodes.push(result.legs[result.legs.length - 1].destination_code);
    expect(stopCodes).toContain("PBI");
    expect(stopCodes).toContain("STY");
  });

  it("inserts both stops when neither exists", async () => {
    const result = await insertPassengerRoute(existingLegs, "PBI", "SDI");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("both_inserted");
    const stopCodes = result.legs.map((l) => l.origin_code);
    stopCodes.push(result.legs[result.legs.length - 1].destination_code);
    expect(stopCodes).toContain("PBI");
    expect(stopCodes).toContain("SDI");
  });

  it("returns invalid when origin equals destination", async () => {
    const result = await insertPassengerRoute(existingLegs, "STY", "STY");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("invalid");
    expect(result.legs).toEqual(existingLegs);
  });
});

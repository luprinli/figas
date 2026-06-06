import { describe, it, expect } from "vitest";
import { computeFlightTime } from "~/utils/scheduling/fuel-planning";

describe("computeFlightTime()", () => {
  it("computes flight time for a known distance (135nm at 140kt = ~63 min with 5 min taxi)", () => {
    const time = computeFlightTime(135, 140, 5);
    // (135 / 140) * 60 = 57.857... → round to 58, + 5 taxi = 63
    expect(time).toBe(63);
  });

  it("returns 0 for zero distance", () => {
    expect(computeFlightTime(0, 140)).toBe(0);
  });

  it("returns 0 for zero cruise speed", () => {
    expect(computeFlightTime(100, 0)).toBe(0);
  });

  it("computes fuel burn correctly for a given flight time", () => {
    // computeFlightTime returns minutes; fuel burn rate is kg/hour
    // For 135nm at 140kt: 63 minutes = 1.05 hours
    // Burn = 68 kg/h * 1.05 h = 71.4 kg
    const flightTimeMinutes = computeFlightTime(135, 140, 5);
    expect(flightTimeMinutes).toBe(63);

    const burnRateKgPerHour = 68;
    const flightTimeHours = flightTimeMinutes / 60;
    const fuelBurnKg = Math.round(burnRateKgPerHour * flightTimeHours);
    expect(fuelBurnKg).toBe(71);
  });

  it("handles edge cases (negative distance, negative speed)", () => {
    expect(computeFlightTime(-100, 140)).toBe(0);
    expect(computeFlightTime(100, -140)).toBe(0);
    expect(computeFlightTime(-100, -140)).toBe(0);
  });

  it("uses default cruise speed of 140 kt and default taxi of 5 min", () => {
    const time = computeFlightTime(135);
    expect(time).toBe(63);
  });

  it("returns correct time with zero taxi time", () => {
    const time = computeFlightTime(135, 140, 0);
    // (135 / 140) * 60 = 57.857... → round to 58
    expect(time).toBe(58);
  });
});

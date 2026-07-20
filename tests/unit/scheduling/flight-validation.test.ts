import { describe, it, expect } from "vitest";
import {
  validateFlight,
  type ValidationPassenger,
  type ValidationLeg,
  type ValidationAircraft,
  type ValidationAerodrome,
} from "~/utils/scheduling/flight-validation";

const mockAircraft: ValidationAircraft = {
  type: "BN-2 Islander",
  registration: "VP-FBE",
  seat_count: 8,
  max_takeoff_weight_kg: 2994,
  max_landing_weight_kg: 2844,
  empty_weight_kg: 1620,
  fuel_capacity_kg: 340,
  fuel_burn_rate_kg_per_hour: 68,
  cruise_speed_kt: 140,
  max_range_nm: 700,
};

describe("validateFlight()", () => {
  it("returns ok for a valid single-leg flight with 2 passengers", async () => {
    const passengers: ValidationPassenger[] = [
      {
        id: 1,
        name: "Alice Smith",
        origin_code: "STY",
        destination_code: "MPA",
        clothed_weight_kg: 70,
        baggage_weight_kg: 15,
      },
      {
        id: 2,
        name: "Bob Jones",
        origin_code: "STY",
        destination_code: "MPA",
        clothed_weight_kg: 85,
        baggage_weight_kg: 20,
      },
    ];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("ok");
    expect(result.passenger_count).toBe(2);
    expect(result.seat_count_exceeded).toBe(false);
    expect(result.range_exceeded).toBe(false);
    expect(result.per_stop).toHaveLength(1);
    expect(result.per_stop[0].mtow_status).toBe("ok");
    expect(result.per_stop[0].mlw_status).toBe("ok");
    expect(result.suggestions).toHaveLength(0);
  });

  it("returns violation when seat count is exceeded (10 passengers on 8-seat aircraft)", async () => {
    const passengers: ValidationPassenger[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Passenger ${i + 1}`,
      origin_code: "STY",
      destination_code: "MPA",
      clothed_weight_kg: 70,
      baggage_weight_kg: 15,
    }));

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("violation");
    expect(result.seat_count_exceeded).toBe(true);
    expect(result.passenger_count).toBe(10);
    expect(result.seat_count).toBe(8);
    expect(result.suggestions.some((s) => s.type === "remove_passenger")).toBe(true);
  });

  it("returns violation when MTOW is exceeded (8 heavy passengers with 120kg + 30kg baggage each)", async () => {
    const passengers: ValidationPassenger[] = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Heavy Pax ${i + 1}`,
      origin_code: "STY",
      destination_code: "MPA",
      clothed_weight_kg: 120,
      baggage_weight_kg: 30,
    }));

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("violation");
    expect(result.per_stop[0].mtow_status).toBe("violation");
    expect(result.suggestions.some((s) => s.type === "remove_passenger")).toBe(true);
  });

  it("detects range exceeded (leg distance > aircraft max range)", async () => {
    const passengers: ValidationPassenger[] = [
      {
        id: 1,
        name: "Alice",
        origin_code: "STY",
        destination_code: "MPA",
        clothed_weight_kg: 70,
        baggage_weight_kg: 15,
      },
    ];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 800 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.range_exceeded).toBe(true);
    expect(result.status).toBe("violation");
    expect(result.total_distance_nm).toBe(800);
    expect(result.suggestions.some((s) => s.type === "use_larger_aircraft")).toBe(true);
  });

  it("applies runway derating for short strips (PBI with 350m runway)", async () => {
    const passengers: ValidationPassenger[] = [
      {
        id: 1,
        name: "Alice",
        origin_code: "STY",
        destination_code: "PBI",
        clothed_weight_kg: 70,
        baggage_weight_kg: 15,
      },
    ];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "PBI", distance_nm: 80 },
    ];

    const aerodromes: ValidationAerodrome[] = [
      {
        code: "STY",
        mtow_limit_kg: null,
        mlw_limit_kg: null,
        runway_length: 350,
      },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft, { aerodromes });

    expect(result.per_stop[0].runway_derated).toBe(true);
    expect(result.per_stop[0].mtow_kg).toBeLessThan(mockAircraft.max_takeoff_weight_kg);
    // 350m runway: deficit = (400-350)/100 = 0.5, derating = 1 - 0.5*0.05 = 0.975
    // effective MTOW = round(2994 * 0.975) = round(2919.15) = 2919
    expect(result.per_stop[0].mtow_kg).toBe(2919);
    expect(result.per_stop[0].mtow_before_derate_kg).toBe(2994);
  });

  it("returns ok for multi-leg flight with valid weights", async () => {
    const passengers: ValidationPassenger[] = [
      {
        id: 1,
        name: "Alice",
        origin_code: "STY",
        destination_code: "MPA",
        clothed_weight_kg: 70,
        baggage_weight_kg: 15,
      },
      {
        id: 2,
        name: "Bob",
        origin_code: "MPA",
        destination_code: "STY",
        clothed_weight_kg: 80,
        baggage_weight_kg: 10,
      },
    ];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 135 },
      { leg_sequence: 2, origin_code: "MPA", destination_code: "STY", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("ok");
    expect(result.per_stop).toHaveLength(2);
    expect(result.per_stop[0].mtow_status).toBe("ok");
    expect(result.per_stop[0].mlw_status).toBe("ok");
    expect(result.per_stop[1].mtow_status).toBe("ok");
    expect(result.per_stop[1].mlw_status).toBe("ok");
  });

  it("returns warning when MLW is approached at a stop", async () => {
    // Create heavy passengers that deplane at MPA, making landing weight high
    const passengers: ValidationPassenger[] = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Heavy Pax ${i + 1}`,
      origin_code: "STY",
      destination_code: "MPA",
      clothed_weight_kg: 100,
      baggage_weight_kg: 25,
    }));

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    // With 8 passengers at 125kg each = 1000kg passenger weight
    // empty 1620 + pilot 160 + passengers 1000 + fuel ~68 = ~2848 takeoff
    // fuel burn ~66kg → landing weight ~2782
    // MLW = 2844, so landing weight is below MLW but >90% → warning
    expect(result.status).toBe("warning");
    expect(result.per_stop[0].mlw_status).toBe("warning");
  });

  it("handles empty passenger list gracefully", async () => {
    const passengers: ValidationPassenger[] = [];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("ok");
    expect(result.passenger_count).toBe(0);
    expect(result.seat_count_exceeded).toBe(false);
    expect(result.per_stop).toHaveLength(1);
    expect(result.per_stop[0].passenger_count).toBe(0);
  });

  it("returns appropriate suggestions for each violation type", async () => {
    // Seat count exceeded
    const seatPassengers: ValidationPassenger[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Pax ${i + 1}`,
      origin_code: "STY",
      destination_code: "MPA",
      clothed_weight_kg: 70,
      baggage_weight_kg: 15,
    }));

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "STY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(seatPassengers, legs, mockAircraft);

    expect(result.status).toBe("violation");
    // Should have remove_passenger suggestions for the excess seats
    const removeSuggestions = result.suggestions.filter((s) => s.type === "remove_passenger");
    expect(removeSuggestions.length).toBeGreaterThanOrEqual(2);
    expect(removeSuggestions[0].passenger_id).toBeDefined();
    expect(removeSuggestions[0].weight_saving_kg).toBeGreaterThan(0);
    expect(removeSuggestions[0].description).toContain("Remove");
  });
});

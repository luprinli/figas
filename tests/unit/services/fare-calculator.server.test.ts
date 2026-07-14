import { describe, it, expect, vi, beforeEach } from "vitest";

let repoGetBaseFare = vi.fn();

vi.mock("~/utils/repositories/fare-route", () => ({
  fareRouteRepository: {
    get getBaseFare() { return repoGetBaseFare; },
  },
}));

import { calculateFareBreakdown, calculateSimpleTotal } from "~/utils/services/fare-calculator.server";

function makeLeg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, booking_id: 100, flight_id: null, origin_code: "STY", destination_code: "MPA",
    leg_date: "2026-07-15", departure_date: "2026-07-15", preferred_time: null,
    preferred_time_start: null, preferred_time_end: null, leg_sequence: 1,
    status: "confirmed", created_at: "", updated_at: "", ...overrides,
  };
}

function makePassenger(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, booking_id: 100, user_id: null, first_name: "John", last_name: "Smith",
    email: null, phone: null, date_of_birth: "1990-01-01",
    clothed_weight_kg: 75, residency: "resident", special_requirements: null,
    passport_number: null, id_document_number: null, nationality: null,
    created_at: "", updated_at: "", ...overrides,
  };
}

function makeLegPassenger(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, booking_leg_id: 1, booking_passenger_id: 1, clothed_weight_kg: 75,
    baggage_weight_kg: 15, baggage_description: null,
    freight_description: null, freight_weight_kg: 0,
    seat_number: null, checked_in: false, checked_in_at: null,
    checked_in_by: null, boarded: false, boarded_at: null,
    created_at: "", updated_at: "", ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repoGetBaseFare = vi.fn().mockResolvedValue(35);
});

// ---------------------------------------------------------------------------
describe("calculateFareBreakdown()", () => {
  it("calculates fare for single leg, single passenger", async () => {
    repoGetBaseFare = vi.fn().mockResolvedValue(40);
    const result = await calculateFareBreakdown(
      [makeLeg()],
      [makePassenger()],
      []
    );
    expect(result.total).toBe(40);
    expect(result.passengerCount).toBe(1);
    expect(result.legCount).toBe(1);
    expect(result.subtotal).toBe(40);
    expect(result.freightTotal).toBe(0);
  });

  it("multiplies fare by passenger count", async () => {
    repoGetBaseFare = vi.fn().mockResolvedValue(35);
    const result = await calculateFareBreakdown(
      [makeLeg()],
      [makePassenger(), makePassenger({ id: 2 })],
      []
    );
    expect(result.total).toBe(70);
    expect(result.passengerCount).toBe(2);
  });

  it("uses default fare when route has no base fare", async () => {
    repoGetBaseFare = vi.fn().mockResolvedValue(null);
    const result = await calculateFareBreakdown(
      [makeLeg()],
      [makePassenger()],
      []
    );
    expect(result.total).toBeGreaterThan(0);
  });

  it("aggregates fares across multiple legs", async () => {
    repoGetBaseFare = vi.fn()
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(35);
    const result = await calculateFareBreakdown(
      [makeLeg({ id: 1, leg_sequence: 1 }), makeLeg({ id: 2, leg_sequence: 2, origin_code: "MPA", destination_code: "STY" })],
      [makePassenger()],
      []
    );
    expect(result.total).toBe(75);
    expect(result.legCount).toBe(2);
  });

  it("adds freight costs for leg passengers with freight weight", async () => {
    repoGetBaseFare = vi.fn().mockResolvedValue(40);
    const result = await calculateFareBreakdown(
      [makeLeg({ id: 1 })],
      [makePassenger()],
      [makeLegPassenger({ booking_leg_id: 1, freight_weight_kg: 50, freight_description: "Medical supplies" })]
    );
    expect(result.total).toBeGreaterThan(40);
    expect(result.freightTotal).toBeGreaterThan(0);
    expect(result.lineItems.some((item) => item.type === "freight")).toBe(true);
  });

  it("returns zero total for empty legs", async () => {
    const result = await calculateFareBreakdown([], [makePassenger()], []);
    expect(result.total).toBe(0);
    expect(result.lineItems).toEqual([]);
  });

  it("handles zero-passenger edge case", async () => {
    const result = await calculateFareBreakdown([makeLeg()], [], []);
    expect(result.passengerCount).toBe(1); // Math.max(passengers.length, 1)
  });
});

// ---------------------------------------------------------------------------
describe("calculateSimpleTotal()", () => {
  it("returns just the total from breakdown", async () => {
    repoGetBaseFare = vi.fn().mockResolvedValue(50);
    const total = await calculateSimpleTotal(
      [makeLeg()],
      [makePassenger(), makePassenger({ id: 2 })],
      []
    );
    expect(total).toBe(100);
  });
});

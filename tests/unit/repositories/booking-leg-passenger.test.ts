import { describe, it, expect, vi, beforeEach } from "vitest";

const { kdbMock } = vi.hoisted(() => {
  const kdbMock: Record<string, unknown> = {};
  return { kdbMock };
});

vi.mock("~/utils/db.server", () => ({
  get kdb() { return kdbMock; },
}));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return { ...actual, sql: () => ({ execute: vi.fn(() => ({ rows: [] })) }) };
});

import { bookingLegPassengerRepository } from "~/utils/repositories/booking-leg-passenger";

const CHAIN_METHODS = ["select", "selectFrom", "innerJoin", "leftJoin", "selectAll",
  "where", "orderBy", "limit", "execute"] as const;

function buildChain(finalResult: unknown) {
  const proxy: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) proxy[m] = vi.fn(() => proxy);
  proxy["execute"] = vi.fn(() => finalResult);
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bookingLegPassengerRepository", () => {
  it("findByBookingId returns empty array for missing booking", async () => {
    Object.assign(kdbMock, buildChain([]));
    const result = await bookingLegPassengerRepository.findByBookingId(999);
    expect(result).toEqual([]);
  });

  it("findByBookingId returns mapped rows with passenger details", async () => {
    Object.assign(kdbMock, buildChain([{
      id: 1, booking_leg_id: 10, booking_passenger_id: 100,
      clothed_weight_kg: 75.5, baggage_weight_kg: 15.0,
      baggage_description: "Suitcase", freight_description: null,
      freight_weight_kg: null, seat_number: "1A",
      checked_in: true, checked_in_at: "2026-07-13T10:00:00Z", checked_in_by: 5,
      boarded: false, boarded_at: null,
      created_at: "2026-07-13T09:00:00Z", updated_at: "2026-07-13T09:00:00Z",
      first_name: "John", last_name: "Smith",
      origin_code: "STY", destination_code: "MPA",
      leg_date: "2026-07-15", leg_sequence: 1,
    }]));
    const result = await bookingLegPassengerRepository.findByBookingId(1);
    expect(result).toHaveLength(1);
    expect(result[0].first_name).toBe("John");
    expect(result[0].origin_code).toBe("STY");
  });

  it("findByLegId returns passengers for a specific leg", async () => {
    Object.assign(kdbMock, buildChain([{
      id: 1, booking_leg_id: 10, booking_passenger_id: 100,
      clothed_weight_kg: 70, baggage_weight_kg: 10,
      baggage_description: null, freight_description: null,
      freight_weight_kg: null, seat_number: null,
      checked_in: false, checked_in_at: null, checked_in_by: null,
      boarded: false, boarded_at: null,
      created_at: "", updated_at: "",
    }]));
    const result = await bookingLegPassengerRepository.findByLegId(10);
    expect(result).toHaveLength(1);
    expect(result[0].booking_leg_id).toBe(10);
  });

  it("findByLegId returns empty array when no passengers", async () => {
    Object.assign(kdbMock, buildChain([]));
    const result = await bookingLegPassengerRepository.findByLegId(999);
    expect(result).toEqual([]);
  });

  it("has expected repository methods", () => {
    expect(bookingLegPassengerRepository).toBeDefined();
    expect(typeof bookingLegPassengerRepository.findByBookingId).toBe("function");
    expect(typeof bookingLegPassengerRepository.findByLegId).toBe("function");
  });
});

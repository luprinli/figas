import { describe, it, expect, vi, beforeEach } from "vitest";
import { clusterBookings } from "~/utils/scheduling/cluster-bookings";
import type { BookingLegPassengerRow } from "~/utils/repositories/booking-leg-passenger";

// Mock the repository layer so we don't hit a real database
vi.mock("~/utils/repositories/booking-leg", () => ({
  bookingLegRepository: {
    findUnassignedLegs: vi.fn(),
  },
}));

vi.mock("~/utils/repositories/booking-leg-passenger", () => ({
  bookingLegPassengerRepository: {
    findByLegId: vi.fn(),
  },
}));

import { bookingLegRepository } from "~/utils/repositories/booking-leg";
import { bookingLegPassengerRepository } from "~/utils/repositories/booking-leg-passenger";

describe("clusterBookings()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups legs by date, origin, and destination", async () => {
    vi.mocked(bookingLegRepository.findUnassignedLegs).mockResolvedValue([
      {
        id: 1,
        booking_id: 1,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: "2026-06-15",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
      {
        id: 2,
        booking_id: 2,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: "2026-06-15",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
      {
        id: 3,
        booking_id: 3,
        origin_code: "STY",
        destination_code: "PBI",
        leg_date: "2026-06-15",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
    ]);

    vi.mocked(bookingLegPassengerRepository.findByLegId).mockResolvedValue([
      { id: 1 } as BookingLegPassengerRow,
    ]);

    const clusters = await clusterBookings();

    // Should group STY→MPA (2 legs) and STY→PBI (1 leg)
    expect(clusters).toHaveLength(2);

    const psyMpa = clusters.find((c) => c.destination === "MPA");
    const psyShr = clusters.find((c) => c.destination === "PBI");

    expect(psyMpa).toBeDefined();
    expect(psyMpa!.origin).toBe("STY");
    expect(psyMpa!.destination).toBe("MPA");
    expect(psyMpa!.legs).toHaveLength(2);

    expect(psyShr).toBeDefined();
    expect(psyShr!.origin).toBe("STY");
    expect(psyShr!.destination).toBe("PBI");
    expect(psyShr!.legs).toHaveLength(1);
  });

  it("returns empty array when no unassigned legs exist", async () => {
    vi.mocked(bookingLegRepository.findUnassignedLegs).mockResolvedValue([]);

    const clusters = await clusterBookings();

    expect(clusters).toHaveLength(0);
  });

  it("handles legs with different dates separately", async () => {
    vi.mocked(bookingLegRepository.findUnassignedLegs).mockResolvedValue([
      {
        id: 1,
        booking_id: 1,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: "2026-06-15",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
      {
        id: 2,
        booking_id: 2,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: "2026-06-16",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
    ]);

    vi.mocked(bookingLegPassengerRepository.findByLegId).mockResolvedValue([
      { id: 1 } as BookingLegPassengerRow,
    ]);

    const clusters = await clusterBookings();

    // Same route but different dates → 2 separate clusters
    expect(clusters).toHaveLength(2);
    expect(clusters[0].date).toBe("2026-06-15");
    expect(clusters[1].date).toBe("2026-06-16");
  });

  it("handles legs with same route but different dates", async () => {
    vi.mocked(bookingLegRepository.findUnassignedLegs).mockResolvedValue([
      {
        id: 1,
        booking_id: 1,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: "2026-06-15",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
      {
        id: 2,
        booking_id: 2,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: "2026-06-15",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
      {
        id: 3,
        booking_id: 3,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: "2026-06-16",
        leg_sequence: 1,
        status: "pending",
        flight_id: null,
        departure_date: null,
        preferred_time: null,
        preferred_time_start: null,
        preferred_time_end: null,
        created_at: "2026-06-14T10:00:00.000Z",
        updated_at: "2026-06-14T10:00:00.000Z",
      },
    ]);

    vi.mocked(bookingLegPassengerRepository.findByLegId).mockResolvedValue([
      { id: 1 } as BookingLegPassengerRow,
    ]);

    const clusters = await clusterBookings();

    // Same route STY→MPA but on different dates → 2 clusters
    expect(clusters).toHaveLength(2);

    const june15 = clusters.find((c) => c.date === "2026-06-15");
    const june16 = clusters.find((c) => c.date === "2026-06-16");

    expect(june15).toBeDefined();
    expect(june15!.legs).toHaveLength(2);

    expect(june16).toBeDefined();
    expect(june16!.legs).toHaveLength(1);
  });
});

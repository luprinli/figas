/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "~/utils/db.server";
import { TEST_VALUES, MOCK_USER_IDS } from "./seed-data";

// ---------------------------------------------------------------------------
// Parallel-safe unique date generator
// ---------------------------------------------------------------------------
let bookingLegSequenceCounter = 0;

const PROCESS_SEED = Math.floor(Math.random() * 100_000);
let callCounter = 0;

function generateUniqueDate(baseDate: Date): Date {
  callCounter++;
  const offset = PROCESS_SEED + callCounter;
  const uniqueDate = new Date(baseDate);
  uniqueDate.setDate(uniqueDate.getDate() + offset);
  return uniqueDate;
}

// ---------------------------------------------------------------------------
// Factory: schedules
// ---------------------------------------------------------------------------

export interface ScheduleOverrides {
  schedule_date?: Date;
  status?: "building" | "draft" | "approved" | "published" | "cancelled";
  created_by?: number;
  updated_by?: number | null;
  approved_by?: number | null;
  approved_at?: Date | null;
  published_by?: number | null;
  published_at?: Date | null;
  notes?: string | null;
  [key: string]: unknown;
}

export async function createTestSchedule(
  overrides: ScheduleOverrides = {},
) {
  const baseDate = overrides.schedule_date ?? new Date("2026-07-01");
  const uniqueDate = generateUniqueDate(baseDate);

  const defaults = {
    schedule_date: uniqueDate,
    status: "draft" as const,
    created_by: MOCK_USER_IDS.ops,
  };

  const rows = await db.insertInto("schedules")
    .values({ ...defaults, ...overrides, schedule_date: uniqueDate } as any)
    .returningAll()
    .execute();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Factory: flights
// ---------------------------------------------------------------------------

export interface FlightOverrides {
  flight_number?: string;
  origin_code?: string;
  destination_code?: string;
  origin_aerodrome_id?: number | null;
  destination_aerodrome_id?: number | null;
  aircraft_id?: number | null;
  pilot_id?: number | null;
  departure_time?: Date;
  arrival_time?: Date;
  status?: string;
  available_seats?: number | null;
  base_fare?: number | null;
  schedule_id?: number | null;
  created_by?: number | null;
  sort_order?: number | null;
  [key: string]: unknown;
}

export async function createTestFlight(
  scheduleId: number,
  overrides: FlightOverrides = {},
) {
  const defaults = {
    flight_number: TEST_VALUES.flightNumber,
    origin_code: TEST_VALUES.originCode,
    destination_code: TEST_VALUES.destinationCode,
    departure_time: new Date("2026-06-15T10:00:00.000Z"),
    arrival_time: new Date("2026-06-15T10:45:00.000Z"),
    status: "scheduled",
    schedule_id: scheduleId,
    created_by: MOCK_USER_IDS.ops,
    available_seats: 9,
    base_fare: 0,
  };

  const rows = await db.insertInto("flights")
    .values({ ...defaults, ...overrides } as any)
    .returningAll()
    .execute();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Factory: flight_legs
// ---------------------------------------------------------------------------

export interface FlightLegOverrides {
  flight_id?: number;
  leg_number?: number;
  origin_code?: string;
  destination_code?: string;
  distance_nm?: number | null;
  heading?: number | null;
  etd?: Date | null;
  eta?: Date | null;
  status?: "scheduled" | "active" | "completed" | "cancelled";
  schedule_id?: number | null;
  [key: string]: unknown;
}

export async function createTestFlightLeg(
  flightId: number,
  overrides: FlightLegOverrides = {},
) {
  const defaults = {
    flight_id: flightId,
    leg_number: 1,
    origin_code: TEST_VALUES.originCode,
    destination_code: TEST_VALUES.destinationCode,
    status: "scheduled" as const,
  };

  const rows = await db.insertInto("flight_legs")
    .values({ ...defaults, ...overrides } as any)
    .returningAll()
    .execute();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Factory: booking_legs
// ---------------------------------------------------------------------------

export interface BookingLegOverrides {
  booking_id?: number;
  flight_id?: number | null;
  origin_code?: string;
  destination_code?: string;
  leg_date?: Date | string;
  leg_sequence?: number;
  status?: string;
  [key: string]: unknown;
}

export async function createTestBookingLeg(
  overrides: BookingLegOverrides = {},
) {
  bookingLegSequenceCounter++;

  const defaults = {
    booking_id: 1,
    origin_code: TEST_VALUES.originCode,
    destination_code: TEST_VALUES.destinationCode,
    leg_date: TEST_VALUES.scheduleDate as string | Date,
    leg_sequence: overrides.leg_sequence ?? bookingLegSequenceCounter,
    status: "pending",
  };

  const rows = await db.insertInto("booking_legs")
    .values({ ...defaults, ...overrides } as any)
    .returningAll()
    .execute();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Factory: pilot_assignments
// ---------------------------------------------------------------------------

export interface PilotAssignmentOverrides {
  flight_id?: number;
  pilot_id?: number;
  role?: "captain" | "first_officer" | "relief";
  status?: "assigned" | "confirmed" | "declined" | "checked_in" | "completed" | "cancelled";
  schedule_id?: number | null;
  assigned_by?: number | null;
  [key: string]: unknown;
}

export async function createTestPilotAssignment(
  flightId: number,
  scheduleId: number,
  overrides: PilotAssignmentOverrides = {},
) {
  const defaults = {
    flight_id: flightId,
    pilot_id: 1,
    role: "captain" as const,
    status: "assigned" as const,
    schedule_id: scheduleId,
    assigned_by: MOCK_USER_IDS.ops,
  };

  const rows = await db.insertInto("pilot_assignments")
    .values({ ...defaults, ...overrides } as any)
    .returningAll()
    .execute();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Factory: booking_passengers + booking_leg_passengers
// ---------------------------------------------------------------------------

let bookingPassengerCounter = 0;

export interface BookingPassengerOverrides {
  booking_id?: number;
  first_name?: string;
  last_name?: string;
  clothed_body_weight_kg?: number;
  [key: string]: unknown;
}

export async function createTestBookingPassenger(
  overrides: BookingPassengerOverrides = {},
) {
  bookingPassengerCounter++;
  const defaults = {
    booking_id: 1,
    first_name: "Test",
    last_name: `Passenger-${bookingPassengerCounter}`,
    clothed_body_weight_kg: 70,
  };

  const rows = await db.insertInto("booking_passengers")
    .values({ ...defaults, ...overrides } as any)
    .returningAll()
    .execute();
  return rows[0];
}

export interface BookingLegPassengerLinkOverrides {
  booking_leg_id: number;
  booking_passenger_id: number;
  clothed_weight_kg?: number;
  baggage_weight_kg?: number;
  freight_weight_kg?: number;
  [key: string]: unknown;
}

export async function createTestBookingLegPassengerLink(
  overrides: BookingLegPassengerLinkOverrides,
) {
  const defaults = {
    clothed_weight_kg: 70,
    baggage_weight_kg: 0,
    freight_weight_kg: 0,
  };

  const rows = await db.insertInto("booking_leg_passengers")
    .values({ ...defaults, ...overrides } as any)
    .returningAll()
    .execute();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Factory: weight_balance_snapshots
// ---------------------------------------------------------------------------

export interface WeightBalanceOverrides {
  flight_leg_id?: number;
  schedule_id?: number | null;
  passenger_weight_kg?: number;
  baggage_weight_kg?: number;
  freight_weight_kg?: number;
  fuel_weight_kg?: number;
  crew_weight_kg?: number;
  empty_weight_kg?: number;
  total_weight_kg?: number;
  computed_by?: string;
  [key: string]: unknown;
}

export async function createTestWeightBalance(
  flightId: number,
  overrides: WeightBalanceOverrides = {},
) {
  const defaults = {
    flight_leg_id: flightId,
    passenger_weight_kg: 0,
    baggage_weight_kg: 0,
    freight_weight_kg: 0,
    fuel_weight_kg: 0,
    crew_weight_kg: 0,
    empty_weight_kg: 0,
    total_weight_kg: 0,
    computed_by: "system",
  };

  const rows = await db.insertInto("weight_balance_snapshots")
    .values({ ...defaults, ...overrides } as any)
    .returningAll()
    .execute();
  return rows[0];
}

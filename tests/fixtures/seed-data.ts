// ---------------------------------------------------------------------------
// Seed data constants for test factories and test assertions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock aerodromes
// ---------------------------------------------------------------------------
export const MOCK_AERODROMES = [
  {
    code: "STY",
    name: "Stanley Airport (Port Stanley)",
    city: "Stanley",
    runway_length: 1200.0,
    timezone: "Atlantic/Stanley",
    is_active: true,
    fuel_available: true,
  },
  {
    code: "MPA",
    name: "Mount Pleasant Airport",
    city: "Mount Pleasant",
    runway_length: 2580.0,
    timezone: "Atlantic/Stanley",
    is_active: true,
    fuel_available: false,
  },
  {
    code: "PBI",
    name: "Pebble Island",
    city: "Pebble Island",
    runway_length: 579.0,
    timezone: "Atlantic/Stanley",
    is_active: true,
    fuel_available: false,
  },
  {
    code: "SDI",
    name: "Saunders Island",
    city: "Saunders Island",
    runway_length: 548.0,
    timezone: "Atlantic/Stanley",
    is_active: true,
    fuel_available: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Mock aircraft
// ---------------------------------------------------------------------------
export const MOCK_AIRCRAFT = {
  registration: "VP-FBZ",
  type: "BN-2 Islander",
  manufacturer: "Britten-Norman",
  model: "BN-2B-26",
  seat_count: 9,
  empty_weight_kg: 1870.0,
  max_takeoff_weight_kg: 2994.0,
  max_payload_kg: 1124.0,
  fuel_capacity_kg: 380.0,
  is_active: true,
} as const;

// ---------------------------------------------------------------------------
// Mock user IDs for different roles
// ---------------------------------------------------------------------------
export const MOCK_USER_IDS = {
  ops: 2,
  admin: 1,
  pilot: 3,
  engineer: 4,
  agent: 5,
} as const;

// ---------------------------------------------------------------------------
// Common test value constants
// ---------------------------------------------------------------------------
export const TEST_VALUES = {
  scheduleDate: new Date("2026-06-15T00:00:00.000Z"),
  flightNumber: "FIG-101",
  originCode: "STY",
  destinationCode: "MPA",
  bookingReference: "BK-00001",
  pilotAssignmentRole: "captain" as const,
  pilotAssignmentStatus: "assigned" as const,
} as const;

// ---------------------------------------------------------------------------
// Aerodrome seeding — ensures FK constraints are satisfied for test factories
// ---------------------------------------------------------------------------
import { db } from "~/utils/db.server";
import { sql } from "kysely";

export async function ensureAerodromes(): Promise<void> {
  await sql`
    INSERT INTO aerodromes (code, name, city, runway_length, timezone, is_active, fuel_available)
    VALUES
      ('STY', 'Stanley Airport', 'Stanley', 970.0, 'Atlantic/Stanley', true, true),
      ('MPA', 'Mount Pleasant Airport', 'Mount Pleasant', 2580.0, 'Atlantic/Stanley', true, false),
      ('PBI', 'Pebble Island', 'Pebble Island', 579.0, 'Atlantic/Stanley', true, false),
      ('SDI', 'Saunders Island', 'Saunders Island', 548.0, 'Atlantic/Stanley', true, false)
    ON CONFLICT (code) DO NOTHING
  `.execute(db);
}

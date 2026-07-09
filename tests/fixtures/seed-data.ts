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
    name: "Mpa Airport",
    city: "Mpa",
    runway_length: 900.0,
    timezone: "Atlantic/Stanley",
    is_active: true,
    fuel_available: false,
  },
  {
    code: "SHR",
    name: "Shirley Airport",
    city: "Shirley",
    runway_length: 800.0,
    timezone: "Atlantic/Stanley",
    is_active: true,
    fuel_available: false,
  },
  {
    code: "PPS",
    name: "Pebble Island Settlement",
    city: "Pebble Island",
    runway_length: 750.0,
    timezone: "Atlantic/Stanley",
    is_active: true,
    fuel_available: false,
  },
  {
    code: "SAU",
    name: "Saunders Island Settlement",
    city: "Saunders Island",
    runway_length: 700.0,
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
  ops: 1,
  admin: 2,
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

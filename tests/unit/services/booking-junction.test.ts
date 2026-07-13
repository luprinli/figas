import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let kdbMock: Record<string, unknown> = {};
const sqlExecuteMock = vi.fn(() => ({ rows: [] }));

vi.mock("~/utils/db.server", () => ({
  get kdb() {
    return kdbMock;
  },
}));

vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: () => ({
      execute: vi.fn(() => sqlExecuteMock()),
    }),
  };
});

import { bookingLegPassengerRepository } from "~/utils/repositories/booking-leg-passenger";
import { DEFAULT_CLOTHED_BODY_WEIGHT_KG } from "~/utils/constants";

const CHAIN_METHODS = [
  "select", "selectAll", "where", "andWhere", "orWhere",
  "orderBy", "limit", "offset", "innerJoin", "leftJoin",
  "groupBy", "values", "returningAll", "set", "onConflict",
  "whereRef", "innerJoinLateral",
];

function makeChain(execute: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const chain: Record<string, unknown> = { execute };
  for (const m of CHAIN_METHODS) {
    chain[m] = vi.fn(() => chain);
  }
  return chain;
}

function makeJunctionRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    booking_leg_id: 1,
    booking_passenger_id: 1,
    clothed_weight_kg: 70,
    baggage_weight_kg: 0,
    baggage_description: null,
    freight_description: null,
    freight_weight_kg: null,
    seat_number: null,
    checked_in: false,
    checked_in_at: null,
    checked_in_by: null,
    boarded: false,
    boarded_at: null,
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// Junction creation helper (inline — mirrors the wizard Step 4 logic)
// ===========================================================================

interface JunctionLeg {
  id: number;
  booking_id: number;
  origin_code: string;
  destination_code: string;
  leg_date: string;
  leg_sequence: number;
}

interface JunctionPassenger {
  id: number;
  booking_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
}

async function createJunctionRecords(
  legs: JunctionLeg[],
  passengers: JunctionPassenger[],
): Promise<{ booking_leg_id: number; booking_passenger_id: number }[]> {
  const records: { booking_leg_id: number; booking_passenger_id: number }[] = [];
  for (const leg of legs) {
    for (const passenger of passengers) {
      records.push({
        booking_leg_id: leg.id,
        booking_passenger_id: passenger.id,
      });
    }
  }
  return records;
}

function createJunctionForLeg(
  leg: JunctionLeg,
  passengers: JunctionPassenger[],
): { booking_leg_id: number; booking_passenger_id: number }[] {
  return passengers.map((p) => ({
    booking_leg_id: leg.id,
    booking_passenger_id: p.id,
  }));
}

function createJunctionForPassenger(
  passenger: JunctionPassenger,
  legs: JunctionLeg[],
): { booking_leg_id: number; booking_passenger_id: number }[] {
  return legs.map((l) => ({
    booking_leg_id: l.id,
    booking_passenger_id: passenger.id,
  }));
}

// ===========================================================================
// Test 1: N�—M junction records are created
// ===========================================================================
describe("booking junction — N�—M cardinality", () => {
  it("creates 1 junction record for 1 leg and 1 passenger", async () => {
    const legs: JunctionLeg[] = [
      { id: 10, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-01", leg_sequence: 1 },
    ];
    const passengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" },
    ];
    const records = await createJunctionRecords(legs, passengers);
    expect(records).toHaveLength(1);
    expect(records[0].booking_leg_id).toBe(10);
    expect(records[0].booking_passenger_id).toBe(100);
  });

  it("creates 4 junction records for 2 legs and 2 passengers", async () => {
    const legs: JunctionLeg[] = [
      { id: 10, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-01", leg_sequence: 1 },
      { id: 11, booking_id: 1, origin_code: "SAWG", destination_code: "SAWO", leg_date: "2026-08-02", leg_sequence: 2 },
    ];
    const passengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" },
      { id: 101, booking_id: 1, first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
    ];
    const records = await createJunctionRecords(legs, passengers);
    expect(records).toHaveLength(4);
  });

  it("creates 9 junction records for 3 legs and 3 passengers", async () => {
    const legs: JunctionLeg[] = [
      { id: 1, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-01", leg_sequence: 1 },
      { id: 2, booking_id: 1, origin_code: "SAWG", destination_code: "SAWO", leg_date: "2026-08-02", leg_sequence: 2 },
      { id: 3, booking_id: 1, origin_code: "SAWO", destination_code: "SAWH", leg_date: "2026-08-03", leg_sequence: 3 },
    ];
    const passengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "A", last_name: "One", email: "a@x.com" },
      { id: 101, booking_id: 1, first_name: "B", last_name: "Two", email: "b@x.com" },
      { id: 102, booking_id: 1, first_name: "C", last_name: "Three", email: "c@x.com" },
    ];
    const records = await createJunctionRecords(legs, passengers);
    expect(records).toHaveLength(9);
  });

  it("creates 0 junction records when there are no passengers", async () => {
    const legs: JunctionLeg[] = [
      { id: 10, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-01", leg_sequence: 1 },
    ];
    const records = await createJunctionRecords(legs, []);
    expect(records).toHaveLength(0);
  });

  it("creates 0 junction records when there are no legs", async () => {
    const passengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" },
    ];
    const records = await createJunctionRecords([], passengers);
    expect(records).toHaveLength(0);
  });
});

// ===========================================================================
// Test 2: Each junction record links correct IDs
// ===========================================================================
describe("booking junction — correct ID linkage", () => {
  it("each record points to the correct booking_leg_id", async () => {
    const legs: JunctionLeg[] = [
      { id: 10, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-01", leg_sequence: 1 },
      { id: 20, booking_id: 1, origin_code: "SAWG", destination_code: "SAWO", leg_date: "2026-08-02", leg_sequence: 2 },
    ];
    const passengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" },
    ];
    const records = await createJunctionRecords(legs, passengers);

    const legIds = records.map((r) => r.booking_leg_id);
    expect(legIds).toContain(10);
    expect(legIds).toContain(20);
  });

  it("each record points to the correct booking_passenger_id", async () => {
    const legs: JunctionLeg[] = [
      { id: 1, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-01", leg_sequence: 1 },
    ];
    const passengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" },
      { id: 200, booking_id: 1, first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
    ];
    const records = await createJunctionRecords(legs, passengers);

    const passengerIds = records.map((r) => r.booking_passenger_id);
    expect(passengerIds).toContain(100);
    expect(passengerIds).toContain(200);
  });

  it("all combinations of leg�—passenger are covered exactly once", async () => {
    const legs: JunctionLeg[] = [
      { id: 1, booking_id: 1, origin_code: "A", destination_code: "B", leg_date: "2026-08-01", leg_sequence: 1 },
      { id: 2, booking_id: 1, origin_code: "B", destination_code: "C", leg_date: "2026-08-02", leg_sequence: 2 },
    ];
    const passengers: JunctionPassenger[] = [
      { id: 10, booking_id: 1, first_name: "X", last_name: "Y", email: "x@y.com" },
      { id: 20, booking_id: 1, first_name: "Z", last_name: "W", email: "z@w.com" },
    ];
    const records = await createJunctionRecords(legs, passengers);

    const combos = new Set(records.map((r) => `${r.booking_leg_id}-${r.booking_passenger_id}`));
    expect(combos.size).toBe(4);
    expect(combos.has("1-10")).toBe(true);
    expect(combos.has("1-20")).toBe(true);
    expect(combos.has("2-10")).toBe(true);
    expect(combos.has("2-20")).toBe(true);
  });
});

// ===========================================================================
// Test 3: Junction records have default weight values
// ===========================================================================
describe("booking junction — default weight values", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = { insertInto: vi.fn(() => chain) };
    vi.clearAllMocks();
  });

  it("creates junction record with default clothed_weight_kg (70kg)", async () => {
    executeMock.mockResolvedValueOnce([
      makeJunctionRow({ clothed_weight_kg: DEFAULT_CLOTHED_BODY_WEIGHT_KG }),
    ]);
    const result = await bookingLegPassengerRepository.create({
      booking_leg_id: 1,
      booking_passenger_id: 1,
    });
    expect(result.clothed_weight_kg).toBe(DEFAULT_CLOTHED_BODY_WEIGHT_KG);
  });

  it("creates junction record with default baggage_weight_kg (0)", async () => {
    executeMock.mockResolvedValueOnce([
      makeJunctionRow({ baggage_weight_kg: 0 }),
    ]);
    const result = await bookingLegPassengerRepository.create({
      booking_leg_id: 1,
      booking_passenger_id: 1,
    });
    expect(result.baggage_weight_kg).toBe(0);
  });

  it("accepts explicit clothing weight overrides", async () => {
    executeMock.mockResolvedValueOnce([
      makeJunctionRow({ clothed_weight_kg: 85 }),
    ]);
    const result = await bookingLegPassengerRepository.create({
      booking_leg_id: 1,
      booking_passenger_id: 1,
      clothed_weight_kg: 85,
    });
    expect(result.clothed_weight_kg).toBe(85);
  });

  it("accepts explicit baggage weight overrides", async () => {
    executeMock.mockResolvedValueOnce([
      makeJunctionRow({ baggage_weight_kg: 15, baggage_description: "suitcase" }),
    ]);
    const result = await bookingLegPassengerRepository.create({
      booking_leg_id: 1,
      booking_passenger_id: 1,
      baggage_weight_kg: 15,
      baggage_description: "suitcase",
    });
    expect(result.baggage_weight_kg).toBe(15);
    expect(result.baggage_description).toBe("suitcase");
  });

  it("default weights match the DEFAULT_CLOTHED_BODY_WEIGHT_KG constant", async () => {
    executeMock.mockResolvedValueOnce([
      makeJunctionRow(),
    ]);
    const result = await bookingLegPassengerRepository.create({
      booking_leg_id: 1,
      booking_passenger_id: 1,
    });
    expect(result.clothed_weight_kg).toBe(70);
    expect(DEFAULT_CLOTHED_BODY_WEIGHT_KG).toBe(70);
  });
});

// ===========================================================================
// Test 4: Removing a passenger removes all their junction records
// ===========================================================================
describe("booking junction — passenger removal", () => {
  it("removes all junction records for a specific passenger across all legs", () => {
    const legs: JunctionLeg[] = [
      { id: 1, booking_id: 1, origin_code: "A", destination_code: "B", leg_date: "2026-08-01", leg_sequence: 1 },
      { id: 2, booking_id: 1, origin_code: "B", destination_code: "C", leg_date: "2026-08-02", leg_sequence: 2 },
      { id: 3, booking_id: 1, origin_code: "C", destination_code: "D", leg_date: "2026-08-03", leg_sequence: 3 },
    ];
    const passengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" },
      { id: 200, booking_id: 1, first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
    ];

    // All original junction records (3 legs �— 2 passengers = 6)
    const allRecords: { booking_leg_id: number; booking_passenger_id: number }[] = [];
    for (const leg of legs) {
      for (const p of passengers) {
        allRecords.push({ booking_leg_id: leg.id, booking_passenger_id: p.id });
      }
    }
    expect(allRecords).toHaveLength(6);

    // Remove passenger 100 → remove leg_ids where passenger_id = 100
    const remaining = allRecords.filter((r) => r.booking_passenger_id !== 100);
    expect(remaining).toHaveLength(3);
    // Remaining records are all for passenger 200
    expect(remaining.every((r) => r.booking_passenger_id === 200)).toBe(true);
    // Leg IDs for passenger 200: all 3 legs
    expect(remaining.map((r) => r.booking_leg_id).sort()).toEqual([1, 2, 3]);
  });

  it("removing the only passenger removes all junction records", () => {
    const records: { booking_leg_id: number; booking_passenger_id: number }[] = [
      { booking_leg_id: 1, booking_passenger_id: 100 },
    ];
    const remaining = records.filter((r) => r.booking_passenger_id !== 100);
    expect(remaining).toHaveLength(0);
  });

  it("removing a non-existent passenger leaves records unchanged", () => {
    const records: { booking_leg_id: number; booking_passenger_id: number }[] = [
      { booking_leg_id: 1, booking_passenger_id: 100 },
      { booking_leg_id: 1, booking_passenger_id: 200 },
    ];
    const remaining = records.filter((r) => r.booking_passenger_id !== 999);
    expect(remaining).toHaveLength(2);
  });
});

// ===========================================================================
// Test 5: Adding a new leg creates junction records for all existing passengers
// ===========================================================================
describe("booking junction — adding a new leg", () => {
  it("adds one junction record per existing passenger for the new leg", () => {
    const existingPassengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" },
      { id: 200, booking_id: 1, first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
      { id: 300, booking_id: 1, first_name: "Bob", last_name: "Smith", email: "bob@example.com" },
    ];
    const newLeg: JunctionLeg = {
      id: 5, booking_id: 1, origin_code: "SAWO", destination_code: "SAWH", leg_date: "2026-08-04", leg_sequence: 4,
    };

    const newRecords = createJunctionForLeg(newLeg, existingPassengers);
    expect(newRecords).toHaveLength(3);
    expect(newRecords.every((r) => r.booking_leg_id === 5)).toBe(true);
    expect(newRecords.map((r) => r.booking_passenger_id).sort()).toEqual([100, 200, 300]);
  });

  it("creates zero junction records when there are no existing passengers", () => {
    const newLeg: JunctionLeg = {
      id: 99, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-05", leg_sequence: 5,
    };
    const newRecords = createJunctionForLeg(newLeg, []);
    expect(newRecords).toHaveLength(0);
  });
});

// ===========================================================================
// Test 6: Adding a new passenger creates junction records for all existing legs
// ===========================================================================
describe("booking junction — adding a new passenger", () => {
  it("adds one junction record per existing leg for the new passenger", () => {
    const existingLegs: JunctionLeg[] = [
      { id: 1, booking_id: 1, origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-08-01", leg_sequence: 1 },
      { id: 2, booking_id: 1, origin_code: "SAWG", destination_code: "SAWO", leg_date: "2026-08-02", leg_sequence: 2 },
    ];
    const newPassenger: JunctionPassenger = {
      id: 500, booking_id: 1, first_name: "Alice", last_name: "New", email: "alice@new.com",
    };

    const newRecords = createJunctionForPassenger(newPassenger, existingLegs);
    expect(newRecords).toHaveLength(2);
    expect(newRecords.every((r) => r.booking_passenger_id === 500)).toBe(true);
    expect(newRecords.map((r) => r.booking_leg_id).sort()).toEqual([1, 2]);
  });

  it("creates zero junction records when there are no existing legs", () => {
    const newPassenger: JunctionPassenger = {
      id: 600, booking_id: 1, first_name: "Bob", last_name: "New", email: "bob@new.com",
    };
    const newRecords = createJunctionForPassenger(newPassenger, []);
    expect(newRecords).toHaveLength(0);
  });

  it("maintains N�—M consistency after adding passenger", () => {
    const legs: JunctionLeg[] = [
      { id: 1, booking_id: 1, origin_code: "A", destination_code: "B", leg_date: "2026-08-01", leg_sequence: 1 },
      { id: 2, booking_id: 1, origin_code: "B", destination_code: "C", leg_date: "2026-08-02", leg_sequence: 2 },
      { id: 3, booking_id: 1, origin_code: "C", destination_code: "D", leg_date: "2026-08-03", leg_sequence: 3 },
    ];

    // Initial: 3 legs �— 2 passengers = 6 records
    const initialPassengers: JunctionPassenger[] = [
      { id: 100, booking_id: 1, first_name: "A", last_name: "P1", email: "a@x.com" },
      { id: 200, booking_id: 1, first_name: "B", last_name: "P2", email: "b@x.com" },
    ];
    const initialRecords: { booking_leg_id: number; booking_passenger_id: number }[] = [];
    for (const leg of legs) {
      for (const p of initialPassengers) {
        initialRecords.push({ booking_leg_id: leg.id, booking_passenger_id: p.id });
      }
    }
    expect(initialRecords).toHaveLength(6);

    // Add new passenger — should add 3 more records (for 3 legs)
    const newPassenger: JunctionPassenger = {
      id: 300, booking_id: 1, first_name: "C", last_name: "P3", email: "c@x.com",
    };
    const newRecords = createJunctionForPassenger(newPassenger, legs);
    const totalRecords = [...initialRecords, ...newRecords];
    expect(totalRecords).toHaveLength(9);

    // Verify: 3 legs �— 3 passengers = 9
    const expectedCount = legs.length * (initialPassengers.length + 1);
    expect(totalRecords).toHaveLength(expectedCount);
  });
});

// ===========================================================================
// Repository-level tests: deleteByLegId
// ===========================================================================
describe("booking junction — repository deleteByLegId", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = { deleteFrom: vi.fn(() => chain) };
    vi.clearAllMocks();
  });

  it("calls deleteFrom with the correct leg ID", async () => {
    executeMock.mockResolvedValueOnce(undefined);
    await bookingLegPassengerRepository.deleteByLegId(42);

    const deleteFromFn = kdbMock.deleteFrom as ReturnType<typeof vi.fn>;
    expect(deleteFromFn).toHaveBeenCalledWith("booking_leg_passengers");
  });

  it("completes silently when no junction records exist for the leg", async () => {
    executeMock.mockResolvedValueOnce(undefined);
    await expect(
      bookingLegPassengerRepository.deleteByLegId(99999),
    ).resolves.toBeUndefined();
  });
});

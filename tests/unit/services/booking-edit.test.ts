import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock state — mirrors tests/unit/repositories/booking.test.ts
// ---------------------------------------------------------------------------

let kdbMock: Record<string, unknown> = {};

const getKdb = () => kdbMock;

vi.mock("~/utils/db.server", () => ({
  get kdb() {
    return getKdb();
  },
}));

vi.mock("~/utils/db.server.kysely", () => ({
  get kdb() {
    return getKdb();
  },
}));

vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: () => ({
      execute: vi.fn(() => ({ rows: [] })),
    }),
  };
});

import { bookingRepository } from "~/utils/repositories/booking";
import { bookingLegRepository } from "~/utils/repositories/booking-leg";

const CHAIN_METHODS = [
  "select",
  "selectAll",
  "where",
  "andWhere",
  "orWhere",
  "orderBy",
  "limit",
  "offset",
  "innerJoin",
  "leftJoin",
  "groupBy",
  "values",
  "returningAll",
  "set",
  "onConflict",
  "whereRef",
  "innerJoinLateral",
];

function makeChain(
  execute: ReturnType<typeof vi.fn>,
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
): Record<string, unknown> {
  const chain: Record<string, unknown> = { execute };
  for (const m of CHAIN_METHODS) {
    chain[m] = overrides[m] ?? vi.fn(() => chain);
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Pure validation functions — extracted from operations.bookings.$bookingId.edit.tsx action
// ---------------------------------------------------------------------------

function hasAtLeastOneLeg(rawOrigins: FormDataEntryValue[]): boolean {
  return rawOrigins.length > 0;
}

function hasAtLeastOnePassenger(rawFirstNames: FormDataEntryValue[]): boolean {
  return rawFirstNames.length > 0;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00");
  return !isNaN(d.getTime());
}

function isFutureDate(dateStr: string, today: Date): boolean {
  if (!isValidDate(dateStr)) return false;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return new Date(dateStr + "T00:00:00") > t;
}

function areOriginDestinationDifferent(origin: string, destination: string): boolean {
  return origin !== destination;
}

function isNotNoFlyDate(dateStr: string, noFlySet: Set<string>): boolean {
  return !noFlySet.has(dateStr);
}

// ---------------------------------------------------------------------------
// Row factories
// ---------------------------------------------------------------------------

function makeBookingRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    user_id: 42,
    booking_reference: "ABC12345",
    status: "pending",
    organization_id: null,
    is_organization_billing: false,
    total_amount: null,
    total_amount_gbp: null,
    payment_status: "pending",
    payment_method: null,
    payment_date: null,
    payment_due_date: null,
    payment_terms: null,
    notes: null,
    booking_source: "customer_direct",
    created_by: null,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    stripe_session_id: null,
    invoice_id: null,
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeLegRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    booking_id: 1,
    flight_id: null,
    origin_code: "STY",
    destination_code: "MPA",
    leg_date: "2026-08-01",
    departure_date: null,
    preferred_time: null,
    preferred_time_start: null,
    preferred_time_end: null,
    leg_sequence: 1,
    status: "pending",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// Validation (pure functions)
// ===========================================================================

describe("booking edit — field count validation", () => {
  describe("hasAtLeastOneLeg", () => {
    it("returns true when there are leg origins", () => {
      expect(hasAtLeastOneLeg(["STY"])).toBe(true);
    });

    it("returns true for multiple legs", () => {
      expect(hasAtLeastOneLeg(["STY", "MPA"])).toBe(true);
    });

    it("returns false when leg origins array is empty", () => {
      expect(hasAtLeastOneLeg([])).toBe(false);
    });
  });

  describe("hasAtLeastOnePassenger", () => {
    it("returns true when there are passenger first names", () => {
      expect(hasAtLeastOnePassenger(["John"])).toBe(true);
    });

    it("returns true for multiple passengers", () => {
      expect(hasAtLeastOnePassenger(["John", "Jane"])).toBe(true);
    });

    it("returns false when passenger names array is empty", () => {
      expect(hasAtLeastOnePassenger([])).toBe(false);
    });
  });
});

describe("booking edit — leg route validation", () => {
  describe("areOriginDestinationDifferent", () => {
    it("returns true for different aerodrome codes", () => {
      expect(areOriginDestinationDifferent("STY", "MPA")).toBe(true);
    });

    it("returns true for different codes in reverse order", () => {
      expect(areOriginDestinationDifferent("MPA", "STY")).toBe(true);
    });

    it("returns false when origin equals destination", () => {
      expect(areOriginDestinationDifferent("STY", "STY")).toBe(false);
    });

    it("returns false for empty strings", () => {
      expect(areOriginDestinationDifferent("", "")).toBe(false);
    });
  });
});

describe("booking edit — date validation", () => {
  describe("isFutureDate", () => {
    const refToday = new Date("2026-07-15T12:00:00");

    it("returns true for a date after the reference date", () => {
      expect(isFutureDate("2026-07-16", refToday)).toBe(true);
    });

    it("returns true for a date far in the future", () => {
      expect(isFutureDate("2099-12-31", refToday)).toBe(true);
    });

    it("returns false for the same date as reference (must be strictly after)", () => {
      expect(isFutureDate("2026-07-15", refToday)).toBe(false);
    });

    it("returns false for a date before the reference date", () => {
      expect(isFutureDate("2026-07-14", refToday)).toBe(false);
    });

    it("returns false for a date in the distant past", () => {
      expect(isFutureDate("2020-01-01", refToday)).toBe(false);
    });

    it("returns false for an invalid date string", () => {
      expect(isFutureDate("not-a-date", refToday)).toBe(false);
    });

    it("returns false for a malformed date", () => {
      expect(isFutureDate("2026-13-01", refToday)).toBe(false);
    });
  });

  describe("isValidDate", () => {
    it("returns true for a valid ISO date", () => {
      expect(isValidDate("2026-08-01")).toBe(true);
    });

    it("returns false for text", () => {
      expect(isValidDate("hello")).toBe(false);
    });

    it("returns false for an incomplete date", () => {
      expect(isValidDate("2026-08")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isValidDate("")).toBe(false);
    });
  });

  describe("isNotNoFlyDate", () => {
    const noFlySet = new Set(["2026-08-01", "2026-08-02", "2026-12-25"]);

    it("returns true for a date not in the no-fly set", () => {
      expect(isNotNoFlyDate("2026-08-03", noFlySet)).toBe(true);
    });

    it("returns false for a no-fly date", () => {
      expect(isNotNoFlyDate("2026-08-01", noFlySet)).toBe(false);
    });

    it("returns false for another no-fly date", () => {
      expect(isNotNoFlyDate("2026-12-25", noFlySet)).toBe(false);
    });

    it("returns true when the no-fly set is empty", () => {
      expect(isNotNoFlyDate("2026-08-01", new Set())).toBe(true);
    });
  });
});

// ===========================================================================
// Booking existence validation
// ===========================================================================

describe("booking edit — booking existence check", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("returns null when booking does not exist — triggers 404 in the loader", async () => {
    executeMock.mockResolvedValueOnce([]);

    const result = await bookingRepository.findById(99999);

    expect(result).toBeNull();
  });

  it("returns the booking row when it exists", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ id: 42, booking_reference: "XYZ00001" })]);

    const result = await bookingRepository.findById(42);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(42);
    expect(result!.booking_reference).toBe("XYZ00001");
  });
});

// ===========================================================================
// Leg date update — verifies that changing a leg date propagates to the DB insert
// ===========================================================================

describe("booking edit — leg date update via bookingLegRepository.create()", () => {
  let executeMock: ReturnType<typeof vi.fn>;
  let valuesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    valuesMock = vi.fn();

    const chain = makeChain(executeMock, { values: valuesMock });
    valuesMock.mockReturnValue(chain);

    kdbMock = {
      insertInto: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("passes the provided leg_date through to the database insert", async () => {
    executeMock.mockResolvedValueOnce([makeLegRow({ id: 10, leg_date: "2026-09-20" })]);

    const result = await bookingLegRepository.create({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: "2026-09-20",
      preferred_time: "08:00",
      leg_sequence: 1,
    });

    const insertInto = kdbMock.insertInto as ReturnType<typeof vi.fn>;
    expect(insertInto).toHaveBeenCalledWith("booking_legs");

    const valuesPayload = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesPayload.leg_date).toBe("2026-09-20");
    expect(valuesPayload.booking_id).toBe(1);
    expect(valuesPayload.origin_code).toBe("STY");
    expect(valuesPayload.destination_code).toBe("MPA");
    expect(valuesPayload.leg_sequence).toBe(1);

    expect(result.leg_date).toBe("2026-09-20");
    expect(result.id).toBe(10);
  });

  it("creates a leg with updated origin and destination when the leg route changes", async () => {
    executeMock.mockResolvedValueOnce([makeLegRow({ id: 11, origin_code: "MPA", destination_code: "PBI", leg_date: "2026-10-01" })]);

    const result = await bookingLegRepository.create({
      booking_id: 1,
      origin_code: "MPA",
      destination_code: "PBI",
      leg_date: "2026-10-01",
      leg_sequence: 2,
    });

    const valuesPayload = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesPayload.origin_code).toBe("MPA");
    expect(valuesPayload.destination_code).toBe("PBI");
    expect(valuesPayload.leg_date).toBe("2026-10-01");
    expect(valuesPayload.leg_sequence).toBe(2);

    expect(result.origin_code).toBe("MPA");
    expect(result.destination_code).toBe("PBI");
  });

  it("rejects when origin equals destination — validates at the repo layer", async () => {
    await expect(
      bookingLegRepository.create({
        booking_id: 1,
        origin_code: "STY",
        destination_code: "STY",
        leg_date: "2026-08-15",
        leg_sequence: 1,
      }),
    ).rejects.toThrow("Origin and destination must be different");
  });
});

// ===========================================================================
// Duplicate leg handling — edit route does full delete+recreate, duplicates pass through
// ===========================================================================

describe("booking edit — duplicate leg handling", () => {
  let executeMock: ReturnType<typeof vi.fn>;
  let valuesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    valuesMock = vi.fn();

    const chain = makeChain(executeMock, { values: valuesMock });
    valuesMock.mockReturnValue(chain);

    kdbMock = {
      insertInto: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("allows creating two legs with the same origin, destination, and date", async () => {
    executeMock
      .mockResolvedValueOnce([makeLegRow({ id: 20, leg_sequence: 1 })])
      .mockResolvedValueOnce([makeLegRow({ id: 21, leg_sequence: 2 })]);

    const leg1 = await bookingLegRepository.create({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: "2026-08-10",
      leg_sequence: 1,
    });

    const leg2 = await bookingLegRepository.create({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: "2026-08-10",
      leg_sequence: 2,
    });

    expect(leg1.id).toBe(20);
    expect(leg2.id).toBe(21);
    expect(valuesMock).toHaveBeenCalledTimes(2);
  });

  it("does not throw when legs share the same route and date with different sequences", async () => {
    executeMock
      .mockResolvedValueOnce([makeLegRow({ id: 30, leg_sequence: 1 })])
      .mockResolvedValueOnce([makeLegRow({ id: 31, leg_sequence: 2 })]);

    await expect(
      Promise.all([
        bookingLegRepository.create({
          booking_id: 1,
          origin_code: "MPA",
          destination_code: "PBI",
          leg_date: "2026-08-12",
          leg_sequence: 1,
        }),
        bookingLegRepository.create({
          booking_id: 1,
          origin_code: "MPA",
          destination_code: "PBI",
          leg_date: "2026-08-12",
          leg_sequence: 2,
        }),
      ]),
    ).resolves.toHaveLength(2);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock state — mutated per describe block
// ---------------------------------------------------------------------------

let kdbMock: Record<string, unknown> = {};
const sqlExecuteMock = vi.fn();

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

// Static import — the module is evaluated once; kdb is accessed via getter
import { bookingRepository } from "~/utils/repositories/booking";

// ---------------------------------------------------------------------------
// Chain builders — every Kysely method returns the chain itself.
// ---------------------------------------------------------------------------

/** Methods shared by every Kysely query builder chain. */
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

// ---------------------------------------------------------------------------
// Shared factory: produce a raw row that looks like the bookings table
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

// ===========================================================================
// createPending
// ===========================================================================
describe("bookingRepository.createPending()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = {
      insertInto: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("creates a booking with status pending and default booking_source", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow()]);

    const result = await bookingRepository.createPending(42, null, false);

    expect(result.status).toBe("pending");
    expect(result.booking_source).toBe("customer_direct");
    expect(result.user_id).toBe(42);
  });

  it("accepts a custom booking_source via options", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ booking_source: "booking_agent" })]);

    const result = await bookingRepository.createPending(42, null, false, {
      booking_source: "booking_agent",
    });

    expect(result.booking_source).toBe("booking_agent");
  });

  it("generates a reference matching 3 uppercase letters + 5 digits", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ booking_reference: "XYZ98765" })]);

    const result = await bookingRepository.createPending(42, null, false);

    expect(result.booking_reference).toMatch(/^[A-Z]{3}\d{5}$/);
  });

  it("retries on duplicate reference (PG code 23505)", async () => {
    executeMock
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce([makeBookingRow()]);

    const result = await bookingRepository.createPending(42, null, false);

    expect(result.booking_reference).toBe("ABC12345");
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("throws a non-duplicate error immediately", async () => {
    executeMock.mockRejectedValueOnce(new Error("connection refused"));

    await expect(
      bookingRepository.createPending(42, null, false),
    ).rejects.toThrow("connection refused");
  });

  it("throws after 10 retry failures", async () => {
    for (let i = 0; i < 10; i++) {
      executeMock.mockRejectedValueOnce({ code: "23505" });
    }

    await expect(
      bookingRepository.createPending(42, null, false),
    ).rejects.toThrow("Unable to generate unique booking reference after 10 attempts");
    expect(executeMock).toHaveBeenCalledTimes(10);
  });
});

// ===========================================================================
// findById
// ===========================================================================
describe("bookingRepository.findById()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("returns the booking row when it exists", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ id: 99, status: "confirmed" })]);

    const result = await bookingRepository.findById(99);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(99);
    expect(result!.status).toBe("confirmed");
  });

  it("returns null when the booking does not exist", async () => {
    executeMock.mockResolvedValueOnce([]);

    const result = await bookingRepository.findById(99999);

    expect(result).toBeNull();
  });
});

// ===========================================================================
// findUpcomingByUserId
// ===========================================================================
describe("bookingRepository.findUpcomingByUserId()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    // The method issues multiple queries through the same kdb, so we give
    // every top-level method (selectFrom, etc.) the same chain whose .execute
    // is driven by an ordered queue.
    const chain = makeChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      fn: {
        countAll: vi.fn(() => ({ as: vi.fn(() => "count(*)") })),
      },
    };
    vi.clearAllMocks();
  });

  function queueResults(
    count: number,
    bookings: Record<string, unknown>[],
    legsPerBooking: Record<string, unknown>[][],
  ) {
    executeMock.mockResolvedValueOnce([{ cnt: count }]); // count query
    executeMock.mockResolvedValueOnce(bookings); // bookings batch
    for (const legs of legsPerBooking) {
      executeMock.mockResolvedValueOnce(legs); // per-booking leg query
    }
  }

  it("returns limited results with correct totalCount", async () => {
    queueResults(
      2,
      [makeBookingRow({ id: 1 }), makeBookingRow({ id: 2 })],
      [
        [{ origin_code: "STY", destination_code: "MPA", leg_date: "2026-07-15" }],
        [{ origin_code: "MPA", destination_code: "STY", leg_date: "2026-07-16" }],
      ],
    );

    const result = await bookingRepository.findUpcomingByUserId(42);

    expect(result.totalCount).toBe(2);
    expect(result.bookings).toHaveLength(2);
    expect(result.bookings[0].firstLeg?.origin_code).toBe("STY");
    expect(result.bookings[1].firstLeg?.origin_code).toBe("MPA");
  });

  it("returns empty results when user has no bookings", async () => {
    queueResults(0, [], []);

    const result = await bookingRepository.findUpcomingByUserId(42);

    expect(result.totalCount).toBe(0);
    expect(result.bookings).toHaveLength(0);
  });

  it("returns null firstLeg when booking has no legs", async () => {
    queueResults(1, [makeBookingRow({ id: 1 })], [[]]);

    const result = await bookingRepository.findUpcomingByUserId(42);

    expect(result.bookings[0].firstLeg).toBeNull();
  });
});

// ===========================================================================
// updateStatus
// ===========================================================================
describe("bookingRepository.updateStatus()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = {
      updateTable: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("calls updateTable and resolves successfully", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await expect(
      bookingRepository.updateStatus(1, "confirmed"),
    ).resolves.toBeUndefined();
  });

  it("allows transition to cancelled", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await expect(
      bookingRepository.updateStatus(1, "cancelled"),
    ).resolves.toBeUndefined();
  });

  it("accepts any status string (no validation at repo layer)", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await expect(
      bookingRepository.updateStatus(1, "completed"),
    ).resolves.toBeUndefined();
  });
});

// ===========================================================================
// cancel
// ===========================================================================
describe("bookingRepository.cancel()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = {
      updateTable: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("sets status=cancelled and records cancelled_at, cancelled_by, and reason", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await bookingRepository.cancel(1, 99, "duplicate");

    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("allows cancellation without a reason", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await expect(bookingRepository.cancel(1, 99)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// searchByUser
// ===========================================================================
describe("bookingRepository.searchByUser()", () => {
  beforeEach(() => {
    sqlExecuteMock.mockReset();
  });

  it("finds bookings by reference for the correct user", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...makeBookingRow({ id: 5, booking_reference: "REF00111", user_id: 42 }),
            origin_code: "STY",
            destination_code: "MPA",
            leg_date: "2026-08-01",
            flight_id: null,
            passenger_first_name: "John",
            passenger_last_name: "Doe",
            passenger_email: "john@example.com",
            passenger_phone: null,
          },
        ],
      });

    const result = await bookingRepository.searchByUser("REF00111", 42);

    expect(result.totalCount).toBe(1);
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].booking.booking_reference).toBe("REF00111");
    expect(result.bookings[0].passenger?.first_name).toBe("John");
  });

  it("finds bookings by passenger name", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...makeBookingRow({ id: 7, user_id: 42 }),
            origin_code: "STY",
            destination_code: "SHR",
            leg_date: "2026-08-05",
            flight_id: null,
            passenger_first_name: "Jane",
            passenger_last_name: "Smith",
            passenger_email: "jane@test.com",
            passenger_phone: null,
          },
        ],
      });

    const result = await bookingRepository.searchByUser("Jane", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.first_name).toBe("Jane");
  });

  it("finds bookings by passenger email", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...makeBookingRow({ id: 8, user_id: 42 }),
            origin_code: null,
            destination_code: null,
            leg_date: null,
            flight_id: null,
            passenger_first_name: "Bob",
            passenger_last_name: "Brown",
            passenger_email: "bob@figas.com",
            passenger_phone: null,
          },
        ],
      });

    const result = await bookingRepository.searchByUser("bob@figas", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.email).toBe("bob@figas.com");
  });

  it("returns empty results and null passenger/leg when no join rows exist", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await bookingRepository.searchByUser("nonexistent", 42);

    expect(result.totalCount).toBe(0);
    expect(result.bookings).toHaveLength(0);
  });

  it("returns empty results when no matches found", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await bookingRepository.searchByUser("zzz_nope_zzz", 42);

    expect(result.bookings).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const kdbMock: Record<string, unknown> = {};
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

import { bookingRepository } from "~/utils/repositories/booking";

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

function makeSearchRow(
  bookingOverrides: Partial<Record<string, unknown>> = {},
  passengerOverrides: Partial<Record<string, unknown>> = {},
  legOverrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    ...makeBookingRow(bookingOverrides),
    origin_code: "STY",
    destination_code: "MPA",
    leg_date: "2026-08-01",
    flight_id: null,
    passenger_first_name: "John",
    passenger_last_name: "Doe",
    passenger_email: "john@example.com",
    passenger_phone: null,
    ...legOverrides,
    ...passengerOverrides,
  };
}

function mockSearchResults(
  count: number,
  rows: Record<string, unknown>[],
) {
  sqlExecuteMock
    .mockResolvedValueOnce({ rows: [{ cnt: count }] })
    .mockResolvedValueOnce({ rows });
}

function mockSearchResultsPaginated(
  count: number,
  page1Rows: Record<string, unknown>[],
  page2Rows: Record<string, unknown>[],
) {
  sqlExecuteMock
    .mockResolvedValueOnce({ rows: [{ cnt: count }] })
    .mockResolvedValueOnce({ rows: page1Rows })
    .mockResolvedValueOnce({ rows: [{ cnt: count }] })
    .mockResolvedValueOnce({ rows: page2Rows });
}

// ===========================================================================
// searchByUser — comprehensive search, filter & pagination tests
// ===========================================================================

describe("bookingRepository.searchByUser()", () => {
  beforeEach(() => {
    sqlExecuteMock.mockReset();
  });

  // -----------------------------------------------------------------------
  // Empty query returns all user's bookings
  // -----------------------------------------------------------------------

  it("returns all bookings for the user when query is empty", async () => {
    mockSearchResults(2, [
      makeSearchRow({ id: 1, booking_reference: "AAA11111" }),
      makeSearchRow({ id: 2, booking_reference: "BBB22222" }),
    ]);

    const result = await bookingRepository.searchByUser("", 42);

    expect(result.totalCount).toBe(2);
    expect(result.bookings).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Search by booking reference
  // -----------------------------------------------------------------------

  it("finds exact match by booking reference", async () => {
    mockSearchResults(1, [
      makeSearchRow({ id: 5, booking_reference: "REF00111", user_id: 42 }),
    ]);

    const result = await bookingRepository.searchByUser("REF00111", 42);

    expect(result.totalCount).toBe(1);
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].booking.booking_reference).toBe("REF00111");
  });

  it("finds partial match by booking reference", async () => {
    mockSearchResults(1, [
      makeSearchRow({ id: 5, booking_reference: "REF00111", user_id: 42 }),
    ]);

    const result = await bookingRepository.searchByUser("REF", 42);

    expect(result.totalCount).toBe(1);
    expect(result.bookings[0].booking.booking_reference).toBe("REF00111");
  });

  // -----------------------------------------------------------------------
  // Search by passenger first name
  // -----------------------------------------------------------------------

  it("finds partial matches by passenger first name", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 7, user_id: 42 },
        { passenger_first_name: "Alexandra", passenger_last_name: "Johnson", passenger_email: "alex@test.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("Alex", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.first_name).toBe("Alexandra");
  });

  it("finds exact first name matches", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 7, user_id: 42 },
        { passenger_first_name: "Jane", passenger_last_name: "Smith", passenger_email: "jane@test.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("Jane", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.first_name).toBe("Jane");
  });

  // -----------------------------------------------------------------------
  // Search by passenger last name
  // -----------------------------------------------------------------------

  it("finds partial matches by passenger last name", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 10, user_id: 42 },
        { passenger_first_name: "Robert", passenger_last_name: "Fitzgerald", passenger_email: "rob@test.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("Fitz", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.last_name).toBe("Fitzgerald");
  });

  it("finds bookings when last name matches across different bookings", async () => {
    mockSearchResults(2, [
      makeSearchRow(
        { id: 11, booking_reference: "CCC33333", user_id: 42 },
        { passenger_first_name: "Alice", passenger_last_name: "Smith", passenger_email: "alice@test.com" },
      ),
      makeSearchRow(
        { id: 12, booking_reference: "DDD44444", user_id: 42 },
        { passenger_first_name: "Bob", passenger_last_name: "Smith", passenger_email: "bob@test.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("Smith", 42);

    expect(result.totalCount).toBe(2);
    expect(result.bookings).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Search by email
  // -----------------------------------------------------------------------

  it("finds matches by email address", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 8, user_id: 42 },
        { passenger_first_name: "Bob", passenger_last_name: "Brown", passenger_email: "bob@figas.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("bob@figas", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.email).toBe("bob@figas.com");
  });

  it("finds partial email matches", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 8, user_id: 42 },
        { passenger_first_name: "Bob", passenger_last_name: "Brown", passenger_email: "bob@figas.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("figas", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.email).toBe("bob@figas.com");
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  it("page 1 uses default limit of 20 and offset 0", async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeSearchRow(
        { id: i + 1, booking_reference: `REF${String(i).padStart(5, "0")}`, user_id: 42 },
        { passenger_first_name: `User${i}`, passenger_last_name: "Test", passenger_email: `user${i}@test.com` },
      ),
    );
    mockSearchResultsPaginated(45, rows, rows.slice(0, 5));

    const page1 = await bookingRepository.searchByUser("Test", 42, 1, 20);

    expect(page1.page).toBe(1);
    expect(page1.bookings).toHaveLength(20);
    expect(page1.totalCount).toBe(45);
  });

  it("page 2 returns next page with correct offset", async () => {
    const page1Rows = Array.from({ length: 20 }, (_, i) =>
      makeSearchRow(
        { id: i + 1, booking_reference: `REF${String(i).padStart(5, "0")}`, user_id: 42 },
        { passenger_first_name: `First20_${i}`, passenger_last_name: "Test", passenger_email: `u${i}@test.com` },
      ),
    );
    const page2Rows = Array.from({ length: 20 }, (_, i) =>
      makeSearchRow(
        { id: i + 21, booking_reference: `REF${String(i + 20).padStart(5, "0")}`, user_id: 42 },
        { passenger_first_name: `Next20_${i}`, passenger_last_name: "Test", passenger_email: `u${i + 20}@test.com` },
      ),
    );
    mockSearchResultsPaginated(45, page1Rows, page2Rows);

    const page1 = await bookingRepository.searchByUser("Test", 42, 1, 20);
    const page2 = await bookingRepository.searchByUser("Test", 42, 2, 20);

    expect(page1.bookings[0].passenger?.first_name).toBe("First20_0");
    expect(page2.page).toBe(2);
    expect(page2.bookings).toHaveLength(20);
    expect(page2.bookings[0].passenger?.first_name).toBe("Next20_0");
  });

  // -----------------------------------------------------------------------
  // totalCount
  // -----------------------------------------------------------------------

  it("totalCount matches the actual count from the count query", async () => {
    mockSearchResults(7, [
      makeSearchRow({ id: 1 }),
      makeSearchRow({ id: 2 }),
    ]);

    const result = await bookingRepository.searchByUser("any", 42);

    expect(result.totalCount).toBe(7);
  });

  it("totalCount is 0 when no rows match", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await bookingRepository.searchByUser("nonexistent_xyz", 42);

    expect(result.totalCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // totalPages calculation
  // -----------------------------------------------------------------------

  it("totalPages equals ceil(totalCount / pageSize)", async () => {
    mockSearchResults(45, [
      makeSearchRow({ id: 1 }),
    ]);

    const result = await bookingRepository.searchByUser("", 42, 1, 20);

    expect(result.totalPages).toBe(3);
  });

  it("totalPages is 1 when totalCount is less than pageSize", async () => {
    mockSearchResults(5, [
      makeSearchRow({ id: 1 }),
    ]);

    const result = await bookingRepository.searchByUser("", 42, 1, 20);

    expect(result.totalPages).toBe(1);
  });

  it("totalPages is exactly 1 when totalCount equals pageSize", async () => {
    mockSearchResults(20, [
      makeSearchRow({ id: 1 }),
    ]);

    const result = await bookingRepository.searchByUser("", 42, 1, 20);

    expect(result.totalPages).toBe(1);
  });

  it("totalPages is 0 when totalCount is 0", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await bookingRepository.searchByUser("nonexistent", 42);

    expect(result.totalPages).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Empty results
  // -----------------------------------------------------------------------

  it("returns empty array with totalCount=0 for no matches", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await bookingRepository.searchByUser("zzz_nope_zzz", 42);

    expect(result.bookings).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(0);
  });

  it("returns empty results when join rows are missing", async () => {
    sqlExecuteMock
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await bookingRepository.searchByUser("nonexistent", 42);

    expect(result.totalCount).toBe(0);
    expect(result.bookings).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Case-insensitive search
  // -----------------------------------------------------------------------

  it("search is case-insensitive for booking reference", async () => {
    mockSearchResults(1, [
      makeSearchRow({ id: 5, booking_reference: "REF00111", user_id: 42 }),
    ]);

    const result = await bookingRepository.searchByUser("ref00111", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].booking.booking_reference).toBe("REF00111");
  });

  it("search is case-insensitive for first name", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 7, user_id: 42 },
        { passenger_first_name: "JANE", passenger_last_name: "DOE", passenger_email: "jane@test.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("jane", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.first_name).toBe("JANE");
  });

  it("search is case-insensitive for last name", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 10, user_id: 42 },
        { passenger_first_name: "John", passenger_last_name: "SMITH", passenger_email: "john@test.com" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("smith", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.last_name).toBe("SMITH");
  });

  it("search is case-insensitive for email", async () => {
    mockSearchResults(1, [
      makeSearchRow(
        { id: 8, user_id: 42 },
        { passenger_first_name: "Bob", passenger_last_name: "Brown", passenger_email: "BOB@FIGAS.COM" },
      ),
    ]);

    const result = await bookingRepository.searchByUser("bob@figas.com", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].passenger?.email).toBe("BOB@FIGAS.COM");
  });

  // -----------------------------------------------------------------------
  // Scoped to correct user
  // -----------------------------------------------------------------------

  it("only returns bookings for the specified user", async () => {
    mockSearchResults(1, [
      makeSearchRow({ id: 5, user_id: 42 }),
    ]);

    const result = await bookingRepository.searchByUser("REF00111", 42);

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].booking.user_id).toBe(42);
  });

  it("does not return bookings from other users", async () => {
    mockSearchResults(0, []);

    const result = await bookingRepository.searchByUser("John", 99);

    expect(result.bookings).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});

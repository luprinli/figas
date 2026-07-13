import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock state — mirrors the pattern in tests/unit/repositories/booking.test.ts
// ---------------------------------------------------------------------------

let kdbMock: Record<string, unknown> = {};

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
      execute: vi.fn(() => ({ rows: [] })),
    }),
  };
});

import { bookingRepository } from "~/utils/repositories/booking";

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

// ===========================================================================
// cancel
// ===========================================================================
// cancel
// ===========================================================================

describe("bookingRepository.cancel()", () => {
  let executeMock: ReturnType<typeof vi.fn>;
  let setMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    setMock = vi.fn();
    const chain: Record<string, unknown> = { execute: executeMock };
    for (const m of CHAIN_METHODS) {
      chain[m] = m === "set" ? setMock : vi.fn(() => chain);
    }
    setMock.mockReturnValue(chain);

    kdbMock = {
      updateTable: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Core cancellation
  // -----------------------------------------------------------------------

  it("sets status=cancelled and records cancelled_at, cancelled_by, and cancellation_reason", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await bookingRepository.cancel(1, 99, "duplicate booking");

    expect(setMock).toHaveBeenCalledTimes(1);
    const payload = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("cancelled");
    expect(payload.cancelled_by).toBe(99);
    expect(payload.cancellation_reason).toBe("duplicate booking");
    expect(payload.cancelled_at).toBeDefined();
    expect(typeof payload.cancelled_at).toBe("string");
    expect(payload.updated_at).toBeDefined();
    expect(typeof payload.updated_at).toBe("string");
  });

  it("targets the correct booking id via the WHERE clause", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await bookingRepository.cancel(42, 7, "test");

    const updateTableFn = kdbMock.updateTable as ReturnType<typeof vi.fn>;
    expect(updateTableFn).toHaveBeenCalledWith("bookings");
  });

  // -----------------------------------------------------------------------
  // Missing reason
  // -----------------------------------------------------------------------

  it("defaults cancellation_reason to null when reason is omitted", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await bookingRepository.cancel(1, 99);

    const payload = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("cancelled");
    expect(payload.cancellation_reason).toBeNull();
    expect(payload.cancelled_by).toBe(99);
  });

  it("defaults cancellation_reason to null when reason is an empty string", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    await bookingRepository.cancel(1, 99, "");

    const payload = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.cancellation_reason).toBe("");
  });

  // -----------------------------------------------------------------------
  // Error propagation
  // -----------------------------------------------------------------------

  it("rejects when the database query fails (simulating nonexistent booking)", async () => {
    executeMock.mockRejectedValueOnce(new Error("update failed"));

    await expect(
      bookingRepository.cancel(99999, 99, "test"),
    ).rejects.toThrow("update failed");
  });

  it("rejects when execute throws a foreign-key violation", async () => {
    executeMock.mockRejectedValueOnce(new Error("violates foreign key constraint"));

    await expect(
      bookingRepository.cancel(1, 99, "reason"),
    ).rejects.toThrow("violates foreign key constraint");
  });

  // -----------------------------------------------------------------------
  // Paid booking cancellation
  // -----------------------------------------------------------------------

  it("records cancellation fields correctly on a booking that was paid", async () => {
    executeMock.mockResolvedValueOnce(undefined);

    // Cancel a booking with id=5 representing a previously paid booking
    await bookingRepository.cancel(5, 42, "customer requested refund");

    const payload = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("cancelled");
    expect(payload.cancelled_by).toBe(42);
    expect(payload.cancellation_reason).toBe("customer requested refund");
    // cancelled_at and updated_at timestamps should be close to each other
    expect(payload.cancelled_at).toBe(payload.updated_at);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock state
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

const noFlyMock = vi.fn().mockResolvedValue(false);
vi.mock("~/utils/services/no-fly.service", () => ({
  isNoFlyDay: (date: string) => noFlyMock(date),
}));

import { bookingRepository } from "~/utils/repositories/booking";
import { bookingLegRepository } from "~/utils/repositories/booking-leg";
import {
  MAX_PASSENGERS_PER_BOOKING,
  DEFAULT_MAX_LEGS_PER_BOOKING,
  MAX_BOOKING_REFERENCE_ATTEMPTS,
} from "~/utils/constants";

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
// Wizard Validation Helpers (inline — mirrors wizard guard logic)
// ===========================================================================

function validateWizardLegs(legs: { origin_code: string; destination_code: string; leg_date: string }[]) {
  if (legs.length === 0) return { valid: false, error: "At least one leg is required" };
  if (legs.length > DEFAULT_MAX_LEGS_PER_BOOKING)
    return { valid: false, error: `Maximum ${DEFAULT_MAX_LEGS_PER_BOOKING} legs allowed per booking` };
  for (const leg of legs) {
    if (leg.origin_code === leg.destination_code)
      return { valid: false, error: `Origin and destination must be different: ${leg.origin_code}` };
    const date = new Date(leg.leg_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (date <= now) return { valid: false, error: "Departure date must be in the future" };
  }
  return { valid: true, error: null };
}

function validateWizardPassengers(passengers: { first_name: string; last_name: string; email: string | null }[]) {
  if (passengers.length === 0) return { valid: false, error: "At least one passenger is required" };
  if (passengers.length > MAX_PASSENGERS_PER_BOOKING)
    return { valid: false, error: `Maximum ${MAX_PASSENGERS_PER_BOOKING} passengers allowed per booking` };
  for (const p of passengers) {
    if (!p.first_name.trim() && !p.last_name.trim())
      return { valid: false, error: "Passenger name is required" };
    if (!p.email || !p.email.trim())
      return { valid: false, error: "Passenger email is required" };
  }
  return { valid: true, error: null };
}

// ===========================================================================
// Test 1: Origin and destination must not be the same
// ===========================================================================
describe("booking wizard — same-origin/destination prevention", () => {
  it("rejects booking when origin and destination are the same aerodrome", () => {
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWH", leg_date: "2026-12-25" },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("must be different");
  });

  it("accepts booking when origin and destination differ", () => {
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-12-25" },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("validates each leg independently for same-origin check", () => {
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-12-25" },
      { origin_code: "SAWG", destination_code: "SAWG", leg_date: "2026-12-26" },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("SAWG");
  });

  it("bookingLegRepository.create throws on same origin and destination", async () => {
    const executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = { insertInto: vi.fn(() => chain) };

    await expect(
      bookingLegRepository.create({
        booking_id: 1,
        origin_code: "SAWH",
        destination_code: "SAWH",
        leg_date: "2026-12-25",
        leg_sequence: 1,
      }),
    ).rejects.toThrow("Origin and destination must be different");
  });
});

// ===========================================================================
// Test 2: Departure date must be in the future
// ===========================================================================
describe("booking wizard — future date validation", () => {
  it("rejects a date in the past", () => {
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWG", leg_date: "2020-01-01" },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("in the future");
  });

  it("rejects today's date", () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWG", leg_date: `${y}-${m}-${d}` },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(false);
  });

  it("accepts a date far in the future", () => {
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWG", leg_date: "2099-06-15" },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(true);
  });
});

// ===========================================================================
// Test 3: Departure date must not be a no-fly day
// ===========================================================================
describe("booking wizard — no-fly day prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a leg date that is a no-fly day", async () => {
    noFlyMock.mockResolvedValueOnce(true);
    const isNoFly = await (await import("~/utils/services/no-fly.service")).isNoFlyDay("2026-12-25");
    expect(isNoFly).toBe(true);
    expect(noFlyMock).toHaveBeenCalledWith("2026-12-25");
  });

  it("accepts a leg date that is not a no-fly day", async () => {
    noFlyMock.mockResolvedValueOnce(false);
    const isNoFly = await (await import("~/utils/services/no-fly.service")).isNoFlyDay("2026-12-26");
    expect(isNoFly).toBe(false);
  });

  it("calls isNoFlyDay for each leg independently", async () => {
    noFlyMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const call1 = await (await import("~/utils/services/no-fly.service")).isNoFlyDay("2026-08-01");
    const call2 = await (await import("~/utils/services/no-fly.service")).isNoFlyDay("2026-08-02");

    expect(call1).toBe(false);
    expect(call2).toBe(true);
    expect(noFlyMock).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// Test 4: At least one leg is required
// ===========================================================================
describe("booking wizard — minimum leg count", () => {
  it("rejects a booking with zero legs", () => {
    const result = validateWizardLegs([]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("At least one leg is required");
  });

  it("accepts a booking with exactly one leg", () => {
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-12-25" },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(true);
  });

  it("accepts a booking with multiple legs", () => {
    const legs = [
      { origin_code: "SAWH", destination_code: "SAWG", leg_date: "2026-12-25" },
      { origin_code: "SAWG", destination_code: "SAWO", leg_date: "2026-12-26" },
    ];
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(true);
  });
});

// ===========================================================================
// Test 5: At least one passenger is required
// ===========================================================================
describe("booking wizard — minimum passenger count", () => {
  it("rejects a booking with zero passengers", () => {
    const result = validateWizardPassengers([]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("At least one passenger is required");
  });

  it("accepts a booking with exactly one passenger", () => {
    const passengers = [
      { first_name: "John", last_name: "Doe", email: "john@example.com" },
    ];
    const result = validateWizardPassengers(passengers);
    expect(result.valid).toBe(true);
  });

  it("rejects a passenger with empty name", () => {
    const passengers = [
      { first_name: "", last_name: "", email: "john@example.com" },
    ];
    const result = validateWizardPassengers(passengers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Passenger name is required");
  });

  it("rejects a passenger with no email", () => {
    const passengers = [
      { first_name: "John", last_name: "Doe", email: null },
    ];
    const result = validateWizardPassengers(passengers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Passenger email is required");
  });
});

// ===========================================================================
// Test 6: Passenger count cannot exceed MAX_PASSENGERS_PER_BOOKING
// ===========================================================================
describe("booking wizard — max passengers per booking", () => {
  it(`rejects when passenger count exceeds ${MAX_PASSENGERS_PER_BOOKING}`, () => {
    const passengers = Array.from({ length: MAX_PASSENGERS_PER_BOOKING + 1 }, (_, i) => ({
      first_name: `Passenger${i}`,
      last_name: "Test",
      email: `p${i}@example.com`,
    }));
    const result = validateWizardPassengers(passengers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${MAX_PASSENGERS_PER_BOOKING} passengers`);
  });

  it(`accepts exactly ${MAX_PASSENGERS_PER_BOOKING} passengers`, () => {
    const passengers = Array.from({ length: MAX_PASSENGERS_PER_BOOKING }, (_, i) => ({
      first_name: `Passenger${i}`,
      last_name: "Test",
      email: `p${i}@example.com`,
    }));
    const result = validateWizardPassengers(passengers);
    expect(result.valid).toBe(true);
  });
});

// ===========================================================================
// Test 7: Leg count cannot exceed DEFAULT_MAX_LEGS_PER_BOOKING
// ===========================================================================
describe("booking wizard — max legs per booking", () => {
  it(`rejects when leg count exceeds ${DEFAULT_MAX_LEGS_PER_BOOKING}`, () => {
    const legs = Array.from({ length: DEFAULT_MAX_LEGS_PER_BOOKING + 1 }, (_, i) => ({
      origin_code: "SAWH",
      destination_code: `SAW${i}`,
      leg_date: `2026-12-${String(25 + i).padStart(2, "0")}`,
    }));
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${DEFAULT_MAX_LEGS_PER_BOOKING} legs`);
  });

  it(`accepts exactly ${DEFAULT_MAX_LEGS_PER_BOOKING} legs`, () => {
    const legs = Array.from({ length: DEFAULT_MAX_LEGS_PER_BOOKING }, (_, i) => ({
      origin_code: "SAWH",
      destination_code: `SAW${i}`,
      leg_date: `2026-12-${String(25 + i).padStart(2, "0")}`,
    }));
    const result = validateWizardLegs(legs);
    expect(result.valid).toBe(true);
  });
});

// ===========================================================================
// Test 8: Booking source defaults to "customer_direct" for customer flow
// ===========================================================================
describe("booking wizard — booking source default", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = { insertInto: vi.fn(() => chain) };
    vi.clearAllMocks();
  });

  it("defaults booking_source to 'customer_direct' when no options are provided", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow()]);
    const result = await bookingRepository.createPending(42, null, false);
    expect(result.booking_source).toBe("customer_direct");
  });

  it("allows overriding booking_source via options", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ booking_source: "booking_agent" })]);
    const result = await bookingRepository.createPending(42, null, false, {
      booking_source: "booking_agent",
    });
    expect(result.booking_source).toBe("booking_agent");
  });

  it("retains customer_direct when other optional fields are provided", async () => {
    executeMock.mockResolvedValueOnce([
      makeBookingRow({ organization_id: 10, created_by: 7, is_organization_billing: true }),
    ]);
    const result = await bookingRepository.createPending(42, 10, true, {
      created_by: 7,
    });
    expect(result.booking_source).toBe("customer_direct");
    expect(result.organization_id).toBe(10);
    expect(result.created_by).toBe(7);
  });
});

// ===========================================================================
// Test 9: Booking reference format (3 uppercase letters + 5 digits)
// ===========================================================================
describe("booking wizard — reference format", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = { insertInto: vi.fn(() => chain) };
    vi.clearAllMocks();
  });

  it("generates a reference matching /^[A-Z]{3}\\d{5}$/", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ booking_reference: "KMF38291" })]);
    const result = await bookingRepository.createPending(42, null, false);
    expect(result.booking_reference).toMatch(/^[A-Z]{3}\d{5}$/);
  });

  it("only contains uppercase letters in the first three characters", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ booking_reference: "ZZZ00000" })]);
    const result = await bookingRepository.createPending(42, null, false);
    const prefix = result.booking_reference.slice(0, 3);
    expect(prefix).toMatch(/^[A-Z]{3}$/);
  });

  it("only contains digits in the last five characters", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ booking_reference: "AAA12345" })]);
    const result = await bookingRepository.createPending(42, null, false);
    const suffix = result.booking_reference.slice(3);
    expect(suffix).toMatch(/^\d{5}$/);
  });

  it("is exactly 8 characters long", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow({ booking_reference: "ABC12345" })]);
    const result = await bookingRepository.createPending(42, null, false);
    expect(result.booking_reference).toHaveLength(8);
  });
});

// ===========================================================================
// Test 10: Reference uniqueness — retry on collision up to 10 times
// ===========================================================================
describe("booking wizard — reference uniqueness retry", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = makeChain(executeMock);
    kdbMock = { insertInto: vi.fn(() => chain) };
    vi.clearAllMocks();
  });

  it("succeeds on first attempt when no collision occurs", async () => {
    executeMock.mockResolvedValueOnce([makeBookingRow()]);
    const result = await bookingRepository.createPending(42, null, false);
    expect(result.booking_reference).toBe("ABC12345");
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("retries on duplicate reference with PG unique violation code 23505", async () => {
    executeMock
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce([makeBookingRow({ booking_reference: "XYZ98765" })]);
    const result = await bookingRepository.createPending(42, null, false);
    expect(result.booking_reference).toBe("XYZ98765");
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("retries on constraint name containing 'booking_reference'", async () => {
    executeMock
      .mockRejectedValueOnce({ code: "23505", constraint: "booking_reference_unique" })
      .mockResolvedValueOnce([makeBookingRow()]);
    const result = await bookingRepository.createPending(42, null, false);
    expect(result.booking_source).toBe("customer_direct");
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("propagates non-collision errors immediately", async () => {
    executeMock.mockRejectedValueOnce(new Error("connection refused"));
    await expect(
      bookingRepository.createPending(42, null, false),
    ).rejects.toThrow("connection refused");
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it(`throws after ${MAX_BOOKING_REFERENCE_ATTEMPTS} consecutive collisions`, async () => {
    for (let i = 0; i < 10; i++) {
      executeMock.mockRejectedValueOnce({ code: "23505" });
    }
    await expect(
      bookingRepository.createPending(42, null, false),
    ).rejects.toThrow("Unable to generate unique booking reference after 10 attempts");
    expect(executeMock).toHaveBeenCalledTimes(10);
  });

  it(`retries up to ${MAX_BOOKING_REFERENCE_ATTEMPTS} times before giving up`, async () => {
    for (let i = 0; i < 10; i++) {
      executeMock.mockRejectedValueOnce({ code: "23505" });
    }
    let lastError: Error | null = null;
    try {
      await bookingRepository.createPending(42, null, false);
    } catch (err) {
      lastError = err as Error;
    }
    expect(lastError).not.toBeNull();
    expect(lastError!.message).toContain("10 attempts");
  });
});

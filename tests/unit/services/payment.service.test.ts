import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock state (runs before vi.mock factories)
// ---------------------------------------------------------------------------

const {
  sqlExecuteMock,
  mockBookingRepo,
  mockStripePaymentRepo,
  mockAccountingRepo,
  mockResolveAccountId,
  mockStripeCheckoutCreate,
} = vi.hoisted(() => {
  const mockBookingRepoH = {
    updatePayment: vi.fn(),
    findById: vi.fn(),
  };

  const mockStripePaymentRepoH = {
    findBySessionId: vi.fn(),
    updateStatus: vi.fn(),
    create: vi.fn(),
  };

  const mockAccountingRepoH = {
    createEntry: vi.fn(),
    createLine: vi.fn(),
  };

  return {
    sqlExecuteMock: vi.fn(() => ({ rows: [] })),
    mockBookingRepo: mockBookingRepoH,
    mockStripePaymentRepo: mockStripePaymentRepoH,
    mockAccountingRepo: mockAccountingRepoH,
    mockResolveAccountId: vi.fn(),
    mockStripeCheckoutCreate: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("~/utils/db.server", () => ({
  get kdb() {
    return kdbMock;
  },
}));

vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: vi.fn(() => ({
      execute: sqlExecuteMock,
    })),
  };
});

vi.mock("~/utils/repositories/booking", () => ({
  bookingRepository: mockBookingRepo,
}));

vi.mock("~/utils/repositories/stripe-payment", () => ({
  stripePaymentRepository: mockStripePaymentRepo,
}));

vi.mock("~/utils/repositories/accounting-entry", () => ({
  accountingEntryRepository: mockAccountingRepo,
  resolveAccountId: mockResolveAccountId,
}));

vi.mock("~/utils/repositories/booking-passenger", () => ({
  bookingPassengerRepository: { findByBookingId: vi.fn(() => []) },
}));

vi.mock("~/utils/repositories/payment-method", () => ({
  paymentMethodRepository: { findAll: vi.fn(() => []), findByCode: vi.fn() },
}));

vi.mock("~/utils/repositories/invoice", () => ({
  invoiceRepository: { generateNumber: vi.fn(), create: vi.fn() },
}));

vi.mock("~/utils/repositories/invoice-item", () => ({
  invoiceItemRepository: { create: vi.fn() },
}));

vi.mock("~/utils/repositories/booking-leg", () => ({
  bookingLegRepository: { findByBookingId: vi.fn(() => []) },
}));

vi.mock("~/utils/repositories/booking-leg-passenger", () => ({
  bookingLegPassengerRepository: { findByBookingId: vi.fn(() => []) },
}));

vi.mock("~/utils/repositories/fare-route", () => ({
  fareRouteRepository: { getBaseFare: vi.fn(() => null) },
}));

vi.mock("~/utils/stripe.server", () => ({
  getStripe: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mockStripeCheckoutCreate,
      },
    },
  })),
}));

import {
  handleStripeSuccess,
  initiateStripePayment,
  recordManualPayment,
} from "~/utils/services/payment.service";

// ---------------------------------------------------------------------------
// kdbMock — mutable, replaced in beforeEach
// ---------------------------------------------------------------------------

let kdbMock: Record<string, unknown> = {};

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

function buildChain(executeMock: ReturnType<typeof vi.fn>) {
  const chain: Record<string, unknown> = { execute: executeMock };
  for (const m of CHAIN_METHODS) {
    chain[m] = vi.fn(() => chain);
  }
  return chain;
}

// ===========================================================================
// handleStripeSuccess
// ===========================================================================

describe("handleStripeSuccess()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn().mockResolvedValue([]);
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      insertInto: vi.fn(() => chain),
      updateTable: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  const stripePaymentFixture = {
    id: "sp-1",
    payment_id: 100,
    amount_gbp: 250,
    payment: { booking_id: 5 },
  };

  it("processes a successful Stripe payment and creates accounting entries", async () => {
    mockStripePaymentRepo.findBySessionId.mockResolvedValueOnce(stripePaymentFixture);
    mockStripePaymentRepo.updateStatus.mockResolvedValueOnce(null);
    mockBookingRepo.updatePayment.mockResolvedValueOnce(null);
    mockAccountingRepo.createEntry.mockResolvedValueOnce({ id: "entry-1" });
    mockResolveAccountId.mockResolvedValueOnce("acc-1020");
    mockResolveAccountId.mockResolvedValueOnce("acc-4010");
    mockAccountingRepo.createLine.mockResolvedValue(null);

    const result = await handleStripeSuccess({
      sessionId: "cs_test_123",
      paymentIntentId: "pi_456",
      userId: 1,
    });

    expect(result.success).toBe(true);
    expect(result.paymentId).toBe("100");
    expect(mockStripePaymentRepo.findBySessionId).toHaveBeenCalledWith("cs_test_123");
    expect(mockStripePaymentRepo.updateStatus).toHaveBeenCalledWith("sp-1", "succeeded", "pi_456");
    expect(mockBookingRepo.updatePayment).toHaveBeenCalledWith(5, { payment_status: "paid" });
    expect(mockAccountingRepo.createEntry).toHaveBeenCalledTimes(1);
    expect(mockAccountingRepo.createLine).toHaveBeenCalledTimes(2);
  });

  it("returns error when Stripe payment record is not found", async () => {
    mockStripePaymentRepo.findBySessionId.mockResolvedValueOnce(null);

    const result = await handleStripeSuccess({
      sessionId: "cs_test_nonexistent",
      paymentIntentId: "pi_456",
      userId: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Stripe payment record not found");
  });

  it("still succeeds when booking has no booking_id on payment relation", async () => {
    const spWithoutBooking = { ...stripePaymentFixture, payment: null };
    mockStripePaymentRepo.findBySessionId.mockResolvedValueOnce(spWithoutBooking);
    mockStripePaymentRepo.updateStatus.mockResolvedValueOnce(null);
    mockAccountingRepo.createEntry.mockResolvedValueOnce({ id: "entry-2" });
    mockResolveAccountId.mockResolvedValueOnce("acc-1020");
    mockResolveAccountId.mockResolvedValueOnce("acc-4010");
    mockAccountingRepo.createLine.mockResolvedValue(null);

    const result = await handleStripeSuccess({
      sessionId: "cs_test_nobooking",
      paymentIntentId: "pi_789",
      userId: 2,
    });

    expect(result.success).toBe(true);
    expect(mockBookingRepo.updatePayment).not.toHaveBeenCalled();
  });

  it("catches and returns errors gracefully", async () => {
    mockStripePaymentRepo.findBySessionId.mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const result = await handleStripeSuccess({
      sessionId: "cs_test_fail",
      paymentIntentId: "pi_fail",
      userId: 3,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Database connection failed");
  });

  it("catches non-Error throws and returns 'Unknown error'", async () => {
    mockStripePaymentRepo.findBySessionId.mockRejectedValueOnce("string error");

    const result = await handleStripeSuccess({
      sessionId: "cs_test_str",
      paymentIntentId: "pi_str",
      userId: 4,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown error");
  });
});

// ===========================================================================
// initiateStripePayment
// ===========================================================================

describe("initiateStripePayment()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn().mockResolvedValue([]);
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      insertInto: vi.fn(() => chain),
      updateTable: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("initiates a Stripe checkout session and stores payment record", async () => {
    mockBookingRepo.updatePayment.mockResolvedValueOnce(null);
    executeMock.mockResolvedValueOnce([{ id: 42 }]);
    mockStripeCheckoutCreate.mockResolvedValueOnce({
      id: "cs_live_abc",
      url: "https://checkout.stripe.com/pay/cs_live_abc",
    });
    mockStripePaymentRepo.create.mockResolvedValueOnce(null);

    const result = await initiateStripePayment({
      bookingId: 10,
      amount: 150,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      customerEmail: "test@example.com",
      metadata: { source: "web" },
      userId: 7,
    });

    expect(result.success).toBe(true);
    expect(result.paymentId).toBe("42");
    expect(result.stripeSessionUrl).toBe("https://checkout.stripe.com/pay/cs_live_abc");
    expect(mockBookingRepo.updatePayment).toHaveBeenCalledWith(10, expect.objectContaining({
      total_amount_gbp: 150,
      payment_method: "stripe",
    }));
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer_email: "test@example.com",
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("booking_10_"),
      })
    );
  });

  it("returns error when Stripe session creation fails", async () => {
    mockBookingRepo.updatePayment.mockResolvedValueOnce(null);
    executeMock.mockResolvedValueOnce([{ id: 43 }]);
    mockStripeCheckoutCreate.mockRejectedValueOnce(new Error("Stripe API error"));

    const result = await initiateStripePayment({
      bookingId: 11,
      amount: 200,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      userId: 7,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Stripe API error");
  });

  it("returns error when booking payment update fails", async () => {
    mockBookingRepo.updatePayment.mockRejectedValueOnce(new Error("Booking not found"));

    const result = await initiateStripePayment({
      bookingId: 99999,
      amount: 100,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      userId: 7,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Booking not found");
  });

  it("rolls back booking status when stripe_payment DB insert fails", async () => {
    mockBookingRepo.updatePayment
      .mockResolvedValueOnce(null)   // initial: set payment_status=PROCESSING
      .mockResolvedValueOnce(null);  // rollback: set payment_status=PENDING
    executeMock.mockResolvedValueOnce([{ id: 44 }]);
    mockStripeCheckoutCreate.mockResolvedValueOnce({
      id: "cs_live_rollback",
      url: "https://checkout.stripe.com/pay/rollback",
    });
    mockStripePaymentRepo.create.mockRejectedValueOnce(new Error("FK constraint"));

    const result = await initiateStripePayment({
      bookingId: 12,
      amount: 300,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      userId: 7,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Payment record could not be saved. Please try again.");
    expect(mockBookingRepo.updatePayment).toHaveBeenCalledWith(12, { payment_status: "pending" });
  });

  it("works without optional customerEmail and metadata", async () => {
    mockBookingRepo.updatePayment.mockResolvedValueOnce(null);
    executeMock.mockResolvedValueOnce([{ id: 45 }]);
    mockStripeCheckoutCreate.mockResolvedValueOnce({
      id: "cs_live_min",
      url: null,
    });
    mockStripePaymentRepo.create.mockResolvedValueOnce(null);

    const result = await initiateStripePayment({
      bookingId: 13,
      amount: 50,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      userId: 7,
    });

    expect(result.success).toBe(true);
    expect(result.stripeSessionUrl).toBeUndefined();
  });
});

// ===========================================================================
// recordManualPayment
// ===========================================================================

describe("recordManualPayment()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn().mockResolvedValue([]);
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      insertInto: vi.fn(() => chain),
      updateTable: vi.fn(() => chain),
    };
    vi.clearAllMocks();
  });

  it("records a manual payment and creates accounting entries", async () => {
    mockBookingRepo.updatePayment.mockResolvedValueOnce(null);
    mockAccountingRepo.createEntry.mockResolvedValueOnce({ id: "entry-manual-1" });
    mockResolveAccountId.mockResolvedValueOnce("acc-1010");
    mockResolveAccountId.mockResolvedValueOnce("acc-4010");
    mockAccountingRepo.createLine.mockResolvedValue(null);

    const result = await recordManualPayment({
      bookingId: 20,
      amount: 500,
      methodCode: "cash",
      notes: "Paid at counter",
      userId: 8,
    });

    expect(result.success).toBe(true);
    expect(result.paymentId).toBe("entry-manual-1");
    expect(mockBookingRepo.updatePayment).toHaveBeenCalledWith(20, expect.objectContaining({
      total_amount_gbp: 500,
      payment_status: "paid",
      payment_method: "cash",
    }));
    expect(mockAccountingRepo.createEntry).toHaveBeenCalledWith(expect.objectContaining({
      entry_type: "payment",
      booking_id: "20",
    }));
    expect(mockAccountingRepo.createLine).toHaveBeenCalledTimes(2);
  });

  it("uses default description when notes are not provided", async () => {
    mockBookingRepo.updatePayment.mockResolvedValueOnce(null);
    mockAccountingRepo.createEntry.mockResolvedValueOnce({ id: "entry-manual-2" });
    mockResolveAccountId.mockResolvedValueOnce("acc-1010");
    mockResolveAccountId.mockResolvedValueOnce("acc-4010");
    mockAccountingRepo.createLine.mockResolvedValue(null);

    await recordManualPayment({
      bookingId: 21,
      amount: 300,
      methodCode: "bank_transfer",
      userId: 8,
    });

    expect(mockAccountingRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Manual payment via bank_transfer",
      })
    );
  });

  it("returns error when booking update fails", async () => {
    mockBookingRepo.updatePayment.mockRejectedValueOnce(new Error("Booking locked"));

    const result = await recordManualPayment({
      bookingId: 22,
      amount: 100,
      methodCode: "cash",
      userId: 8,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Booking locked");
  });

  it("returns error when accounting entry creation fails", async () => {
    mockBookingRepo.updatePayment.mockResolvedValueOnce(null);
    mockAccountingRepo.createEntry.mockRejectedValueOnce(new Error("Chart of accounts missing"));

    const result = await recordManualPayment({
      bookingId: 23,
      amount: 200,
      methodCode: "card",
      userId: 8,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Chart of accounts missing");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock state (runs before vi.mock factories)
// ---------------------------------------------------------------------------

const {
  sqlExecuteMock,
  mockCreateAuditLogEntry,
  mockValidateApproval,
  mockBookingRepo,
  mockBookingLegRepo,
  mockBookingPassengerRepo,
  mockBookingLegPassengerRepo,
  mockFareRouteRepo,
  mockInvoiceRepo,
  mockInvoiceItemRepo,
  mockAccountingRepo,
  mockResolveAccountId,
} = vi.hoisted(() => {
  const mockBookingRepoH = { findById: vi.fn(), updatePayment: vi.fn() };
  const mockBookingLegRepoH = { findByBookingId: vi.fn() };
  const mockBookingPassengerRepoH = { findByBookingId: vi.fn() };
  const mockBookingLegPassengerRepoH = { findByBookingId: vi.fn() };
  const mockFareRouteRepoH = { getBaseFare: vi.fn() };
  const mockInvoiceRepoH = {
    generateNumber: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByBooking: vi.fn(),
    updateStatus: vi.fn(),
    updatePayment: vi.fn(),
  };
  const mockInvoiceItemRepoH = { create: vi.fn(), findByInvoice: vi.fn() };
  const mockAccountingRepoH = {
    createEntry: vi.fn(),
    createLine: vi.fn(),
    findLinesByEntryId: vi.fn(),
    findByInvoice: vi.fn(),
  };
  const mockResolveAccountIdH = vi.fn();

  return {
    sqlExecuteMock: vi.fn(() => ({ rows: [] })),
    mockCreateAuditLogEntry: vi.fn(),
    mockValidateApproval: vi.fn(),
    mockBookingRepo: mockBookingRepoH,
    mockBookingLegRepo: mockBookingLegRepoH,
    mockBookingPassengerRepo: mockBookingPassengerRepoH,
    mockBookingLegPassengerRepo: mockBookingLegPassengerRepoH,
    mockFareRouteRepo: mockFareRouteRepoH,
    mockInvoiceRepo: mockInvoiceRepoH,
    mockInvoiceItemRepo: mockInvoiceItemRepoH,
    mockAccountingRepo: mockAccountingRepoH,
    mockResolveAccountId: mockResolveAccountIdH,
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

vi.mock("~/utils/permissions.server", () => ({
  createAuditLogEntry: mockCreateAuditLogEntry,
  validateApproval: mockValidateApproval,
}));

vi.mock("~/utils/repositories/booking", () => ({
  bookingRepository: mockBookingRepo,
}));

vi.mock("~/utils/repositories/booking-leg", () => ({
  bookingLegRepository: mockBookingLegRepo,
}));

vi.mock("~/utils/repositories/booking-passenger", () => ({
  bookingPassengerRepository: mockBookingPassengerRepo,
}));

vi.mock("~/utils/repositories/booking-leg-passenger", () => ({
  bookingLegPassengerRepository: mockBookingLegPassengerRepo,
}));

vi.mock("~/utils/repositories/fare-route", () => ({
  fareRouteRepository: mockFareRouteRepo,
}));

vi.mock("~/utils/repositories/invoice", () => ({
  invoiceRepository: mockInvoiceRepo,
}));

vi.mock("~/utils/repositories/invoice-item", () => ({
  invoiceItemRepository: mockInvoiceItemRepo,
}));

vi.mock("~/utils/repositories/accounting-entry", () => ({
  accountingEntryRepository: mockAccountingRepo,
  resolveAccountId: mockResolveAccountId,
}));

vi.mock("~/utils/repositories/payment-method", () => ({
  paymentMethodRepository: { findAll: vi.fn(() => []), findByCode: vi.fn() },
}));

vi.mock("~/utils/repositories/stripe-payment", () => ({
  stripePaymentRepository: {
    findBySessionId: vi.fn(),
    updateStatus: vi.fn(),
    create: vi.fn(),
  },
}));

import {
  generateInvoice,
  issueInvoice,
  recordPaymentAgainstInvoice,
  cancelInvoice,
} from "~/utils/services/invoice.service";

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

function setupKdbMock() {
  const executeMock = vi.fn().mockResolvedValue([]);
  const chain = buildChain(executeMock);
  kdbMock = {
    selectFrom: vi.fn(() => chain),
    insertInto: vi.fn(() => chain),
    updateTable: vi.fn(() => chain),
    transaction: vi.fn(() => ({
      execute: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        await fn(kdbMock);
      }),
    })),
    fn: {
      countAll: vi.fn(() => ({ as: vi.fn(() => "count") })),
    },
  };
  return executeMock;
}

// ===========================================================================
// generateInvoice
// ===========================================================================

describe("generateInvoice()", () => {
  beforeEach(() => {
    setupKdbMock();
    vi.clearAllMocks();
  });

  const bookingFixture = { id: 100, booking_reference: "FIG-ABC", status: "confirmed" };
  const passengerFixture = { id: 1, first_name: "John", last_name: "Doe", email: "john@example.com" };
  const legFixture = { id: 10, origin_code: "MPN", destination_code: "PSY", leg_date: "2026-08-01" };

  it("generates an invoice with fare line items from booking data", async () => {
    mockBookingRepo.findById.mockResolvedValueOnce(bookingFixture);
    mockBookingLegRepo.findByBookingId.mockResolvedValueOnce([legFixture]);
    mockBookingPassengerRepo.findByBookingId.mockResolvedValueOnce([passengerFixture]);
    mockBookingLegPassengerRepo.findByBookingId.mockResolvedValueOnce([]);
    mockFareRouteRepo.getBaseFare.mockResolvedValueOnce(75);
    mockInvoiceRepo.generateNumber.mockResolvedValueOnce("INV-2026-000001");
    mockInvoiceRepo.create.mockResolvedValueOnce({
      id: "inv-1",
      invoice_number: "INV-2026-000001",
      total_gbp: 75,
    });
    mockInvoiceItemRepo.create.mockResolvedValue(null);
    mockInvoiceItemRepo.findByInvoice.mockResolvedValueOnce([]);
    mockCreateAuditLogEntry.mockResolvedValueOnce(undefined);

    const result = await generateInvoice({ bookingId: "100", userId: "5" });

    expect(result.success).toBe(true);
    expect(result.invoice).toBeDefined();
    expect(mockBookingRepo.findById).toHaveBeenCalledWith(100);
    expect(mockInvoiceRepo.create).toHaveBeenCalledTimes(1);
    expect(mockInvoiceItemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_id: "inv-1",
        description: "Fare — John Doe",
        quantity: 1,
        unit_price_gbp: 75,
        type: "fare",
      })
    );
  });

  it("generates freight line items when freight weight is present", async () => {
    mockBookingRepo.findById.mockResolvedValueOnce(bookingFixture);
    mockBookingLegRepo.findByBookingId.mockResolvedValueOnce([legFixture]);
    mockBookingPassengerRepo.findByBookingId.mockResolvedValueOnce([passengerFixture]);
    mockBookingLegPassengerRepo.findByBookingId.mockResolvedValueOnce([
      { booking_leg_id: 10, freight_weight_kg: 5 },
    ]);
    mockFareRouteRepo.getBaseFare.mockResolvedValueOnce(50);
    mockInvoiceRepo.generateNumber.mockResolvedValueOnce("INV-2026-000002");
    mockInvoiceRepo.create.mockResolvedValueOnce({
      id: "inv-2",
      invoice_number: "INV-2026-000002",
      total_gbp: 60,
    });
    mockInvoiceItemRepo.create.mockResolvedValue(null);
    mockInvoiceItemRepo.findByInvoice.mockResolvedValueOnce([]);
    mockCreateAuditLogEntry.mockResolvedValueOnce(undefined);

    const result = await generateInvoice({ bookingId: "100", userId: "5" });

    expect(result.success).toBe(true);
    const freightCalls = mockInvoiceItemRepo.create.mock.calls.filter(
      (call: Record<string, unknown>[]) => (call[0] as Record<string, unknown>).type === "freight"
    );
    expect(freightCalls.length).toBe(1);
    expect(freightCalls[0][0]).toMatchObject({ quantity: 1, unit_price_gbp: 10 });
  });

  it("returns error when booking is not found", async () => {
    mockBookingRepo.findById.mockResolvedValueOnce(null);

    const result = await generateInvoice({ bookingId: "999", userId: "5" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Booking not found");
  });

  it("catches and returns internal errors", async () => {
    mockBookingRepo.findById.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await generateInvoice({ bookingId: "100", userId: "5" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("DB connection lost");
  });
});

// ===========================================================================
// issueInvoice
// ===========================================================================

describe("issueInvoice()", () => {
  beforeEach(() => {
    setupKdbMock();
    vi.clearAllMocks();
  });

  const draftInvoice = {
    id: "inv-1",
    invoice_number: "INV-2026-000001",
    status: "draft",
    total_gbp: 500,
    booking_id: "10",
  };

  const issuedInvoice = { ...draftInvoice, status: "issued" };

  it("issues a draft invoice and creates accounting journal entry", async () => {
    mockInvoiceRepo.findById
      .mockResolvedValueOnce(draftInvoice)
      .mockResolvedValueOnce(issuedInvoice);
    mockInvoiceRepo.updateStatus.mockResolvedValueOnce(null);
    mockAccountingRepo.createEntry.mockResolvedValueOnce({ id: "entry-1" });
    mockResolveAccountId.mockResolvedValueOnce("acc-1020");
    mockResolveAccountId.mockResolvedValueOnce("acc-4010");
    mockAccountingRepo.createLine.mockResolvedValue(null);
    mockCreateAuditLogEntry.mockResolvedValueOnce(undefined);

    const result = await issueInvoice({ invoiceId: "inv-1", userId: "5" });

    expect(result.success).toBe(true);
    expect(result.invoice).toBeDefined();
    expect(mockInvoiceRepo.updateStatus).toHaveBeenCalledWith("inv-1", "issued");
    expect(mockAccountingRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: "invoice_issued", invoice_id: "inv-1" }),
      kdbMock
    );
    expect(mockAccountingRepo.createLine).toHaveBeenCalledTimes(2);
    expect(mockCreateAuditLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "invoice.issued", entityType: "invoice" })
    );
  });

  it("returns error when invoice is not found", async () => {
    mockInvoiceRepo.findById.mockResolvedValueOnce(null);

    const result = await issueInvoice({ invoiceId: "inv-nonexistent", userId: "5" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invoice not found");
  });

  it("returns error when invoice is not in draft status", async () => {
    mockInvoiceRepo.findById.mockResolvedValueOnce({ ...draftInvoice, status: "paid" });

    const result = await issueInvoice({ invoiceId: "inv-1", userId: "5" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot be issued from status");
  });

  it("catches errors during journal entry creation", async () => {
    mockInvoiceRepo.findById.mockResolvedValueOnce(draftInvoice);
    mockInvoiceRepo.updateStatus.mockResolvedValueOnce(null);
    mockAccountingRepo.createEntry.mockRejectedValueOnce(new Error("Account not found"));

    const result = await issueInvoice({ invoiceId: "inv-1", userId: "5" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Account not found");
  });
});

// ===========================================================================
// recordPaymentAgainstInvoice
// ===========================================================================

describe("recordPaymentAgainstInvoice()", () => {
  beforeEach(() => {
    setupKdbMock();
    vi.clearAllMocks();
  });

  const partiallyPaidInvoice = {
    id: "inv-1",
    invoice_number: "INV-2026-000001",
    status: "partially_paid",
    total_gbp: 500,
    booking_id: "10",
  };

  const fullyPaidInvoice = { ...partiallyPaidInvoice, status: "paid" };

  it("creates accounting entry when invoice becomes fully paid", async () => {
    mockInvoiceRepo.updatePayment.mockResolvedValueOnce(fullyPaidInvoice);
    mockAccountingRepo.createEntry.mockResolvedValueOnce({ id: "entry-pay-1" });
    mockResolveAccountId.mockResolvedValueOnce("acc-1010");
    mockResolveAccountId.mockResolvedValueOnce("acc-1020");
    mockAccountingRepo.createLine.mockResolvedValue(null);
    mockCreateAuditLogEntry.mockResolvedValueOnce(undefined);

    const result = await recordPaymentAgainstInvoice({
      invoiceId: "inv-1",
      paymentId: "pay-1",
      amountGbp: 500,
      userId: "5",
    });

    expect(result.success).toBe(true);
    expect(mockAccountingRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: "invoice_payment", invoice_id: "inv-1" }),
      kdbMock
    );
    expect(mockResolveAccountId).toHaveBeenCalledWith("1010");
    expect(mockResolveAccountId).toHaveBeenCalledWith("1020");
    expect(mockAccountingRepo.createLine).toHaveBeenCalledTimes(2);
  });

  it("does not create accounting entry when invoice is not fully paid", async () => {
    mockInvoiceRepo.updatePayment.mockResolvedValueOnce(partiallyPaidInvoice);
    mockCreateAuditLogEntry.mockResolvedValueOnce(undefined);

    const result = await recordPaymentAgainstInvoice({
      invoiceId: "inv-1",
      paymentId: "pay-2",
      amountGbp: 200,
      userId: "5",
    });

    expect(result.success).toBe(true);
    expect(mockAccountingRepo.createEntry).not.toHaveBeenCalled();
    expect(mockCreateAuditLogEntry).toHaveBeenCalled();
  });

  it("returns error when invoice is not found", async () => {
    mockInvoiceRepo.updatePayment.mockResolvedValueOnce(null);

    const result = await recordPaymentAgainstInvoice({
      invoiceId: "inv-nonexistent",
      paymentId: "pay-3",
      amountGbp: 100,
      userId: "5",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invoice not found");
  });

  it("catches errors during accounting entry creation", async () => {
    mockInvoiceRepo.updatePayment.mockResolvedValueOnce(fullyPaidInvoice);
    mockAccountingRepo.createEntry.mockRejectedValueOnce(new Error("Journal entry creation failed"));

    const result = await recordPaymentAgainstInvoice({
      invoiceId: "inv-1",
      paymentId: "pay-4",
      amountGbp: 500,
      userId: "5",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Journal entry creation failed");
  });
});

// ===========================================================================
// cancelInvoice
// ===========================================================================

describe("cancelInvoice()", () => {
  beforeEach(() => {
    setupKdbMock();
    vi.clearAllMocks();
  });

  const issuedInvoice = {
    id: "inv-1",
    invoice_number: "INV-2026-000001",
    status: "issued",
    total_gbp: 300,
  };

  const draftInvoice = { ...issuedInvoice, status: "draft" };

  it("cancels a draft invoice without creating reversing entries", async () => {
    mockInvoiceRepo.findById.mockResolvedValueOnce(draftInvoice);
    mockInvoiceRepo.updateStatus.mockResolvedValueOnce(null);
    mockCreateAuditLogEntry.mockResolvedValueOnce(undefined);

    const result = await cancelInvoice({ invoiceId: "inv-1", userId: "5", reason: "Duplicate invoice" });

    expect(result.success).toBe(true);
    expect(mockInvoiceRepo.updateStatus).toHaveBeenCalledWith("inv-1", "cancelled");
    expect(mockAccountingRepo.findByInvoice).not.toHaveBeenCalled();
    expect(mockCreateAuditLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invoice.cancelled",
        oldValues: expect.objectContaining({ status: "draft" }),
        newValues: expect.objectContaining({ status: "cancelled", reason: "Duplicate invoice" }),
      })
    );
  });

  it("cancels an issued invoice and creates reversing journal entries", async () => {
    mockInvoiceRepo.findById.mockResolvedValueOnce(issuedInvoice);
    mockInvoiceRepo.updateStatus.mockResolvedValueOnce(null);
    mockAccountingRepo.findByInvoice.mockResolvedValueOnce([
      { id: "entry-1", entry_number: "INV-123" },
    ]);
    mockAccountingRepo.findLinesByEntryId.mockResolvedValueOnce([
      { id: "line-1", account_id: "acc-1020", debit_amount_gbp: 300, credit_amount_gbp: 0, description: "Accounts Receivable" },
      { id: "line-2", account_id: "acc-4010", debit_amount_gbp: 0, credit_amount_gbp: 300, description: "Revenue" },
    ]);
    mockAccountingRepo.createEntry.mockResolvedValueOnce({ id: "rev-entry-1" });
    mockAccountingRepo.createLine.mockResolvedValue(null);
    mockCreateAuditLogEntry.mockResolvedValueOnce(undefined);

    const result = await cancelInvoice({ invoiceId: "inv-1", userId: "5", reason: "Customer requested cancellation" });

    expect(result.success).toBe(true);
    expect(mockAccountingRepo.findByInvoice).toHaveBeenCalledWith("inv-1");
    expect(mockAccountingRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: "adjustment", invoice_id: "inv-1" })
    );
    expect(mockAccountingRepo.createLine).toHaveBeenCalledTimes(2);
    // Reversing lines swap debits/credits
    expect(mockAccountingRepo.createLine).toHaveBeenCalledWith(
      expect.objectContaining({ debit_amount_gbp: 0, credit_amount_gbp: 300 })
    );
    expect(mockAccountingRepo.createLine).toHaveBeenCalledWith(
      expect.objectContaining({ debit_amount_gbp: 300, credit_amount_gbp: 0 })
    );
  });

  it("returns error when invoice is not found", async () => {
    mockInvoiceRepo.findById.mockResolvedValueOnce(null);

    const result = await cancelInvoice({ invoiceId: "inv-nonexistent", userId: "5" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invoice not found");
  });
});

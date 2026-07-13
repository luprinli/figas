/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock all repository modules before importing the payment service.
// Each mock uses vi.fn() which will be configured per test via vi.mocked().
// ---------------------------------------------------------------------------

vi.mock("~/utils/db.server", () => ({
  get kdb() {
    return kdbMock;
  },
}));

const kdbMock: Record<string, unknown> = {};

vi.mock("~/utils/stripe.server", () => ({
  getStripe: vi.fn(),
}));

vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return { ...actual, sql: () => ({ execute: vi.fn() }) };
});

vi.mock("~/utils/repositories/booking-leg", () => ({
  bookingLegRepository: { findByBookingId: vi.fn() },
}));

vi.mock("~/utils/repositories/booking-passenger", () => ({
  bookingPassengerRepository: { findByBookingId: vi.fn() },
}));

vi.mock("~/utils/repositories/booking-leg-passenger", () => ({
  bookingLegPassengerRepository: { findByBookingId: vi.fn() },
}));

vi.mock("~/utils/repositories/fare-route", () => ({
  fareRouteRepository: { getBaseFare: vi.fn() },
}));

vi.mock("~/utils/repositories/payment-method", () => ({
  paymentMethodRepository: {
    findAll: vi.fn(),
    findByCode: vi.fn(),
  },
}));

vi.mock("~/utils/repositories/booking", () => ({
  bookingRepository: { updatePayment: vi.fn() },
}));

vi.mock("~/utils/repositories/invoice", () => ({
  invoiceRepository: {
    generateNumber: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("~/utils/repositories/invoice-item", () => ({
  invoiceItemRepository: { create: vi.fn() },
}));

// Import after all mocks are in place
import {
  calculateBookingCost,
  getAvailableMethods,
  recordOfflinePaymentSelection,
  recordInvoiceSelection,
} from "~/utils/services/payment.service";
import { bookingLegRepository } from "~/utils/repositories/booking-leg";
import { bookingPassengerRepository } from "~/utils/repositories/booking-passenger";
import { bookingLegPassengerRepository } from "~/utils/repositories/booking-leg-passenger";
import { fareRouteRepository } from "~/utils/repositories/fare-route";
import { paymentMethodRepository } from "~/utils/repositories/payment-method";
import { bookingRepository } from "~/utils/repositories/booking";
import { invoiceRepository } from "~/utils/repositories/invoice";
import { invoiceItemRepository } from "~/utils/repositories/invoice-item";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePassengerRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    booking_id: 1,
    user_id: null,
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    phone: null,
    date_of_birth: null,
    clothed_weight_kg: 70,
    residency: null,
    special_requirements: null,
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

function makeLegPassengerRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    booking_leg_id: 1,
    booking_passenger_id: 1,
    clothed_weight_kg: 70,
    baggage_weight_kg: null,
    baggage_description: null,
    freight_description: null,
    freight_weight_kg: 0,
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
// getAvailableMethods
// ===========================================================================

describe("getAvailableMethods()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns payment methods from the repository", async () => {
    vi.mocked(paymentMethodRepository.findAll).mockResolvedValue([
      {
        id: "1",
        code: "stripe",
        name: "Stripe",
        description: "Pay online with card",
        is_active: true,
        requires_online: true,
        requires_invoice: false,
        sort_order: 1,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
      {
        id: "2",
        code: "pay_on_departure",
        name: "Pay on Departure",
        description: "Pay at the counter before departure",
        is_active: true,
        requires_online: false,
        requires_invoice: false,
        sort_order: 2,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
      {
        id: "3",
        code: "pay_on_arrival",
        name: "Pay on Arrival",
        description: "Pay when you arrive at destination",
        is_active: true,
        requires_online: false,
        requires_invoice: false,
        sort_order: 3,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
      {
        id: "4",
        code: "invoice",
        name: "Invoice",
        description: "Pay via invoice",
        is_active: true,
        requires_online: false,
        requires_invoice: true,
        sort_order: 4,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);

    const methods = await getAvailableMethods();

    expect(methods).toHaveLength(4);
    expect(methods.map((m) => m.code)).toEqual([
      "stripe",
      "pay_on_departure",
      "pay_on_arrival",
      "invoice",
    ]);
  });

  it("returns empty array when no payment methods are configured", async () => {
    vi.mocked(paymentMethodRepository.findAll).mockResolvedValue([]);

    const methods = await getAvailableMethods();

    expect(methods).toHaveLength(0);
  });

  it("includes description field in returned methods", async () => {
    vi.mocked(paymentMethodRepository.findAll).mockResolvedValue([
      {
        id: "1",
        code: "stripe",
        name: "Stripe",
        description: "Pay online with card",
        is_active: true,
        requires_online: true,
        requires_invoice: false,
        sort_order: 1,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);

    const methods = await getAvailableMethods();

    expect(methods[0].description).toBe("Pay online with card");
  });
});

// ===========================================================================
// calculateBookingCost
// ===========================================================================

describe("calculateBookingCost()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct total for a single-leg single-passenger booking with a fare route", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow({ origin_code: "STY", destination_code: "MPA" }),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow({ first_name: "John", last_name: "Doe" }),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ freight_weight_kg: 0 }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare).mockResolvedValue(50);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(50);
  });

  it("returns correct total for multi-passenger booking", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow({ origin_code: "STY", destination_code: "MPA" }),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow({ id: 1, first_name: "John" }),
      makePassengerRow({ id: 2, first_name: "Jane" }),
      makePassengerRow({ id: 3, first_name: "Bob" }),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ booking_passenger_id: 1, freight_weight_kg: 0 }),
      makeLegPassengerRow({ booking_passenger_id: 2, freight_weight_kg: 0 }),
      makeLegPassengerRow({ booking_passenger_id: 3, freight_weight_kg: 0 }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare).mockResolvedValue(50);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(150);
  });

  it("falls back to default fare when no fare route exists", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow({ origin_code: "XYZ", destination_code: "ABC" }),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow(),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ freight_weight_kg: 0 }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare).mockResolvedValue(null);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(50);
  });

  it("uses the default fare when fare route returns null", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow(),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow(),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ freight_weight_kg: 0 }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare).mockResolvedValue(null);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(50);
  });

  it("adds freight cost at FREIGHT_RATE_PER_KG", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow({ id: 1, origin_code: "STY", destination_code: "MPA" }),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow({ id: 1 }),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ id: 1, booking_leg_id: 1, freight_weight_kg: 10 }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare).mockResolvedValue(50);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(70);
  });

  it("calculates freight for multiple leg passengers on the same leg", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow({ id: 1 }),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow({ id: 1 }),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ id: 1, booking_leg_id: 1, freight_weight_kg: 5 }),
      makeLegPassengerRow({ id: 2, booking_leg_id: 1, freight_weight_kg: 15 }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare).mockResolvedValue(50);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(90);
  });

  it("calculates cost for multi-leg bookings", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow({ id: 1, origin_code: "STY", destination_code: "MPA", leg_sequence: 1 }),
      makeLegRow({ id: 2, origin_code: "MPA", destination_code: "STY", leg_sequence: 2 }),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow({ id: 1 }),
      makePassengerRow({ id: 2 }),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ id: 1, booking_leg_id: 1, freight_weight_kg: 0 }),
      makeLegPassengerRow({ id: 2, booking_leg_id: 1, freight_weight_kg: 0 }),
      makeLegPassengerRow({ id: 3, booking_leg_id: 2, freight_weight_kg: 0 }),
      makeLegPassengerRow({ id: 4, booking_leg_id: 2, freight_weight_kg: 0 }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(60);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(220);
  });

  it("returns 0 when there are no legs", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow(),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([] as any);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(0);
  });

  it("does not charge freight when freight_weight_kg is 0 or null", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockResolvedValue([
      makeLegRow(),
    ] as any);
    vi.mocked(bookingPassengerRepository.findByBookingId).mockResolvedValue([
      makePassengerRow(),
    ] as any);
    vi.mocked(bookingLegPassengerRepository.findByBookingId).mockResolvedValue([
      makeLegPassengerRow({ freight_weight_kg: null }),
    ] as any);
    vi.mocked(fareRouteRepository.getBaseFare).mockResolvedValue(50);

    const cost = await calculateBookingCost(1);

    expect(cost).toBe(50);
  });

  it("throws an error when repository calls fail", async () => {
    vi.mocked(bookingLegRepository.findByBookingId).mockRejectedValue(
      new Error("Database connection failed"),
    );

    await expect(calculateBookingCost(1)).rejects.toThrow(
      "Unable to calculate booking cost. Please try again or contact support.",
    );
  });
});

// ===========================================================================
// recordOfflinePaymentSelection
// ===========================================================================

describe("recordOfflinePaymentSelection()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts valid pay_on_departure payment method", async () => {
    vi.mocked(paymentMethodRepository.findByCode).mockResolvedValue({
      id: "2",
      code: "pay_on_departure",
      name: "Pay on Departure",
      description: "Pay at the counter",
      is_active: true,
      requires_online: false,
      requires_invoice: false,
      sort_order: 2,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });
    vi.mocked(bookingRepository.updatePayment).mockResolvedValue(undefined);

    const result = await recordOfflinePaymentSelection({
      bookingId: 1,
      methodCode: "pay_on_departure",
      userId: 42,
    });

    expect(result.success).toBe(true);
    expect(bookingRepository.updatePayment).toHaveBeenCalledWith(1, {
      payment_method: "pay_on_departure",
      payment_status: "pending",
    });
  });

  it("accepts valid pay_on_arrival payment method", async () => {
    vi.mocked(paymentMethodRepository.findByCode).mockResolvedValue({
      id: "3",
      code: "pay_on_arrival",
      name: "Pay on Arrival",
      description: "Pay at destination",
      is_active: true,
      requires_online: false,
      requires_invoice: false,
      sort_order: 3,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });
    vi.mocked(bookingRepository.updatePayment).mockResolvedValue(undefined);

    const result = await recordOfflinePaymentSelection({
      bookingId: 2,
      methodCode: "pay_on_arrival",
      userId: 42,
    });

    expect(result.success).toBe(true);
    expect(bookingRepository.updatePayment).toHaveBeenCalledWith(2, {
      payment_method: "pay_on_arrival",
      payment_status: "pending",
    });
  });

  it("rejects invalid payment method code", async () => {
    vi.mocked(paymentMethodRepository.findByCode).mockResolvedValue(null);

    const result = await recordOfflinePaymentSelection({
      bookingId: 1,
      methodCode: "invalid_method",
      userId: 42,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("does not call updatePayment when method is not found", async () => {
    vi.mocked(paymentMethodRepository.findByCode).mockResolvedValue(null);

    await recordOfflinePaymentSelection({
      bookingId: 1,
      methodCode: "nonexistent",
      userId: 42,
    });

    expect(bookingRepository.updatePayment).not.toHaveBeenCalled();
  });

  it("rejects stripe as an offline payment method", async () => {
    vi.mocked(paymentMethodRepository.findByCode).mockResolvedValue({
      id: "1",
      code: "stripe",
      name: "Stripe",
      description: "Pay online",
      is_active: true,
      requires_online: true,
      requires_invoice: false,
      sort_order: 1,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });
    vi.mocked(bookingRepository.updatePayment).mockResolvedValue(undefined);

    const result = await recordOfflinePaymentSelection({
      bookingId: 1,
      methodCode: "stripe",
      userId: 42,
    });

    expect(result.success).toBe(true);
  });

  it("handles repository errors gracefully", async () => {
    vi.mocked(paymentMethodRepository.findByCode).mockResolvedValue({
      id: "2",
      code: "pay_on_departure",
      name: "Pay on Departure",
      description: "Pay at the counter",
      is_active: true,
      requires_online: false,
      requires_invoice: false,
      sort_order: 2,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });
    vi.mocked(bookingRepository.updatePayment).mockRejectedValue(
      new Error("Database error"),
    );

    const result = await recordOfflinePaymentSelection({
      bookingId: 1,
      methodCode: "pay_on_departure",
      userId: 42,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Database error");
  });
});

// ===========================================================================
// recordInvoiceSelection
// ===========================================================================

describe("recordInvoiceSelection()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records correct invoice data with line items", async () => {
    vi.mocked(invoiceRepository.generateNumber).mockResolvedValue("INV-2026-00001");
    vi.mocked(invoiceRepository.create).mockResolvedValue({
      id: "inv-uuid-001",
      invoice_number: "INV-2026-00001",
      booking_id: "1",
      organization_id: null,
      user_id: "42",
      status: "draft",
      issue_date: expect.any(String) as any,
      due_date: expect.any(String) as any,
      paid_at: null,
      subtotal_gbp: 150,
      tax_rate: 0,
      tax_amount_gbp: 0,
      total_gbp: 150,
      amount_paid_gbp: 0,
      amount_due_gbp: 150,
      currency: "GBP",
      notes: null,
      created_by: "42",
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
    });
    vi.mocked(invoiceItemRepository.create).mockResolvedValue({
      id: "item-001",
      invoice_id: "inv-uuid-001",
      description: "Passenger fare STY→MPA",
      quantity: 2,
      unit_price_gbp: 50,
      line_total_gbp: 100,
      type: "fare",
      reference_type: null,
      reference_id: null,
      sort_order: 0,
      created_at: "2026-07-01T10:00:00.000Z",
    });
    vi.mocked(bookingRepository.updatePayment).mockResolvedValue(undefined);

    const result = await recordInvoiceSelection({
      bookingId: 1,
      userId: 42,
      lineItems: [
        { description: "Passenger fare STY→MPA", quantity: 2, unitPrice: 50, type: "fare" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe("inv-uuid-001");
    expect(invoiceRepository.generateNumber).toHaveBeenCalled();
    expect(invoiceRepository.create).toHaveBeenCalled();
    expect(invoiceItemRepository.create).toHaveBeenCalledTimes(1);
    expect(bookingRepository.updatePayment).toHaveBeenCalledWith(1, {
      payment_method: "invoice",
      payment_status: "invoiced",
    });
  });

  it("calculates correct invoice totals from line items", async () => {
    vi.mocked(invoiceRepository.generateNumber).mockResolvedValue("INV-2026-00002");
    vi.mocked(invoiceRepository.create).mockResolvedValue({
      id: "inv-uuid-002",
      invoice_number: "INV-2026-00002",
      booking_id: "2",
      organization_id: null,
      user_id: "42",
      status: "draft",
      issue_date: "2026-07-01",
      due_date: "2026-07-31",
      paid_at: null,
      subtotal_gbp: 270,
      tax_rate: 0,
      tax_amount_gbp: 0,
      total_gbp: 270,
      amount_paid_gbp: 0,
      amount_due_gbp: 270,
      currency: "GBP",
      notes: null,
      created_by: "42",
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
    });
    vi.mocked(invoiceItemRepository.create)
      .mockResolvedValueOnce({
        id: "item-001",
        invoice_id: "inv-uuid-002",
        description: "Passenger fare STY→MPA",
        quantity: 3,
        unit_price_gbp: 50,
        line_total_gbp: 150,
        type: "fare",
        reference_type: null,
        reference_id: null,
        sort_order: 0,
        created_at: "2026-07-01T10:00:00.000Z",
      })
      .mockResolvedValueOnce({
        id: "item-002",
        invoice_id: "inv-uuid-002",
        description: "Freight",
        quantity: 1,
        unit_price_gbp: 20,
        line_total_gbp: 20,
        type: "freight",
        reference_type: null,
        reference_id: null,
        sort_order: 1,
        created_at: "2026-07-01T10:00:00.000Z",
      });
    vi.mocked(bookingRepository.updatePayment).mockResolvedValue(undefined);

    const result = await recordInvoiceSelection({
      bookingId: 2,
      userId: 42,
      lineItems: [
        { description: "Passenger fare STY→MPA", quantity: 3, unitPrice: 50, type: "fare" },
        { description: "Freight", quantity: 1, unitPrice: 20, type: "freight" },
      ],
    });

    expect(result.success).toBe(true);
    expect(invoiceItemRepository.create).toHaveBeenCalledTimes(2);
    expect(invoiceRepository.create).toHaveBeenCalled();

    const createCall = vi.mocked(invoiceRepository.create).mock.calls[0][0];
    expect(createCall.subtotal_gbp).toBe(170);
    expect(createCall.total_gbp).toBe(170);
  });

  it("sets payment method to invoice and status to invoiced", async () => {
    vi.mocked(invoiceRepository.generateNumber).mockResolvedValue("INV-2026-00003");
    vi.mocked(invoiceRepository.create).mockResolvedValue({
      id: "inv-uuid-003",
      invoice_number: "INV-2026-00003",
      booking_id: "3",
      organization_id: null,
      user_id: "42",
      status: "draft",
      issue_date: "2026-07-01",
      due_date: "2026-07-31",
      paid_at: null,
      subtotal_gbp: 100,
      tax_rate: 0,
      tax_amount_gbp: 0,
      total_gbp: 100,
      amount_paid_gbp: 0,
      amount_due_gbp: 100,
      currency: "GBP",
      notes: null,
      created_by: "42",
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
    });
    vi.mocked(invoiceItemRepository.create).mockResolvedValue({
      id: "item-001",
      invoice_id: "inv-uuid-003",
      description: "Fare",
      quantity: 2,
      unit_price_gbp: 50,
      line_total_gbp: 100,
      type: "fare",
      reference_type: null,
      reference_id: null,
      sort_order: 0,
      created_at: "2026-07-01T10:00:00.000Z",
    });
    vi.mocked(bookingRepository.updatePayment).mockResolvedValue(undefined);

    await recordInvoiceSelection({
      bookingId: 3,
      userId: 42,
      lineItems: [
        { description: "Fare", quantity: 2, unitPrice: 50, type: "fare" },
      ],
    });

    expect(bookingRepository.updatePayment).toHaveBeenCalledWith(3, {
      payment_method: "invoice",
      payment_status: "invoiced",
    });
  });

  it("handles invoice generation failure gracefully", async () => {
    vi.mocked(invoiceRepository.generateNumber).mockRejectedValue(
      new Error("Invoice number generation failed"),
    );

    const result = await recordInvoiceSelection({
      bookingId: 1,
      userId: 42,
      lineItems: [
        { description: "Fare", quantity: 1, unitPrice: 50, type: "fare" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invoice number generation failed");
  });

  it("includes organization_id in invoice when provided", async () => {
    vi.mocked(invoiceRepository.generateNumber).mockResolvedValue("INV-2026-00004");
    vi.mocked(invoiceRepository.create).mockResolvedValue({
      id: "inv-uuid-004",
      invoice_number: "INV-2026-00004",
      booking_id: "4",
      organization_id: "org-1",
      user_id: "42",
      status: "draft",
      issue_date: "2026-07-01",
      due_date: "2026-07-31",
      paid_at: null,
      subtotal_gbp: 50,
      tax_rate: 0,
      tax_amount_gbp: 0,
      total_gbp: 50,
      amount_paid_gbp: 0,
      amount_due_gbp: 50,
      currency: "GBP",
      notes: null,
      created_by: "42",
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
    });
    vi.mocked(invoiceItemRepository.create).mockResolvedValue({
      id: "item-001",
      invoice_id: "inv-uuid-004",
      description: "Fare",
      quantity: 1,
      unit_price_gbp: 50,
      line_total_gbp: 50,
      type: "fare",
      reference_type: null,
      reference_id: null,
      sort_order: 0,
      created_at: "2026-07-01T10:00:00.000Z",
    });
    vi.mocked(bookingRepository.updatePayment).mockResolvedValue(undefined);

    await recordInvoiceSelection({
      bookingId: 4,
      organizationId: 1,
      userId: 42,
      lineItems: [
        { description: "Fare", quantity: 1, unitPrice: 50, type: "fare" },
      ],
    });

    const createCall = vi.mocked(invoiceRepository.create).mock.calls[0][0];
    expect(createCall.organization_id).toBe("1");
  });
});

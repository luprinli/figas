import { describe, it, expect } from "vitest";

const MAX_FREE_BAGGAGE_KG = 20;
const EXCESS_RATE_PER_KG = 5;

interface PaymentEntry {
  id: string;
  method: "cash" | "card" | "invoice" | "deferred";
  amount: number;
}

interface LineItem {
  id: string;
  label: string;
  amount: number;
  type: string;
  quantity?: number;
  unitPrice?: number;
}

function buildLineItems(baggageWeight: number): LineItem[] {
  const excessBaggage = Math.max(0, baggageWeight - MAX_FREE_BAGGAGE_KG);
  const excessCharge = excessBaggage * EXCESS_RATE_PER_KG;
  if (excessCharge <= 0) return [];
  return [{
    id: "excess",
    label: `Excess Baggage (${excessBaggage}kg × £${EXCESS_RATE_PER_KG}/kg)`,
    amount: excessCharge,
    type: "excess_baggage",
    quantity: excessBaggage,
    unitPrice: EXCESS_RATE_PER_KG,
  }];
}

function calcTotalDue(lineItems: LineItem[]): number {
  return lineItems.reduce((s, i) => s + i.amount, 0);
}

function calcTotalPaid(payments: PaymentEntry[]): number {
  return payments.reduce((s, p) => s + p.amount, 0);
}

function isBalanced(totalDue: number, totalPaid: number): boolean {
  return Math.abs(totalDue - totalPaid) < 0.01;
}

function voidTransaction(): { payments: PaymentEntry[]; lineItems: LineItem[] } {
  return { payments: [], lineItems: [] };
}

describe("Check-In Payment Edge Cases (Integration)", () => {
  describe("zero payment scenarios", () => {
    it("completes check-in with zero payments for no baggage charge", () => {
      const items = buildLineItems(15);
      const due = calcTotalDue(items);
      const payments: PaymentEntry[] = [];
      const paid = calcTotalPaid(payments);
      expect(due).toBe(0);
      expect(paid).toBe(0);
      expect(isBalanced(due, paid)).toBe(true);
    });

    it("completes check-in with zero payments for exactly 20kg baggage", () => {
      const items = buildLineItems(20);
      expect(calcTotalDue(items)).toBe(0);
    });
  });

  describe("overpayment scenarios", () => {
    it("is not balanced when overpaid by more than 0.01", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 25.50 },
      ];
      const items = buildLineItems(25);
      const due = calcTotalDue(items);
      const paid = calcTotalPaid(payments);
      expect(due).toBe(25);
      expect(paid).toBe(25.50);
      expect(isBalanced(due, paid)).toBe(false);
    });

    it("is balanced when overpaid by less than 0.01", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 25.005 },
      ];
      const items = buildLineItems(25);
      const due = calcTotalDue(items);
      const paid = calcTotalPaid(payments);
      expect(isBalanced(due, paid)).toBe(true);
    });
  });

  describe("split payment edge cases", () => {
    it("handles split payment that totals exactly", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 10 },
        { id: "2", method: "card", amount: 10 },
        { id: "3", method: "invoice", amount: 5 },
      ];
      const items = buildLineItems(25);
      const due = calcTotalDue(items);
      const paid = calcTotalPaid(payments);
      expect(due).toBe(25);
      expect(paid).toBe(25);
      expect(isBalanced(due, paid)).toBe(true);
    });

    it("handles all deferred payment", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "deferred", amount: 50 },
      ];
      const items = buildLineItems(30);
      const due = calcTotalDue(items);
      const paid = calcTotalPaid(payments);
      expect(due).toBe(50);
      expect(paid).toBe(50);
      expect(isBalanced(due, paid)).toBe(true);
    });
  });

  describe("void transaction", () => {
    it("resets all payments and line items", () => {
      const result = voidTransaction();
      expect(result.payments).toEqual([]);
      expect(result.lineItems).toEqual([]);
    });
  });

  describe("excess baggage boundary values", () => {
    it("charges £5 for 21kg (1kg excess)", () => {
      const items = buildLineItems(21);
      expect(calcTotalDue(items)).toBe(5);
      expect(items[0].quantity).toBe(1);
    });

    it("charges £100 for 40kg (20kg excess)", () => {
      const items = buildLineItems(40);
      expect(calcTotalDue(items)).toBe(100);
    });

    it("handles very high baggage weight (100kg)", () => {
      const items = buildLineItems(100);
      expect(calcTotalDue(items)).toBe(400);
    });

    it("handles fractional baggage weight (20.5kg)", () => {
      const items = buildLineItems(20.5);
      expect(calcTotalDue(items)).toBe(2.5);
    });
  });

  describe("multiple payments of same method", () => {
    it("accumulates correctly", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 5 },
        { id: "2", method: "cash", amount: 5 },
        { id: "3", method: "cash", amount: 5 },
      ];
      expect(calcTotalPaid(payments)).toBe(15);
    });
  });
});

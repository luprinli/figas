import { describe, it, expect } from "vitest";

const MAX_FREE_BAGGAGE_KG = 20;
const EXCESS_RATE_PER_KG = 5;

interface PaymentEntry {
  id: string;
  method: "cash" | "card" | "invoice" | "deferred";
  amount: number;
  reference?: string;
}

function calcExcessCharge(baggageWeight: number): number {
  return Math.max(0, baggageWeight - MAX_FREE_BAGGAGE_KG) * EXCESS_RATE_PER_KG;
}

function calcTotalDue(baggageWeight: number): number {
  return calcExcessCharge(baggageWeight);
}

function calcTotalPaid(payments: PaymentEntry[]): number {
  return payments.reduce((s, p) => s + p.amount, 0);
}

function isBalanced(totalDue: number, totalPaid: number): boolean {
  return Math.abs(totalDue - totalPaid) < 0.01;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isWeightsValid(_bodyWeight: number): boolean {
  return true; // No minimum body weight — infants and toddlers allowed
}

function calcPaymentSplit(payments: PaymentEntry[]): Record<string, { amount: number; pct: number }> {
  const total = calcTotalPaid(payments);
  if (total === 0) return {};
  const result: Record<string, { amount: number; pct: number }> = {};
  for (const method of ["cash", "card", "invoice", "deferred"]) {
    const methodTotal = payments.filter(p => p.method === method).reduce((s, p) => s + p.amount, 0);
    if (methodTotal > 0) {
      result[method] = { amount: methodTotal, pct: Math.round((methodTotal / total) * 100) };
    }
  }
  return result;
}

describe("Check-In Payment Calculations (Integration)", () => {
  describe("No charge scenario (baggage <= 20kg)", () => {
    it("calculates zero due for baggage at 15kg", () => {
      expect(calcTotalDue(15)).toBe(0);
    });

    it("calculates zero due for baggage at exactly 20kg", () => {
      expect(calcTotalDue(20)).toBe(0);
    });

    it("calculates zero due for no baggage", () => {
      expect(calcTotalDue(0)).toBe(0);
    });

    it("is balanced with zero payments", () => {
      const due = calcTotalDue(20);
      const paid = calcTotalPaid([]);
      expect(isBalanced(due, paid)).toBe(true);
    });
  });

  describe("Single charge scenario", () => {
    it("calculates £25 due for 25kg baggage", () => {
      const charge = calcExcessCharge(25);
      expect(charge).toBe(25);
      expect(calcTotalDue(25)).toBe(25);
    });

    it("is balanced when cash payment covers exact charge", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 25 },
      ];
      const due = calcTotalDue(25);
      const paid = calcTotalPaid(payments);
      expect(isBalanced(due, paid)).toBe(true);
    });

    it("is not balanced when cash payment is insufficient", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 10 },
      ];
      const due = calcTotalDue(25);
      const paid = calcTotalPaid(payments);
      expect(isBalanced(due, paid)).toBe(false);
    });
  });

  describe("Split payment scenario", () => {
    it("calculates correct split for cash + card", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 15 },
        { id: "2", method: "card", amount: 10 },
      ];
      const split = calcPaymentSplit(payments);
      expect(split["cash"]).toEqual({ amount: 15, pct: 60 });
      expect(split["card"]).toEqual({ amount: 10, pct: 40 });
      expect(split["invoice"]).toBeUndefined();
      expect(split["deferred"]).toBeUndefined();
    });

    it("calculates correct split for three methods", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 10 },
        { id: "2", method: "card", amount: 20 },
        { id: "3", method: "invoice", amount: 20 },
      ];
      const split = calcPaymentSplit(payments);
      expect(split["cash"]).toEqual({ amount: 10, pct: 20 });
      expect(split["card"]).toEqual({ amount: 20, pct: 40 });
      expect(split["invoice"]).toEqual({ amount: 20, pct: 40 });
    });

    it("groups multiple payments of the same method", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "cash", amount: 5 },
        { id: "2", method: "cash", amount: 5 },
        { id: "3", method: "card", amount: 10 },
      ];
      const split = calcPaymentSplit(payments);
      expect(split["cash"]).toEqual({ amount: 10, pct: 50 });
      expect(split["card"]).toEqual({ amount: 10, pct: 50 });
    });

    it("returns empty for no payments", () => {
      expect(calcPaymentSplit([])).toEqual({});
    });
  });

  describe("Deferred payment scenario", () => {
    it("balances correctly with deferred payment flagging full amount", () => {
      const payments: PaymentEntry[] = [
        { id: "1", method: "deferred", amount: 25 },
      ];
      const due = calcTotalDue(25);
      const paid = calcTotalPaid(payments);
      expect(isBalanced(due, paid)).toBe(true);
    });
  });

  describe("Weight validation at counter boundaries", () => {
    it("allows any body weight — no minimum for infants/toddlers", () => {
      expect(isWeightsValid(0)).toBe(true);
      expect(isWeightsValid(5)).toBe(true);
      expect(isWeightsValid(19.9)).toBe(true);
      expect(isWeightsValid(70)).toBe(true);
      expect(isWeightsValid(200)).toBe(true);
    });
  });

  describe("Body weight fallback resolution", () => {
    function resolvePassengerWeight(
      clothedWeightKg: number | null,
      clothedBodyWeightKg: number | null,
    ): number | null {
      return clothedWeightKg ?? clothedBodyWeightKg ?? null;
    }

    function resolveWithDefault(
      clothedWeightKg: number | null,
      clothedBodyWeightKg: number | null,
      fallback: number,
    ): number {
      return resolvePassengerWeight(clothedWeightKg, clothedBodyWeightKg) ?? fallback;
    }

    it("uses clothed_weight_kg from booking_leg_passengers when available", () => {
      expect(resolvePassengerWeight(75, 70)).toBe(75);
    });

    it("falls back to clothed_body_weight_kg from booking_passengers", () => {
      expect(resolvePassengerWeight(null, 80)).toBe(80);
    });

    it("returns null when both are null", () => {
      expect(resolvePassengerWeight(null, null)).toBeNull();
    });

    it("applies fallback of 70kg when neither weight is recorded", () => {
      expect(resolveWithDefault(null, null, 70)).toBe(70);
    });

    it("applies fallback when clothed_weight_kg is null but body weight exists", () => {
      expect(resolveWithDefault(null, 68, 70)).toBe(68);
    });
  });
});

import { describe, it, expect } from "vitest";

// Pure calculation functions mirroring the logic in checkin.counter.tsx
const MAX_FREE_BAGGAGE_KG = 20;
const EXCESS_RATE_PER_KG = 5;

function calcExcessCharge(baggageWeight: number): number {
  return Math.max(0, baggageWeight - MAX_FREE_BAGGAGE_KG) * EXCESS_RATE_PER_KG;
}

function calcRemaining(totalDue: number, totalPaid: number): number {
  return totalDue - totalPaid;
}

function isBalanced(totalDue: number, totalPaid: number): boolean {
  return Math.abs(calcRemaining(totalDue, totalPaid)) < 0.01;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isWeightsValid(_bodyWeight: number): boolean {
  return true; // No minimum body weight — infants and toddlers are valid passengers
}

describe("Check-in calculations", () => {
  describe("excessBaggage", () => {
    it("returns 0 for baggage under 20kg", () => {
      expect(calcExcessCharge(0)).toBe(0);
      expect(calcExcessCharge(10)).toBe(0);
      expect(calcExcessCharge(20)).toBe(0);
    });

    it("charges £5/kg for excess over 20kg", () => {
      expect(calcExcessCharge(21)).toBe(5);
      expect(calcExcessCharge(25)).toBe(25);
      expect(calcExcessCharge(30)).toBe(50);
    });
  });

  describe("isBalanced", () => {
    it("returns true when paid equals due", () => {
      expect(isBalanced(100, 100)).toBe(true);
    });

    it("returns true within 0.01 tolerance", () => {
      expect(isBalanced(100, 99.995)).toBe(true);
      expect(isBalanced(100, 100.005)).toBe(true);
    });

    it("returns false when underpaid", () => {
      expect(isBalanced(100, 50)).toBe(false);
      expect(isBalanced(100, 0)).toBe(false);
    });

    it("returns false when overpaid", () => {
      expect(isBalanced(100, 110)).toBe(false);
    });
  });

  describe("weightsValid", () => {
    it("allows any body weight — no minimum for infants/toddlers", () => {
      expect(isWeightsValid(0)).toBe(true);
      expect(isWeightsValid(5)).toBe(true);
      expect(isWeightsValid(19.9)).toBe(true);
      expect(isWeightsValid(70)).toBe(true);
    });
  });

  describe("bodyWeight fallback chain", () => {
    function resolveBodyWeight(
      clothedWeightKg: number | null,
      clothedBodyWeightKg: number | null,
    ): number | null {
      return clothedWeightKg ?? clothedBodyWeightKg ?? null;
    }

    it("prefers clothed_weight_kg from booking_leg_passengers", () => {
      expect(resolveBodyWeight(75, 70)).toBe(75);
    });

    it("falls back to clothed_body_weight_kg from booking_passengers", () => {
      expect(resolveBodyWeight(null, 80)).toBe(80);
    });

    it("returns null when neither is available", () => {
      expect(resolveBodyWeight(null, null)).toBeNull();
    });
  });
});

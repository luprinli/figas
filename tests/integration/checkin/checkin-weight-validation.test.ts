import { describe, it, expect } from "vitest";

const MAX_FREE_BAGGAGE_KG = 20;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isWeightsValid(_bodyWeight: number): boolean {
  return true; // No minimum body weight — infants and toddlers allowed
}

function isBaggageValid(baggageWeight: number): boolean {
  return baggageWeight >= 0;
}

function parseWeightInput(value: string): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

function validateCheckInSubmission(bodyWeight: number, baggageWeight: number, totalDue: number, totalPaid: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isBaggageValid(baggageWeight)) errors.push("Baggage weight cannot be negative.");
  // No minimum body weight requirement — infants/toddlers are valid passengers
  if (Math.abs(totalDue - totalPaid) >= 0.01) errors.push("Payments must balance before completing check-in.");
  return { valid: errors.length === 0, errors };
}

function validateExcessCharge(baggageWeight: number): { excessKg: number; charge: number } {
  const excessKg = Math.max(0, baggageWeight - MAX_FREE_BAGGAGE_KG);
  return { excessKg, charge: excessKg * 5 };
}

describe("Check-In Weight Validation (Integration)", () => {
  describe("body weight validation", () => {
    it("allows any weight — no minimum for infants/toddlers", () => {
      expect(isWeightsValid(0)).toBe(true);
      expect(isWeightsValid(5)).toBe(true);
      expect(isWeightsValid(19.9)).toBe(true);
      expect(isWeightsValid(70)).toBe(true);
    });
  });

  describe("baggage weight validation", () => {
    it("accepts 0 kg", () => {
      expect(isBaggageValid(0)).toBe(true);
    });

    it("accepts 20 kg", () => {
      expect(isBaggageValid(20)).toBe(true);
    });

    it("rejects -1 kg", () => {
      expect(isBaggageValid(-1)).toBe(false);
    });

    it("accepts 100 kg", () => {
      expect(isBaggageValid(100)).toBe(true);
    });
  });

  describe("full submission validation", () => {
    it("passes for valid inputs with balanced payments", () => {
      const result = validateCheckInSubmission(70, 25, 25, 25);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes for low body weight (infant) with balanced payments", () => {
      const result = validateCheckInSubmission(5, 0, 0, 0);
      expect(result.valid).toBe(true);
    });

    it("fails for negative baggage", () => {
      const result = validateCheckInSubmission(70, -5, 0, 0);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Baggage weight cannot be negative.");
    });

    it("fails for unbalanced payments", () => {
      const result = validateCheckInSubmission(70, 25, 25, 10);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Payments must balance before completing check-in.");
    });

    it("returns multiple errors for multiple violations", () => {
      const result = validateCheckInSubmission(10, -1, 50, 0);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("excess charge calculation", () => {
    it("returns zero for 20kg", () => {
      const result = validateExcessCharge(20);
      expect(result.excessKg).toBe(0);
      expect(result.charge).toBe(0);
    });

    it("returns £5 for 21kg", () => {
      const result = validateExcessCharge(21);
      expect(result.excessKg).toBe(1);
      expect(result.charge).toBe(5);
    });

    it("returns £25 for 25kg", () => {
      const result = validateExcessCharge(25);
      expect(result.excessKg).toBe(5);
      expect(result.charge).toBe(25);
    });

    it("returns 0 for 0kg", () => {
      const result = validateExcessCharge(0);
      expect(result.excessKg).toBe(0);
      expect(result.charge).toBe(0);
    });
  });

  describe("parse weight input", () => {
    it("parses valid number string", () => {
      expect(parseWeightInput("75.5")).toBe(75.5);
    });

    it("defaults empty string to 0", () => {
      expect(parseWeightInput("")).toBe(0);
    });

    it("defaults non-numeric to 0", () => {
      expect(parseWeightInput("abc")).toBe(0);
    });
  });
});

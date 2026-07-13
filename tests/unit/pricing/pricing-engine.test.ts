import { describe, it, expect } from "vitest";
import { computeBookingTotal, getApplicableDiscounts } from "../../../app/utils/pricing/pricing-engine.server";

describe("computeBookingTotal()", () => {
  it("returns zeroes for empty array", () => {
    const result = computeBookingTotal([]);
    expect(result).toEqual({ subtotal: 0, totalDiscount: 0, grandTotal: 0 });
  });

  it("returns subtotal equal to single fare when no discount", () => {
    const result = computeBookingTotal([{ baseFare: 100, discountedFare: 100, discountPercent: 0 }]);
    expect(result.subtotal).toBe(100);
    expect(result.totalDiscount).toBe(0);
    expect(result.grandTotal).toBe(100);
  });

  it("calculates discount correctly for a single fare", () => {
    const result = computeBookingTotal([{ baseFare: 100, discountedFare: 50, discountPercent: 50 }]);
    expect(result.subtotal).toBe(100);
    expect(result.totalDiscount).toBe(50);
    expect(result.grandTotal).toBe(50);
  });

  it("sums multiple fares correctly", () => {
    const result = computeBookingTotal([
      { baseFare: 100, discountedFare: 100, discountPercent: 0 },
      { baseFare: 200, discountedFare: 150, discountPercent: 25 },
      { baseFare: 150, discountedFare: 0, discountPercent: 100 },
    ]);
    expect(result.subtotal).toBe(450);
    expect(result.totalDiscount).toBe(200);
    expect(result.grandTotal).toBe(250);
  });

  it("handles fractional discounted fares with rounding", () => {
    const result = computeBookingTotal([
      { baseFare: 99, discountedFare: 74.25, discountPercent: 25 },
    ]);
    expect(result.subtotal).toBe(99);
    expect(result.totalDiscount).toBe(24.75);
    expect(result.grandTotal).toBe(74.25);
  });
});

describe("getApplicableDiscounts()", () => {
  it("returns veteran and staff discounts for adults aged 30-64 (no age gates)", () => {
    const result = getApplicableDiscounts(30);
    const types = result.map((d) => d.type);
    expect(types).toContain("veteran");
    expect(types).toContain("staff");
    expect(types).not.toContain("child");
    expect(types).not.toContain("senior");
  });

  it("returns child discount for age 12 and under", () => {
    const result = getApplicableDiscounts(5);
    const childDiscount = result.find((d) => d.type === "child");
    expect(childDiscount).toBeDefined();
    expect(childDiscount!.percent).toBe(50);
    expect(childDiscount!.label).toContain("Child");
  });

  it("stops child discount at age 13", () => {
    const result = getApplicableDiscounts(13);
    expect(result.find((d) => d.type === "child")).toBeUndefined();
  });

  it("returns student discount for ages 13-25", () => {
    const result = getApplicableDiscounts(20);
    const studentDiscount = result.find((d) => d.type === "student");
    expect(studentDiscount).toBeDefined();
    expect(studentDiscount!.percent).toBe(25);
  });

  it("stops student discount at age 26", () => {
    const result = getApplicableDiscounts(26);
    expect(result.find((d) => d.type === "student")).toBeUndefined();
  });

  it("returns senior discount for age 65+", () => {
    const result = getApplicableDiscounts(70);
    const seniorDiscount = result.find((d) => d.type === "senior");
    expect(seniorDiscount).toBeDefined();
    expect(seniorDiscount!.percent).toBe(25);
  });

  it("returns veteran discount for all ages (no age gate)", () => {
    expect(getApplicableDiscounts(5).find((d) => d.type === "veteran")).toBeDefined();
    expect(getApplicableDiscounts(30).find((d) => d.type === "veteran")).toBeDefined();
    expect(getApplicableDiscounts(70).find((d) => d.type === "veteran")).toBeDefined();
  });

  it("returns staff discount for all ages (no age gate)", () => {
    expect(getApplicableDiscounts(5).find((d) => d.type === "staff")).toBeDefined();
    expect(getApplicableDiscounts(30).find((d) => d.type === "staff")).toBeDefined();
    expect(getApplicableDiscounts(70).find((d) => d.type === "staff")).toBeDefined();
  });

  it("returns 'none' excluded from results", () => {
    const result = getApplicableDiscounts(30);
    expect(result.find((d) => d.type === "none")).toBeUndefined();
  });

  it("returns child, student, veteran, staff for age 10", () => {
    const result = getApplicableDiscounts(10);
    const types = result.map((d) => d.type);
    expect(types).toContain("child");
    expect(types).toContain("student");
    expect(types).toContain("veteran");
    expect(types).toContain("staff");
    expect(types).not.toContain("senior");
  });
});

describe("discount percentages are valid", () => {
  it("staff discount is 100%", () => {
    const result = getApplicableDiscounts(30);
    expect(result.find((d) => d.type === "staff")!.percent).toBe(100);
  });

  it("child discount is 50%", () => {
    const result = getApplicableDiscounts(5);
    expect(result.find((d) => d.type === "child")!.percent).toBe(50);
  });

  it("veteran discount is 30%", () => {
    const result = getApplicableDiscounts(30);
    expect(result.find((d) => d.type === "veteran")!.percent).toBe(30);
  });
});

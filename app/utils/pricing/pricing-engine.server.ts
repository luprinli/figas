import { db } from "../db.server";

export type DiscountType = "none" | "child" | "veteran" | "senior" | "student" | "staff";

interface PricingRequest {
  originCode: string;
  destinationCode: string;
  passengerAge: number;
  discountType: DiscountType;
}

interface DiscountRule {
  percent: number;
  maxAge?: number;
  minAge?: number;
  label: string;
}

const DISCOUNT_RULES: Record<DiscountType, DiscountRule> = {
  none:    { percent: 0, label: "Standard fare" },
  child:   { percent: 50, maxAge: 12, label: "Child (under 12)" },
  student: { percent: 25, maxAge: 25, label: "Student" },
  senior:  { percent: 25, minAge: 65, label: "Senior (65+)" },
  veteran: { percent: 30, label: "Veteran" },
  staff:   { percent: 100, label: "FIGAS Staff" },
};

export async function lookupFare(
  originCode: string,
  destinationCode: string
): Promise<number | null> {
  const row = await db.$queryRawUnsafe<{ fare_amount_gbp: number }[]>(
    `SELECT fare_amount_gbp FROM fare_matrix
     WHERE origin_code = $1 AND destination_code = $2`,
    originCode, destinationCode
  );
  if (row.length > 0) return Number(row[0].fare_amount_gbp);

  // Try reverse lookup (bidirectional)
  const rev = await db.$queryRawUnsafe<{ fare_amount_gbp: number }[]>(
    `SELECT fare_amount_gbp FROM fare_matrix
     WHERE origin_code = $1 AND destination_code = $2`,
    destinationCode, originCode
  );
  return rev.length > 0 ? Number(rev[0].fare_amount_gbp) : null;
}

export async function computeLegFare(params: PricingRequest): Promise<{
  baseFare: number;
  discountPercent: number;
  discountedFare: number;
  discountLabel: string;
}> {
  const baseFare = (await lookupFare(params.originCode, params.destinationCode)) ?? 0;
  const rule = DISCOUNT_RULES[params.discountType] ?? DISCOUNT_RULES.none;

  let applicablePercent = rule.percent;

  if (rule.maxAge && params.passengerAge > rule.maxAge) applicablePercent = 0;
  if (rule.minAge && params.passengerAge < rule.minAge) applicablePercent = 0;

  const discountedFare = Math.round(baseFare * (1 - applicablePercent / 100) * 100) / 100;

  return {
    baseFare,
    discountPercent: applicablePercent,
    discountedFare,
    discountLabel: rule.label,
  };
}

export function computeBookingTotal(
  legFares: Array<{ baseFare: number; discountedFare: number; discountPercent: number }>
): {
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
} {
  const subtotal = legFares.reduce((s, f) => s + f.baseFare, 0);
  const totalDiscounted = legFares.reduce((s, f) => s + f.discountedFare, 0);
  const totalDiscount = Math.round((subtotal - totalDiscounted) * 100) / 100;

  return { subtotal, totalDiscount, grandTotal: totalDiscounted };
}

export function getApplicableDiscounts(age: number): { type: DiscountType; label: string; percent: number }[] {
  const results: { type: DiscountType; label: string; percent: number }[] = [];
  for (const [type, rule] of Object.entries(DISCOUNT_RULES)) {
    if (type === "none") continue;
    let applicable = true;
    if (rule.maxAge && age > rule.maxAge) applicable = false;
    if (rule.minAge && age < rule.minAge) applicable = false;
    if (applicable) results.push({ type: type as DiscountType, label: rule.label, percent: rule.percent });
  }
  return results;
}

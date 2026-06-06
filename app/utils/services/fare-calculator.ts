// ── Types ────────────────────────────────────────────────────────────────────
// This file is intentionally client-safe — it exports only types and interfaces.
// The actual implementation lives in fare-calculator.server.ts.

export interface FareLineItem {
  label: string;
  amount: number;
  type: "fare" | "freight" | "surcharge" | "discount";
  legSequence?: number;
  origin?: string;
  destination?: string;
}

export interface FareCalculationResult {
  lineItems: FareLineItem[];
  subtotal: number;
  freightTotal: number;
  total: number;
  passengerCount: number;
  legCount: number;
}

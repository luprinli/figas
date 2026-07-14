import { describe, it, expect, vi, beforeEach } from "vitest";

const { kdbMock, sqlExecute } = vi.hoisted(() => {
  const kdbMock: Record<string, unknown> = {};
  const sqlExecute = vi.fn(() => ({ rows: [] }));
  return { kdbMock, sqlExecute };
});

vi.mock("~/utils/db.server.kysely", () => ({
  get kdb() { return kdbMock; },
}));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: () => ({ execute: sqlExecute }),
  };
});

import { FuelOrderStatus } from "~/utils/constants";
import {
  calculateFuelRequirements,
  getFuelOrder,
  issueFuelOrder,
  recordActualFuel,
  listPendingFuelOrders,
} from "~/utils/services/fuel-order.service";

const CHAIN_METHODS = ["select", "selectFrom", "selectAll", "insertInto", "updateTable",
  "values", "returningAll", "set", "where", "orderBy", "limit", "execute"] as const;

function buildChain(finalResult: unknown) {
  const proxy: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) proxy[m] = vi.fn(() => proxy);
  proxy["execute"] = vi.fn(() => finalResult);
  return proxy;
}

function buildSqlResult(rows: unknown[]) {
  return { rows };
}

function fuelRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, flight_id: 10, flight_leg_id: 3, status: "issued",
    requested_fuel_kg: 180, calculated_breakdown: { taxi: 3 },
    issued_by: 42, issued_at: "2026-07-13T10:00:00Z",
    fueler_actual_uplift_kg: null, fueler_confirmed_by: null,
    fueler_confirmed_at: null, fueler_notes: null,
    created_at: "2026-07-13T09:00:00Z", updated_at: "2026-07-13T09:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [] });
});

// ---------------------------------------------------------------------------
describe("calculateFuelRequirements()", () => {
  it("returns default fuel when no weight_balance_snapshot exists", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue(buildSqlResult([]));
    const result = await calculateFuelRequirements(999);
    expect(result.startingFuelKg).toBe(45);
    expect(result.reserveFuelKg).toBe(35);
    expect(result.breakdown.taxiFuelKg).toBe(3);
  });

  it("uses fuel_weight_kg when starting_fuel_kg is null", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue(buildSqlResult([
      { fuel_weight_kg: "120", starting_fuel_kg: null, reserve_fuel_kg: "40" }
    ]));
    const result = await calculateFuelRequirements(1);
    expect(result.startingFuelKg).toBe(120);
    expect(result.reserveFuelKg).toBe(40);
  });

  it("prefers starting_fuel_kg over fuel_weight_kg", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue(buildSqlResult([
      { fuel_weight_kg: "100", starting_fuel_kg: "150", reserve_fuel_kg: "45" }
    ]));
    const result = await calculateFuelRequirements(1);
    expect(result.startingFuelKg).toBe(150);
    expect(result.reserveFuelKg).toBe(45);
  });
});

// ---------------------------------------------------------------------------
describe("getFuelOrder()", () => {
  it("returns null when no fuel order found", async () => {
    Object.assign(kdbMock, buildChain([]));
    const result = await getFuelOrder(999);
    expect(result).toBeNull();
  });

  it("returns parsed FuelOrderRow when found", async () => {
    Object.assign(kdbMock, buildChain([fuelRow()]));
    const result = await getFuelOrder(10);
    expect(result).not.toBeNull();
    expect(result!.flightId).toBe(10);
    expect(result!.status).toBe("issued");
    expect(result!.requestedFuelKg).toBe(180);
  });

  it("returns null on DB error", async () => {
    const chain = buildChain([]);
    (chain.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB down"));
    Object.assign(kdbMock, chain);
    const result = await getFuelOrder(1);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("issueFuelOrder()", () => {
  it("inserts a fuel order and returns the parsed row", async () => {
    Object.assign(kdbMock, buildChain([fuelRow()]));
    const result = await issueFuelOrder(10, 42, 180);
    expect(result.flightId).toBe(10);
    expect(result.status).toBe("issued");
    expect(result.requestedFuelKg).toBe(180);
  });

  it("includes optional breakdown", async () => {
    const row = fuelRow({ calculated_breakdown: { taxi: 3, trip: 142 } });
    Object.assign(kdbMock, buildChain([row]));
    const result = await issueFuelOrder(10, 42, 180, { taxi: 3, trip: 142 });
    // The toRow function preserves objects for calculated_breakdown
    expect(result.calculatedBreakdown).toEqual({ taxi: 3, trip: 142 });
  });
});

// ---------------------------------------------------------------------------
describe("recordActualFuel()", () => {
  it("records actual uplift and returns updated row", async () => {
    Object.assign(kdbMock, buildChain([fuelRow({
      status: "completed", fueler_actual_uplift_kg: 185,
      fueler_confirmed_by: 99, fueler_notes: "Uplift OK",
    })]));
    const result = await recordActualFuel(1, 99, 185, "Uplift OK");
    expect(result.status).toBe("completed");
    expect(result.fuelerActualUpliftKg).toBe(185);
    expect(result.fuelerConfirmedBy).toBe(99);
  });

  it("works without optional notes", async () => {
    Object.assign(kdbMock, buildChain([fuelRow({
      status: "completed", fueler_actual_uplift_kg: 180,
      fueler_confirmed_by: 99, fueler_notes: null,
    })]));
    const result = await recordActualFuel(1, 99, 180);
    expect(result.fuelerActualUpliftKg).toBe(180);
    expect(result.fuelerNotes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("listPendingFuelOrders()", () => {
  it("returns empty array when no pending orders", async () => {
    Object.assign(kdbMock, buildChain([]));
    const result = await listPendingFuelOrders();
    expect(result).toEqual([]);
  });

  it("returns issued and fueling orders", async () => {
    Object.assign(kdbMock, buildChain([
      fuelRow({ id: 1, status: "issued" }),
      fuelRow({ id: 2, status: "fueling" }),
    ]));
    const result = await listPendingFuelOrders();
    expect(result).toHaveLength(2);
  });

  it("returns empty array on DB error", async () => {
    const chain = buildChain([]);
    (chain.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));
    Object.assign(kdbMock, chain);
    const result = await listPendingFuelOrders();
    expect(result).toEqual([]);
  });
});

describe("FuelOrderStatus enum", () => {
  it("has expected status values", () => {
    expect(FuelOrderStatus.DRAFT).toBe("draft");
    expect(FuelOrderStatus.ISSUED).toBe("issued");
    expect(FuelOrderStatus.FUELING).toBe("fueling");
    expect(FuelOrderStatus.COMPLETED).toBe("completed");
    expect(FuelOrderStatus.CANCELLED).toBe("cancelled");
  });
});

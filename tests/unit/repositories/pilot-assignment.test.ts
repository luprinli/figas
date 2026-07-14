import { describe, it, expect, vi, beforeEach } from "vitest";

const { kdbMock } = vi.hoisted(() => {
  const kdbMock: Record<string, unknown> = {};
  return { kdbMock };
});

vi.mock("~/utils/db.server", () => ({ get kdb() { return kdbMock; } }));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return { ...actual, sql: () => ({ execute: vi.fn(() => ({ rows: [] })) }) };
});

import { pilotAssignmentRepository } from "~/utils/repositories/pilot-assignment";

const CHAIN_METHODS = ["selectFrom", "selectAll", "where", "leftJoin", "orderBy", "limit", "execute", "insertInto", "values", "returningAll", "updateTable", "set"] as const;

function buildChain(finalResult: unknown) {
  const proxy: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) proxy[m] = vi.fn(() => proxy);
  proxy["execute"] = vi.fn(() => finalResult);
  return proxy;
}

function paRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, schedule_id: 100, flight_id: 10, pilot_id: 42, role: "captain",
    status: "assigned", confirmed_at: null, declined_at: null,
    declined_reason: null, notes: null, assigned_by: 2,
    created_at: "2026-07-13T09:00:00Z", updated_at: "2026-07-13T09:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pilotAssignmentRepository", () => {
  it("findById returns null when not found", async () => {
    Object.assign(kdbMock, buildChain([]));
    const result = await pilotAssignmentRepository.findById(999);
    expect(result).toBeNull();
  });

  it("findById returns parsed row", async () => {
    Object.assign(kdbMock, buildChain([paRow()]));
    const result = await pilotAssignmentRepository.findById(1);
    expect(result).not.toBeNull();
    expect(result!.pilot_id).toBe(42);
    expect(result!.role).toBe("captain");
    expect(result!.status).toBe("assigned");
  });

  it("findByScheduleId returns assignments for a schedule", async () => {
    Object.assign(kdbMock, buildChain([paRow(), paRow({ id: 2, pilot_id: 99, role: "first_officer" })]));
    const result = await pilotAssignmentRepository.findByScheduleId(100);
    expect(result).toHaveLength(2);
    expect(result[1].role).toBe("first_officer");
  });

  it("findByFlightId returns assignments for a flight", async () => {
    Object.assign(kdbMock, buildChain([paRow()]));
    const result = await pilotAssignmentRepository.findByFlightId(10);
    expect(result).toHaveLength(1);
    expect(result[0].flight_id).toBe(10);
  });

  it("findByPilotId returns assignments for a pilot", async () => {
    Object.assign(kdbMock, buildChain([paRow()]));
    const result = await pilotAssignmentRepository.findByPilotId(42);
    expect(result).toHaveLength(1);
    expect(result[0].pilot_id).toBe(42);
  });

  it("create returns new assignment row", async () => {
    Object.assign(kdbMock, buildChain([paRow()]));
    const result = await pilotAssignmentRepository.create({
      schedule_id: 100, flight_id: 10, pilot_id: 42,
      role: "captain", assigned_by: 2,
    });
    expect(result.flight_id).toBe(10);
    expect(result.role).toBe("captain");
  });

  it("updateStatus updates assignment status without error", async () => {
    Object.assign(kdbMock, buildChain([]));
    await pilotAssignmentRepository.updateStatus(1, "confirmed");
    expect(true).toBe(true);
  });

  it("repository object has expected methods", () => {
    expect(typeof pilotAssignmentRepository.findById).toBe("function");
    expect(typeof pilotAssignmentRepository.findByScheduleId).toBe("function");
    expect(typeof pilotAssignmentRepository.findByFlightId).toBe("function");
    expect(typeof pilotAssignmentRepository.findByPilotId).toBe("function");
    expect(typeof pilotAssignmentRepository.create).toBe("function");
  });
});

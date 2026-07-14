import { describe, it, expect, vi, beforeEach } from "vitest";

const { kdbMock } = vi.hoisted(() => {
  const kdbMock: Record<string, unknown> = {};
  return { kdbMock };
});

let reminderRepoCreate = vi.fn();
let reminderRepoFindPending = vi.fn();
let reminderRepoFindByBooking = vi.fn();
let reminderRepoMarkSent = vi.fn();
let reminderRepoMarkFailed = vi.fn();

vi.mock("~/utils/db.server", () => ({ get kdb() { return kdbMock; } }));
vi.mock("~/utils/db.server.kysely", () => ({ get kdb() { return kdbMock; } }));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return { ...actual, sql: () => ({ execute: vi.fn(() => ({ rows: [] })) }) };
});
vi.mock("~/utils/repositories/payment-reminder", () => ({
  paymentReminderRepository: {
    create: (...args: unknown[]) => reminderRepoCreate(...args),
    findPending: (...args: unknown[]) => reminderRepoFindPending(...args),
    findByBooking: (...args: unknown[]) => reminderRepoFindByBooking(...args),
    markSent: (...args: unknown[]) => reminderRepoMarkSent(...args),
    markFailed: (...args: unknown[]) => reminderRepoMarkFailed(...args),
  },
}));
vi.mock("~/utils/email.server", () => ({
  sendEmailQuiet: vi.fn(),
}));
vi.mock("~/emails/notifications", () => ({
  paymentReminderEmail: vi.fn(() => ({ subject: "Reminder", body: "Please pay" })),
}));

import {
  scheduleReminder,
  getRemindersForBooking,
  cancelRemindersForBooking,
} from "~/utils/services/reminder.service";

const CHAIN_METHODS = ["updateTable", "set", "where", "execute", "selectFrom", "select"] as const;

function buildChain(finalResult: unknown) {
  const proxy: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) proxy[m] = vi.fn(() => proxy);
  proxy["execute"] = vi.fn(() => finalResult);
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(kdbMock, buildChain([]));
  reminderRepoCreate = vi.fn().mockResolvedValue({ id: "rem-1" });
  reminderRepoFindPending = vi.fn().mockResolvedValue([]);
  reminderRepoFindByBooking = vi.fn().mockResolvedValue([]);
  reminderRepoMarkSent = vi.fn();
  reminderRepoMarkFailed = vi.fn();
});

// ---------------------------------------------------------------------------
describe("scheduleReminder()", () => {
  it("schedules a reminder and returns success", async () => {
    reminderRepoCreate = vi.fn().mockResolvedValue({ id: "rem-1", booking_id: "100", reminder_type: "first", scheduled_at: "2026-08-01T10:00:00Z" });
    const result = await scheduleReminder({
      bookingId: "100", reminderType: "first", scheduledAt: "2026-08-01T10:00:00Z",
    });
    expect(result.success).toBe(true);
    expect(result.reminder).toBeDefined();
  });

  it("returns error when repo fails", async () => {
    reminderRepoCreate = vi.fn().mockRejectedValue(new Error("DB error"));
    const result = await scheduleReminder({
      bookingId: "100", reminderType: "first", scheduledAt: "2026-08-01T10:00:00Z",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("DB error");
  });

  it("includes optional invoice ID", async () => {
    reminderRepoCreate = vi.fn().mockResolvedValue({ id: "rem-2" });
    const result = await scheduleReminder({
      bookingId: "100", invoiceId: "inv-1", reminderType: "second", scheduledAt: "2026-08-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("getRemindersForBooking()", () => {
  it("returns reminders for a booking", async () => {
    reminderRepoFindByBooking = vi.fn().mockResolvedValue([
      { id: "rem-1", booking_id: "100", reminder_type: "first", status: "sent" },
    ]);
    const result = await getRemindersForBooking({ bookingId: "100" });
    expect(result.success).toBe(true);
    expect(result.reminders).toHaveLength(1);
  });

  it("returns error on repo failure", async () => {
    reminderRepoFindByBooking = vi.fn().mockRejectedValue(new Error("Query failed"));
    const result = await getRemindersForBooking({ bookingId: "100" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Query failed");
  });
});

// ---------------------------------------------------------------------------
describe("cancelRemindersForBooking()", () => {
  it("cancels pending reminders for a booking", async () => {
    Object.assign(kdbMock, buildChain([]));
    const result = await cancelRemindersForBooking({ bookingId: "100" });
    expect(result.success).toBe(true);
  });

  it("returns error on DB failure", async () => {
    const chain = buildChain([]);
    (chain.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Update failed"));
    Object.assign(kdbMock, chain);
    const result = await cancelRemindersForBooking({ bookingId: "100" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Update failed");
  });
});

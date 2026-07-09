/**
 * checkin-counter.smoke.ts
 * Guardian smoke test — verifies check-in components import without errors.
 */

import { describe, test, expect } from "vitest";

describe("Check-in Counter smoke", () => {
  test("checkin repository exports expected methods", async () => {
    const repo = await import("~/utils/repositories/checkin");
    expect(repo.checkinRepository).toBeDefined();
  });

  test("booking-leg-passenger repository exports expected methods", async () => {
    const repo = await import("~/utils/repositories/booking-leg-passenger");
    expect(repo.bookingLegPassengerRepository).toBeDefined();
  });

  test("CardProcessor component imports", async () => {
    const mod = await import("~/components/checkin/CardProcessor");
    expect(mod.default).toBeDefined();
  });

  test("CashKeypad component imports", async () => {
    const mod = await import("~/components/checkin/CashKeypad");
    expect(mod.default).toBeDefined();
  });

  test("CheckinSidebar component imports", async () => {
    const mod = await import("~/components/checkin/CheckinSidebar");
    expect(mod.default).toBeDefined();
  });

  test("check-in-time utility imports", async () => {
    const util = await import("~/utils/check-in-time.server");
    expect(util).toBeDefined();
  });
});

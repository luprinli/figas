/**
 * booking-list.smoke.ts
 * Guardian smoke test — verifies booking components import without errors.
 */

import { describe, test, expect } from "vitest";

describe("Booking List smoke", () => {
  test("BookingWizard component imports", async () => {
    const mod = await import("~/components/BookingWizard");
    expect(mod.default).toBeDefined();
  });

  test("BookingCard component imports", async () => {
    const mod = await import("~/components/BookingCard");
    expect(mod.default).toBeDefined();
  });

  test("PassengerForm component imports", async () => {
    const mod = await import("~/components/PassengerForm");
    expect(mod.default).toBeDefined();
  });

  test("booking repository exports CRUD methods", async () => {
    const repo = await import("~/utils/repositories/booking");
    expect(repo.bookingRepository).toBeDefined();
  });

  test("booking leg repository exports CRUD methods", async () => {
    const repo = await import("~/utils/repositories/booking-leg");
    expect(repo.bookingLegRepository).toBeDefined();
  });

  test("pricing engine imports", async () => {
    const pricing = await import("~/utils/pricing/pricing-engine.server");
    expect(pricing).toBeDefined();
  });
});

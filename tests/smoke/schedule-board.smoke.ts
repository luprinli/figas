/**
 * schedule-board.smoke.ts
 * Guardian smoke test — verifies schedule board components import without errors.
 */

import { describe, test, expect } from "vitest";

describe("Schedule Board smoke", () => {
  test("ScheduleBoard component imports", async () => {
    const mod = await import("~/components/schedule/ScheduleBoard");
    expect(mod.default).toBeDefined();
  });

  test("ScheduleStatusBar component imports", async () => {
    const mod = await import("~/components/schedule/ScheduleStatusBar");
    expect(mod.default).toBeDefined();
  });

  test("FlightCard component imports", async () => {
    const mod = await import("~/components/schedule/FlightCard");
    expect(mod.default).toBeDefined();
  });

  test("schedule-handlers.server exports expected handlers", async () => {
    const handlers = await import("~/utils/schedule-handlers.server");
    expect(typeof handlers.handleAutoBuild).toBe("function");
    expect(typeof handlers.handleApprove).toBe("function");
    expect(typeof handlers.handlePublish).toBe("function");
    expect(typeof handlers.handleRevise).toBe("function");
    expect(typeof handlers.handleCancel).toBe("function");
  });

  test("schedule repository exports CRUD methods", async () => {
    const repo = await import("~/utils/repositories/schedule");
    expect(repo.scheduleRepository).toBeDefined();
  });
});

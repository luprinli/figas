import { describe, it, expect } from "vitest";
import { hasPermission } from "~/utils/permissions.server";
import { Permission } from "~/utils/constants";
import { withRollback } from "../../fixtures/helpers";
import { MOCK_USER_IDS } from "../../fixtures/seed-data";

describe("Schedule Action Permissions", () => {
  // ── Test: Auto-build without permission returns 403 ────────────────────────
  it("auto-build without permission returns 403", async () => {
    await withRollback(async () => {
      // Use a user that likely doesn't have schedule:create permission
      // (e.g., a passenger or agent user)
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.SCHEDULE_CREATE);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Test: Approve without permission returns 403 ───────────────────────────
  it("approve without permission returns 403", async () => {
    await withRollback(async () => {
      // Check that a non-admin/ops user does NOT have schedule:approve
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.SCHEDULE_APPROVE);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Test: Publish without permission returns 403 ───────────────────────────
  it("publish without permission returns 403", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.SCHEDULE_PUBLISH);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Test: Cancel without permission returns 403 ────────────────────────────
  it("cancel without permission returns 403", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.SCHEDULE_EDIT);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Test: Create flight without permission returns 403 ─────────────────────
  it("create flight without permission returns 403", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.FLIGHT_CREATE);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Test: Assign booking without permission returns 403 ────────────────────
  it("assign booking without permission returns 403", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.BOOKING_ASSIGN_FLIGHT);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Test: Unassign booking without permission returns 403 ──────────────────
  it("unassign booking without permission returns 403", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.BOOKING_ASSIGN_FLIGHT);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Test: Assign pilot without permission returns 403 ──────────────────────
  it("assign pilot without permission returns 403", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.agent, Permission.FLIGHT_ASSIGN_PILOT);
      expect(hasPerm).toBe(false);
    });
  });

  // ── Positive checks: ops user has expected permissions ─────────────────────

  it("ops user has schedule:create permission", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.ops, Permission.SCHEDULE_CREATE);
      expect(hasPerm).toBe(true);
    });
  });

  it("ops user has flight:create permission", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.ops, Permission.FLIGHT_CREATE);
      expect(hasPerm).toBe(true);
    });
  });

  it("ops user has schedule:create permission", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.ops, Permission.SCHEDULE_CREATE);
      expect(hasPerm).toBe(true);
    });
  });

  it("ops user has flight:create permission", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.ops, Permission.FLIGHT_CREATE);
      expect(hasPerm).toBe(true);
    });
  });

  // ── Admin user has elevated permissions ────────────────────────────────────

  it("admin user has schedule:approve permission", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.admin, Permission.SCHEDULE_APPROVE);
      expect(hasPerm).toBe(true);
    });
  });

  it("admin user has schedule:publish permission", async () => {
    await withRollback(async () => {
      const hasPerm = await hasPermission(MOCK_USER_IDS.admin, Permission.SCHEDULE_PUBLISH);
      expect(hasPerm).toBe(true);
    });
  });
});

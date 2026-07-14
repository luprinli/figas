import { describe, it, expect, vi, beforeEach } from "vitest";

const { sqlExecute } = vi.hoisted(() => {
  const sqlExecute = vi.fn(() => ({ rows: [] }));
  return { sqlExecute };
});

let notificationRepoCreate = vi.fn();

vi.mock("~/utils/db.server.kysely", () => ({ get kdb() { return {}; } }));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return { ...actual, sql: () => ({ execute: sqlExecute }) };
});
vi.mock("~/utils/repositories/notification", () => ({
  notificationRepository: {
    create: (...args: unknown[]) => notificationRepoCreate(...args),
  },
}));

import {
  notifyPilotAccepted,
  notifyPilotDeclined,
  notifyFuelOrderIssued,
  notifyFuelUpliftRecorded,
  notifyFlightLogSubmitted,
  notifyDefectReported,
} from "~/utils/services/efb-notification.service";

beforeEach(() => {
  vi.clearAllMocks();
  (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [] });
  notificationRepoCreate = vi.fn();
});

// ---------------------------------------------------------------------------
describe("notifyPilotAccepted()", () => {
  it("creates notification for ops when ops email found", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [{ email: "ops@figas.gov.fk" }] });
    await notifyPilotAccepted(10);
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_type: "pilot_accepted",
        recipient_email: "ops@figas.gov.fk",
        recipient_type: "operations",
        flight_id: 10,
      })
    );
  });

  it("does nothing when no ops email found", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [] });
    await notifyPilotAccepted(10);
    expect(notificationRepoCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("notifyPilotDeclined()", () => {
  it("creates notification for ops on pilot decline", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [{ email: "ops@figas.gov.fk" }] });
    await notifyPilotDeclined(20);
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ notification_type: "pilot_declined", flight_id: 20 })
    );
  });

  it("does nothing when no ops email", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [] });
    await notifyPilotDeclined(20);
    expect(notificationRepoCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("notifyFuelOrderIssued()", () => {
  it("creates fuel order notification for ops", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [{ email: "ops@figas.gov.fk" }] });
    await notifyFuelOrderIssued(30);
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ notification_type: "fuel_order_issued", flight_id: 30 })
    );
  });
});

// ---------------------------------------------------------------------------
describe("notifyFuelUpliftRecorded()", () => {
  it("creates uplift notification for ops", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [{ email: "ops@figas.gov.fk" }] });
    await notifyFuelUpliftRecorded(40);
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ notification_type: "fuel_uplift_recorded" })
    );
  });
});

// ---------------------------------------------------------------------------
describe("notifyFlightLogSubmitted()", () => {
  it("notifies both ops and finance when both exist", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ rows: [{ email: "ops@figas.gov.fk" }] })
      .mockReturnValueOnce({ rows: [{ email: "finance@figas.gov.fk" }] });
    await notifyFlightLogSubmitted(50);
    expect(notificationRepoCreate).toHaveBeenCalledTimes(2);
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_type: "operations" })
    );
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_type: "finance" })
    );
  });

  it("notifies only ops when finance doesn't exist", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ rows: [{ email: "ops@figas.gov.fk" }] })
      .mockReturnValueOnce({ rows: [] });
    await notifyFlightLogSubmitted(50);
    expect(notificationRepoCreate).toHaveBeenCalledTimes(1);
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_type: "operations" })
    );
  });
});

// ---------------------------------------------------------------------------
describe("notifyDefectReported()", () => {
  it("creates defect notification for engineer", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [{ email: "engineer@figas.gov.fk" }] });
    await notifyDefectReported(60);
    expect(notificationRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ notification_type: "defect_reported", recipient_type: "engineer" })
    );
  });

  it("does nothing when no engineer exists", async () => {
    (sqlExecute as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [] });
    await notifyDefectReported(60);
    expect(notificationRepoCreate).not.toHaveBeenCalled();
  });
});

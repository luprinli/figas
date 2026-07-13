import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requirePermission, hasPermission } from "../../utils/permissions.server";
import { handleAutoBuild, handleApprove, handleRevise, handlePublish, handleCancel, handleCreateFlightFromBooking, handleUnassignBooking, handleAssignBooking, handleTransferBooking, handleAssignPilot, handleAssignAircraft, handleReorderFlights, handleResetDraft, handleRemoveFlight } from "../../utils/schedule-handlers.server";
import { convertBigInts } from "../../utils/bigint";
import { todayISO } from "../../utils/dates";
import { validateCsrfRequest } from "../../utils/csrf-check.server";
import type { ScheduleBuildResult } from "../../utils/scheduling/types";

export async function action({ request }: ActionFunctionArgs) {
  const user = await requirePermission(request, "schedule:create");
  const formData = await request.formData();

  if (!(await validateCsrfRequest(request, formData))) {
    return json({ error: "CSRF token validation failed" }, { status: 403 });
  }
  const intent = formData.get("intent")?.toString();
  const date = formData.get("date")?.toString() ?? todayISO();

  // Helper to check a specific permission and return 403 if denied
  async function requireActionPermission(permission: string): Promise<boolean> {
    const allowed = await hasPermission(Number(user.id), permission);
    if (!allowed) return false;
    return true;
  }

  // Helper to return a successful JSON response with the intent echoed back
  // so the frontend can identify which operation completed without relying on
  // a shared mutable ref (which causes race conditions during rapid drag ops).
  function ok(result: Record<string, unknown>) {
    return json({ ...result, intent });
  }

  switch (intent) {
    case "auto-build": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to build schedules" }, { status: 403 });
      }
      const result = await handleAutoBuild(date, Number(user.id));
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok({ success: true, buildResult: (result as { result?: ScheduleBuildResult }).result ?? null });
    }
    case "preview-build": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to preview schedules" }, { status: 403 });
      }
      const { handlePreviewBuild } = await import("../../utils/schedule-handlers.server");
      const result = await handlePreviewBuild(date);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "accept-build": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to build schedules" }, { status: 403 });
      }
      const { handleAcceptBuild } = await import("../../utils/schedule-handlers.server");
      const result = await handleAcceptBuild(date, Number(user.id));
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "approve": {
      if (!(await requireActionPermission("schedule:approve"))) {
        return json({ error: "You do not have permission to approve schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleApprove(scheduleId, Number(user.id));
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "revise": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to revise schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleRevise(scheduleId, Number(user.id));
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "publish": {
      if (!(await requireActionPermission("schedule:publish"))) {
        return json({ error: "You do not have permission to publish schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handlePublish(scheduleId, Number(user.id));
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "publish-schedule": {
      if (!(await requireActionPermission("schedule:publish"))) {
        return json({ error: "You do not have permission to publish schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const { publishSchedule } = await import("../../utils/publishing/publish.server");
      const result = await publishSchedule(scheduleId, Number(user.id));
      if (result.error) return json({ error: result.error }, { status: 400 });
      return ok(result);
    }
    case "cancel": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to cancel schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const cancellationReason = formData.get("cancellationReason")?.toString() ?? "";
      const result = await handleCancel(scheduleId, Number(user.id), cancellationReason);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "reorder-flights": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to reorder flights" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const flightIdsRaw = formData.get("flightIds")?.toString();
      if (!flightIdsRaw) return json({ error: "No flight IDs provided" }, { status: 400 });
      const flightIds: number[] = JSON.parse(flightIdsRaw);
      const result = await handleReorderFlights(scheduleId, flightIds);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 500 });
      return ok(result);
    }
    case "assign-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to assign bookings" }, { status: 403 });
      }
      const bookingLegId = Number(formData.get("bookingLegId"));
      const flightId = Number(formData.get("flightId"));
      const bookingLegPassengerId = formData.get("bookingLegPassengerId") ? Number(formData.get("bookingLegPassengerId")) : undefined;
      const result = await handleAssignBooking(bookingLegId, flightId, bookingLegPassengerId);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "transfer-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to transfer bookings" }, { status: 403 });
      }
      const bookingLegPassengerId = Number(formData.get("bookingLegPassengerId"));
      const targetFlightId = Number(formData.get("targetFlightId"));
      const result = await handleTransferBooking(bookingLegPassengerId, targetFlightId);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "create-flight-from-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to create flights" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const bookingLegIdsRaw = formData.get("bookingLegIds")?.toString();
      if (!bookingLegIdsRaw) return json({ error: "No booking leg IDs provided" }, { status: 400 });
      const bookingLegIds: number[] = JSON.parse(bookingLegIdsRaw);
      const bookingLegPassengerIdsRaw = formData.get("bookingLegPassengerIds")?.toString();
      const bookingLegPassengerIds: number[] | undefined = bookingLegPassengerIdsRaw ? JSON.parse(bookingLegPassengerIdsRaw) : undefined;
      const result = await handleCreateFlightFromBooking(scheduleId, bookingLegIds, {
        date: formData.get("date")?.toString(),
        createdBy: Number(user.id),
        bookingLegPassengerIds,
      });
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      // Convert BigInt values from raw SQL queries before JSON serialization.
      // db.query() delegates to $queryRawUnsafe which returns BigInt for
      // integer columns; JSON.stringify (used by Remix's json() helper)
      // cannot serialize BigInt and would throw a TypeError, preventing
      // the frontend from receiving the created flight data.
      return ok(convertBigInts(result));
    }
    case "unassign-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to unassign bookings" }, { status: 403 });
      }
      const bookingLegId = Number(formData.get("bookingLegId"));
      const bookingLegPassengerId = formData.get("bookingLegPassengerId") ? Number(formData.get("bookingLegPassengerId")) : undefined;
      const result = await handleUnassignBooking(bookingLegId, bookingLegPassengerId);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "remove-flight": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to remove flights" }, { status: 403 });
      }
      const flightId = Number(formData.get("flightId"));
      const result = await handleRemoveFlight(flightId);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(convertBigInts(result));
    }
    case "assign-pilot": {
      if (!(await requireActionPermission("schedule:assign-pilot"))) {
        return json({ error: "You do not have permission to assign pilots" }, { status: 403 });
      }
      const flightId = Number(formData.get("flightId"));
      const pilotId = Number(formData.get("pilotId"));
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleAssignPilot(flightId, pilotId, scheduleId, Number(user.id));
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "assign-aircraft": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to assign aircraft" }, { status: 403 });
      }
      const flightId = Number(formData.get("flightId"));
      const aircraftId = Number(formData.get("aircraftId"));
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleAssignAircraft(flightId, aircraftId, scheduleId, Number(user.id));
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    case "suggest-route": {
      const passengersRaw = formData.get("passengers")?.toString();
      if (!passengersRaw) return json({ error: "No passenger data provided" }, { status: 400 });
      const passengers = JSON.parse(passengersRaw);
      const { suggestRoute } = await import("../../utils/scheduling/suggest-route.server");
      const result = await suggestRoute(passengers);
      return ok((result ?? {}) as Record<string, unknown>);
    }
    case "reset-draft": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to reset schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleResetDraft(scheduleId);
      if (result.error) return json({ ...result, intent }, { status: (result as { status?: number }).status ?? 400 });
      return ok(result);
    }
    default:
      return json({ error: `Unknown intent: ${intent}` }, { status: 400 });
  }
}
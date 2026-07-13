import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": {
      const aircraft_id = Number(formData.get("aircraft_id"));
      const last_reading_date = formData.get("last_reading_date") as string;
      const total_hours = formData.get("total_hours") as string;
      const next_check_date = (formData.get("next_check_date") as string) || null;
      const next_check_type = formData.get("next_check_type")
        ? Number(formData.get("next_check_type"))
        : null;
      const days_remaining = formData.get("days_remaining")
        ? Number(formData.get("days_remaining"))
        : null;
      const next_check_due_hours =
        (formData.get("next_check_due_hours") as string) || null;
      const hours_until_next_check =
        (formData.get("hours_until_next_check") as string) || null;
      const next_500_hour_check =
        (formData.get("next_500_hour_check") as string) || null;
      const hours_until_500_check =
        (formData.get("hours_until_500_check") as string) || null;
      const next_1000_hour_check =
        (formData.get("next_1000_hour_check") as string) || null;
      const hours_until_1000_check =
        (formData.get("hours_until_1000_check") as string) || null;
      const status = (formData.get("status") as string) || null;

      if (!aircraft_id || !last_reading_date || !total_hours) {
        return json(
          { error: "Aircraft, last reading date, and total hours are required" },
          { status: 400 }
        );
      }

      try {
        await adminRepository.createAirframeHour({
          aircraft_id,
          last_reading_date,
          total_hours,
          next_check_date,
          next_check_type,
          days_remaining,
          next_check_due_hours,
          hours_until_next_check,
          next_500_hour_check,
          hours_until_500_check,
          next_1000_hour_check,
          hours_until_1000_check,
          status,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to create airframe hour record";
        return json({ error: message }, { status: 400 });
      }
      break;
    }
    case "update": {
      const id = Number(formData.get("id"));
      const aircraft_id = Number(formData.get("aircraft_id"));
      const last_reading_date = formData.get("last_reading_date") as string;
      const total_hours = formData.get("total_hours") as string;
      const next_check_date = (formData.get("next_check_date") as string) || null;
      const next_check_type = formData.get("next_check_type")
        ? Number(formData.get("next_check_type"))
        : null;
      const days_remaining = formData.get("days_remaining")
        ? Number(formData.get("days_remaining"))
        : null;
      const next_check_due_hours =
        (formData.get("next_check_due_hours") as string) || null;
      const hours_until_next_check =
        (formData.get("hours_until_next_check") as string) || null;
      const next_500_hour_check =
        (formData.get("next_500_hour_check") as string) || null;
      const hours_until_500_check =
        (formData.get("hours_until_500_check") as string) || null;
      const next_1000_hour_check =
        (formData.get("next_1000_hour_check") as string) || null;
      const hours_until_1000_check =
        (formData.get("hours_until_1000_check") as string) || null;
      const status = (formData.get("status") as string) || null;

      if (id) {
        await adminRepository.updateAirframeHour(id, {
          aircraft_id,
          last_reading_date,
          total_hours,
          next_check_date,
          next_check_type,
          days_remaining,
          next_check_due_hours,
          hours_until_next_check,
          next_500_hour_check,
          hours_until_500_check,
          next_1000_hour_check,
          hours_until_1000_check,
          status,
        });
      }
      break;
    }
    case "delete": {
      const id = Number(formData.get("id"));
      if (id) {
        await adminRepository.deleteAirframeHour(id);
      }
      break;
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }

  return redirect("/admin/airframe-hours");
}

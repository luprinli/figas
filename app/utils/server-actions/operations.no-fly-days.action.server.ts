import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requirePermission } from "~/utils/permissions.server";
import { requireUser } from "~/utils/layout.server";
import { validateCsrfRequest } from "~/utils/csrf-check.server";
import { Permission } from "~/utils/constants";
import {
  findAllRules,
  createRule,
  updateRule,
  toggleRuleActive,
  deleteRule,
  getNoFlyCalendar,
} from "~/utils/services/no-fly.service";
import { todayISO, daysFromNow } from "~/utils/dates";

const CALENDAR_LOOKAHEAD_DAYS = 90;

export async function loader({ request }: LoaderFunctionArgs) {
  const { userIdentity } = await requireUser(request);
  await requirePermission(request, Permission.NO_FLY_MANAGE);

  const rules = await findAllRules();
  const today = todayISO();
  const endDate = daysFromNow(CALENDAR_LOOKAHEAD_DAYS);
  const calendar = await getNoFlyCalendar(today, endDate);

  return json({ rules, calendar, today, userIdentity });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const numericUserId = Number(userId);
  await requirePermission(request, Permission.NO_FLY_MANAGE);

  const formData = await request.formData();

  if (!(await validateCsrfRequest(request, formData))) {
    return json({ error: "CSRF token validation failed" }, { status: 403 });
  }

  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": {
      const label = formData.get("label") as string;
      const description = (formData.get("description") as string) || undefined;
      const ruleType = formData.get("rule_type") as "recurring" | "one_off";
      const dayOfWeekValues = formData.getAll("day_of_week");
      const dayOfWeek = dayOfWeekValues.length > 0
        ? dayOfWeekValues.map((v) => parseInt(v as string, 10))
        : null;
      const seasonStart = (formData.get("season_start") as string) || undefined;
      const seasonEnd = (formData.get("season_end") as string) || undefined;
      const specificDate = (formData.get("specific_date") as string) || undefined;
      const priority = formData.get("priority")
        ? parseInt(formData.get("priority") as string, 10)
        : 0;
      if (!label || !ruleType) {
        return json({ error: "Label and rule type are required." }, { status: 400 });
      }

      try {
        await createRule({
          label,
          description,
          rule_type: ruleType,
          day_of_week: dayOfWeek,
          season_start: seasonStart ?? null,
          season_end: seasonEnd ?? null,
          specific_date: specificDate ?? null,
          priority,
          override_reason: (formData.get("override_reason") as string) || undefined,
          created_by: numericUserId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create rule";
        return json({ error: message }, { status: 400 });
      }
      break;
    }

    case "update": {
      const id = parseInt(formData.get("rule_id") as string, 10);
      if (isNaN(id)) {
        return json({ error: "Invalid rule ID." }, { status: 400 });
      }

      const label = formData.get("label") as string | undefined;
      const description = formData.get("description") as string | null | undefined;
      const isActive = formData.has("is_active")
        ? formData.get("is_active") === "true"
        : undefined;
      const dayOfWeekValues = formData.getAll("day_of_week");
      const dayOfWeek = dayOfWeekValues.length > 0
        ? dayOfWeekValues.map((v) => parseInt(v as string, 10))
        : undefined;
      const seasonStart = formData.get("season_start") as string | null | undefined;
      const seasonEnd = formData.get("season_end") as string | null | undefined;
      const specificDate = formData.get("specific_date") as string | null | undefined;
      const priority = formData.get("priority")
        ? parseInt(formData.get("priority") as string, 10)
        : undefined;
      const overrideReason = formData.get("override_reason") as string | null | undefined;

      try {
        await updateRule(id, {
          label,
          description: description === "" ? null : description,
          is_active: isActive,
          day_of_week: dayOfWeek,
          season_start: seasonStart === "" ? null : seasonStart,
          season_end: seasonEnd === "" ? null : seasonEnd,
          specific_date: specificDate === "" ? null : specificDate,
          priority,
          override_reason: overrideReason === "" ? null : overrideReason,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update rule";
        return json({ error: message }, { status: 400 });
      }
      break;
    }

    case "toggle": {
      const id = parseInt(formData.get("rule_id") as string, 10);
      if (isNaN(id)) {
        return json({ error: "Invalid rule ID." }, { status: 400 });
      }
      try {
        await toggleRuleActive(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to toggle rule";
        return json({ error: message }, { status: 400 });
      }
      break;
    }

    case "delete": {
      const id = parseInt(formData.get("rule_id") as string, 10);
      if (isNaN(id)) {
        return json({ error: "Invalid rule ID." }, { status: 400 });
      }
      try {
        await deleteRule(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete rule";
        return json({ error: message }, { status: 400 });
      }
      break;
    }

    default:
      return json({ error: "Unknown intent." }, { status: 400 });
  }

  return null;
}

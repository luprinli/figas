import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useSubmit, useNavigation } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState, useMemo, useCallback } from "react";
import { requirePermission } from "../utils/permissions.server";
import { requireUser } from "../utils/layout.server";
import { Permission } from "../utils/constants";
import {
  findAllRules,
  createRule,
  updateRule,
  toggleRuleActive,
  deleteRule,
  getNoFlyCalendar,
  type NoFlyRuleRow,
} from "../utils/services/no-fly.service";
import { todayISO, daysFromNow, MONTH_NAMES, DAY_NAMES_SHORT, getCalendarGrid, formatDate } from "../utils/dates";
import DatePicker from "../components/DatePicker";

// ── Meta ──────────────────────────────────────────────────────────────────────

export const meta: MetaFunction = () => [{ title: "No Fly Days - Operations - FIGAS" }];

// ── Constants ─────────────────────────────────────────────────────────────────

const CALENDAR_LOOKAHEAD_DAYS = 90;

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { userIdentity } = await requireUser(request);
  await requirePermission(request, Permission.NO_FLY_MANAGE);

  const rules = await findAllRules();
  const today = todayISO();
  const endDate = daysFromNow(CALENDAR_LOOKAHEAD_DAYS);
  const calendar = await getNoFlyCalendar(today, endDate);

  return json({ rules, calendar, today, userIdentity });
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const numericUserId = Number(userId);
  await requirePermission(request, Permission.NO_FLY_MANAGE);

  const formData = await request.formData();
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

  return null; // Triggers revalidation of the loader
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDisplayDate(dateStr: string | Date | null | undefined): string {
  // pg returns DATE columns as Date objects; convert to YYYY-MM-DD string
  if (typeof dateStr !== "string") {
    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      const y = dateStr.getFullYear();
      const m = String(dateStr.getMonth() + 1).padStart(2, "0");
      const d = String(dateStr.getDate()).padStart(2, "0");
      dateStr = `${y}-${m}-${d}`;
    } else {
      return "";
    }
  }
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const year = parseInt(parts[0], 10);
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${day}, ${year}`;
}

function getRuleSummary(rule: NoFlyRuleRow): string {
  if (rule.rule_type === "one_off") {
    return `One-off: ${formatDisplayDate(rule.specific_date ?? "")}`;
  }
  const dayNames = rule.day_of_week?.map((d) => DAY_NAMES[d]).join(", ") ?? "Unknown";
  if (rule.season_start && rule.season_end) {
    return `Recurring: Every ${dayNames} (${formatDisplayDate(rule.season_start)} – ${formatDisplayDate(rule.season_end)})`;
  }
  return `Recurring: Every ${dayNames}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NoFlyDaysPage() {
  const { rules, calendar, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<NoFlyRuleRow | null>(null);
  const [modalTab, setModalTab] = useState<"recurring" | "one_off">("recurring");

  // Date picker state for the modal
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [specificDate, setSpecificDate] = useState("");

  // Calendar view state
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  // Build a Set of no-fly dates for quick lookup in the calendar
  const noFlyDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const day of calendar) {
      if (day.isNoFly) s.add(day.date);
    }
    return s;
  }, [calendar]);

  // Build a map of date -> rule info for tooltips
  const noFlyInfoMap = useMemo(() => {
    const m = new Map<string, { ruleIds: number[]; labels: string[] }>();
    for (const day of calendar) {
      if (day.isNoFly) {
        m.set(day.date, { ruleIds: day.ruleIds, labels: day.labels });
      }
    }
    return m;
  }, [calendar]);

  // Calendar grid for the selected month
  const grid = useMemo(
    () => getCalendarGrid(calMonth.year, calMonth.month),
    [calMonth],
  );

  const shiftMonth = useCallback((delta: number) => {
    setCalMonth((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      return { year: y, month: m };
    });
  }, []);

  function openCreateModal() {
    setEditingRule(null);
    setModalTab("recurring");
    setSeasonStart("");
    setSeasonEnd("");
    setSpecificDate("");
    setShowModal(true);
  }

  function openEditModal(rule: NoFlyRuleRow) {
    setEditingRule(rule);
    setModalTab(rule.rule_type);
    setSeasonStart(rule.season_start ?? "");
    setSeasonEnd(rule.season_end ?? "");
    setSpecificDate(rule.specific_date ?? "");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingRule(null);
    setSeasonStart("");
    setSeasonEnd("");
    setSpecificDate("");
  }

  function handleToggle(ruleId: number) {
    const form = new FormData();
    form.set("intent", "toggle");
    form.set("rule_id", String(ruleId));
    submit(form, { method: "post" });
  }

  function handleDelete(ruleId: number) {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    const form = new FormData();
    form.set("intent", "delete");
    form.set("rule_id", String(ruleId));
    submit(form, { method: "post" });
  }

  // Count no-fly days in the visible calendar month
  const noFlyCountInMonth = useMemo(() => {
    let count = 0;
    for (const day of calendar) {
      const parts = day.date.split("-");
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[0], 10);
        if (m === calMonth.month && y === calMonth.year && day.isNoFly) {
          count++;
        }
      }
    }
    return count;
  }, [calendar, calMonth]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto px-4 py-6 max-w-7xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">No Fly Days</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage days on which flight bookings cannot be made.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add Rule
        </button>
      </div>

      {/* Error banner */}
      {actionData?.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700">
          {actionData.error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column: Effective Calendar ─────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Effective No-Fly Calendar</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {noFlyCountInMonth} no-fly day{noFlyCountInMonth !== 1 ? "s" : ""} this month
              </span>
            </div>

            <div className="p-6">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                  aria-label="Previous month"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>
                <span className="text-base font-semibold text-slate-700 dark:text-slate-200">
                  {MONTH_NAMES[calMonth.month - 1]} {calMonth.year}
                </span>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                  aria-label="Next month"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Day-of-week header */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES_SHORT.map((name) => (
                  <div key={name} className="h-8 text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-center">
                    {name}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7">
                {grid.map((day, idx) => {
                  if (day === null) {
                    return <div key={idx} className="h-10" />;
                  }
                  const dateStr = formatDate(calMonth.year, calMonth.month, day);
                  const isNoFly = noFlyDateSet.has(dateStr);
                  const isToday = dateStr === today;
                  const info = noFlyInfoMap.get(dateStr);

                  return (
                    <div
                      key={idx}
                      className={`h-10 flex items-center justify-center text-sm relative ${
                        isNoFly
                          ? "text-red-500 line-through cursor-default"
                          : isToday
                            ? "font-bold text-slate-900 dark:text-slate-100"
                            : "text-slate-600 dark:text-slate-300 dark:text-slate-500"
                      }`}
                      title={info ? info.labels.join(", ") : undefined}
                    >
                      {day}
                      {isNoFly && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-400" />
                      )}
                      {isToday && !isNoFly && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-400" /> No-fly day
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400" /> Today
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: Rules list ────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Rules ({rules.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
              {rules.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400 italic">
                  No rules defined yet.
                </div>
              ) : (
                rules.map((rule) => (
                  <div key={rule.id} className={`px-6 py-4 ${!rule.is_active ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {rule.label}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {getRuleSummary(rule)}
                        </p>
                        {rule.override_reason && (
                          <p className="text-xs text-amber-600 mt-0.5 italic">
                            {rule.override_reason}
                          </p>
                        )}
                        {rule.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {rule.description}
                          </p>
                        )}
                      </div>

                      {/* Active badge */}
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          rule.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500 dark:text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Disabled"}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggle(rule.id)}
                        disabled={isSubmitting}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                          rule.is_active
                            ? "text-amber-600 hover:bg-amber-50"
                            : "text-green-600 hover:bg-green-50"
                        }`}
                      >
                        {rule.is_active ? "Disable" : "Enable"}
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => openEditModal(rule)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        Edit
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:bg-red-900/30 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Add/Edit Modal ────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl dark:shadow-slate-900/50 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <Form method="post" onSubmit={closeModal}>
              <input
                type="hidden"
                name="intent"
                value={editingRule ? "update" : "create"}
              />
              {editingRule && (
                <input type="hidden" name="rule_id" value={editingRule.id} />
              )}

              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {editingRule ? "Edit Rule" : "Add Rule"}
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              {/* Modal body */}
              <div className="px-6 py-4 space-y-4">
                {/* Label */}
                <div>
                  <label htmlFor="label" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Label <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="label"
                    name="label"
                    type="text"
                    required
                    defaultValue={editingRule?.label ?? ""}
                    placeholder="e.g., Christmas Day, Winter Wednesdays"
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    defaultValue={editingRule?.description ?? ""}
                    placeholder="Optional description or notes"
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* Rule type tabs */}
                <div>
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Rule Type
                  </span>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="radiogroup" aria-label="Rule Type">
                    <button
                      type="button"
                      onClick={() => setModalTab("recurring")}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        modalTab === "recurring"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-700"
                      }`}
                    >
                      Recurring
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab("one_off")}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        modalTab === "one_off"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-700"
                      }`}
                    >
                      One-Off
                    </button>
                  </div>
                  <input type="hidden" name="rule_type" value={modalTab} />
                </div>

                {/* Recurring fields */}
                {modalTab === "recurring" && (
                  <>
                    <div>
                      <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                        Days of Week <span className="text-red-500">*</span>
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {DAY_NAMES.map((name, idx) => {
                          const checked = editingRule?.day_of_week?.includes(idx) ?? false;
                          return (
                            <label
                              key={idx}
                              className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                name="day_of_week"
                                value={idx}
                                defaultChecked={checked}
                                className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                              />
                              {name.slice(0, 3)}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Season Start
                        </label>
                        <DatePicker
                          value={seasonStart}
                          onChange={setSeasonStart}
                          label="Season Start"
                        />
                        <input type="hidden" name="season_start" value={seasonStart} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Season End
                        </label>
                        <DatePicker
                          value={seasonEnd}
                          onChange={setSeasonEnd}
                          label="Season End"
                        />
                        <input type="hidden" name="season_end" value={seasonEnd} />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      Leave season dates empty for year-round recurrence.
                    </p>
                  </>
                )}

                {/* One-off fields */}
                {modalTab === "one_off" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      value={specificDate}
                      onChange={setSpecificDate}
                      label="Date"
                    />
                    <input type="hidden" name="specific_date" value={specificDate} />
                  </div>
                )}

                {/* Priority */}
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Priority
                  </label>
                  <input
                    id="priority"
                    name="priority"
                    type="number"
                    min={0}
                    defaultValue={editingRule?.priority ?? 0}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Higher priority overrides lower. One-off rules always beat recurring.
                  </p>
                </div>

                {/* Override reason */}
                <div>
                  <label htmlFor="override_reason" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Override Reason
                  </label>
                  <input
                    id="override_reason"
                    name="override_reason"
                    type="text"
                    defaultValue={editingRule?.override_reason ?? ""}
                    placeholder="e.g., Overrides recurring Wednesday rule"
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}
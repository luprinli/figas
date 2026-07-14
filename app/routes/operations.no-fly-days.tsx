import type { MetaFunction } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useSubmit, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";

export { loader, action } from "~/utils/server-actions/operations.no-fly-days.action.server";
import type { loader, action } from "~/utils/server-actions/operations.no-fly-days.action.server";

import { useState, useMemo, useCallback } from "react";
import { useCsrf } from "~/utils/use-csrf";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { NoFlyRuleRow } from "../utils/services/no-fly.service";
import { MONTH_NAMES, DAY_NAMES_SHORT, getCalendarGrid, formatDate } from "../utils/dates";
import DatePicker from "../components/DatePicker";
import Button from "../components/Button";

// Ã¢â€â‚¬Ã¢â€â‚¬ Meta Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export const meta: MetaFunction = () => [{ title: "No Fly Days - Operations - FIGAS" }];

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

// Ã¢â€â‚¬Ã¢â€â‚¬ Component Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export default function NoFlyDaysPage() {
  const { rules, calendar, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const { csrfHiddenInput } = useCsrf();

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Render Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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
        <Button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          Add Rule
        </Button>
      </div>

      {/* Error banner */}
      {actionData?.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700">
          {actionData.error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Left column: Effective Calendar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Effective No-Fly Calendar</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {noFlyCountInMonth} no-fly day{noFlyCountInMonth !== 1 ? "s" : ""} this month
              </span>
            </div>

            <div className="p-6">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <Button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={20} />
                </Button>
                <span className="text-base font-semibold text-slate-700 dark:text-slate-200">
                  {MONTH_NAMES[calMonth.month - 1]} {calMonth.year}
                </span>
                <Button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight size={20} />
                </Button>
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
              <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Right column: Rules list Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
            <div className="border-b border-slate-100 dark:border-slate-700 px-6 py-4">
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
                  <div key={rule.id} className={`px-6 py-4 ${!rule.is_active ? "opacity-50 dark:opacity-60" : ""}`}>
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
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Disabled"}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      {/* Toggle */}
                      <Button
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
                      </Button>

                      {/* Edit */}
                      <Button
                        type="button"
                        onClick={() => openEditModal(rule)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        Edit
                      </Button>

                      {/* Delete */}
                      <Button
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:bg-red-900/30 transition-colors"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Add/Edit Modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl dark:shadow-slate-900/50 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <Form method="post" onSubmit={closeModal}>
              {csrfHiddenInput}
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
                <Button
                  type="button"
                  onClick={closeModal}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                >
                  <X size={20} />
                </Button>
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
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* Rule type tabs */}
                <div>
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Rule Type
                  </span>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="radiogroup" aria-label="Rule Type">
                    <Button
                      type="button"
                      onClick={() => setModalTab("recurring")}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        modalTab === "recurring"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      Recurring
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setModalTab("one_off")}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        modalTab === "one_off"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      One-Off
                    </Button>
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
                                className="rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-blue-600 focus:ring-blue-500"
                              />
                              {name.slice(0, 3)}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Season Start
                        </span>
                        <DatePicker
                          value={seasonStart}
                          onChange={setSeasonStart}
                          label="Season Start"
                        />
                        <input type="hidden" name="season_start" value={seasonStart} />
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Season End
                        </span>
                        <DatePicker
                          value={seasonEnd}
                          onChange={setSeasonEnd}
                          label="Season End"
                        />
                        <input type="hidden" name="season_end" value={seasonEnd} />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Leave season dates empty for year-round recurrence.
                    </p>
                  </>
                )}

                {/* One-off fields */}
                {modalTab === "one_off" && (
                  <div>
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Date <span className="text-red-500">*</span>
                    </span>
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
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
                <Button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 dark:opacity-60 transition-colors"
                >
                  {isSubmitting ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
                </Button>
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.statusText}</p>
          <Button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <Button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</Button>
      </div>
    </div>
  );
}
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useActionData, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";

export { action } from "./admin.airframe-hours.action.server";
import type { action } from "./admin.airframe-hours.action.server";

import { useState } from "react";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import DatePicker from "../components/DatePicker";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = DEFAULT_PAGE_SIZE;

  const [result, aircraftList] = await Promise.all([
    adminRepository.getAllAirframeHoursPaginated(page, perPage),
    adminRepository.getAllAircraft(),
  ]);

  return json({
    items: result.rows,
    totalCount: result.totalCount,
    page,
    totalPages: Math.ceil(result.totalCount / perPage),
    aircraftList,
  });
}

export default function ManageAirframeHours() {
  const { items, totalCount, page, totalPages, aircraftList } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Create form state
  const [createLastReadingDate, setCreateLastReadingDate] = useState("");
  const [createNextCheckDate, setCreateNextCheckDate] = useState("");

  // Edit form state (keyed by record id)
  const [editDates, setEditDates] = useState<Record<number, { last_reading_date: string; next_check_date: string }>>({});

  function getEditDate(id: number, field: "last_reading_date" | "next_check_date"): string {
    return editDates[id]?.[field] ?? "";
  }

  function setEditDate(id: number, field: "last_reading_date" | "next_check_date", value: string) {
    setEditDates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  const aircraftMap = new Map(
    aircraftList.map((a) => [a.id, a.registration])
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Manage Airframe Hours
      </h1>

      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {actionData.error}
        </div>
      )}

      {/* Create Airframe Hour Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Add Airframe Hour Record
        </h2>
        <Form
          method="post"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <input type="hidden" name="intent" value="create" />

          <div>
            <label
              htmlFor="create-aircraft-id"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Aircraft *
            </label>
            <select
              id="create-aircraft-id"
              name="aircraft_id"
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select aircraft...</option>
              {aircraftList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.registration}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Last Reading Date *
            </span>
            <DatePicker
              value={createLastReadingDate}
              onChange={setCreateLastReadingDate}
              label="Last Reading Date"
            />
            <input type="hidden" name="last_reading_date" value={createLastReadingDate} />
          </div>

          <div>
            <label
              htmlFor="create-total-hours"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Total Hours *
            </label>
            <input
              id="create-total-hours"
              type="text"
              name="total_hours"
              required
              placeholder="e.g. 1234.5"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Next Check Date
            </span>
            <DatePicker
              value={createNextCheckDate}
              onChange={setCreateNextCheckDate}
              label="Next Check Date"
            />
            <input type="hidden" name="next_check_date" value={createNextCheckDate} />
          </div>

          <div>
            <label
              htmlFor="create-next-check-type"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Next Check Type
            </label>
            <input
              id="create-next-check-type"
              type="number"
              name="next_check_type"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-days-remaining"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Days Remaining
            </label>
            <input
              id="create-days-remaining"
              type="number"
              name="days_remaining"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-next-check-due-hours"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Next Check Due Hours
            </label>
            <input
              id="create-next-check-due-hours"
              type="text"
              name="next_check_due_hours"
              placeholder="e.g. 1500.0"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-hours-until-next-check"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Hours Until Next Check
            </label>
            <input
              id="create-hours-until-next-check"
              type="text"
              name="hours_until_next_check"
              placeholder="e.g. 265.5"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-next-500-hour-check"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Next 500 Hour Check
            </label>
            <input
              id="create-next-500-hour-check"
              type="text"
              name="next_500_hour_check"
              placeholder="e.g. 2000.0"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-hours-until-500-check"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Hours Until 500 Check
            </label>
            <input
              id="create-hours-until-500-check"
              type="text"
              name="hours_until_500_check"
              placeholder="e.g. 765.5"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-next-1000-hour-check"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Next 1000 Hour Check
            </label>
            <input
              id="create-next-1000-hour-check"
              type="text"
              name="next_1000_hour_check"
              placeholder="e.g. 2500.0"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-hours-until-1000-check"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Hours Until 1000 Check
            </label>
            <input
              id="create-hours-until-1000-check"
              type="text"
              name="hours_until_1000_check"
              placeholder="e.g. 1265.5"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-status"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Status
            </label>
            <input
              id="create-status"
              type="text"
              name="status"
              placeholder="e.g. OK"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add Record
            </button>
          </div>
        </Form>
      </div>

      {/* Airframe Hours Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Airframe Hours ({totalCount})
          </h2>
        </div>
        {(() => {
          const statusBadge = (status: string | null | undefined) => {
            if (!status) return <span className="text-slate-500 dark:text-slate-400">Ã¢â‚¬â€</span>;
            let colorClass = "bg-yellow-100 text-yellow-800";
            if (status === "OK") colorClass = "bg-green-100 text-green-800";
            else if (status === "DUE" || status === "OVERDUE") colorClass = "bg-red-100 text-red-800";
            return (
              <span className={`px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
                {status}
              </span>
            );
          };

          const airframeColumns: Column<Record<string, unknown>>[] = [
            { key: "id", header: "ID" },
            {
              key: "aircraft_id",
              header: "Aircraft",
              render: (h) => <span>{aircraftMap.get(h.aircraft_id as number) ?? (h.aircraft_id as string)}</span>,
            },
            { key: "last_reading_date", header: "Last Reading" },
            { key: "total_hours", header: "Total Hours" },
            {
              key: "next_check_date",
              header: "Next Check Date",
              render: (h) => <span>{(h.next_check_date as string) ?? "Ã¢â‚¬â€"}</span>,
            },
            {
              key: "status",
              header: "Status",
              render: (h) => statusBadge(h.status as string | null | undefined),
            },
          ];
          return (
            <DataTable
              columns={airframeColumns}
              data={items as unknown as Array<Record<string, unknown>>}
              keyExtractor={(h) => h.id as number}
              sortable
              initialSortColumn="id"
              initialSortDirection="asc"
              emptyState={
                <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No airframe hour records found.
                </div>
              }
              actions={(h) => (
                <div className="flex gap-2">
                  {/* Edit form (inline) */}
                  <details className="relative">
                    <summary className="text-blue-600 hover:underline text-xs cursor-pointer">
                      Edit
                    </summary>
                    <div className="absolute left-0 top-6 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg dark:shadow-slate-900/50 p-4 w-96">
                      <Form method="post" className="space-y-2">
                        <input
                          type="hidden"
                          name="intent"
                          value="update"
                        />
                        <input
                          type="hidden"
                          name="id"
                          value={h.id as number}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label
                              htmlFor={`edit-aircraft-id-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Aircraft
                            </label>
                            <select
                              id={`edit-aircraft-id-${h.id as number}`}
                              name="aircraft_id"
                              required
                              defaultValue={h.aircraft_id as number}
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            >
                              {aircraftList.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.registration}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              Last Reading Date
                            </span>
                            <DatePicker
                              value={getEditDate(h.id as number, "last_reading_date") || (h.last_reading_date as string)}
                              onChange={(v) => setEditDate(h.id as number, "last_reading_date", v)}
                              label="Last Reading Date"
                            />
                            <input
                              type="hidden"
                              name="last_reading_date"
                              value={getEditDate(h.id as number, "last_reading_date") || (h.last_reading_date as string)}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-total-hours-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Total Hours
                            </label>
                            <input
                              id={`edit-total-hours-${h.id as number}`}
                              type="text"
                              name="total_hours"
                              defaultValue={h.total_hours as string}
                              required
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              Next Check Date
                            </span>
                            <DatePicker
                              value={getEditDate(h.id as number, "next_check_date") || ((h.next_check_date as string) ?? "")}
                              onChange={(v) => setEditDate(h.id as number, "next_check_date", v)}
                              label="Next Check Date"
                            />
                            <input
                              type="hidden"
                              name="next_check_date"
                              value={getEditDate(h.id as number, "next_check_date") || ((h.next_check_date as string) ?? "")}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-next-check-type-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Next Check Type
                            </label>
                            <input
                              id={`edit-next-check-type-${h.id as number}`}
                              type="number"
                              name="next_check_type"
                              defaultValue={
                                (h.next_check_type as number) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-days-remaining-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Days Remaining
                            </label>
                            <input
                              id={`edit-days-remaining-${h.id as number}`}
                              type="number"
                              name="days_remaining"
                              defaultValue={
                                (h.days_remaining as number) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-next-check-due-hours-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Next Check Due Hours
                            </label>
                            <input
                              id={`edit-next-check-due-hours-${h.id as number}`}
                              type="text"
                              name="next_check_due_hours"
                              defaultValue={
                                (h.next_check_due_hours as string) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-hours-until-next-check-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Hours Until Next Check
                            </label>
                            <input
                              id={`edit-hours-until-next-check-${h.id as number}`}
                              type="text"
                              name="hours_until_next_check"
                              defaultValue={
                                (h.hours_until_next_check as string) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-next-500-hour-check-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Next 500 Hour Check
                            </label>
                            <input
                              id={`edit-next-500-hour-check-${h.id as number}`}
                              type="text"
                              name="next_500_hour_check"
                              defaultValue={
                                (h.next_500_hour_check as string) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-hours-until-500-check-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Hours Until 500 Check
                            </label>
                            <input
                              id={`edit-hours-until-500-check-${h.id as number}`}
                              type="text"
                              name="hours_until_500_check"
                              defaultValue={
                                (h.hours_until_500_check as string) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-next-1000-hour-check-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Next 1000 Hour Check
                            </label>
                            <input
                              id={`edit-next-1000-hour-check-${h.id as number}`}
                              type="text"
                              name="next_1000_hour_check"
                              defaultValue={
                                (h.next_1000_hour_check as string) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-hours-until-1000-check-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Hours Until 1000 Check
                            </label>
                            <input
                              id={`edit-hours-until-1000-check-${h.id as number}`}
                              type="text"
                              name="hours_until_1000_check"
                              defaultValue={
                                (h.hours_until_1000_check as string) ?? undefined
                              }
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-status-${h.id as number}`}
                              className="block text-xs text-slate-500 dark:text-slate-400"
                            >
                              Status
                            </label>
                            <input
                              id={`edit-status-${h.id as number}`}
                              type="text"
                              name="status"
                              defaultValue={(h.status as string) ?? undefined}
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                        >
                          Save
                        </button>
                      </Form>
                    </div>
                  </details>

                  {/* Delete form */}
                  <Form method="post" className="inline">
                    <input
                      type="hidden"
                      name="intent"
                      value="delete"
                    />
                    <input
                      type="hidden"
                      name="id"
                      value={h.id as number}
                    />
                    <button
                      type="submit"
                      className="text-red-600 hover:underline text-xs"
                      onClick={(e) => {
                        if (
                          !confirm(
                            "Are you sure you want to delete this airframe hour record?"
                          )
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Delete
                    </button>
                  </Form>
                </div>
              )}
            />
          );
        })()}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  to={`/admin/airframe-hours?page=${page - 1}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  to={`/admin/airframe-hours?page=${page + 1}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
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
          <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
      </div>
    </div>
  );
}
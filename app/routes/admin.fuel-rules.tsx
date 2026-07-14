import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useActionData, Link, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { validateCsrfRequest } from "../utils/csrf-check.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import { useCsrf } from "~/utils/use-csrf";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = DEFAULT_PAGE_SIZE;

  const result = await adminRepository.getAllFuelRulesPaginated(page, perPage);

  return json({
    items: result.rows,
    totalCount: result.totalCount,
    page,
    totalPages: Math.ceil(result.totalCount / perPage),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const formData = await request.formData();

  if (!(await validateCsrfRequest(request, formData))) {
    return json({ error: "CSRF token validation failed" }, { status: 403 });
  }

  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": {
      const flight_time_minutes = Number(formData.get("flight_time_minutes"));
      const sectors = Number(formData.get("sectors"));
      const required_fuel_kg = Number(formData.get("required_fuel_kg"));
      const minimum_fuel_kg = Number(formData.get("minimum_fuel_kg"));
      const fuel_state = formData.get("fuel_state") as string;

      if (!flight_time_minutes || !sectors || !required_fuel_kg || !minimum_fuel_kg || !fuel_state) {
        return json(
          { error: "All fields are required" },
          { status: 400 }
        );
      }

      try {
        await adminRepository.createFuelRule({
          flight_time_minutes,
          sectors,
          required_fuel_kg,
          minimum_fuel_kg,
          fuel_state,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create fuel rule";
        return json({ error: message }, { status: 400 });
      }
      break;
    }
    case "update": {
      const id = Number(formData.get("id"));
      const flight_time_minutes = Number(formData.get("flight_time_minutes"));
      const sectors = Number(formData.get("sectors"));
      const required_fuel_kg = Number(formData.get("required_fuel_kg"));
      const minimum_fuel_kg = Number(formData.get("minimum_fuel_kg"));
      const fuel_state = formData.get("fuel_state") as string;

      if (id) {
        await adminRepository.updateFuelRule(id, {
          flight_time_minutes,
          sectors,
          required_fuel_kg,
          minimum_fuel_kg,
          fuel_state,
        });
      }
      break;
    }
    case "delete": {
      const id = Number(formData.get("id"));
      if (id) {
        await adminRepository.deleteFuelRule(id);
      }
      break;
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }

  return redirect("/admin/fuel-rules");
}

export default function ManageFuelRules() {
  const { items, totalCount, page, totalPages } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { csrfHiddenInput } = useCsrf();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Manage Fuel Rules</h1>

      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {actionData.error}
        </div>
      )}

      {/* Create Fuel Rule Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Add Fuel Rule
        </h2>
        <Form method="post" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {csrfHiddenInput}
          <input type="hidden" name="intent" value="create" />
          <div>
            <label htmlFor="create-flight-time" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Flight Time (mins) *
            </label>
            <input
              id="create-flight-time"
              type="number"
              name="flight_time_minutes"
              required
              min={1}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-sectors" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Sectors *
            </label>
            <input
              id="create-sectors"
              type="number"
              name="sectors"
              required
              min={1}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-required-fuel" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Required Fuel (kg) *
            </label>
            <input
              id="create-required-fuel"
              type="number"
              name="required_fuel_kg"
              required
              step="any"
              min={0}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-minimum-fuel" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Minimum Fuel (kg) *
            </label>
            <input
              id="create-minimum-fuel"
              type="number"
              name="minimum_fuel_kg"
              required
              step="any"
              min={0}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-fuel-state" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Fuel State *
            </label>
            <input
              id="create-fuel-state"
              type="text"
              name="fuel_state"
              required
              placeholder="e.g. TAKEOFF, LANDING, ENROUTE"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add Fuel Rule
            </button>
          </div>
        </Form>
      </div>

      {/* Fuel Rules Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Fuel Rules ({totalCount})
          </h2>
        </div>
        {(() => {
          const fuelColumns: Column<Record<string, unknown>>[] = [
            { key: "id", header: "ID" },
            { key: "flight_time_minutes", header: "Flight Time (mins)" },
            { key: "sectors", header: "Sectors" },
            { key: "required_fuel_kg", header: "Required Fuel (kg)" },
            { key: "minimum_fuel_kg", header: "Minimum Fuel (kg)" },
            {
              key: "fuel_state",
              header: "Fuel State",
              render: (rule) => (
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  {rule.fuel_state as string}
                </span>
              ),
            },
          ];
          return (
            <DataTable
              columns={fuelColumns}
              data={items as unknown as Array<Record<string, unknown>>}
              keyExtractor={(rule) => rule.id as number}
              sortable
              initialSortColumn="id"
              initialSortDirection="asc"
              emptyState={
                <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No fuel rules found.
                </div>
              }
              actions={(rule) => (
                <div className="flex gap-2">
                  {/* Edit form (inline) */}
                  <details className="relative">
                    <summary className="text-blue-600 hover:underline text-xs cursor-pointer">
                      Edit
                    </summary>
                    <div className="absolute left-0 top-6 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg dark:shadow-slate-900/50 p-4 w-80">
                      <Form method="post" className="space-y-2">
                        {csrfHiddenInput}
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="id" value={rule.id as number} />
                        <div>
                          <label htmlFor={`edit-flight-time-${rule.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Flight Time (mins)
                          </label>
                          <input
                            id={`edit-flight-time-${rule.id}`}
                            type="number"
                            name="flight_time_minutes"
                            defaultValue={rule.flight_time_minutes as number}
                            required
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-sectors-${rule.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Sectors
                          </label>
                          <input
                            id={`edit-sectors-${rule.id}`}
                            type="number"
                            name="sectors"
                            defaultValue={rule.sectors as number}
                            required
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-required-fuel-${rule.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Required Fuel (kg)
                          </label>
                          <input
                            id={`edit-required-fuel-${rule.id}`}
                            type="number"
                            name="required_fuel_kg"
                            defaultValue={rule.required_fuel_kg as number}
                            required
                            step="any"
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-minimum-fuel-${rule.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Minimum Fuel (kg)
                          </label>
                          <input
                            id={`edit-minimum-fuel-${rule.id}`}
                            type="number"
                            name="minimum_fuel_kg"
                            defaultValue={rule.minimum_fuel_kg as number}
                            required
                            step="any"
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-fuel-state-${rule.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Fuel State
                          </label>
                          <input
                            id={`edit-fuel-state-${rule.id}`}
                            type="text"
                            name="fuel_state"
                            defaultValue={rule.fuel_state as string}
                            required
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
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
                    {csrfHiddenInput}
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={rule.id as number} />
                    <button
                      type="submit"
                      className="text-red-600 hover:underline text-xs"
                      onClick={(e) => {
                        if (!confirm("Are you sure you want to delete this fuel rule?")) {
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
                  to={`/admin/fuel-rules?page=${page - 1}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  to={`/admin/fuel-rules?page=${page + 1}`}
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
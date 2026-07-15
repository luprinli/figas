import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import { TourTrigger } from "../components/TourTrigger";
import { adminAircraftTour } from "../utils/tour/definitions/admin-aircraft";

export const meta: MetaFunction = () => [{ title: "Manage Aircraft - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = DEFAULT_PAGE_SIZE;

  const result = await adminRepository.getAllAircraftPaginated(page, perPage);

  return json({
    aircraft: result.rows,
    totalCount: result.totalCount,
    page,
    totalPages: Math.ceil(result.totalCount / perPage),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": {
      const registration = (
        formData.get("registration") as string
      ).toUpperCase();
      const type = (formData.get("type") as string) || "BN-2 Islander";
      const seat_count = Number(formData.get("seat_count")) || 9;
      const empty_weight_kg = Number(formData.get("empty_weight_kg"));
      const max_takeoff_weight_kg = Number(
        formData.get("max_takeoff_weight_kg")
      );
      const max_payload_kg = Number(formData.get("max_payload_kg"));
      const fuel_capacity_kg = Number(formData.get("fuel_capacity_kg"));

      if (!registration) {
        return json(
          { error: "Registration is required" },
          { status: 400 }
        );
      }

      try {
        await adminRepository.createAircraft({
          registration,
          type,
          seat_count,
          empty_weight_kg,
          max_takeoff_weight_kg,
          max_payload_kg,
          fuel_capacity_kg,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create aircraft";
        return json({ error: message }, { status: 400 });
      }
      break;
    }
    case "update": {
      const id = Number(formData.get("id"));
      const registration = (
        formData.get("registration") as string
      ).toUpperCase();
      const type = formData.get("type") as string;
      const seat_count = formData.get("seat_count")
        ? Number(formData.get("seat_count"))
        : undefined;
      const empty_weight_kg = formData.get("empty_weight_kg")
        ? Number(formData.get("empty_weight_kg"))
        : undefined;
      const max_takeoff_weight_kg = formData.get("max_takeoff_weight_kg")
        ? Number(formData.get("max_takeoff_weight_kg"))
        : undefined;
      const max_payload_kg = formData.get("max_payload_kg")
        ? Number(formData.get("max_payload_kg"))
        : undefined;
      const fuel_capacity_kg = formData.get("fuel_capacity_kg")
        ? Number(formData.get("fuel_capacity_kg"))
        : undefined;

      if (id) {
        await adminRepository.updateAircraft(id, {
          registration,
          type,
          seat_count,
          empty_weight_kg,
          max_takeoff_weight_kg,
          max_payload_kg,
          fuel_capacity_kg,
        });
      }
      break;
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }

  return redirect("/admin/aircraft");
}

export default function ManageAircraft() {
  const { aircraft, totalCount, page, totalPages } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Manage Aircraft</h1>
        <TourTrigger config={adminAircraftTour} />
      </div>

      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {actionData.error}
        </div>
      )}

      {/* Create Aircraft Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Add Aircraft
        </h2>
        <Form method="post" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <input type="hidden" name="intent" value="create" />
          <div>
            <label htmlFor="create-reg" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Registration *
            </label>
            <input
              id="create-reg"
              type="text"
              name="registration"
              required
              placeholder="e.g. VP-FBE"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
            />
          </div>
          <div>
            <label htmlFor="create-type" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Type
            </label>
            <input
              id="create-type"
              type="text"
              name="type"
              defaultValue="BN-2 Islander"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-seats" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Seat Count
            </label>
            <input
              id="create-seats"
              type="number"
              name="seat_count"
              defaultValue={9}
              min={1}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-empty-weight" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Empty Weight (kg) *
            </label>
            <input
              id="create-empty-weight"
              type="number"
              name="empty_weight_kg"
              required
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-mtow" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              MTOW (kg) *
            </label>
            <input
              id="create-mtow"
              type="number"
              name="max_takeoff_weight_kg"
              required
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-payload" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Max Payload (kg) *
            </label>
            <input
              id="create-payload"
              type="number"
              name="max_payload_kg"
              required
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-fuel" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Fuel Capacity (kg) *
            </label>
            <input
              id="create-fuel"
              type="number"
              name="fuel_capacity_kg"
              required
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add Aircraft
            </button>
          </div>
        </Form>
      </div>

      {/* Aircraft Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Aircraft ({totalCount})
          </h2>
        </div>
        {(() => {
          const aircraftColumns: Column<Record<string, unknown>>[] = [
            {
              key: "registration",
              header: "Registration",
              render: (a) => <span className="font-bold text-slate-800 dark:text-slate-100">{a.registration as string}</span>,
            },
            {
              key: "type",
              header: "Type",
              render: (a) => <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{a.type as string}</span>,
            },
            {
              key: "seat_count",
              header: "Seats",
              className: "text-right",
              render: (a) => <span className="text-right">{a.seat_count as number}</span>,
            },
            {
              key: "max_takeoff_weight_kg",
              header: "MTOW (kg)",
              className: "text-right",
              render: (a) => <span className="text-right">{a.max_takeoff_weight_kg as number}</span>,
            },
            {
              key: "is_active",
              header: "Status",
              render: (a) => (
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${a.is_active
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                    }`}
                >
                  {a.is_active ? "Active" : "Inactive"}
                </span>
              ),
            },
          ];
          return (
            <DataTable
              columns={aircraftColumns}
              data={aircraft as unknown as Array<Record<string, unknown>>}
              keyExtractor={(a) => a.id as number}
              sortable
              initialSortColumn="registration"
              initialSortDirection="asc"
              emptyState={
                <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No aircraft found.
                </div>
              }
              actions={(a) => (
                <details className="relative">
                  <summary className="text-blue-600 hover:underline text-xs cursor-pointer">
                    Edit
                  </summary>
                  <div className="absolute left-0 top-6 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg dark:shadow-slate-900/50 p-4 w-80">
                    <Form method="post" className="space-y-2">
                      <input type="hidden" name="intent" value="update" />
                      <input type="hidden" name="id" value={a.id as number} />
                      <div>
                        <label htmlFor={`edit-reg-${a.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                          Registration
                        </label>
                        <input
                          id={`edit-reg-${a.id}`}
                          type="text"
                          name="registration"
                          defaultValue={a.registration as string}
                          required
                          className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-type-${a.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                          Type
                        </label>
                        <input
                          id={`edit-type-${a.id}`}
                          type="text"
                          name="type"
                          defaultValue={a.type as string}
                          className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-seats-${a.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                          Seats
                        </label>
                        <input
                          id={`edit-seats-${a.id}`}
                          type="number"
                          name="seat_count"
                          defaultValue={a.seat_count as number}
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
                  to={`/admin/aircraft?page=${page - 1}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  to={`/admin/aircraft?page=${page + 1}`}
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
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, Link, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { validateCsrfRequest } from "../utils/csrf-check.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import { clearFareCache } from "../utils/repositories/fare-route";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";

export const meta: MetaFunction = () => [{ title: "Manage Fare Routes - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = DEFAULT_PAGE_SIZE;

  const result = await adminRepository.getAllFareRoutesPaginated(page, perPage);

  return json({
    fareRoutes: result.rows,
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
      const origin_code = (
        formData.get("origin_code") as string
      ).toUpperCase();
      const destination_code = (
        formData.get("destination_code") as string
      ).toUpperCase();
      const base_fare_gbp = Number(formData.get("base_fare_gbp"));
      const currency = (formData.get("currency") as string) || "GBP";

      if (!origin_code || !destination_code || !base_fare_gbp) {
        return json(
          { error: "Origin, destination, and base fare are required" },
          { status: 400 }
        );
      }

      if (origin_code === destination_code) {
        return json(
          { error: "Origin and destination must be different" },
          { status: 400 }
        );
      }

      try {
        await adminRepository.createFareRoute({
          origin_code,
          destination_code,
          base_fare_gbp,
          currency,
        });
        clearFareCache();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create fare route";
        return json({ error: message }, { status: 400 });
      }
      break;
    }
    case "update": {
      const id = Number(formData.get("id"));
      const origin_code = (
        formData.get("origin_code") as string
      ).toUpperCase();
      const destination_code = (
        formData.get("destination_code") as string
      ).toUpperCase();
      const base_fare_gbp = formData.get("base_fare_gbp")
        ? Number(formData.get("base_fare_gbp"))
        : undefined;
      const currency = formData.get("currency") as string | undefined;

      if (id) {
        await adminRepository.updateFareRoute(id, {
          origin_code,
          destination_code,
          base_fare_gbp,
          currency,
        });
        clearFareCache();
      }
      break;
    }
    case "toggleActive": {
      const id = Number(formData.get("id"));
      const isActive = formData.get("isActive") === "true";
      if (id) {
        await adminRepository.updateFareRoute(id, { is_active: !isActive });
        clearFareCache();
      }
      break;
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }

  return redirect("/admin/fares");
}

export default function ManageFares() {
  const { fareRoutes, totalCount, page, totalPages } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Manage Fare Routes</h1>

      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {actionData.error}
        </div>
      )}

      {/* Create Fare Route Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Add Fare Route
        </h2>
        <Form method="post" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="hidden" name="intent" value="create" />
          <div>
            <label htmlFor="create-origin" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Origin Code *
            </label>
            <input
              id="create-origin"
              type="text"
              name="origin_code"
              required
              maxLength={4}
              placeholder="e.g. MPN"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
            />
          </div>
          <div>
            <label htmlFor="create-dest" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Destination Code *
            </label>
            <input
              id="create-dest"
              type="text"
              name="destination_code"
              required
              maxLength={4}
              placeholder="e.g. STY"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
            />
          </div>
          <div>
            <label htmlFor="create-fare" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Base Fare (GBP) *
            </label>
            <input
              id="create-fare"
              type="number"
              name="base_fare_gbp"
              required
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add Fare Route
            </button>
          </div>
        </Form>
      </div>

      {/* Fare Routes Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Fare Routes ({totalCount})
          </h2>
        </div>
        {(() => {
          const fareColumns: Column<Record<string, unknown>>[] = [
            {
              key: "origin_code",
              header: "Origin",
              render: (fr) => <span className="font-bold text-slate-800 dark:text-slate-100">{fr.origin_code as string}</span>,
            },
            {
              key: "destination_code",
              header: "Destination",
              render: (fr) => <span className="font-bold text-slate-800 dark:text-slate-100">{fr.destination_code as string}</span>,
            },
            {
              key: "base_fare_gbp",
              header: "Base Fare (GBP)",
              className: "text-right",
              render: (fr) => <span className="text-right font-medium">Ã‚Â£{Number(fr.base_fare_gbp).toFixed(2)}</span>,
            },
            {
              key: "is_active",
              header: "Status",
              render: (fr) => (
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${fr.is_active
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                    }`}
                >
                  {fr.is_active ? "Active" : "Inactive"}
                </span>
              ),
            },
          ];
          return (
            <DataTable
              columns={fareColumns}
              data={fareRoutes as unknown as Array<Record<string, unknown>>}
              keyExtractor={(fr) => fr.id as number}
              sortable
              initialSortColumn="origin_code"
              initialSortDirection="asc"
              emptyState={
                <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No fare routes found.
                </div>
              }
              actions={(fr) => (
                <div className="flex gap-2">
                  {/* Edit form */}
                  <details className="relative">
                    <summary className="text-blue-600 hover:underline text-xs cursor-pointer">
                      Edit
                    </summary>
                    <div className="absolute left-0 top-6 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg dark:shadow-slate-900/50 p-4 w-72">
                      <Form method="post" className="space-y-2">
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="id" value={fr.id as number} />
                        <div>
                          <label htmlFor={`edit-origin-${fr.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Origin
                          </label>
                          <input
                            id={`edit-origin-${fr.id}`}
                            type="text"
                            name="origin_code"
                            defaultValue={fr.origin_code as string}
                            required
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-dest-${fr.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Destination
                          </label>
                          <input
                            id={`edit-dest-${fr.id}`}
                            type="text"
                            name="destination_code"
                            defaultValue={fr.destination_code as string}
                            required
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-fare-${fr.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Base Fare (GBP)
                          </label>
                          <input
                            id={`edit-fare-${fr.id}`}
                            type="number"
                            name="base_fare_gbp"
                            defaultValue={fr.base_fare_gbp as number}
                            step="0.01"
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

                  {/* Toggle active */}
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="toggleActive" />
                    <input type="hidden" name="id" value={fr.id as number} />
                    <input type="hidden" name="isActive" value={String(fr.is_active)} />
                    <button
                      type="submit"
                      className={`text-xs hover:underline ${fr.is_active ? "text-red-600" : "text-green-600"}`}
                    >
                      {fr.is_active ? "Deactivate" : "Activate"}
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
                  to={`/admin/fares?page=${page - 1}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  to={`/admin/fares?page=${page + 1}`}
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
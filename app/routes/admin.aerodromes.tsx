import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";

export const meta: MetaFunction = () => [{ title: "Manage Aerodromes - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = DEFAULT_PAGE_SIZE;

  const result = await adminRepository.getAllAerodromesPaginated(page, perPage);

  return json({
    aerodromes: result.rows,
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
      const code = (formData.get("code") as string).toUpperCase();
      const name = formData.get("name") as string;
      const runway_length = formData.get("runway_length")
        ? Number(formData.get("runway_length"))
        : null;
      const runway_type = formData.get("runway_type") as string | null;
      const latitude = formData.get("latitude")
        ? Number(formData.get("latitude"))
        : null;
      const longitude = formData.get("longitude")
        ? Number(formData.get("longitude"))
        : null;
      const timezone =
        (formData.get("timezone") as string) || "Atlantic/Stanley";

      if (!code || !name) {
        return json({ error: "Code and name are required" }, { status: 400 });
      }

      try {
        await adminRepository.createAerodrome({
          code,
          name,
          runway_length,
          runway_type,
          latitude,
          longitude,
          timezone,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create aerodrome";
        return json({ error: message }, { status: 400 });
      }
      break;
    }
    case "update": {
      const id = Number(formData.get("id"));
      const code = (formData.get("code") as string).toUpperCase();
      const name = formData.get("name") as string;
      const runway_length = formData.get("runway_length")
        ? Number(formData.get("runway_length"))
        : null;
      const runway_type = formData.get("runway_type") as string | null;
      const latitude = formData.get("latitude")
        ? Number(formData.get("latitude"))
        : null;
      const longitude = formData.get("longitude")
        ? Number(formData.get("longitude"))
        : null;
      const timezone =
        (formData.get("timezone") as string) || "Atlantic/Stanley";

      if (id) {
        await adminRepository.updateAerodrome(id, {
          code,
          name,
          runway_length,
          runway_type,
          latitude,
          longitude,
          timezone,
        });
      }
      break;
    }
    case "toggleActive": {
      const id = Number(formData.get("id"));
      const isActive = formData.get("isActive") === "true";
      if (id) {
        await adminRepository.toggleAerodromeActive(id, !isActive);
      }
      break;
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }

  return redirect("/admin/aerodromes");
}

export default function ManageAerodromes() {
  const { aerodromes, totalCount, page, totalPages } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Manage Aerodromes</h1>

      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {actionData.error}
        </div>
      )}

      {/* Create Aerodrome Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Add Aerodrome
        </h2>
        <Form method="post" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <input type="hidden" name="intent" value="create" />
          <div>
            <label htmlFor="create-code" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Code *
            </label>
            <input
              id="create-code"
              type="text"
              name="code"
              required
              maxLength={4}
              placeholder="e.g. MPN"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
            />
          </div>
          <div>
            <label htmlFor="create-name" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Name *
            </label>
            <input
              id="create-name"
              type="text"
              name="name"
              required
              placeholder="e.g. Mount Pleasant Airport"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-runway-length" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Runway Length (m)
            </label>
            <input
              id="create-runway-length"
              type="number"
              name="runway_length"
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-runway-type" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Runway Type
            </label>
            <input
              id="create-runway-type"
              type="text"
              name="runway_type"
              placeholder="e.g. Asphalt"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-latitude" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Latitude
            </label>
            <input
              id="create-latitude"
              type="number"
              name="latitude"
              step="any"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-longitude" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Longitude
            </label>
            <input
              id="create-longitude"
              type="number"
              name="longitude"
              step="any"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-timezone" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Timezone
            </label>
            <input
              id="create-timezone"
              type="text"
              name="timezone"
              defaultValue="Atlantic/Stanley"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add Aerodrome
            </button>
          </div>
        </Form>
      </div>

      {/* Aerodromes Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Aerodromes ({totalCount})
          </h2>
        </div>
        {(() => {
          const aerodromeColumns: Column<Record<string, unknown>>[] = [
            {
              key: "code",
              header: "Code",
              render: (a) => <span className="font-bold text-slate-800 dark:text-slate-100">{a.code as string}</span>,
            },
            {
              key: "name",
              header: "Name",
              render: (a) => <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{a.name as string}</span>,
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
              columns={aerodromeColumns}
              data={aerodromes as unknown as Array<Record<string, unknown>>}
              keyExtractor={(a) => a.id as number}
              sortable
              initialSortColumn="code"
              initialSortDirection="asc"
              emptyState={
                <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No aerodromes found.
                </div>
              }
              actions={(a) => (
                <div className="flex gap-2">
                  {/* Edit form (inline) */}
                  <details className="relative">
                    <summary className="text-blue-600 hover:underline text-xs cursor-pointer">
                      Edit
                    </summary>
                    <div className="absolute left-0 top-6 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg dark:shadow-slate-900/50 p-4 w-80">
                      <Form method="post" className="space-y-2">
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="id" value={a.id as number} />
                        <div>
                          <label htmlFor={`edit-code-${a.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Code
                          </label>
                          <input
                            id={`edit-code-${a.id}`}
                            type="text"
                            name="code"
                            defaultValue={a.code as string}
                            required
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-name-${a.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Name
                          </label>
                          <input
                            id={`edit-name-${a.id}`}
                            type="text"
                            name="name"
                            defaultValue={a.name as string}
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
                    <input type="hidden" name="id" value={a.id as number} />
                    <input type="hidden" name="isActive" value={String(a.is_active)} />
                    <button
                      type="submit"
                      className={`text-xs hover:underline ${a.is_active ? "text-red-600" : "text-green-600"}`}
                    >
                      {a.is_active ? "Deactivate" : "Activate"}
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
                  to={`/admin/aerodromes?page=${page - 1}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  to={`/admin/aerodromes?page=${page + 1}`}
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
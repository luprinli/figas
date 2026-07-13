import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useActionData, Link, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = DEFAULT_PAGE_SIZE;

  const [result, aerodromes] = await Promise.all([
    adminRepository.getAllAerodromeHeadingsPaginated(page, perPage),
    adminRepository.getAllAerodromes(),
  ]);

  return json({
    items: result.rows,
    totalCount: result.totalCount,
    page,
    totalPages: Math.ceil(result.totalCount / perPage),
    aerodromes,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": {
      const origin_code = (formData.get("origin_code") as string).toUpperCase();
      const destination_code = (formData.get("destination_code") as string).toUpperCase();
      const heading_degrees = Number(formData.get("heading_degrees"));

      if (!origin_code || !destination_code || !heading_degrees) {
        return json(
          { error: "Origin, destination, and heading are required" },
          { status: 400 }
        );
      }

      try {
        await adminRepository.createAerodromeHeading({
          origin_code,
          destination_code,
          heading_degrees,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create aerodrome heading";
        return json({ error: message }, { status: 400 });
      }
      break;
    }
    case "update": {
      const id = Number(formData.get("id"));
      const origin_code = (formData.get("origin_code") as string).toUpperCase();
      const destination_code = (formData.get("destination_code") as string).toUpperCase();
      const heading_degrees = Number(formData.get("heading_degrees"));

      if (id) {
        await adminRepository.updateAerodromeHeading(id, {
          origin_code,
          destination_code,
          heading_degrees,
        });
      }
      break;
    }
    case "delete": {
      const id = Number(formData.get("id"));
      if (id) {
        await adminRepository.deleteAerodromeHeading(id);
      }
      break;
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }

  return redirect("/admin/aerodrome-headings");
}

export default function ManageAerodromeHeadings() {
  const { items, totalCount, page, totalPages, aerodromes } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Manage Aerodrome Headings
      </h1>

      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {actionData.error}
        </div>
      )}

      {/* Create Aerodrome Heading Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Add Aerodrome Heading
        </h2>
        <Form
          method="post"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          <input type="hidden" name="intent" value="create" />
          <div>
            <label
              htmlFor="create-origin-code"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Origin *
            </label>
            <select
              id="create-origin-code"
              name="origin_code"
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select origin...</option>
              {aerodromes.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="create-destination-code"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Destination *
            </label>
            <select
              id="create-destination-code"
              name="destination_code"
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select destination...</option>
              {aerodromes.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="create-heading-degrees"
              className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            >
              Heading (°) *
            </label>
            <input
              id="create-heading-degrees"
              type="number"
              name="heading_degrees"
              required
              step="any"
              min={0}
              max={360}
              placeholder="e.g. 270"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add Heading
            </button>
          </div>
        </Form>
      </div>

      {/* Aerodrome Headings Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Aerodrome Headings ({totalCount})
          </h2>
        </div>
        {(() => {
          const headingColumns: Column<Record<string, unknown>>[] = [
            { key: "id", header: "ID" },
            { key: "origin_code", header: "Origin" },
            { key: "destination_code", header: "Destination" },
            {
              key: "heading_degrees",
              header: "Heading (°)",
              render: (h) => <span>{h.heading_degrees as number}°</span>,
            },
          ];
          return (
            <DataTable
              columns={headingColumns}
              data={items as unknown as Array<Record<string, unknown>>}
              keyExtractor={(h) => h.id as number}
              sortable
              initialSortColumn="id"
              initialSortDirection="asc"
              emptyState={
                <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No aerodrome headings found.
                </div>
              }
              actions={(h) => (
                <div className="flex gap-2">
                  {/* Edit form (inline) */}
                  <details className="relative">
                    <summary className="text-blue-600 hover:underline text-xs cursor-pointer">
                      Edit
                    </summary>
                    <div className="absolute left-0 top-6 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg dark:shadow-slate-900/50 p-4 w-80">
                      <Form method="post" className="space-y-2">
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="id" value={h.id as number} />
                        <div>
                          <label htmlFor={`edit-origin-code-${h.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Origin
                          </label>
                          <select
                            id={`edit-origin-code-${h.id}`}
                            name="origin_code"
                            required
                            defaultValue={h.origin_code as string}
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          >
                            {aerodromes.map((a) => (
                              <option key={a.id} value={a.code}>
                                {a.code} - {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`edit-destination-code-${h.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Destination
                          </label>
                          <select
                            id={`edit-destination-code-${h.id}`}
                            name="destination_code"
                            required
                            defaultValue={h.destination_code as string}
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs"
                          >
                            {aerodromes.map((a) => (
                              <option key={a.id} value={a.code}>
                                {a.code} - {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`edit-heading-degrees-${h.id}`} className="block text-xs text-slate-500 dark:text-slate-400">
                            Heading (°)
                          </label>
                          <input
                            id={`edit-heading-degrees-${h.id}`}
                            type="number"
                            name="heading_degrees"
                            defaultValue={h.heading_degrees as number}
                            required
                            step="any"
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
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={h.id as number} />
                    <button
                      type="submit"
                      className="text-red-600 hover:underline text-xs"
                      onClick={(e) => {
                        if (!confirm("Are you sure you want to delete this aerodrome heading?")) {
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
                  to={`/admin/aerodrome-headings?page=${page - 1}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  to={`/admin/aerodrome-headings?page=${page + 1}`}
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

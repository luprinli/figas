import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, Link, useSearchParams, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState } from "react";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_PAGE_SIZE, UserRole } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { getSession } from "../session.server";
import { validateCsrfRequest } from "../utils/csrf-check.server";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import { useCsrf } from "~/utils/use-csrf";
import DOBPicker from "../components/DOBPicker";
import { TourTrigger } from "../components/TourTrigger";
import { adminUsersTour } from "../utils/tour/definitions/admin-users";

export const meta: MetaFunction = () => [{ title: "Manage Users - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.USER_VIEW);

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = DEFAULT_PAGE_SIZE;

  const result = await adminRepository.searchUsersPaginated(query, page, perPage);

  return json({
    users: result.rows,
    totalCount: result.totalCount,
    page,
    perPage,
    query: query ?? "",
    totalPages: Math.ceil(result.totalCount / perPage),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.USER_VIEW);

  const formData = await request.formData();

  if (!(await validateCsrfRequest(request, formData))) {
    return json({ error: "CSRF token validation failed" }, { status: 403 });
  }

  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": {
      const name = formData.get("name") as string;
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;
      const role = formData.get("role") as string;
      const date_of_birth = formData.get("date_of_birth") as string;

      if (!name || !email || !password || !date_of_birth) {
        return json(
          { error: "Name, email, password, and date of birth are required" },
          { status: 400 }
        );
      }

      try {
        await adminRepository.createUser({
          name,
          email,
          password,
          role: role || UserRole.PASSENGER,
          date_of_birth,
          clothed_body_weight_kg: 70,
          residency_status: "resident",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create user";
        return json({ error: message }, { status: 400 });
      }
      break;
    }
    case "updateRole": {
      const targetUserId = Number(formData.get("userId"));
      const roleSlug = formData.get("role") as string;
      if (targetUserId && roleSlug) {
        // Look up the PBAC role ID by slug
        const roleResult = await sql<{ id: number }>`
          SELECT id FROM roles WHERE slug = ${roleSlug}
        `.execute(kdb);
        const roleRow = roleResult.rows[0] ?? null;
        if (roleRow) {
          const session = await getSession(request.headers.get("Cookie"));
          const actorId = Number(session.get("userId"));
          if (actorId) {
            await adminRepository.assignRole(actorId, targetUserId, roleRow.id);
          }
        }
      }
      break;
    }
    case "toggleStatus": {
      const userId = Number(formData.get("userId"));
      const isActive = formData.get("isActive") === "true";
      if (userId) {
        await adminRepository.updateUserStatus(userId, !isActive);
      }
      break;
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }

  return redirect("/admin/users");
}

export default function ManageUsers() {
  const { users, totalCount, page, query, totalPages } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [, setSearchParams] = useSearchParams();
  const [dateOfBirth, setDateOfBirth] = useState("");
  const { csrfHiddenInput } = useCsrf();

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-100 text-red-800",
      operations: "bg-blue-100 text-blue-800",
      pilot: "bg-green-100 text-green-800",
      engineer: "bg-yellow-100 text-yellow-800",
      checkin: "bg-purple-100 text-purple-800",
      passenger: "bg-slate-100 text-slate-800 dark:text-slate-100",
    };
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${colors[role] ?? "bg-slate-100 text-slate-800 dark:text-slate-100"
          }`}
      >
        {role}
      </span>
    );
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = formData.get("q") as string;
    setSearchParams(q ? { q } : {});
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Manage Users</h1>
        <TourTrigger config={adminUsersTour} />
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2" data-tour="admin-users-search">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search by name or email..."
          className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Error message */}
      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {actionData.error}
        </div>
      )}

      {/* Create User Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4" data-tour="admin-users-create">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Create New User
        </h2>
        <Form method="post" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {csrfHiddenInput}
          <input type="hidden" name="intent" value="create" />
          <div>
            <label htmlFor="create-name" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Name</label>
            <input
              id="create-name"
              type="text"
              name="name"
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-email" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Email</label>
            <input
              id="create-email"
              type="email"
              name="email"
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="create-password" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Password</label>
            <input
              id="create-password"
              type="password"
              name="password"
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Date of Birth
            </span>
            <DOBPicker
              value={dateOfBirth}
              onChange={setDateOfBirth}
            />
            <input type="hidden" name="date_of_birth" value={dateOfBirth} />
          </div>
          <div>
            <label htmlFor="create-role" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Role</label>
            <select
              id="create-role"
              name="role"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="passenger">Passenger</option>
              <option value="operations">Operations</option>
              <option value="pilot">Pilot</option>
              <option value="engineer">Engineer</option>
              <option value="checkin">Check-in</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Create User
            </button>
          </div>
        </Form>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Users ({totalCount})
          </h2>
        </div>
        {(() => {
          const userColumns: Column<Record<string, unknown>>[] = [
            {
              key: "name",
              header: "Name",
              render: (u) => <span className="font-medium text-slate-800 dark:text-slate-100">{u.name as string}</span>,
            },
            {
              key: "email",
              header: "Email",
              render: (u) => <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{u.email as string}</span>,
            },
            {
              key: "role",
              header: "Role",
              render: (u) => roleBadge(u.role as string),
            },
            {
              key: "is_active",
              header: "Status",
              render: (u) => (
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${u.is_active
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                    }`}
                >
                  {u.is_active ? "Active" : "Inactive"}
                </span>
              ),
            },
            {
              key: "created_at",
              header: "Created",
              render: (u) => (
                <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
                  {new Date(u.created_at as string).toLocaleDateString("en-GB")}
                </span>
              ),
            },
          ];
          return (
            <DataTable
              columns={userColumns}
              data={users as unknown as Array<Record<string, unknown>>}
              keyExtractor={(u) => u.id as number}
              sortable
              initialSortColumn="name"
              initialSortDirection="asc"
              emptyState={
                <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No users found.
                </div>
              }
              actions={(user) => (
                <div className="flex gap-2">
                  {/* Role update */}
                  <Form method="post" className="inline-flex items-center gap-1">
                    {csrfHiddenInput}
                    <input type="hidden" name="intent" value="updateRole" />
                    <input type="hidden" name="userId" value={user.id as number} />
                    <select
                      name="role"
                      defaultValue={user.role as string}
                      className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="passenger">Passenger</option>
                      <option value="operations">Operations</option>
                      <option value="pilot">Pilot</option>
                      <option value="engineer">Engineer</option>
                      <option value="checkin">Check-in</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="submit" className="text-blue-600 hover:underline text-xs">
                      Update
                    </button>
                  </Form>

                  {/* Toggle status */}
                  <Form method="post" className="inline">
                    {csrfHiddenInput}
                    <input type="hidden" name="intent" value="toggleStatus" />
                    <input type="hidden" name="userId" value={user.id as number} />
                    <input type="hidden" name="isActive" value={String(user.is_active)} />
                    <button
                      type="submit"
                      className={`text-xs hover:underline ${user.is_active ? "text-red-600" : "text-green-600"}`}
                    >
                      {user.is_active ? "Deactivate" : "Activate"}
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
                  to={`/admin/users?page=${page - 1}${query ? `&q=${query}` : ""}`}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm hover:bg-slate-50 dark:bg-slate-700"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  to={`/admin/users?page=${page + 1}${query ? `&q=${query}` : ""}`}
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

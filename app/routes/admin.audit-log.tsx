import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, Form, Link } from "@remix-run/react";
import { requirePermission, queryAuditLog } from "../utils/permissions.server";
import { Permission } from "../utils/constants";

export const meta: MetaFunction = () => [{ title: "Audit Log - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.AUDIT_VIEW);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const action = url.searchParams.get("action") || undefined;
  const entityType = url.searchParams.get("entityType") || undefined;
  const entityId = url.searchParams.get("entityId")
    ? Number(url.searchParams.get("entityId"))
    : undefined;
  const dateFrom = url.searchParams.get("dateFrom")
    ? new Date(url.searchParams.get("dateFrom")!)
    : undefined;
  const dateTo = url.searchParams.get("dateTo")
    ? new Date(url.searchParams.get("dateTo")!)
    : undefined;
  const perPage = 50;

  const { entries, totalCount } = await queryAuditLog({
    page,
    perPage,
    action,
    entityType,
    entityId,
    dateFrom,
    dateTo,
  });

  const totalPages = Math.ceil(totalCount / perPage);

  return json({
    entries,
    totalCount,
    page,
    perPage,
    totalPages,
    filters: { action, entityType, entityId: entityId?.toString(), dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo") },
  });
}

export default function AuditLogPage() {
  const { entries, totalCount, page, totalPages, filters } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  function updateFilter(key: string, value: string) {
    setSearchParams((prev) => {
      if (value) prev.set(key, value);
      else prev.delete(key);
      prev.delete("page");
      return prev;
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link to="/admin" className="text-blue-600 hover:underline text-sm">
          ← Back to Admin
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Audit Log
          <span className="ml-2 text-sm font-normal text-slate-500">({totalCount} entries)</span>
        </h1>
      </div>

      <Form className="mb-4 flex flex-wrap items-end gap-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        <div>
          <label htmlFor="audit-action" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Action</label>
          <input
            id="audit-action"
            type="text"
            name="action"
            defaultValue={filters.action ?? ""}
            placeholder="schedule:approve"
            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-40"
            onBlur={(e) => updateFilter("action", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="audit-entityType" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Entity Type</label>
          <input
            id="audit-entityType"
            type="text"
            name="entityType"
            defaultValue={filters.entityType ?? ""}
            placeholder="schedule"
            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-32"
            onBlur={(e) => updateFilter("entityType", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="audit-dateFrom" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Date From</label>
          <input
            id="audit-dateFrom"
            type="date"
            name="dateFrom"
            defaultValue={filters.dateFrom ?? ""}
            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
            onChange={(e) => updateFilter("dateFrom", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="audit-dateTo" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Date To</label>
          <input
            id="audit-dateTo"
            type="date"
            name="dateTo"
            defaultValue={filters.dateTo ?? ""}
            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
            onChange={(e) => updateFilter("dateTo", e.target.value)}
          />
        </div>
        <button
          type="reset"
          className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          onClick={() => setSearchParams({})}
        >
          Clear
        </button>
      </Form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 text-left">
              <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">ID</th>
              <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Action</th>
              <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Entity</th>
              <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Entity ID</th>
              <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Actor</th>
              <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Date</th>
              <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">No audit entries found.</td>
              </tr>
            ) : entries.map((entry) => (
              <tr key={String(entry.id)} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="py-1.5 px-3 font-mono text-slate-500">{String(entry.id)}</td>
                <td className="py-1.5 px-3">
                  <span className="rounded bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 font-medium text-blue-700 dark:text-blue-300">
                    {String(entry.action)}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-slate-600 dark:text-slate-300">{String(entry.entity_type ?? "—")}</td>
                <td className="py-1.5 px-3 font-mono text-slate-500">{entry.entity_id ? String(entry.entity_id) : "—"}</td>
                <td className="py-1.5 px-3 font-mono text-slate-500">{entry.actor_id ? `#${String(entry.actor_id)}` : "—"}</td>
                <td className="py-1.5 px-3 text-slate-500 whitespace-nowrap">
                  {entry.created_at ? new Date(String(entry.created_at)).toLocaleString("en-GB") : "—"}
                </td>
                <td className="py-1.5 px-3 max-w-xs truncate text-slate-500" title={entry.new_values ? JSON.stringify(entry.new_values) : undefined}>
                  {entry.new_values ? JSON.stringify(entry.new_values) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setSearchParams((prev) => { prev.set("page", String(p)); return prev; })}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                p === page
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

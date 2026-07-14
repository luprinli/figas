import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission, createAuditLogEntry } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import { validateCsrfRequest } from "../utils/csrf-check.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import MetricCard from "../components/MetricCard";
import Card from "../components/Card";
import Button from "../components/Button";
import { useCsrf } from "~/utils/use-csrf";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.MAINTENANCE_VIEW);
  const defects = await sql<Record<string, unknown>>`
    SELECT d.id, d.title, d.description, d.severity, d.ata_chapter, d.deferral_status,
       d.mel_reference, d.mel_category, d.reported_at, d.deferral_expiry_date, d.aircraft_id,
       a.registration
 FROM defects d
 JOIN aircraft a ON a.id = d.aircraft_id
 ORDER BY d.deferral_status != 'closed' DESC, d.reported_at DESC
 LIMIT 100
  `.execute(kdb);
  const data = defects.rows as Array<Record<string, unknown>>;
  const openCount = data.filter((d) => d.deferral_status === 'open' || d.deferral_status === 'deferred').length;
  const rectified = data.filter((d) => d.deferral_status === 'rectified').length;
  const aircraft = await sql<Record<string, unknown>>`SELECT id, registration FROM aircraft ORDER BY registration`.execute(kdb);
  return json({ defects: data, openCount, rectified, aircraft: aircraft.rows });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const formData = await request.formData();

  if (!(await validateCsrfRequest(request, formData))) {
    return json({ error: "CSRF token validation failed" }, { status: 403 });
  }

  const intent = formData.get("intent") as string;

  switch (intent) {
    case "report": {
      await requirePermission(request, Permission.MAINTENANCE_EDIT);
      const aircraftId = Number(formData.get("aircraft_id"));
      const title = (formData.get("title") as string).trim();
      const description = (formData.get("description") as string) || null;
      const severity = (formData.get("severity") as string) || "minor";
      const ataChapter = (formData.get("ata_chapter") as string) || null;

      if (!aircraftId || !title) {
        return json({ error: "Aircraft and title are required." }, { status: 400 });
      }

      await sql`
        INSERT INTO defects (aircraft_id, title, description, severity, ata_chapter, reported_by, deferral_status)
         VALUES (${aircraftId}, ${title}, ${description}, ${severity}, ${ataChapter}, ${userId}, 'open')
      `.execute(kdb);
      await createAuditLogEntry({
        actorId: Number(userId),
        action: "defect.reported",
        entityType: "defect",
        newValues: { aircraft_id: aircraftId, title, severity },
      });
      return redirect("/engineer/defects");
    }

    case "defer": {
      await requirePermission(request, Permission.MAINTENANCE_DEFER_DEFECT);
      const defectId = Number(formData.get("defect_id"));
      const melRef = (formData.get("mel_reference") as string).trim();
      const melCat = (formData.get("mel_category") as string) || null;
      const expiryDate = formData.get("expiry_date") as string || null;

      if (!melRef) {
        return json({ error: "MEL reference is required for deferral." }, { status: 400 });
      }

      await sql`
        UPDATE defects SET deferral_status = 'deferred', mel_reference = ${melRef}, mel_category = ${melCat},
         deferral_approved_by = ${userId}, deferral_expiry_date = ${expiryDate}::date WHERE id = ${defectId}
      `.execute(kdb);
      await createAuditLogEntry({
        actorId: Number(userId),
        action: "defect.deferred",
        entityType: "defect",
        entityId: defectId,
        newValues: { deferral_status: "deferred", mel_reference: melRef },
      });
      return redirect("/engineer/defects");
    }

    case "rectify": {
      await requirePermission(request, Permission.MAINTENANCE_SIGN_OFF);
      const defectId = Number(formData.get("defect_id"));
      const rectification = (formData.get("rectification") as string).trim();

      if (!rectification) {
        return json({ error: "Rectification description is required." }, { status: 400 });
      }

      await sql`
        UPDATE defects SET deferral_status = 'rectified', rectification = ${rectification}, rectified_at = NOW(), rectified_by = ${userId} WHERE id = ${defectId}
      `.execute(kdb);
      await createAuditLogEntry({
        actorId: Number(userId),
        action: "defect.rectified",
        entityType: "defect",
        entityId: defectId,
        newValues: { deferral_status: "rectified" },
      });
      return redirect("/engineer/defects");
    }

    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
}

export default function EngineerDefects() {
  const { defects, openCount, rectified, aircraft } = useLoaderData<typeof loader>();
  const { csrfHiddenInput } = useCsrf();
  const columns: Column<Record<string, unknown>>[] = [
    { key: "registration", header: "Aircraft", sortable: true, render: (r) => (
      <span className="font-medium text-slate-800 dark:text-slate-100">{String(r.registration)}</span>
    )},
    { key: "title", header: "Defect", sortable: true },
    { key: "ata_chapter", header: "ATA", sortable: true },
    { key: "severity", header: "Severity", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.severity === 'aog' || r.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
        r.severity === 'major' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      }`}>{String(r.severity)}</span>
    )},
    { key: "mel_reference", header: "MEL", sortable: true, render: (r) => (
      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{String(r.mel_reference ?? '—')}{r.mel_category ? ` Cat ${r.mel_category}` : ''}</span>
    )},
    { key: "deferral_status", header: "Status", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.deferral_status === 'open' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
        r.deferral_status === 'deferred' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        r.deferral_status === 'rectified' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>{String(r.deferral_status)}</span>
    )},
    { key: "reported_at", header: "Reported", sortable: true },
    { key: "deferral_expiry_date", header: "Expires", render: (r) => {
      const date = r.deferral_expiry_date ? new Date(String(r.deferral_expiry_date)) : null;
      const overdue = date && date < new Date();
      return <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-600 dark:text-slate-300'}>{date ? date.toLocaleDateString("en-GB") : '—'}</span>;
    }},
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Defects &amp; Snags</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard label="Open / Deferred" value={openCount} color={openCount > 0 ? 'amber' : 'emerald'} />
        <MetricCard label="Rectified" value={rectified} color="emerald" />
      </div>

      {/* Report Defect Form */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Report Defect</h2>
        </div>
        <Form method="post" className="p-4 space-y-3 bg-white dark:bg-slate-800">
          {csrfHiddenInput}
          <input type="hidden" name="intent" value="report" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="aircraft_id" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Aircraft</label>
              <select name="aircraft_id" id="aircraft_id" required className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="">Select...</option>
                {(aircraft as Array<Record<string, unknown>>).map((a) => (
                  <option key={String(a.id)} value={String(a.id)}>{String(a.registration)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="title" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Title</label>
              <input name="title" id="title" required placeholder="e.g. Left main tire worn below limits" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div>
            <label htmlFor="description" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Description</label>
            <textarea name="description" id="description" rows={2} className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="severity" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Severity</label>
              <select name="severity" id="severity" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
                <option value="aog">AOG</option>
              </select>
            </div>
            <div>
              <label htmlFor="ata_chapter" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">ATA Chapter</label>
              <select name="ata_chapter" id="ata_chapter" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="">—</option>
                <option value="05">05 - Time Limits</option>
                <option value="12">12 - Servicing</option>
                <option value="27">27 - Flight Controls</option>
                <option value="32">32 - Landing Gear</option>
                <option value="61">61 - Propellers</option>
                <option value="72">72 - Engine</option>
                <option value="79">79 - Oil</option>
              </select>
            </div>
          </div>
          <Button type="submit" color="danger">Report Defect</Button>
        </Form>
      </Card>

      {/* Defect list */}
      <Card>
        <DataGrid
          columns={columns}
          data={defects}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="reported_at"
          initialSortDirection="desc"
          actions={(r) => {
            if (r.deferral_status === 'open') {
              return (
                <Form method="post" className="inline-flex items-center gap-1">
                  {csrfHiddenInput}
                  <input type="hidden" name="intent" value="defer" />
                  <input type="hidden" name="defect_id" value={String(r.id)} />
                  <input type="text" name="mel_reference" placeholder="MEL ref" className="w-16 text-xs px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600" />
                  <Button type="submit" variant="outlined" color="warning" className="text-xs px-1.5 py-0.5">Defer</Button>
                </Form>
              );
            }
            if (r.deferral_status === 'open' || r.deferral_status === 'deferred') {
              return (
                <Form method="post" className="inline-flex items-center gap-1">
                  {csrfHiddenInput}
                  <input type="hidden" name="intent" value="rectify" />
                  <input type="hidden" name="defect_id" value={String(r.id)} />
                  <input type="text" name="rectification" placeholder="Action taken" className="w-20 text-xs px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600" />
                  <Button type="submit" color="success" className="text-xs px-1.5 py-0.5">Fix</Button>
                </Form>
              );
            }
            return null;
          }}
          emptyState={<EmptyState title="No defects recorded" description="All aircraft are currently defect-free." />}
        />
      </Card>
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

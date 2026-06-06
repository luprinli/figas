import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import { db } from "../utils/db.server";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import DashboardCard from "../components/DashboardCard";
import Card from "../components/Card";
import Button from "../components/Button";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.MAINTENANCE_VIEW);
  const comps = await db.query(
    `SELECT lc.*, a.registration
 FROM lifed_components lc
 JOIN aircraft a ON a.id = lc.aircraft_id
 ORDER BY COALESCE(lc.hours_remaining, 9999) ASC
 LIMIT 100`
  );
  const data = comps.rows as Array<Record<string, unknown>>;
  const active = data.filter((c) => c.status === 'active').length;
  const critical = data.filter((c) => c.status === 'active' && Number(c.hours_remaining ?? 0) <= (Number(c.tbo_hours ?? 1) * 0.10)).length;
  const aircraft = await db.query(`SELECT id, registration FROM aircraft ORDER BY registration`);
  return json({ components: data, active, critical, aircraft: aircraft.rows });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "install": {
      await requirePermission(request, Permission.MAINTENANCE_MANAGE_COMPONENTS);
      const aircraftId = Number(formData.get("aircraft_id"));
      const componentName = (formData.get("component_name") as string).trim();
      const partNumber = (formData.get("part_number") as string) || null;
      const serialNumber = (formData.get("serial_number") as string) || null;
      const ataChapter = (formData.get("ata_chapter") as string) || null;
      const tboHours = Number(formData.get("tbo_hours"));
      const installedHours = Number(formData.get("installed_hours") || 0);
      const installedDate = (formData.get("installed_date") as string) || new Date().toISOString().slice(0, 10);

      if (!aircraftId || !componentName || !tboHours) {
        return json({ error: "Aircraft, component name, and TBO hours are required." }, { status: 400 });
      }

      await db.$queryRawUnsafe(
        `INSERT INTO lifed_components (aircraft_id, component_name, part_number, serial_number, ata_chapter,
         tbo_hours, installed_hours, current_hours, installed_date, hours_remaining, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8::date, $6 - $7, 'active')`,
        [aircraftId, componentName, partNumber, serialNumber, ataChapter, tboHours, installedHours, installedDate]
      );
      return redirect("/engineer/components");
    }

    case "replace": {
      await requirePermission(request, Permission.MAINTENANCE_MANAGE_COMPONENTS);
      const componentId = Number(formData.get("component_id"));

      await db.$queryRawUnsafe(
        `UPDATE lifed_components SET status = 'removed', last_inspected_at = NOW() WHERE id = $1`,
        [componentId]
      );
      return redirect("/engineer/components");
    }

    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
}

export default function EngineerComponents() {
  const { components, active, critical, aircraft } = useLoaderData<typeof loader>();
  const columns: Column<Record<string, unknown>>[] = [
    { key: "registration", header: "Aircraft", sortable: true, render: (r) => (
      <span className="font-medium text-slate-800 dark:text-slate-100">{String(r.registration)}</span>
    )},
    { key: "component_name", header: "Component", sortable: true },
    { key: "part_number", header: "Part #", sortable: true, render: (r) => (
      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{String(r.part_number ?? '—')}</span>
    )},
    { key: "serial_number", header: "Serial", sortable: true, render: (r) => (
      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{String(r.serial_number ?? '—')}</span>
    )},
    { key: "ata_chapter", header: "ATA" },
    { key: "tbo_hours", header: "TBO", sortable: true, render: (r) => (
      <span className="tabular-nums">{Number(r.tbo_hours).toLocaleString()} hrs</span>
    )},
    { key: "current_hours", header: "Current", sortable: true, render: (r) => (
      <span className="tabular-nums">{Number(r.current_hours).toLocaleString()} hrs</span>
    )},
    { key: "hours_remaining", header: "Remaining", sortable: true, render: (r) => {
      const remaining = Number(r.hours_remaining ?? 0);
      const pct = remaining / Math.max(1, Number(r.tbo_hours ?? 1));
      return (
        <span className={`tabular-nums font-medium ${
          pct <= 0.10 ? 'text-red-600 dark:text-red-400' :
          pct <= 0.25 ? 'text-amber-600 dark:text-amber-400' :
          'text-emerald-600 dark:text-emerald-400'
        }`}>{remaining <= 0 ? 'OVERDUE' : `${remaining.toLocaleString()} hrs`}</span>
      );
    }},
    { key: "status", header: "Status", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>{String(r.status)}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Life-Limited Components</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DashboardCard label="Active Components" value={active} color="emerald" />
        <DashboardCard label="Critical (&lt;10% life)" value={critical} color={critical > 0 ? 'red' : 'emerald'} />
      </div>

      {/* Install Component Form */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Install Component</h2>
        </div>
        <Form method="post" className="p-4 space-y-3 bg-white dark:bg-slate-800">
          <input type="hidden" name="intent" value="install" />
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
            <div>
              <label htmlFor="component_name" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Component Name</label>
              <input name="component_name" id="component_name" required placeholder="e.g. Lycoming O-540 Engine" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="ata_chapter" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">ATA Chapter</label>
              <select name="ata_chapter" id="ata_chapter" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="">—</option>
                <option value="32">32 - Landing Gear</option>
                <option value="61">61 - Propellers</option>
                <option value="72">72 - Engine</option>
                <option value="79">79 - Oil</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="part_number" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Part Number</label>
              <input name="part_number" id="part_number" placeholder="e.g. LW-12345" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="serial_number" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Serial Number</label>
              <input name="serial_number" id="serial_number" placeholder="e.g. SN-98765" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="tbo_hours" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">TBO Hours</label>
              <input name="tbo_hours" id="tbo_hours" type="number" required defaultValue={2000} className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="installed_hours" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Hours at Install</label>
              <input name="installed_hours" id="installed_hours" type="number" defaultValue={0} className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <Button type="submit" color="primary">Install Component</Button>
        </Form>
      </Card>

      {/* Component list */}
      <Card>
        <DataGrid
          columns={columns}
          data={components}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="hours_remaining"
          initialSortDirection="asc"
          actions={(r) => {
            if (r.status === 'active') {
              return (
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="replace" />
                  <input type="hidden" name="component_id" value={String(r.id)} />
                  <Button type="submit" variant="outlined" color="danger" className="text-xs px-2 py-0.5">Remove</Button>
                </Form>
              );
            }
            return null;
          }}
          emptyState={<EmptyState title="No components tracked" description="Install a lifed component above to begin tracking." />}
        />
      </Card>
    </div>
  );
}

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useFetcher, useNavigation } from "@remix-run/react";
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
  const tasks = await db.query(
    `SELECT mt.id, mt.title, mt.task_type, mt.ata_chapter, mt.status, mt.priority,
       mt.next_due_hours, mt.interval_value, mt.interval_type, mt.aircraft_id,
       a.registration
 FROM maintenance_tasks mt
 JOIN aircraft a ON a.id = mt.aircraft_id
 ORDER BY mt.status = 'open' DESC, mt.next_due_hours ASC
 LIMIT 100`
  );
  const data = tasks.rows as Array<Record<string, unknown>>;
  const openCount = data.filter((t) => t.status === 'open').length;
  const inProgress = data.filter((t) => t.status === 'in_progress').length;
  const overdue = data.filter((t) => t.status === 'open' && Number(t.next_due_hours ?? 9999) <= 0).length;

  const aircraft = await db.query(`SELECT id, registration FROM aircraft ORDER BY registration`);
  return json({ tasks: data, openCount, inProgress, overdue, aircraft: aircraft.rows });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "create": {
      await requirePermission(request, Permission.MAINTENANCE_CREATE_TASK);
      const aircraftId = Number(formData.get("aircraft_id"));
      const title = (formData.get("title") as string).trim();
      const taskType = (formData.get("task_type") as string) || "inspection";
      const ataChapter = (formData.get("ata_chapter") as string) || null;
      const intervalType = (formData.get("interval_type") as string) || "hours";
      const intervalValue = Number(formData.get("interval_value"));
      const priority = (formData.get("priority") as string) || "routine";

      if (!aircraftId || !title || !intervalValue) {
        return json({ error: "Aircraft, title, and interval value are required." }, { status: 400 });
      }

      await db.$queryRawUnsafe(
        `INSERT INTO maintenance_tasks (aircraft_id, title, task_type, ata_chapter, interval_type, interval_value, priority, status, assigned_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8)`,
        [aircraftId, title, taskType, ataChapter, intervalType, intervalValue, priority, userId]
      );
      return redirect("/engineer/tasks");
    }

    case "start": {
      await requirePermission(request, Permission.MAINTENANCE_EDIT);
      const taskId = Number(formData.get("task_id"));
      await db.$queryRawUnsafe(
        `UPDATE maintenance_tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [taskId]
      );
      return redirect("/engineer/tasks");
    }

    case "complete": {
      await requirePermission(request, Permission.MAINTENANCE_SIGN_OFF);
      const taskId = Number(formData.get("task_id"));
      await db.$queryRawUnsafe(
        `UPDATE maintenance_tasks SET status = 'completed', completed_at = NOW(), completed_by = $2 WHERE id = $1`,
        [taskId, userId]
      );
      return redirect("/engineer/tasks");
    }

    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
}

export default function EngineerTaskBoard() {
  const { tasks, openCount, inProgress, overdue, aircraft } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "registration", header: "Aircraft", sortable: true, render: (r) => (
      <span className="font-medium text-slate-800 dark:text-slate-100">{String(r.registration)}</span>
    )},
    { key: "title", header: "Task", sortable: true },
    { key: "ata_chapter", header: "ATA", sortable: true },
    { key: "interval_type", header: "Interval", render: (r) => (
      <span className="text-slate-600 dark:text-slate-300">{String(r.interval_value)} {String(r.interval_type)}</span>
    )},
    { key: "next_due_hours", header: "Due", sortable: true, render: (r) => {
      const due = Number(r.next_due_hours ?? 0);
      return <span className={`tabular-nums font-medium ${due <= 0 ? 'text-red-600 dark:text-red-400' : due <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>{due <= 0 ? 'Overdue' : `${due.toLocaleString()} hrs`}</span>;
    }},
    { key: "status", header: "Status", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.status === 'open' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
        r.status === 'in_progress' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        r.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>{String(r.status).replace('_',' ')}</span>
    )},
    { key: "priority", header: "Priority", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.priority === 'aog' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
        r.priority === 'urgent' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      }`}>{String(r.priority).toUpperCase()}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Task Board</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DashboardCard label="Open Tasks" value={openCount} color="blue" />
        <DashboardCard label="In Progress" value={inProgress} color="amber" />
        <DashboardCard label="Overdue" value={overdue} color={overdue > 0 ? 'red' : 'emerald'} />
      </div>

      {/* Create Task Form */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Create Task</h2>
        </div>
        <Form method="post" className="p-4 space-y-3 bg-white dark:bg-slate-800">
          <input type="hidden" name="intent" value="create" />
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
              <label htmlFor="title" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Title</label>
              <input name="title" id="title" required placeholder="e.g. 100-hour inspection" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="task_type" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Type</label>
              <select name="task_type" id="task_type" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="inspection">Inspection</option>
                <option value="repair">Repair</option>
                <option value="overhaul">Overhaul</option>
                <option value="replacement">Replacement</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="interval_value" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Interval Value</label>
              <input name="interval_value" id="interval_value" type="number" required defaultValue={100} className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="interval_type" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Interval Type</label>
              <select name="interval_type" id="interval_type" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="hours">Hours</option>
                <option value="cycles">Cycles</option>
                <option value="calendar">Calendar</option>
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
            <div>
              <label htmlFor="priority" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Priority</label>
              <select name="priority" id="priority" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="aog">AOG</option>
              </select>
            </div>
          </div>
          <Button type="submit" color="primary">Create Task</Button>
        </Form>
      </Card>

      {/* Task board */}
      <Card>
        <DataGrid
          columns={columns}
          data={tasks}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="status"
          initialSortDirection="asc"
          actions={(r) => {
            if (r.status === 'open') {
              return (
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="start" />
                  <input type="hidden" name="task_id" value={String(r.id)} />
                  <Button type="submit" variant="outlined" className="text-xs px-2 py-0.5">Start</Button>
                </Form>
              );
            }
            if (r.status === 'in_progress') {
              return (
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="complete" />
                  <input type="hidden" name="task_id" value={String(r.id)} />
                  <Button type="submit" color="success" className="text-xs px-2 py-0.5">Complete</Button>
                </Form>
              );
            }
            return null;
          }}
          emptyState={<EmptyState title="No maintenance tasks" description="Create a task above to begin tracking inspections." />}
        />
      </Card>
    </div>
  );
}

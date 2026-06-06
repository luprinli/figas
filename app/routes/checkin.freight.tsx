import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
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
  await requirePermission(request, Permission.CHECKIN_PROCESS);
  const freight = await db.query(
    `SELECT fc.*, COALESCE(f.flight_number, '—') AS flight_number
     FROM freight_consignments fc
     LEFT JOIN flights f ON f.id = fc.flight_id
     ORDER BY fc.created_at DESC LIMIT 100`
  );
  const data = freight.rows as Array<Record<string, unknown>>;
  const unassigned = data.filter((f) => f.status === 'unassigned').length;
  const assigned = data.filter((f) => f.status === 'assigned').length;
  return json({ freight: data, unassigned, assigned });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    await requirePermission(request, Permission.CHECKIN_PROCESS);
    const consignorName = (formData.get("consignor_name") as string).trim();
    const consigneeName = (formData.get("consignee_name") as string).trim();
    const description = (formData.get("description") as string) || null;
    const weightKg = parseFloat(formData.get("weight_kg") as string);
    const lengthCm = parseFloat(formData.get("length_cm") as string) || null;
    const widthCm = parseFloat(formData.get("width_cm") as string) || null;
    const heightCm = parseFloat(formData.get("height_cm") as string) || null;
    const priority = (formData.get("priority") as string) || "medium";
    const hazardous = formData.get("hazardous") === "on";
    const paymentMode = (formData.get("payment_mode") as string) || null;

    if (!consignorName || !consigneeName || isNaN(weightKg) || weightKg <= 0) {
      return json({ error: "Consignor, consignee, and valid weight are required." }, { status: 400 });
    }

    const seq = String(Date.now() % 100000).padStart(5, "0");
    const waybill = `FW-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${seq}`;

    await db.$queryRawUnsafe(
      `INSERT INTO freight_consignments (consignor_name, consignee_name, description, weight_kg, length_cm, width_cm, height_cm, priority, hazardous, waybill_number, payment_mode, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [consignorName, consigneeName, description, weightKg, lengthCm, widthCm, heightCm, priority, hazardous, waybill, paymentMode, userId]
    );

    // Display volumetric weight if dimensions provided
    if (lengthCm && widthCm && heightCm) {
      const volWeight = (lengthCm * widthCm * heightCm) / 6000;
      if (volWeight > weightKg) {
        return redirect(`/checkin/freight?warning=vol_weight&waybill=${waybill}&vol=${Math.round(volWeight)}`);
      }
    }
    return redirect("/checkin/freight");
  }

  return json({ error: "Invalid action." }, { status: 400 });
}

export default function FreightReceiving() {
  const { freight, unassigned, assigned } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "waybill_number", header: "Waybill", sortable: true, render: (r) => (
      <span className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100">{String(r.waybill_number)}</span>
    )},
    { key: "consignor_name", header: "Consignor", sortable: true },
    { key: "consignee_name", header: "Consignee", sortable: true },
    { key: "description", header: "Description", sortable: true, render: (r) => (
      <span className="text-slate-600 dark:text-slate-300">{String(r.description ?? "—")}</span>
    )},
    { key: "weight_kg", header: "Weight", sortable: true, render: (r) => (
      <span className="tabular-nums font-medium">{Number(r.weight_kg).toLocaleString()} kg</span>
    )},
    { key: "priority", header: "Priority", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.priority === 'urgent' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
        r.priority === 'high' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      }`}>{String(r.priority)}</span>
    )},
    { key: "status", header: "Status", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.status === 'unassigned' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        r.status === 'assigned' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>{String(r.status)}</span>
    )},
    { key: "flight_number", header: "Flight", render: (r) => (
      <span className="text-slate-600 dark:text-slate-300">{String(r.flight_number)}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Freight Receiving</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DashboardCard label="Unassigned" value={unassigned} color={unassigned > 0 ? 'amber' : 'emerald'} />
        <DashboardCard label="Assigned to Flights" value={assigned} color="emerald" />
      </div>

      {/* Create Freight Form */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">New Freight Consignment</h2>
        </div>
        <Form method="post" className="p-4 space-y-3 bg-white dark:bg-slate-800">
          <input type="hidden" name="intent" value="create" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="consignor_name" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Consignor</label>
              <input name="consignor_name" id="consignor_name" required placeholder="e.g. Falkland Supplies Ltd" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="consignee_name" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Consignee</label>
              <input name="consignee_name" id="consignee_name" required placeholder="e.g. Port Howard Lodge" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="weight_kg" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Weight (kg)</label>
              <input type="number" name="weight_kg" id="weight_kg" required step="0.1" min="0.1" defaultValue={10} className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="length_cm" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Length (cm)</label>
              <input type="number" name="length_cm" id="length_cm" step="0.1" min="0" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="width_cm" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Width (cm)</label>
              <input type="number" name="width_cm" id="width_cm" step="0.1" min="0" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="height_cm" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Height (cm)</label>
              <input type="number" name="height_cm" id="height_cm" step="0.1" min="0" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="priority" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Priority</label>
              <select name="priority" id="priority" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label htmlFor="payment_mode" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Payment</label>
              <select name="payment_mode" id="payment_mode" className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100">
                <option value="">—</option>
                <option value="cash_on_departure">Cash on Departure</option>
                <option value="collect_on_arrival">Collect on Arrival</option>
                <option value="invoice">Invoice</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="hazardous" id="hazardous" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-amber-600" />
            <label htmlFor="hazardous" className="text-sm text-slate-700 dark:text-slate-200">Hazardous / Dangerous Goods</label>
          </div>
          <Button type="submit" color="primary">Create Consignment</Button>
        </Form>
      </Card>

      {/* Freight List */}
      <Card>
        <DataGrid
          columns={columns}
          data={freight}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="created_at"
          initialSortDirection="desc"
          emptyState={<EmptyState title="No freight consignments" description="Create a freight consignment above." />}
        />
      </Card>
    </div>
  );
}

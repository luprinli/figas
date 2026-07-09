import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState } from "react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import {
  exportToCsv,
  exportToXml,
  getRecentExports,
  getExportFormats,
} from "../utils/services/export.service";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import ExportFormatSelector from "../components/ExportFormatSelector";
import type { ExportTypeOption, ExportFormatOption } from "../components/ExportFormatSelector";
import type { ExportLogRow } from "../utils/repositories/export-log";

interface ExportsData {
  exportTypes: ExportTypeOption[];
  exportFormats: ExportFormatOption[];
  recentExports: ExportLogRow[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_MANAGE_EXPORTS);

  const formatsResult = await getExportFormats();
  const recentResult = await getRecentExports({ limit: 10 });

  // formatsResult.formats is Record<string, unknown> with { types: ..., formats: ... }
  const formats = (formatsResult.formats ?? {}) as Record<string, unknown>;
  const typesObj = formats.types as Record<string, string> | undefined;
  const formatsObj = formats.formats as Record<string, string> | undefined;

  const exportTypes: ExportTypeOption[] = Object.values(typesObj ?? {}).map((t) => ({
    value: t,
    label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  const exportFormats: ExportFormatOption[] = Object.values(formatsObj ?? {}).map((f) => ({
    value: f,
    label: f.toUpperCase(),
  }));

  const recentExports = (recentResult.exports ?? []) as unknown as ExportLogRow[];

  return json<ExportsData>({
    exportTypes,
    exportFormats,
    recentExports,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  await requirePermission(request, Permission.FINANCE_MANAGE_EXPORTS);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent !== "export") {
    return json({ error: "Unknown intent" }, { status: 400 });
  }

  const exportType = formData.get("exportType") as string;
  const exportFormat = formData.get("exportFormat") as string;
  const dateFrom = (formData.get("dateFrom") as string) || "";
  const dateTo = (formData.get("dateTo") as string) || "";

  if (!exportType || !exportFormat) {
    return json({ error: "Missing export type or format" }, { status: 400 });
  }

  let result;
  if (exportFormat === "csv") {
    result = await exportToCsv({ exportType, dateFrom, dateTo, userId });
  } else if (exportFormat === "xml") {
    result = await exportToXml({ exportType, dateFrom, dateTo, userId });
  } else if (exportFormat === "json") {
    const csvResult = await exportToCsv({ exportType, dateFrom, dateTo, userId });
    if (csvResult.success) {
      const rows = (csvResult.data as string).split("\n").filter(Boolean);
      const headers = rows[0].split(",").map((h: string) => h.trim().replace(/"/g, ""));
      const jsonData = rows.slice(1).map((row: string) => {
        const vals = row.split(",").map((v: string) => v.trim().replace(/"/g, ""));
        return headers.reduce((obj: Record<string, string>, h: string, i: number) => {
          obj[h] = vals[i] ?? "";
          return obj;
        }, {});
      });
      return new Response(JSON.stringify(jsonData, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${exportType}_${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }
    return json({ error: "JSON export failed" }, { status: 400 });
  } else {
    return json({ error: `Unsupported format: ${exportFormat}` }, { status: 400 });
  }

  if (!result.success) {
    return json({ error: result.error ?? "Export failed" }, { status: 400 });
  }

  const content = result.data as string;
  const mimeType = exportFormat === "csv" ? "text/csv" : "application/xml";
  const extension = exportFormat === "csv" ? "csv" : "xml";
  const filename = `${exportType}_${new Date().toISOString().slice(0, 10)}.${extension}`;

  return new Response(content, {
    headers: {
      "Content-Type": `${mimeType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export default function FinanceExports() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [selectedType, setSelectedType] = useState(data.exportTypes[0]?.value ?? "");
  const [selectedFormat, setSelectedFormat] = useState(data.exportFormats[0]?.value ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const isExporting = navigation.state === "submitting" && navigation.formData?.get("intent") === "export";

  const recentColumns: Column<ExportLogRow>[] = [
    {
      key: "export_type",
      header: "Type",
      render: (r) => (
        <span className="text-sm/5 text-slate-900 dark:text-slate-100 capitalize">
          {r.export_type?.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "export_format",
      header: "Format",
      render: (r) => (
        <span className="text-sm/5 font-medium text-slate-700 dark:text-slate-200 uppercase">
          {r.export_format}
        </span>
      ),
    },
    {
      key: "date_from",
      header: "Date Range",
      render: (r) => (
        <span className="text-sm/5 text-slate-500 dark:text-slate-400 tabular-nums">
          {r.date_from ? new Date(r.date_from).toLocaleDateString() : "—"}
          {" → "}
          {r.date_to ? new Date(r.date_to).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "record_count",
      header: "Records",
      className: "text-right",
      render: (r) => (
        <span className="text-sm/5 text-slate-900 dark:text-slate-100 tabular-nums">
          {r.record_count}
        </span>
      ),
    },
    {
      key: "total_amount_gbp",
      header: "Total",
      className: "text-right",
      render: (r) => (
        <span className="text-sm/5 text-slate-900 dark:text-slate-100 tabular-nums">
          £{Number(r.total_amount_gbp).toFixed(2)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span
          className={`text-sm/5 font-medium capitalize ${r.status === "completed"
            ? "text-green-600"
            : r.status === "failed"
              ? "text-red-600"
              : "text-amber-600"
            }`}
        >
          {r.status}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Exported At",
      render: (r) => (
        <span className="text-sm/5 text-slate-500 dark:text-slate-400 tabular-nums">
          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Data Exports"
        description="Export financial data in various formats"
      />

      {/* Export Form */}
      <Card title="New Export">
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="export" />

          <ExportFormatSelector
            exportTypes={data.exportTypes}
            exportFormats={data.exportFormats}
            selectedType={selectedType}
            selectedFormat={selectedFormat}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onTypeChange={setSelectedType}
            onFormatChange={setSelectedFormat}
            onDateChange={({ dateFrom, dateTo }) => {
              setDateFrom(dateFrom);
              setDateTo(dateTo);
            }}
            onExport={() => {
              // Form submission handled by the Form component
            }}
            loading={isExporting}
          />

          <div className="flex items-center gap-3">
            <Button type="submit" loading={isExporting}>
              Export Data
            </Button>
          </div>
        </Form>
      </Card>

      {/* Recent Exports */}
      <Card title="Recent Exports">
        {data.recentExports.length > 0 ? (
          <DataTable
            columns={recentColumns}
            data={data.recentExports}
            keyExtractor={(r) => r.id}
          />
        ) : (
          <EmptyState
            title="No recent exports"
            description="Exports will appear here once you generate them."
          />
        )}
      </Card>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}
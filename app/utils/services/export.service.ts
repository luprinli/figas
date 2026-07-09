import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { DB } from "../../../generated/kysely/database";
import { exportLogRepository } from "../repositories/export-log";
import { ExportFormat, ExportType } from "../constants";

export interface ExportToCsvParams {
  exportType: string;
  dateFrom: string;
  dateTo: string;
  userId: string;
}

export interface ExportToXmlParams {
  exportType: string;
  dateFrom: string;
  dateTo: string;
  userId: string;
}

export interface GetRecentExportsParams {
  limit?: number;
}

export interface ExportResult {
  success: boolean;
  data?: string;
  recordCount?: number;
  error?: string;
}

export interface RecentExportsResult {
  success: boolean;
  exports?: Record<string, unknown>[];
  error?: string;
}

export interface ExportFormatsResult {
  success: boolean;
  formats?: Record<string, unknown>;
  error?: string;
}

/**
 * Escape a CSV field value — wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCsvField(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string.
 */
function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) =>
    row.map(escapeCsvField).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

/**
 * Escape XML special characters.
 */
function escapeXml(value: unknown): string {
  const str = value == null ? "" : String(value);
  return str
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "'");
}

/**
 * Build an XML string from a collection of records.
 */
function toXml(
  rootElement: string,
  recordElement: string,
  records: Array<Record<string, unknown>>
): string {
  const children = records
    .map((record) => {
      const fields = Object.entries(record)
        .map(
          ([key, value]) =>
            `    <${key}>${escapeXml(value)}</${key}>`
        )
        .join("\n");
      return `  <${recordElement}>\n${fields}\n  </${recordElement}>`;
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<${rootElement}>`,
    children,
    `</${rootElement}>`,
    "",
  ].join("\n");
}

/**
 * Fetch data based on export type.
 */
async function fetchExportData(
  exportType: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  headers: string[];
  rows: unknown[][];
  records: Array<Record<string, unknown>>;
}> {
  switch (exportType) {
    case "payments": {
      const records = await kdb.selectFrom("payments as p")
        .leftJoin("bookings as b", "b.id", "p.booking_id")
        .selectAll("p")
        .select(["b.booking_reference", "b.id as booking_id_alias"])
        .where("p.created_at", ">=", new Date(dateFrom) as any)
        .where("p.created_at", "<=", new Date(dateTo + "T23:59:59.999Z") as any)
        .orderBy("p.created_at desc")
        .execute();

      const mapped = records.map((r) => ({
        id: (r as any).id,
        amount_gbp: (r as any).amount_gbp,
        status: (r as any).status,
        payment_method: (r as any).payment_method,
        created_at: (r as any).created_at,
        booking_reference: (r as any).booking_reference ?? null,
        booking_id: (r as any).booking_id_alias ?? (r as any).booking_id ?? null,
      }));

      const headers = [
        "ID",
        "Amount (GBP)",
        "Status",
        "Method",
        "Created At",
        "Booking Reference",
        "Booking ID",
      ];
      const dataRows = mapped.map((r) => [
        r.id,
        r.amount_gbp,
        r.status,
        r.payment_method,
        r.created_at,
        r.booking_reference,
        r.booking_id,
      ]);
      return { headers, rows: dataRows, records: mapped as unknown as Array<Record<string, unknown>> };
    }

    case "invoices": {
      const records = await kdb.selectFrom("invoices as i")
        .leftJoin("bookings as b", "b.id", "i.booking_id")
        .selectAll("i")
        .select("b.booking_reference")
        .where("i.issue_date", ">=", new Date(dateFrom) as any)
        .where("i.issue_date", "<=", new Date(dateTo + "T23:59:59.999Z") as any)
        .orderBy("i.issue_date desc")
        .execute();

      const mapped = records.map((r) => ({
        id: (r as any).id,
        invoice_number: (r as any).invoice_number,
        status: (r as any).status,
        issue_date: (r as any).issue_date,
        due_date: (r as any).due_date,
        total_gbp: (r as any).total_gbp,
        amount_paid_gbp: (r as any).amount_paid_gbp,
        // amount_due_gbp is a generated column; compute it
        amount_due_gbp: Number((r as any).total_gbp) - Number((r as any).amount_paid_gbp),
        booking_reference: (r as any).booking_reference ?? null,
      }));

      const headers = [
        "ID",
        "Invoice Number",
        "Status",
        "Issue Date",
        "Due Date",
        "Total (GBP)",
        "Paid (GBP)",
        "Due (GBP)",
        "Booking Reference",
      ];
      const dataRows = mapped.map((r) => [
        r.id,
        r.invoice_number,
        r.status,
        r.issue_date,
        r.due_date,
        r.total_gbp,
        r.amount_paid_gbp,
        r.amount_due_gbp,
        r.booking_reference,
      ]);
      return { headers, rows: dataRows, records: mapped as unknown as Array<Record<string, unknown>> };
    }

    case "journal": {
      const rawRows = await kdb.selectFrom("accounting_journal_entries as aje")
        .leftJoin("accounting_journal_lines as ajl", "ajl.entry_id", "aje.id")
        .leftJoin("chart_of_accounts as coa", "coa.id", "ajl.account_id")
        .select([
          "aje.id",
          "aje.entry_number",
          "aje.entry_type",
          "aje.description",
          "aje.entry_date",
          "aje.created_by",
          "ajl.account_id",
          "ajl.debit_amount_gbp",
          "ajl.credit_amount_gbp",
          "ajl.description as line_description",
          "coa.account_code",
        ])
        .where("aje.entry_date", ">=", new Date(dateFrom) as any)
        .where("aje.entry_date", "<=", new Date(dateTo + "T23:59:59.999Z") as any)
        .orderBy("aje.entry_date asc")
        .orderBy("aje.id asc")
        .execute();

      // Flatten: each journal line becomes a row
      const mapped: Array<Record<string, unknown>> = rawRows.map((r) => ({
        id: (r as any).id,
        entry_number: (r as any).entry_number,
        entry_type: (r as any).entry_type,
        description: (r as any).description,
        entry_date: (r as any).entry_date,
        created_by: (r as any).created_by,
        account_id: (r as any).account_code ?? (r as any).account_id,
        debit_amount_gbp: (r as any).debit_amount_gbp,
        credit_amount_gbp: (r as any).credit_amount_gbp,
        line_description: (r as any).line_description,
      }));

      const headers = [
        "Entry ID",
        "Entry Number",
        "Type",
        "Description",
        "Date",
        "Created By",
        "Account ID",
        "Debit (GBP)",
        "Credit (GBP)",
        "Line Description",
      ];
      const dataRows = mapped.map((r) => [
        r.id,
        r.entry_number,
        r.entry_type,
        r.description,
        r.entry_date,
        r.created_by,
        r.account_id,
        r.debit_amount_gbp,
        r.credit_amount_gbp,
        r.line_description,
      ]);
      return { headers, rows: dataRows, records: mapped };
    }

    case "aging": {
      const now = new Date();
      const records = await kdb.selectFrom("invoices")
        .select(["total_gbp", "amount_paid_gbp", "due_date"])
        .where("status", "=", "issued")
        .where("due_date", "<", now as any)
        .execute();

      // Bucket in-memory
      const buckets: Record<string, { count: number; total: number }> = {
        "0-30 days": { count: 0, total: 0 },
        "31-60 days": { count: 0, total: 0 },
        "61-90 days": { count: 0, total: 0 },
        "90+ days": { count: 0, total: 0 },
      };

      for (const inv of records) {
        const daysOverdue = Math.floor(
          (now.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
        );
        const amountDue = Number(inv.total_gbp) - Number(inv.amount_paid_gbp);

        let bucket: string;
        if (daysOverdue <= 30) bucket = "0-30 days";
        else if (daysOverdue <= 60) bucket = "31-60 days";
        else if (daysOverdue <= 90) bucket = "61-90 days";
        else bucket = "90+ days";

        buckets[bucket].count++;
        buckets[bucket].total += amountDue;
      }

      const mapped = Object.entries(buckets)
        .filter(([, data]) => data.count > 0)
        .map(([bucket, data]) => ({
          bucket,
          count: data.count,
          total_amount: data.total,
        }));

      const headers = ["Bucket", "Count", "Total Amount (GBP)"];
      const dataRows = mapped.map((r) => [
        r.bucket,
        r.count,
        r.total_amount,
      ]);
      return { headers, rows: dataRows, records: mapped as unknown as Array<Record<string, unknown>> };
    }

    default:
      throw new Error(`Unknown export type: "${exportType}"`);
  }
}

/**
 * Export data to CSV format.
 */
export async function exportToCsv(
  params: ExportToCsvParams
): Promise<ExportResult> {
  try {
    const { headers, rows, records } = await fetchExportData(
      params.exportType,
      params.dateFrom,
      params.dateTo
    );

    const csv = toCsv(headers, rows);

    // Log the export
    await exportLogRepository.create({
      export_type: params.exportType,
      export_format: ExportFormat.CSV,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      record_count: records.length,
      exported_by: params.userId,
    });

    return {
      success: true,
      data: csv,
      recordCount: records.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Export data to XML format.
 */
export async function exportToXml(
  params: ExportToXmlParams
): Promise<ExportResult> {
  try {
    const { records } = await fetchExportData(
      params.exportType,
      params.dateFrom,
      params.dateTo
    );

    const rootElement = "export";
    const recordElement = "record";
    const xml = toXml(rootElement, recordElement, records);

    // Log the export
    await exportLogRepository.create({
      export_type: params.exportType,
      export_format: ExportFormat.XML,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      record_count: records.length,
      exported_by: params.userId,
    });

    return {
      success: true,
      data: xml,
      recordCount: records.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Get the most recent export logs.
 */
export async function getRecentExports(
  params: GetRecentExportsParams = {}
): Promise<RecentExportsResult> {
  try {
    const limit = params.limit ?? 20;
    const exports = await exportLogRepository.findRecent(limit);

    return {
      success: true,
      exports: exports as unknown as Record<string, unknown>[],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Get available export types and formats from constants.
 */
export async function getExportFormats(): Promise<ExportFormatsResult> {
  try {
    return {
      success: true,
      formats: {
        types: ExportType,
        formats: ExportFormat,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

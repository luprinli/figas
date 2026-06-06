import { db } from "../db.server";
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
      const records = await db.payments.findMany({
        where: {
          created_at: {
            gte: new Date(dateFrom),
            lte: new Date(dateTo + "T23:59:59.999Z"),
          },
        },
        include: {
          booking: {
            select: {
              booking_reference: true,
              id: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      const mapped = records.map((r) => ({
        id: r.id,
        amount_gbp: r.amount_gbp,
        status: r.status,
        payment_method: r.payment_method,
        created_at: r.created_at,
        booking_reference: r.booking?.booking_reference ?? null,
        booking_id: r.booking?.id ?? null,
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
      const records = await db.invoices.findMany({
        where: {
          issue_date: {
            gte: new Date(dateFrom),
            lte: new Date(dateTo + "T23:59:59.999Z"),
          },
        },
        include: {
          booking: {
            select: {
              booking_reference: true,
            },
          },
        },
        orderBy: {
          issue_date: "desc",
        },
      });

      const mapped = records.map((r) => ({
        id: r.id,
        invoice_number: r.invoice_number,
        status: r.status,
        issue_date: r.issue_date,
        due_date: r.due_date,
        total_gbp: r.total_gbp,
        amount_paid_gbp: r.amount_paid_gbp,
        // amount_due_gbp is a generated column; compute it
        amount_due_gbp: Number(r.total_gbp) - Number(r.amount_paid_gbp),
        booking_reference: r.booking?.booking_reference ?? null,
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
      const records = await db.accounting_journal_entries.findMany({
        where: {
          entry_date: {
            gte: new Date(dateFrom),
            lte: new Date(dateTo + "T23:59:59.999Z"),
          },
        },
        include: {
          journal_lines: {
            include: {
              account: {
                select: {
                  account_code: true,
                },
              },
            },
          },
        },
        orderBy: [
          { entry_date: "asc" },
          { id: "asc" },
        ],
      });

      // Flatten: each journal line becomes a row
      const mapped: Array<Record<string, unknown>> = [];
      for (const entry of records) {
        for (const line of entry.journal_lines) {
          mapped.push({
            id: entry.id,
            entry_number: entry.entry_number,
            entry_type: entry.entry_type,
            description: entry.description,
            entry_date: entry.entry_date,
            created_by: entry.created_by,
            account_id: line.account?.account_code ?? line.account_id,
            debit_amount_gbp: line.debit_amount_gbp,
            credit_amount_gbp: line.credit_amount_gbp,
            line_description: line.description,
          });
        }
      }

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
      const records = await db.invoices.findMany({
        where: {
          status: "issued",
          due_date: {
            lt: now,
          },
        },
        select: {
          total_gbp: true,
          amount_paid_gbp: true,
          due_date: true,
        },
      });

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
        .filter(([_, data]) => data.count > 0)
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

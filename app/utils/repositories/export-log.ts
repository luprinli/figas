import { kdb } from "../db.server";

export interface ExportLogRow {
  id: string;
  export_type: string;
  export_format: string;
  date_from: string;
  date_to: string;
  record_count: number;
  total_amount_gbp: number;
  status: string;
  file_path: string | null;
  error_message: string | null;
  exported_by: string;
  created_at: string;
}

function toRow(r: Record<string, unknown>): ExportLogRow {
  return {
    id: String(r.id ?? ""),
    export_type: String(r.export_type ?? ""),
    export_format: String(r.export_format ?? ""),
    date_from: String(r.date_from ?? ""),
    date_to: String(r.date_to ?? ""),
    record_count: Number(r.record_count ?? 0),
    total_amount_gbp: Number(r.total_amount_gbp ?? 0),
    status: String(r.status ?? ""),
    file_path: r.file_path != null ? String(r.file_path) : null,
    error_message: r.error_message != null ? String(r.error_message) : null,
    exported_by: String(r.exported_by ?? ""),
    created_at: String(r.created_at ?? ""),
  };
}

export const exportLogRepository = {
  async create(params: {
    export_type: string;
    export_format: string;
    date_from: string;
    date_to: string;
    record_count?: number;
    total_amount_gbp?: number;
    status?: string;
    file_path?: string;
    error_message?: string;
    exported_by: string;
  }): Promise<ExportLogRow> {
    const rows = await kdb
      .insertInto("export_log")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({
        export_type: params.export_type,
        export_format: params.export_format,
        date_from: new Date(params.date_from),
        date_to: new Date(params.date_to),
        record_count: params.record_count ?? 0,
        total_amount_gbp: params.total_amount_gbp ?? 0,
        status: params.status ?? "completed",
        file_path: params.file_path ?? undefined,
        error_message: params.error_message ?? undefined,
        exported_by: parseInt(params.exported_by, 10),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findRecent(limit: number = 20): Promise<ExportLogRow[]> {
    const rows = await kdb
      .selectFrom("export_log")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },
};

import { db } from "../db.server";
import type { ExportType, ExportFormat, ExportStatus } from "../../../generated/prisma/client";

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
    return db.export_log.create({
      data: {
        export_type: params.export_type as ExportType,
        export_format: params.export_format as ExportFormat,
        date_from: new Date(params.date_from),
        date_to: new Date(params.date_to),
        record_count: params.record_count ?? 0,
        total_amount_gbp: params.total_amount_gbp ?? 0,
        status: (params.status ?? "completed") as ExportStatus,
        file_path: params.file_path ?? null,
        error_message: params.error_message ?? null,
        exported_by: parseInt(params.exported_by, 10),
      },
    }) as unknown as ExportLogRow;
  },

  async findRecent(limit: number = 20): Promise<ExportLogRow[]> {
    return db.export_log.findMany({
      orderBy: { created_at: "desc" },
      take: limit,
    }) as unknown as ExportLogRow[];
  },
};

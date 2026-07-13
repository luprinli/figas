import { kdb } from "../db.server.kysely";
import { sql, type Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

const accountCodeCache = new Map<string, string>();

export async function resolveAccountId(accountCode: string): Promise<string> {
  const cached = accountCodeCache.get(accountCode);
  if (cached) return cached;

  const rows = await kdb
    .selectFrom("chart_of_accounts")
    .select("id")
    .where("account_code", "=", accountCode)
    .execute();

  if (rows.length === 0) {
    throw new Error(`Chart of accounts code "${accountCode}" not found`);
  }
  accountCodeCache.set(accountCode, rows[0].id);
  return rows[0].id;
}

export interface AccountingJournalEntryRow {
  id: string;
  entry_number: string;
  entry_type: string;
  description: string;
  booking_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  entry_date: string;
  posting_date: string | null;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountingJournalLineRow {
  id: string;
  entry_id: string;
  account_id: string;
  debit_amount_gbp: number;
  credit_amount_gbp: number;
  description: string | null;
  created_at: string;
}

function toEntryRow(r: Record<string, unknown>): AccountingJournalEntryRow {
  return {
    id: String(r.id ?? ""),
    entry_number: String(r.entry_number ?? ""),
    entry_type: String(r.entry_type ?? ""),
    description: String(r.description ?? ""),
    booking_id: r.booking_id != null ? String(r.booking_id) : null,
    invoice_id: r.invoice_id != null ? String(r.invoice_id) : null,
    payment_id: r.payment_id != null ? String(r.payment_id) : null,
    entry_date: String(r.entry_date ?? ""),
    posting_date: r.posting_date != null ? String(r.posting_date) : null,
    created_by: String(r.created_by ?? ""),
    approved_by: r.approved_by != null ? String(r.approved_by) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function toLineRow(r: Record<string, unknown>): AccountingJournalLineRow {
  return {
    id: String(r.id ?? ""),
    entry_id: String(r.entry_id ?? ""),
    account_id: String(r.account_id ?? ""),
    debit_amount_gbp: Number(r.debit_amount_gbp ?? 0),
    credit_amount_gbp: Number(r.credit_amount_gbp ?? 0),
    description: r.description != null ? String(r.description) : null,
    created_at: String(r.created_at ?? ""),
  };
}

export const accountingEntryRepository = {
  async createEntry(
    params: {
      entry_number: string;
      entry_type: string;
      description: string;
      booking_id?: string;
      invoice_id?: string;
      payment_id?: string;
      entry_date: string;
      created_by: string;
    },
    tx?: Kysely<DB>
  ): Promise<AccountingJournalEntryRow> {
    const db = tx ?? kdb;
    const rows = await db
      .insertInto("accounting_journal_entries")
      .values({
        entry_number: params.entry_number,
        entry_type: params.entry_type,
        description: params.description,
        booking_id: params.booking_id ? parseInt(params.booking_id, 10) : null,
        invoice_id: params.invoice_id || null,
        payment_id: params.payment_id ? parseInt(params.payment_id, 10) : null,
        entry_date: params.entry_date,
        created_by: parseInt(params.created_by, 10),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toEntryRow(rows[0] as unknown as Record<string, unknown>);
  },

  async createLine(
    params: {
      entry_id: string;
      account_id: string;
      debit_amount_gbp?: number;
      credit_amount_gbp?: number;
      description?: string;
    },
    tx?: Kysely<DB>
  ): Promise<AccountingJournalLineRow> {
    const db = tx ?? kdb;
    const rows = await db
      .insertInto("accounting_journal_lines")
      .values({
        entry_id: params.entry_id,
        account_id: params.account_id,
        debit_amount_gbp: String(params.debit_amount_gbp ?? 0),
        credit_amount_gbp: String(params.credit_amount_gbp ?? 0),
        description: params.description || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toLineRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findEntryById(id: string): Promise<AccountingJournalEntryRow | null> {
    const rows = await kdb
      .selectFrom("accounting_journal_entries")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toEntryRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findLinesByEntryId(entryId: string): Promise<AccountingJournalLineRow[]> {
    const rows = await kdb
      .selectFrom("accounting_journal_lines")
      .selectAll()
      .where("entry_id", "=", entryId)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map((r) => toLineRow(r as unknown as Record<string, unknown>));
  },

  async findByDateRange(fromDate: string, toDate: string): Promise<AccountingJournalEntryRow[]> {
    const rows = await kdb
      .selectFrom("accounting_journal_entries")
      .selectAll()
      .where("entry_date", ">=", fromDate)
      .where("entry_date", "<=", toDate)
      .orderBy("entry_date", "asc")
      .execute();
    return rows.map((r) => toEntryRow(r as unknown as Record<string, unknown>));
  },

  async findByBooking(bookingId: string): Promise<AccountingJournalEntryRow[]> {
    const rows = await kdb
      .selectFrom("accounting_journal_entries")
      .selectAll()
      .where("booking_id", "=", parseInt(bookingId, 10))
      .orderBy("created_at desc")
      .execute();
    return rows.map((r) => toEntryRow(r as unknown as Record<string, unknown>));
  },

  async findByInvoice(invoiceId: string): Promise<AccountingJournalEntryRow[]> {
    const rows = await kdb
      .selectFrom("accounting_journal_entries")
      .selectAll()
      .where("invoice_id", "=", invoiceId)
      .orderBy("created_at desc")
      .execute();
    return rows.map((r) => toEntryRow(r as unknown as Record<string, unknown>));
  },

  async getDailySales(date: string): Promise<{ total_debit: number; total_credit: number }> {
    const result = await sql`
      SELECT
        COALESCE(SUM(ajl.debit_amount_gbp), 0)::numeric AS total_debit,
        COALESCE(SUM(ajl.credit_amount_gbp), 0)::numeric AS total_credit
      FROM accounting_journal_lines ajl
      INNER JOIN accounting_journal_entries aje ON aje.id = ajl.entry_id
      WHERE aje.entry_date = ${date}
        AND aje.posting_date IS NOT NULL
    `.execute(kdb);
    const row = result.rows[0] as { total_debit: number; total_credit: number } | undefined;
    return {
      total_debit: Number(row?.total_debit ?? 0),
      total_credit: Number(row?.total_credit ?? 0),
    };
  },

  async approveEntry(id: string, approvedBy: string): Promise<AccountingJournalEntryRow | null> {
    const now = new Date().toISOString();
    const rows = await kdb
      .updateTable("accounting_journal_entries")
      .set({
        approved_by: parseInt(approvedBy, 10),
        posting_date: now,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toEntryRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async getTotalPaidByBooking(bookingId: string): Promise<number> {
    const result = await sql`
      SELECT COALESCE(SUM(ajl.debit_amount_gbp), 0)::numeric AS total
      FROM accounting_journal_lines ajl
      INNER JOIN accounting_journal_entries aje ON aje.id = ajl.entry_id
      WHERE aje.booking_id = ${parseInt(bookingId, 10)}
        AND aje.entry_type = 'payment'
    `.execute(kdb);
    return Number((result.rows[0] as { total: number } | undefined)?.total ?? 0);
  },
};

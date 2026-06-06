import { db } from "../db.server";
import type { JournalEntryType } from "../../../generated/prisma/client";

/**
 * Resolve a chart_of_accounts UUID from an account code (e.g. "1010").
 * Caches results in a module-level map to avoid repeated lookups.
 */
const accountCodeCache = new Map<string, string>();

export async function resolveAccountId(accountCode: string): Promise<string> {
  const cached = accountCodeCache.get(accountCode);
  if (cached) return cached;

  const record = await db.chart_of_accounts.findUnique({
    where: { account_code: accountCode },
    select: { id: true },
  });
  if (!record) {
    throw new Error(`Chart of accounts code "${accountCode}" not found`);
  }
  accountCodeCache.set(accountCode, record.id);
  return record.id;
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

export const accountingEntryRepository = {
  async createEntry(params: {
    entry_number: string;
    entry_type: string;
    description: string;
    booking_id?: string;
    invoice_id?: string;
    payment_id?: string;
    entry_date: string;
    created_by: string;
  }): Promise<AccountingJournalEntryRow> {
    return db.accounting_journal_entries.create({
      data: {
        entry_number: params.entry_number,
        entry_type: params.entry_type as JournalEntryType,
        description: params.description,
        booking_id: params.booking_id ? parseInt(params.booking_id, 10) : null,
        invoice_id: params.invoice_id || null,
        payment_id: params.payment_id ? parseInt(params.payment_id, 10) : null,
        entry_date: new Date(params.entry_date),
        created_by: parseInt(params.created_by, 10),
      },
    }) as unknown as AccountingJournalEntryRow;
  },

  async createLine(params: {
    entry_id: string;
    account_id: string;
    debit_amount_gbp?: number;
    credit_amount_gbp?: number;
    description?: string;
  }): Promise<AccountingJournalLineRow> {
    return db.accounting_journal_lines.create({
      data: {
        entry_id: params.entry_id,
        account_id: params.account_id,
        debit_amount_gbp: params.debit_amount_gbp ?? 0,
        credit_amount_gbp: params.credit_amount_gbp ?? 0,
        description: params.description || null,
      },
    }) as unknown as AccountingJournalLineRow;
  },

  async findEntryById(id: string): Promise<AccountingJournalEntryRow | null> {
    return db.accounting_journal_entries.findUnique({
      where: { id },
    }) as unknown as AccountingJournalEntryRow | null;
  },

  async findLinesByEntryId(entryId: string): Promise<AccountingJournalLineRow[]> {
    return db.accounting_journal_lines.findMany({
      where: { entry_id: entryId },
      orderBy: { created_at: "asc" },
    }) as unknown as AccountingJournalLineRow[];
  },

  async findByDateRange(fromDate: string, toDate: string): Promise<AccountingJournalEntryRow[]> {
    return db.accounting_journal_entries.findMany({
      where: {
        entry_date: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      },
      orderBy: { entry_date: "asc" },
    }) as unknown as AccountingJournalEntryRow[];
  },

  async findByBooking(bookingId: string): Promise<AccountingJournalEntryRow[]> {
    return db.accounting_journal_entries.findMany({
      where: { booking_id: parseInt(bookingId, 10) },
      orderBy: { created_at: "desc" },
    }) as unknown as AccountingJournalEntryRow[];
  },

  async findByInvoice(invoiceId: string): Promise<AccountingJournalEntryRow[]> {
    return db.accounting_journal_entries.findMany({
      where: { invoice_id: invoiceId },
      orderBy: { created_at: "desc" },
    }) as unknown as AccountingJournalEntryRow[];
  },

  async getDailySales(date: string): Promise<{ total_debit: number; total_credit: number }> {
    const result = await db.accounting_journal_lines.aggregate({
      _sum: {
        debit_amount_gbp: true,
        credit_amount_gbp: true,
      },
      where: {
        entry: {
          entry_date: new Date(date),
          posting_date: { not: null },
        },
      },
    });
    return {
      total_debit: Number(result._sum.debit_amount_gbp ?? 0),
      total_credit: Number(result._sum.credit_amount_gbp ?? 0),
    };
  },

  async approveEntry(id: string, approvedBy: string): Promise<AccountingJournalEntryRow | null> {
    return db.accounting_journal_entries.update({
      where: { id },
      data: {
        approved_by: parseInt(approvedBy, 10),
        posting_date: new Date(),
      },
    }) as unknown as AccountingJournalEntryRow | null;
  },

  /**
   * Get the total amount paid for a booking by summing debit lines
   * from payment-type accounting journal entries.
   */
  async getTotalPaidByBooking(bookingId: string): Promise<number> {
    const result = await db.accounting_journal_lines.aggregate({
      _sum: {
        debit_amount_gbp: true,
      },
      where: {
        entry: {
          booking_id: parseInt(bookingId, 10),
          entry_type: "payment",
        },
      },
    });
    return Number(result._sum.debit_amount_gbp ?? 0);
  },
};

import { kdb } from "../db.server.kysely";
import { bookingRepository } from "../repositories/booking";
import { bookingPassengerRepository } from "../repositories/booking-passenger";
import { bookingLegRepository } from "../repositories/booking-leg";
import { fareRouteRepository } from "../repositories/fare-route";
import { invoiceRepository } from "../repositories/invoice";
import { invoiceItemRepository } from "../repositories/invoice-item";
import { accountingEntryRepository, resolveAccountId, type AccountingJournalEntryRow } from "../repositories/accounting-entry";
import { createAuditLogEntry, validateApproval } from "../permissions.server";
import {
  InvoiceStatus,
  AccountingEntryType,
  InvoiceItemType,
  FREIGHT_RATE_PER_KG,
  DEFAULT_PAYMENT_TERM_DAYS,
} from "../constants";

export interface GenerateInvoiceParams {
  bookingId: string;
  userId: string;
  organizationId?: string;
}

export interface IssueInvoiceParams {
  invoiceId: string;
  userId: string;
}

export interface GetInvoiceWithItemsParams {
  invoiceId: string;
}

export interface GetAgingSummaryParams {
  asOfDate?: string;
}

export interface CancelInvoiceParams {
  invoiceId: string;
  userId: string;
  reason?: string;
}

export interface RecordPaymentAgainstInvoiceParams {
  invoiceId: string;
  paymentId: string;
  amountGbp: number;
  userId: string;
}

export interface InvoiceResult {
  success: boolean;
  invoice?: Record<string, unknown>;
  items?: Record<string, unknown>[];
  error?: string;
}

export interface AgingBucket {
  bucket: string;
  count: number;
  totalAmount: number;
}

export interface AgingSummaryResult {
  success: boolean;
  buckets?: AgingBucket[];
  error?: string;
}

export interface CancelInvoiceResult {
  success: boolean;
  error?: string;
}

export interface RecordPaymentResult {
  success: boolean;
  invoice?: Record<string, unknown>;
  error?: string;
}

// ── Journal Entry Control Types ─────────────────────────────────────────────

export interface VoidInvoiceParams {
  invoiceId: string;
  userId: string;
  reason?: string;
}

export interface VoidInvoiceResult {
  success: boolean;
  error?: string;
}

export interface ApproveJournalEntryParams {
  entryId: string;
  approverId: number;
  initiatorId: number;
}

export interface ApproveJournalEntryResult {
  success: boolean;
  entry?: Record<string, unknown>;
  error?: string;
}

export interface ValidateBalancedEntryParams {
  entryId: string;
}

export interface ValidateBalancedEntryResult {
  success: boolean;
  balanced: boolean;
  difference?: number;
  error?: string;
}

/**
 * Generate an invoice for a booking based on passengers, freight, and fees.
 */
export async function generateInvoice(
  params: GenerateInvoiceParams
): Promise<InvoiceResult> {
  try {
    const booking = await bookingRepository.findById(
      Number(params.bookingId)
    );
    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    const legs = await bookingLegRepository.findByBookingId(
      Number(params.bookingId)
    );
    const passengers = await bookingPassengerRepository.findByBookingId(
      Number(params.bookingId)
    );

    // Load freight data from booking_leg_passengers (freight moved from booking_legs in migration 016)
    const { bookingLegPassengerRepository } = await import("../repositories/booking-leg-passenger");
    const legPassengers = await bookingLegPassengerRepository.findByBookingId(
      Number(params.bookingId)
    );

    // Calculate line items
    const lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      type: string;
      referenceType?: string;
      referenceId?: string;
    }> = [];

    const DEFAULT_FARE_PER_PASSENGER = 50; // fallback when no fare route exists (keep for closures)

    // Fare line items per passenger — sum fares across all legs
    for (const passenger of passengers) {
      let totalFareForPassenger = 0;

      for (const leg of legs) {
        const baseFare = await fareRouteRepository.getBaseFare(
          leg.origin_code,
          leg.destination_code
        );
        totalFareForPassenger += baseFare ?? DEFAULT_FARE_PER_PASSENGER;
      }

      // If no legs, use default fare
      if (legs.length === 0) {
        totalFareForPassenger = DEFAULT_FARE_PER_PASSENGER;
      }

      lineItems.push({
        description: `Fare — ${passenger.first_name} ${passenger.last_name}`,
        quantity: 1,
        unitPrice: totalFareForPassenger,
        type: InvoiceItemType.FARE,
        referenceType: "passenger",
        referenceId: String(passenger.id),
      });
    }

    // Freight line items per leg (from booking_leg_passengers)
    for (const leg of legs) {
      const legFreightTotal = legPassengers
        .filter((lp) => lp.booking_leg_id === leg.id)
        .reduce((sum, lp) => sum + (lp.freight_weight_kg ?? 0), 0);

      if (legFreightTotal > 0) {
        lineItems.push({
          description: `Freight — ${leg.origin_code} \u2192 ${leg.destination_code} (${legFreightTotal}kg)`,
          quantity: 1,
          unitPrice: legFreightTotal * FREIGHT_RATE_PER_KG,
          type: InvoiceItemType.FREIGHT,
          referenceType: "booking_leg",
          referenceId: String(leg.id),
        });
      }
    }

    // Calculate totals
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const taxRate = 0; // Falkland Islands — no VAT
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Generate invoice number
    const invoiceNumber = await invoiceRepository.generateNumber();

    // Create invoice
    const invoice = await invoiceRepository.create({
      invoice_number: invoiceNumber,
      booking_id: params.bookingId,
      organization_id: params.organizationId || undefined,
      user_id: params.userId,
      status: InvoiceStatus.DRAFT,
      issue_date: new Date().toISOString().split("T")[0],
      due_date: new Date(
        Date.now() + DEFAULT_PAYMENT_TERM_DAYS * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .split("T")[0],
      subtotal_gbp: subtotal,
      tax_rate: taxRate,
      tax_amount_gbp: taxAmount,
      total_gbp: total,
      created_by: params.userId,
    });

    // Create invoice line items
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      await invoiceItemRepository.create({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price_gbp: item.unitPrice,
        type: item.type,
        reference_type: item.referenceType,
        reference_id: item.referenceId,
        sort_order: i,
      });
    }

    // Fetch the created items
    const items = await invoiceItemRepository.findByInvoice(invoice.id);

    // Audit trail: log invoice creation
    await createAuditLogEntry({
      actorId: Number(params.userId),
      action: "invoice.created",
      entityType: "invoice",
      entityId: Number(invoice.id),
      newValues: {
        invoice_number: invoice.invoice_number,
        total_gbp: total,
        booking_id: params.bookingId,
        organization_id: params.organizationId || null,
      },
    });

    return {
      success: true,
      invoice: invoice as unknown as Record<string, unknown>,
      items: items as unknown as Record<string, unknown>[],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Issue a draft invoice — updates status and creates accounting journal entry.
 */
export async function issueInvoice(
  params: IssueInvoiceParams
): Promise<InvoiceResult> {
  try {
    const invoice = await invoiceRepository.findById(params.invoiceId);
    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      return {
        success: false,
        error: `Invoice cannot be issued from status "${invoice.status}"`,
      };
    }

    // Update invoice to issued
    await invoiceRepository.updateStatus(
      params.invoiceId,
      InvoiceStatus.ISSUED
    );

    // Set issue_date via Kysely (updateStatus doesn't set issue_date)
    await kdb.updateTable("invoices").set({
      issue_date: new Date(new Date().toISOString().split("T")[0]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).where("id", "=", params.invoiceId).execute();

    // Create accounting journal entry (atomic: entry + both lines)
    let entry: AccountingJournalEntryRow;
    await kdb.transaction().execute(async (tx) => {
      entry = await accountingEntryRepository.createEntry({
        entry_number: `INV-${Date.now()}`,
        entry_type: AccountingEntryType.INVOICE_ISSUED,
        description: `Invoice ${invoice.invoice_number} issued`,
        invoice_id: params.invoiceId,
        booking_id: invoice.booking_id || undefined,
        entry_date: new Date().toISOString().split("T")[0],
        created_by: params.userId,
      }, tx);

      // Resolve chart of accounts UUIDs
      const accountsReceivableId = await resolveAccountId("1020");
      const passengerFareRevenueId = await resolveAccountId("4010");

      // Debit: Accounts Receivable (1020)
      await accountingEntryRepository.createLine({
        entry_id: entry.id,
        account_id: accountsReceivableId,
        debit_amount_gbp: invoice.total_gbp,
        description: "Accounts Receivable — invoice issued",
      }, tx);

      // Credit: Passenger Fare Revenue (4010)
      await accountingEntryRepository.createLine({
        entry_id: entry.id,
        account_id: passengerFareRevenueId,
        credit_amount_gbp: invoice.total_gbp,
        description: "Passenger Fare Revenue — invoice issued",
      }, tx);
    });

    // Re-fetch the updated invoice
    const refreshedInvoice = await invoiceRepository.findById(
      params.invoiceId
    );

    // Audit trail: log invoice issuance
    await createAuditLogEntry({
      actorId: Number(params.userId),
      action: "invoice.issued",
      entityType: "invoice",
      entityId: Number(params.invoiceId),
      newValues: {
        status: InvoiceStatus.ISSUED,
        invoice_number: invoice.invoice_number,
        total_gbp: invoice.total_gbp,
        entry_id: entry!.id,
      },
      oldValues: {
        status: InvoiceStatus.DRAFT,
      },
    });

    return {
      success: true,
      invoice: refreshedInvoice as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Fetch an invoice together with its line items.
 */
export async function getInvoiceWithItems(
  params: GetInvoiceWithItemsParams
): Promise<InvoiceResult> {
  try {
    const invoice = await invoiceRepository.findById(params.invoiceId);
    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    const items = await invoiceItemRepository.findByInvoice(params.invoiceId);

    return {
      success: true,
      invoice: invoice as unknown as Record<string, unknown>,
      items: items as unknown as Record<string, unknown>[],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Get aging summary for overdue invoices grouped by aging buckets.
 */
export async function getAgingSummary(
  params: GetAgingSummaryParams = {}
): Promise<AgingSummaryResult> {
  try {
    const asOfDate = params.asOfDate || new Date().toISOString().split("T")[0];
    const asOf = new Date(asOfDate);

    // Fetch issued invoices that are overdue (due_date < asOfDate)
    const overdueInvoices = await kdb.selectFrom("invoices")
      .select(["due_date", "total_gbp", "amount_paid_gbp"])
      .where("status", "=", InvoiceStatus.ISSUED)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where("due_date", "<", asOf as any)
      .execute();

    // Group into aging buckets
    const buckets: Record<string, { count: number; totalAmount: number }> = {
      "0-30 days": { count: 0, totalAmount: 0 },
      "31-60 days": { count: 0, totalAmount: 0 },
      "61-90 days": { count: 0, totalAmount: 0 },
      "90+ days": { count: 0, totalAmount: 0 },
    };

    const now = new Date(asOfDate);

    for (const inv of overdueInvoices) {
      const dueDate = new Date(inv.due_date as string);
      const daysOverdue = Math.floor(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const amountDue = Number(inv.total_gbp) - Number(inv.amount_paid_gbp ?? 0);

      let bucket: string;
      if (daysOverdue <= 30) bucket = "0-30 days";
      else if (daysOverdue <= 60) bucket = "31-60 days";
      else if (daysOverdue <= 90) bucket = "61-90 days";
      else bucket = "90+ days";

      buckets[bucket].count++;
      buckets[bucket].totalAmount += amountDue;
    }

    const result: AgingBucket[] = Object.entries(buckets)
      .filter(([, v]) => v.count > 0)
      .map(([bucket, data]) => ({
        bucket,
        count: data.count,
        totalAmount: data.totalAmount,
      }));

    return { success: true, buckets: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Cancel an invoice. If the invoice was previously issued and had accounting
 * entries, create reversing journal entries.
 */
export async function cancelInvoice(
  params: CancelInvoiceParams
): Promise<CancelInvoiceResult> {
  try {
    const invoice = await invoiceRepository.findById(params.invoiceId);
    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    const wasIssued = invoice.status === InvoiceStatus.ISSUED;

    // Update invoice status to cancelled
    await invoiceRepository.updateStatus(
      params.invoiceId,
      InvoiceStatus.CANCELLED
    );

    // If the invoice was previously issued, create reversing accounting entries
    if (wasIssued) {
      const existingEntries = await accountingEntryRepository.findByInvoice(
        params.invoiceId
      );

      for (const entry of existingEntries) {
        const lines = await accountingEntryRepository.findLinesByEntryId(
          entry.id
        );

        // Create reversing entry
        const reversingEntry = await accountingEntryRepository.createEntry({
          entry_number: `REV-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          entry_type: AccountingEntryType.ADJUSTMENT,
          description: params.reason
            ? `Reversing entry — ${params.reason}`
            : `Reversing entry for cancelled invoice ${invoice.invoice_number}`,
          invoice_id: params.invoiceId,
          booking_id: invoice.booking_id || undefined,
          entry_date: new Date().toISOString().split("T")[0],
          created_by: params.userId,
        });

        // Reverse each line (swap debits and credits)
        for (const line of lines) {
          await accountingEntryRepository.createLine({
            entry_id: reversingEntry.id,
            account_id: line.account_id,
            debit_amount_gbp: line.credit_amount_gbp,
            credit_amount_gbp: line.debit_amount_gbp,
            description: `Reversal — ${line.description || ""}`,
          });
        }
      }
    }

    // Audit trail: log invoice cancellation
    await createAuditLogEntry({
      actorId: Number(params.userId),
      action: "invoice.cancelled",
      entityType: "invoice",
      entityId: Number(params.invoiceId),
      oldValues: {
        status: invoice.status,
        invoice_number: invoice.invoice_number,
        total_gbp: invoice.total_gbp,
      },
      newValues: {
        status: InvoiceStatus.CANCELLED,
        reason: params.reason || null,
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Record a payment against an invoice. If fully paid, create accounting entry.
 */
export async function recordPaymentAgainstInvoice(
  params: RecordPaymentAgainstInvoiceParams
): Promise<RecordPaymentResult> {
  try {
    const updatedInvoice = await invoiceRepository.updatePayment(
      params.invoiceId,
      params.amountGbp
    );

    if (!updatedInvoice) {
      return { success: false, error: "Invoice not found" };
    }

    // If invoice becomes fully paid, create accounting entry (atomic)
    if (updatedInvoice.status === InvoiceStatus.PAID) {
      let entry: AccountingJournalEntryRow;
      await kdb.transaction().execute(async (tx) => {
        entry = await accountingEntryRepository.createEntry({
          entry_number: `PAY-${Date.now()}`,
          entry_type: AccountingEntryType.INVOICE_PAYMENT,
          description: `Payment received for invoice ${updatedInvoice.invoice_number}`,
          invoice_id: params.invoiceId,
          payment_id: params.paymentId,
          entry_date: new Date().toISOString().split("T")[0],
          created_by: params.userId,
        }, tx);

        // Resolve chart of accounts UUIDs
        const cashAtBankId = await resolveAccountId("1010");
        const accountsReceivableId = await resolveAccountId("1020");

        // Debit: Cash at Bank (1010)
        await accountingEntryRepository.createLine({
          entry_id: entry.id,
          account_id: cashAtBankId,
          debit_amount_gbp: params.amountGbp,
          description: "Cash at Bank — payment received",
        }, tx);

        // Credit: Accounts Receivable (1020)
        await accountingEntryRepository.createLine({
          entry_id: entry.id,
          account_id: accountsReceivableId,
          credit_amount_gbp: params.amountGbp,
          description: "Accounts Receivable — payment received",
        }, tx);
      });
    }

    // Audit trail: log payment recording
    await createAuditLogEntry({
      actorId: Number(params.userId),
      action: "payment.recorded",
      entityType: "payment",
      entityId: Number(params.paymentId),
      newValues: {
        amount_gbp: params.amountGbp,
        invoice_id: params.invoiceId,
        invoice_number: updatedInvoice.invoice_number,
        new_status: updatedInvoice.status,
      },
    });

    return {
      success: true,
      invoice: updatedInvoice as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Journal Entry Controls (Phase 9 — Accounting Controls)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Void an invoice using the voided flag instead of DELETE.
 * Creates a reversing journal entry and logs to audit trail.
 * Only invoices in ISSUED or OVERDUE status can be voided.
 * The voided invoice is preserved for audit purposes with status = "voided".
 */
export async function voidInvoice(
  params: VoidInvoiceParams
): Promise<VoidInvoiceResult> {
  try {
    const invoice = await invoiceRepository.findById(params.invoiceId);
    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    // Only issued/overdue invoices can be voided
    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.OVERDUE) {
      return {
        success: false,
        error: `Invoice cannot be voided from status "${invoice.status}". Only issued or overdue invoices can be voided.`,
      };
    }

    // Update invoice status to voided (not deleted — preserved for audit)
    await invoiceRepository.updateStatus(
      params.invoiceId,
      InvoiceStatus.VOIDED
    );

    // Create reversing accounting entries for previously issued invoices
    const existingEntries = await accountingEntryRepository.findByInvoice(
      params.invoiceId
    );

    for (const entry of existingEntries) {
      const lines = await accountingEntryRepository.findLinesByEntryId(
        entry.id
      );

      // Create reversing entry
      const reversingEntry = await accountingEntryRepository.createEntry({
        entry_number: `REV-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        entry_type: AccountingEntryType.ADJUSTMENT,
        description: params.reason
          ? `Reversing entry — ${params.reason}`
          : `Reversing entry for voided invoice ${invoice.invoice_number}`,
        invoice_id: params.invoiceId,
        booking_id: invoice.booking_id || undefined,
        entry_date: new Date().toISOString().split("T")[0],
        created_by: params.userId,
      });

      // Reverse each line (swap debits and credits)
      for (const line of lines) {
        await accountingEntryRepository.createLine({
          entry_id: reversingEntry.id,
          account_id: line.account_id,
          debit_amount_gbp: line.credit_amount_gbp,
          credit_amount_gbp: line.debit_amount_gbp,
          description: `Reversal — ${line.description || ""}`,
        });
      }
    }

    // Audit trail: log the void action
    await createAuditLogEntry({
      actorId: Number(params.userId),
      action: "invoice.voided",
      entityType: "invoice",
      entityId: Number(params.invoiceId),
      oldValues: {
        status: invoice.status,
        total_gbp: invoice.total_gbp,
        invoice_number: invoice.invoice_number,
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Validate that a journal entry is balanced (debits === credits).
 * Returns the difference if not balanced.
 */
export async function validateBalancedEntry(
  params: ValidateBalancedEntryParams
): Promise<ValidateBalancedEntryResult> {
  try {
    const lines = await accountingEntryRepository.findLinesByEntryId(
      params.entryId
    );

    if (lines.length === 0) {
      return {
        success: false,
        balanced: false,
        error: "Journal entry has no lines",
      };
    }

    const totalDebits = lines.reduce(
      (sum, line) => sum + Number(line.debit_amount_gbp),
      0
    );
    const totalCredits = lines.reduce(
      (sum, line) => sum + Number(line.credit_amount_gbp),
      0
    );
    const difference = Math.round((totalDebits - totalCredits) * 100) / 100;
    const balanced = difference === 0;

    return {
      success: true,
      balanced,
      difference: balanced ? undefined : Math.abs(difference),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, balanced: false, error: message };
  }
}

/**
 * Approve a journal entry with dual-control validation.
 * - Prevents self-approval (initiator cannot be the approver)
 * - Validates the entry is balanced before approving
 * - Sets posting_date and approved_by
 * - Logs to audit trail
 */
export async function approveJournalEntry(
  params: ApproveJournalEntryParams
): Promise<ApproveJournalEntryResult> {
  try {
    // 1. No self-approval: the user who creates a journal entry cannot approve it
    await validateApproval(params.initiatorId, params.approverId);

    // 2. Verify the entry exists
    const entry = await accountingEntryRepository.findEntryById(params.entryId);
    if (!entry) {
      return { success: false, error: "Journal entry not found" };
    }

    // 3. Check immutability: already approved entries cannot be re-approved
    if (entry.approved_by) {
      return {
        success: false,
        error: "Journal entry is already approved and cannot be modified.",
      };
    }

    // 4. Check immutability: already posted entries cannot be modified
    if (entry.posting_date) {
      return {
        success: false,
        error: "Journal entry is already posted and cannot be modified.",
      };
    }

    // 5. Validate the entry is balanced before approving
    const balanceCheck = await validateBalancedEntry({
      entryId: params.entryId,
    });

    if (!balanceCheck.success || !balanceCheck.balanced) {
      return {
        success: false,
        error: balanceCheck.error ||
          `Journal entry is not balanced. Difference: ${balanceCheck.difference}`,
      };
    }

    // 6. Approve the entry (sets approved_by and posting_date)
    const approvedEntry = await accountingEntryRepository.approveEntry(
      params.entryId,
      String(params.approverId)
    );

    if (!approvedEntry) {
      return { success: false, error: "Failed to approve journal entry" };
    }

    // 7. Audit trail
    await createAuditLogEntry({
      actorId: params.approverId,
      action: "journal.approved",
      entityType: "accounting_journal_entry",
      entityId: Number(params.entryId),
      newValues: {
        approved_by: params.approverId,
        posting_date: approvedEntry.posting_date,
        entry_number: approvedEntry.entry_number,
      },
    });

    return {
      success: true,
      entry: approvedEntry as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

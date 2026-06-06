import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState } from "react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import {
  getInvoiceWithItems,
  issueInvoice,
  cancelInvoice,
  voidInvoice,
  recordPaymentAgainstInvoice,
} from "../utils/services/invoice.service";
import { db } from "../utils/db.server";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import Card from "../components/Card";
import InvoiceView from "../components/InvoiceView";
import type { InvoiceViewInvoice } from "../components/InvoiceView";
import PaymentTimeline from "../components/PaymentTimeline";
import type { PaymentTimelineEvent } from "../components/PaymentTimeline";

interface InvoiceDetailData {
  invoice: InvoiceViewInvoice;
  paymentTimeline: PaymentTimelineEvent[];
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_VIEW);

  const invoiceId = params.invoiceId!;

  const result = await getInvoiceWithItems({ invoiceId });

  if (!result.success || !result.invoice) {
    throw new Response("Invoice not found", { status: 404 });
  }

  const inv = result.invoice as Record<string, unknown>;
  const items = (result.items ?? []) as Record<string, unknown>[];

  const invoice: InvoiceViewInvoice = {
    id: String(inv.id),
    invoiceNumber: String(inv.invoice_number),
    status: String(inv.status),
    issueDate: inv.issue_date ? String(inv.issue_date) : undefined,
    dueDate: inv.due_date ? String(inv.due_date) : undefined,
    subtotalGbp: Number(inv.subtotal_gbp),
    taxRate: Number(inv.tax_rate),
    taxAmountGbp: Number(inv.tax_amount_gbp),
    totalGbp: Number(inv.total_gbp),
    amountPaidGbp: Number(inv.amount_paid_gbp ?? 0),
    amountDueGbp: Number(inv.amount_due_gbp ?? inv.total_gbp),
    notes: inv.notes ? String(inv.notes) : undefined,
    organization: inv.organization_name
      ? { name: String(inv.organization_name) }
      : undefined,
    items: items.map((item) => ({
      id: String(item.id),
      description: String(item.description),
      quantity: Number(item.quantity),
      unitPriceGbp: Number(item.unit_price_gbp),
      lineTotalGbp: Number(item.line_total_gbp ?? (Number(item.quantity) * Number(item.unit_price_gbp))),
      type: String(item.type ?? ""),
    })),
  };

  // Fetch payment timeline events for this invoice's booking
  const bookingId = inv.booking_id;
  let paymentTimeline: PaymentTimelineEvent[] = [];

  if (bookingId) {
    const eventsResult = await db.query(
      `SELECT p.id, p.amount_gbp, p.status, p.payment_method, p.created_at,
              u.name AS actor_name
       FROM payments p
       LEFT JOIN users u ON u.id = p.processed_by
       WHERE p.booking_id = $1
       ORDER BY p.created_at DESC`,
      [bookingId]
    );

    paymentTimeline = (eventsResult.rows as Array<{
      id: string;
      amount_gbp: number;
      status: string;
      payment_method: string;
      created_at: string;
      actor_name: string | null;
    }>).map((row) => ({
      id: row.id,
      type: row.status === "refunded" || row.status === "partially_refunded" ? "refund" : "payment",
      status: row.status,
      amount: Number(row.amount_gbp),
      description: `Payment via ${(row.payment_method ?? "unknown").replace(/_/g, " ")}`,
      timestamp: row.created_at,
      actor: row.actor_name ?? undefined,
    }));
  }

  return json<InvoiceDetailData>({ invoice, paymentTimeline });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const invoiceId = params.invoiceId!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "issue": {
      await requirePermission(request, Permission.FINANCE_CREATE_INVOICE);
      const result = await issueInvoice({ invoiceId, userId });
      if (!result.success) {
        return json({ error: result.error ?? "Failed to issue invoice" }, { status: 400 });
      }
      return redirect(`/finance/invoices/${invoiceId}`);
    }

    case "cancel": {
      await requirePermission(request, Permission.FINANCE_CREATE_INVOICE);
      const reason = (formData.get("reason") as string) || undefined;
      const result = await cancelInvoice({ invoiceId, userId, reason });
      if (!result.success) {
        return json({ error: result.error ?? "Failed to cancel invoice" }, { status: 400 });
      }
      return redirect(`/finance/invoices/${invoiceId}`);
    }

    case "record-payment": {
      await requirePermission(request, Permission.FINANCE_RECORD_PAYMENT);
      const amountStr = formData.get("amount") as string;
      const amountGbp = parseFloat(amountStr);
      const method = (formData.get("method") as string) || "manual";
      const reference = (formData.get("reference") as string) || null;
      if (isNaN(amountGbp) || amountGbp <= 0) {
        return json({ error: "Invalid payment amount" }, { status: 400 });
      }

      // Get the booking_id from the invoice
      const invoice = await db.$queryRawUnsafe<Array<{ booking_id: number }>>(
        `SELECT booking_id FROM invoices WHERE id = $1`, [invoiceId]
      );
      if (invoice.length === 0) {
        return json({ error: "Invoice not found" }, { status: 404 });
      }

      // Create a payment record first
      const paymentResult = await db.query(
        `INSERT INTO payments (booking_id, amount, amount_gbp, status, method, processed_by, transaction_reference)
         VALUES ($1, $2, $3, 'paid', $4, $5, $6)
         RETURNING id`,
        [invoice[0].booking_id, amountGbp, amountGbp, method, userId, reference]
      );
      const paymentId = String((paymentResult.rows[0] as { id: string }).id);

      const result = await recordPaymentAgainstInvoice({
        invoiceId,
        paymentId,
        amountGbp,
        userId,
      });

      if (!result.success) {
        return json({ error: result.error ?? "Failed to record payment" }, { status: 400 });
      }
      return redirect(`/finance/invoices/${invoiceId}`);
    }

    case "void": {
      await requirePermission(request, Permission.FINANCE_CREATE_INVOICE);
      const reason = (formData.get("reason") as string) || undefined;
      const result = await voidInvoice({ invoiceId, userId, reason });
      if (!result.success) {
        return json({ error: result.error ?? "Failed to void invoice" }, { status: 400 });
      }
      return redirect(`/finance/invoices/${invoiceId}`);
    }

    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
}

export default function InvoiceDetail() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [showVoidForm, setShowVoidForm] = useState(false);

  const isIssuing = navigation.state === "submitting" && navigation.formData?.get("intent") === "issue";
  const isCancelling = navigation.state === "submitting" && navigation.formData?.get("intent") === "cancel";
  const isRecordingPayment = navigation.state === "submitting" && navigation.formData?.get("intent") === "record-payment";

  const status = data.invoice.status.toUpperCase();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Invoice ${data.invoice.invoiceNumber}`}
        description={`Status: ${data.invoice.status.replace(/_/g, " ")}`}
        actions={
          <div className="flex items-center gap-3">
            {status === "DRAFT" && (
              <Form method="post" style={{ display: "inline" }}>
                <input type="hidden" name="intent" value="issue" />
                <Button type="submit" loading={isIssuing}>
                  Issue
                </Button>
              </Form>
            )}
            {(status === "ISSUED" || status === "OVERDUE") && (
              <>
                <Button
                  variant="outlined"
                  onClick={() => setShowPaymentForm(true)}
                >
                  Record Payment
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setShowCancelForm(true)}
                >
                  Cancel
                </Button>
                <Button
                  variant="outlined"
                  color="danger"
                  onClick={() => setShowVoidForm(true)}
                >
                  Void
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Record Payment Form */}
      {showPaymentForm && (
        <Card title="Record Payment">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="record-payment" />
            <div>
              <label htmlFor="amount" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Amount (£)
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="method" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Payment Method
              </label>
              <select
                id="method"
                name="method"
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="stripe">Stripe</option>
                <option value="manual">Manual / Cash</option>
                <option value="pay_on_departure">Pay on Departure</option>
              </select>
            </div>
            <div>
              <label htmlFor="reference" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Reference (optional)
              </label>
              <input
                id="reference"
                name="reference"
                type="text"
                placeholder="e.g. bank transaction ID"
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" loading={isRecordingPayment}>
                Record Payment
              </Button>
              <Button variant="outlined" onClick={() => setShowPaymentForm(false)}>
                Cancel
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* Cancel Form */}
      {showCancelForm && (
        <Card title="Cancel Invoice">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="cancel" />
            <div>
              <label htmlFor="reason" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Reason (optional)
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={3}
                className="block w-full max-w-lg rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" loading={isCancelling}>
                Confirm Cancel
              </Button>
              <Button variant="outlined" onClick={() => setShowCancelForm(false)}>
                Back
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* Void Form */}
      {showVoidForm && (
        <Card title="Void Invoice">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="void" />
            <div>
              <label htmlFor="void-reason" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Reason (optional)
              </label>
              <textarea
                id="void-reason"
                name="reason"
                rows={3}
                className="block w-full max-w-lg rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" color="danger">
                Confirm Void
              </Button>
              <Button variant="outlined" onClick={() => setShowVoidForm(false)}>
                Back
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* Invoice View */}
      <InvoiceView invoice={data.invoice} />

      {/* Payment Timeline */}
      <Card title="Payment Timeline">
        <PaymentTimeline events={data.paymentTimeline} />
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
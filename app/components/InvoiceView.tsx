import DataTable from "./DataTable";
import type { Column } from "./DataTable";
import PaymentStatusBadge from "./PaymentStatusBadge";

export interface InvoiceViewItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceGbp: number;
  lineTotalGbp: number;
  type: string;
}

export interface InvoiceViewOrganization {
  name: string;
}

export interface InvoiceViewInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate?: string;
  dueDate?: string;
  subtotalGbp: number;
  taxRate: number;
  taxAmountGbp: number;
  totalGbp: number;
  amountPaidGbp: number;
  amountDueGbp: number;
  notes?: string;
  organization?: InvoiceViewOrganization;
  items: InvoiceViewItem[];
}

export interface InvoiceViewProps {
  invoice: InvoiceViewInvoice;
  onPrint?: () => void;
}

function formatGbp(value: number): string {
  return `£${value.toFixed(2)}`;
}

function PrintIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

export default function InvoiceView({
  invoice,
  onPrint,
}: InvoiceViewProps) {
  const columns: Column<InvoiceViewItem>[] = [
    {
      key: "description",
      header: "Description",
      render: (item) => (
        <div>
          <span className="text-sm/5 text-slate-900 dark:text-slate-100">{item.description}</span>
          {item.type && (
            <span className="ml-2 text-xs/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">({item.type})</span>
          )}
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      className: "text-right",
      render: (item) => (
        <span className="text-sm/5 text-slate-700 dark:text-slate-200 tabular-nums">{item.quantity}</span>
      ),
    },
    {
      key: "unitPriceGbp",
      header: "Unit Price",
      className: "text-right",
      render: (item) => (
        <span className="text-sm/5 text-slate-700 dark:text-slate-200 tabular-nums">
          {formatGbp(item.unitPriceGbp)}
        </span>
      ),
    },
    {
      key: "lineTotalGbp",
      header: "Line Total",
      className: "text-right",
      render: (item) => (
        <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
          {formatGbp(item.lineTotalGbp)}
        </span>
      ),
    },
  ];

  return (
    <div className="rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 px-6 py-5">
        <div>
          <h2 className="text-2xl/7 font-bold text-slate-900 dark:text-slate-100">INVOICE</h2>
          <p className="mt-1 text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
            #{invoice.invoiceNumber}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PaymentStatusBadge status={invoice.status} size="lg" />
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 font-medium text-slate-700 dark:text-slate-200 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
            >
              <PrintIcon />
              Print
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Bill-to & Invoice Details */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-xs/5 font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Bill To
            </h3>
            {invoice.organization ? (
              <p className="text-sm/5 font-medium text-slate-900 dark:text-slate-100">
                {invoice.organization.name}
              </p>
            ) : (
              <p className="text-sm/5 text-slate-500 dark:text-slate-400 italic">No organization</p>
            )}
          </div>
          <div className="space-y-2">
            {invoice.issueDate && (
              <div className="flex justify-between">
                <span className="text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Issue Date:</span>
                <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100">
                  {new Date(invoice.issueDate).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
            {invoice.dueDate && (
              <div className="flex justify-between">
                <span className="text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Due Date:</span>
                <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100">
                  {new Date(invoice.dueDate).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div>
          <h3 className="text-xs/5 font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Line Items
          </h3>
          <DataTable
            columns={columns}
            data={invoice.items}
            keyExtractor={(item) => item.id}
          />
        </div>

        {/* Summary */}
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <div className="ml-auto max-w-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Subtotal</span>
              <span className="text-sm/5 text-slate-900 dark:text-slate-100 tabular-nums">
                {formatGbp(invoice.subtotalGbp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Tax ({(invoice.taxRate * 100).toFixed(0)}%)
              </span>
              <span className="text-sm/5 text-slate-900 dark:text-slate-100 tabular-nums">
                {formatGbp(invoice.taxAmountGbp)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
              <span className="text-base/6 font-semibold text-slate-900 dark:text-slate-100">Total</span>
              <span className="text-base/6 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatGbp(invoice.totalGbp)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700 p-4">
          <h3 className="text-xs/5 font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Payment Summary
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Amount Paid</span>
              <span className="text-sm/5 font-medium text-green-700 dark:text-green-400 tabular-nums">
                {formatGbp(invoice.amountPaidGbp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm/5 font-medium text-slate-700 dark:text-slate-200">Amount Due</span>
              <span className="text-base/6 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatGbp(invoice.amountDueGbp)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div>
            <h3 className="text-xs/5 font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Notes
            </h3>
            <p className="text-sm/5 text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
              {invoice.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

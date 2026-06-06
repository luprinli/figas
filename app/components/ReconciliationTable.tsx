import Badge from "./Badge";
import type { BadgeProps } from "./Badge";
import DataTable from "./DataTable";
import type { Column } from "./DataTable";

export interface ReconciliationTransaction {
  id: string;
  externalId: string;
  transactionDate: string;
  description: string;
  amountGbp: number;
  reconciliationStatus: string;
  matchedPaymentId?: string;
  matchedAt?: string;
}

export interface ReconciliationTableProps {
  transactions: ReconciliationTransaction[];
  onMatch?: (transactionId: string) => void;
  onFlag?: (transactionId: string) => void;
}

const statusVariantMap: Record<string, BadgeProps["variant"]> = {
  UNMATCHED: "warning",
  MATCHED: "success",
  DISPUTED: "danger",
};

function formatGbp(value: number): string {
  return `£${Math.abs(value).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ReconciliationTable({
  transactions,
  onMatch,
  onFlag,
}: ReconciliationTableProps) {
  const columns: Column<ReconciliationTransaction>[] = [
    {
      key: "transactionDate",
      header: "Date",
      render: (txn) => (
        <span className="text-sm/5 text-slate-700 dark:text-slate-200 tabular-nums">
          {formatDate(txn.transactionDate)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (txn) => (
        <div className="max-w-xs">
          <p className="text-sm/5 text-slate-900 dark:text-slate-100 truncate">{txn.description}</p>
          <p className="text-xs/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">ID: {txn.externalId}</p>
        </div>
      ),
    },
    {
      key: "amountGbp",
      header: "Amount",
      className: "text-right",
      render: (txn) => {
        const isNegative = txn.amountGbp < 0;
        return (
          <span
            className={[
              "text-sm/5 font-medium tabular-nums",
              isNegative ? "text-red-600" : "text-slate-900 dark:text-slate-100",
            ].join(" ")}
          >
            {isNegative ? "-" : ""}{formatGbp(txn.amountGbp)}
          </span>
        );
      },
    },
    {
      key: "reconciliationStatus",
      header: "Status",
      render: (txn) => {
        const variant = statusVariantMap[txn.reconciliationStatus] ?? "default";
        return (
          <Badge variant={variant}>
            {txn.reconciliationStatus.replace(/_/g, " ")}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (txn) => (
        <div className="flex items-center gap-2">
          {onMatch && txn.reconciliationStatus === "UNMATCHED" && (
            <button
              type="button"
              onClick={() => onMatch(txn.id)}
              className="rounded-md bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs/5 font-medium text-cyan-600 ring-1 ring-inset ring-cyan-200 hover:bg-cyan-50 transition"
            >
              Match
            </button>
          )}
          {onFlag && (
            <button
              type="button"
              onClick={() => onFlag(txn.id)}
              className="rounded-md bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs/5 font-medium text-amber-600 ring-1 ring-inset ring-amber-200 hover:bg-amber-50 dark:bg-amber-900/30 transition"
            >
              Flag
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={transactions}
      keyExtractor={(txn) => txn.id}
    />
  );
}

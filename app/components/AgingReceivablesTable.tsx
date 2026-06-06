export interface AgingBucket {
  count: number;
  total: number;
}

export interface AgingReceivablesBuckets {
  "0-30": AgingBucket;
  "31-60": AgingBucket;
  "61-90": AgingBucket;
  "90+": AgingBucket;
}

export interface AgingReceivablesTableProps {
  buckets: AgingReceivablesBuckets;
  currency?: string;
  onBucketClick?: (bucket: string) => void;
}

const BUCKET_KEYS = ["0-30", "31-60", "61-90", "90+"] as const;

const bucketColorMap: Record<string, string> = {
  "0-30": "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100",
  "31-60": "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100",
  "61-90": "bg-orange-50 text-orange-700 hover:bg-orange-100",
  "90+": "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100",
};

const bucketLabelMap: Record<string, string> = {
  "0-30": "0–30 Days",
  "31-60": "31–60 Days",
  "61-90": "61–90 Days",
  "90+": "90+ Days",
};

function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  return `${symbol}${amount.toFixed(2)}`;
}

export default function AgingReceivablesTable({
  buckets,
  currency = "GBP",
  onBucketClick,
}: AgingReceivablesTableProps) {
  const totalCount = BUCKET_KEYS.reduce((sum, key) => sum + buckets[key].count, 0);
  const totalAmount = BUCKET_KEYS.reduce((sum, key) => sum + buckets[key].total, 0);

  return (
    <div className="overflow-x-auto rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700">
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr>
            <th
              scope="col"
              className="px-4 py-3.5 text-left text-sm/5 font-semibold text-slate-900 dark:text-slate-100"
            >
              Aging Period
            </th>
            <th
              scope="col"
              className="px-4 py-3.5 text-right text-sm/5 font-semibold text-slate-900 dark:text-slate-100"
            >
              Count
            </th>
            <th
              scope="col"
              className="px-4 py-3.5 text-right text-sm/5 font-semibold text-slate-900 dark:text-slate-100"
            >
              Total Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {BUCKET_KEYS.map((key) => {
            const bucket = buckets[key];
            const colorClasses = bucketColorMap[key] ?? "bg-white text-slate-700 dark:text-slate-200";
            const isClickable = !!onBucketClick;

            return (
              <tr
                key={key}
                onClick={isClickable ? () => onBucketClick(key) : undefined}
                className={[
                  "transition",
                  isClickable ? "cursor-pointer" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td
                  className={[
                    "whitespace-nowrap px-4 py-3 text-sm/5 font-medium",
                    colorClasses,
                  ].join(" ")}
                >
                  {bucketLabelMap[key]}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm/5 text-slate-700 dark:text-slate-200 tabular-nums">
                  {bucket.count}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm/5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatCurrency(bucket.total, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700">
            <td className="px-4 py-3.5 text-sm/5 font-semibold text-slate-900 dark:text-slate-100">
              Total
            </td>
            <td className="px-4 py-3.5 text-right text-sm/5 font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {totalCount}
            </td>
            <td className="px-4 py-3.5 text-right text-sm/5 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatCurrency(totalAmount, currency)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

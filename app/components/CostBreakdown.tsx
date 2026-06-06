export interface CostBreakdownItem {
  label: string;
  amount: number;
  type?: string;
}

export interface CostBreakdownProps {
  items: CostBreakdownItem[];
  total: number;
  currency?: string;
}

function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  return `${symbol}${amount.toFixed(2)}`;
}

export default function CostBreakdown({
  items,
  total,
  currency = "GBP",
}: CostBreakdownProps) {
  // Group items by type if types are present
  const hasTypes = items.some((item) => item.type);
  const grouped: Record<string, CostBreakdownItem[]> = {};

  if (hasTypes) {
    for (const item of items) {
      const type = item.type ?? "Other";
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(item);
    }
  }

  const renderItem = (item: CostBreakdownItem, index: number) => (
    <div
      key={index}
      className="flex items-center justify-between py-2"
    >
      <span className="text-sm/5 text-slate-700 dark:text-slate-200">{item.label}</span>
      <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
        {formatCurrency(item.amount, currency)}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg bg-white dark:bg-slate-800">
      {hasTypes ? (
        Object.entries(grouped).map(([type, typeItems]) => (
          <div key={type} className="mb-2">
            <h4 className="text-xs/5 font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 py-1.5">
              {type}
            </h4>
            <div className="space-y-0.5">
              {typeItems.map((item, idx) => renderItem(item, idx))}
            </div>
          </div>
        ))
      ) : (
        <div className="space-y-0.5">
          {items.map((item, index) => renderItem(item, index))}
        </div>
      )}

      {/* Total row */}
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
        <span className="text-sm/5 font-semibold text-slate-900 dark:text-slate-100">Total</span>
        <span className="text-base/6 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {formatCurrency(total, currency)}
        </span>
      </div>
    </div>
  );
}

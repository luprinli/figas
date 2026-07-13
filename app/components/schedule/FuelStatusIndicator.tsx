interface FuelStatusIndicatorProps {
  label: string;
  ok: boolean;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-green-500 dark:bg-green-900/30" : "bg-red-500 dark:bg-red-900/30"
      }`}
    />
  );
}

export function FuelStatusIndicator({ label, ok }: FuelStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <StatusDot ok={ok} />
      <span className={ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{label}</span>
    </div>
  );
}

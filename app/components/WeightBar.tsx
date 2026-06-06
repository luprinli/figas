export interface WeightBarProps {
  currentWeight: number;
  maxWeight: number;
  label?: string;
  className?: string;
}

function getPercentage(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min((current / max) * 100, 100);
}

function getBarColor(percentage: number): string {
  if (percentage >= 90) return "bg-red-500";
  if (percentage >= 70) return "bg-amber-500";
  return "bg-green-500";
}

function getTextColor(percentage: number): string {
  if (percentage >= 90) return "text-red-700";
  if (percentage >= 70) return "text-amber-700";
  return "text-green-700";
}

export default function WeightBar({
  currentWeight,
  maxWeight,
  label,
  className,
}: WeightBarProps) {
  const percentage = getPercentage(currentWeight, maxWeight);
  const barColor = getBarColor(percentage);
  const textColor = getTextColor(percentage);

  return (
    <div className={className}>
      {label && (
        <p className="mb-1 text-sm/5 font-medium text-slate-700 dark:text-slate-200">{label}</p>
      )}
      <div className="overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={["h-2.5 rounded-full transition-all duration-300", barColor].join(" ")}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={currentWeight}
          aria-valuemin={0}
          aria-valuemax={maxWeight}
          aria-label={`${currentWeight} / ${maxWeight}`}
        />
      </div>
      <p className={["mt-1 text-xs/5 font-medium", textColor].join(" ")}>
        {currentWeight} / {maxWeight}
      </p>
    </div>
  );
}

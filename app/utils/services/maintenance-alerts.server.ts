/**
 * Maintenance alert thresholds and color-coded status indicators.
 * Used by the engineer dashboard and component tracking views.
 */

export type AlertLevel = 'green' | 'amber' | 'red';

export interface ComponentAlert {
  level: AlertLevel;
  label: string;
  hoursRemaining: number;
  cyclesRemaining: number | null;
  percentRemaining: number;
}

const THRESHOLDS = {
  red: 0.10,   // <10% remaining — immediate action
  amber: 0.25, // <25% remaining — plan replacement
  green: 1.0,  // OK
};

export function getComponentStatus(remaining: number, tbo: number): AlertLevel {
  const pct = remaining / tbo;
  if (pct <= THRESHOLDS.red) return 'red';
  if (pct <= THRESHOLDS.amber) return 'amber';
  return 'green';
}

export function getTaskPriority(
  nextDueHours: number,
  currentHours: number
): 'routine' | 'urgent' | 'aog' {
  const remaining = nextDueHours - currentHours;
  if (remaining <= 0) return 'aog';
  if (remaining <= 5) return 'urgent';
  return 'routine';
}

export function getAlertColorClass(level: AlertLevel): string {
  switch (level) {
    case 'red': return 'text-red-600 dark:text-red-400';
    case 'amber': return 'text-amber-600 dark:text-amber-400';
    default: return 'text-emerald-600 dark:text-emerald-400';
  }
}

export function getAlertBgClass(level: AlertLevel): string {
  switch (level) {
    case 'red': return 'bg-red-50 dark:bg-red-900/30';
    case 'amber': return 'bg-amber-50 dark:bg-amber-900/30';
    default: return 'bg-emerald-50 dark:bg-emerald-900/30';
  }
}

export function getAlertDotClass(level: AlertLevel): string {
  switch (level) {
    case 'red': return 'bg-red-500';
    case 'amber': return 'bg-amber-500';
    default: return 'bg-emerald-500';
  }
}

export function getHoursRemainingLabel(remaining: number): string {
  if (remaining <= 0) return 'Overdue';
  if (remaining < 1) return '<1 hr';
  return `${remaining.toLocaleString()} hrs`;
}

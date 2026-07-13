import Badge from "./Badge";
import type { BadgeProps } from "./Badge";

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusVariantMap: Record<string, BadgeProps["variant"]> = {
  scheduled: "info",
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
  completed: "success",
  active: "success",
  inactive: "default",
  archived: "default",
  draft: "warning",
  published: "success",
  paid: "success",
  unpaid: "warning",
  refunded: "info",
  failed: "danger",
  error: "danger",
  success: "success",
  warning: "warning",
  info: "info",
  booked: "info",
  checked_in: "success",
  "checked in": "success",
  boarded: "success",
  "not checked in": "warning",
  boarding: "info",
  departed: "info",
  arrived: "success",
  delayed: "warning",
  on_hold: "warning",
  processing: "info",
  approved: "success",
  rejected: "danger",
  submitted: "info",
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = statusVariantMap[status.toLowerCase()] ?? "default";

  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  );
}

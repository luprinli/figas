import Badge from "./Badge";
import type { BadgeProps } from "./Badge";

export interface PaymentStatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
}

const statusVariantMap: Record<string, BadgeProps["variant"]> = {
  PENDING: "warning",
  PROCESSING: "info",
  PAID: "success",
  PARTIALLY_PAID: "info",
  INVOICED: "default",
  OVERDUE: "danger",
  REFUNDED: "default",
  PARTIALLY_REFUNDED: "warning",
  FAILED: "danger",
  CANCELLED: "default",
};

const sizeStyles: Record<NonNullable<PaymentStatusBadgeProps["size"]>, string> = {
  sm: "text-xs/5 px-2 py-0.5",
  md: "text-sm/5 px-2.5 py-0.5",
  lg: "text-base/6 px-3 py-1",
};

export default function PaymentStatusBadge({
  status,
  size = "md",
}: PaymentStatusBadgeProps) {
  const variant = statusVariantMap[status] ?? "default";

  return (
    <Badge variant={variant} className={sizeStyles[size]}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

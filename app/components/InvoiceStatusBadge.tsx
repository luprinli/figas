import Badge from "./Badge";
import type { BadgeProps } from "./Badge";

export interface InvoiceStatusBadgeProps {
  status: string;
}

const statusVariantMap: Record<string, BadgeProps["variant"]> = {
  DRAFT: "default",
  ISSUED: "info",
  PAID: "success",
  OVERDUE: "danger",
  CANCELLED: "default",
  WRITTEN_OFF: "warning",
};

export default function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const variant = statusVariantMap[status] ?? "default";

  return (
    <Badge variant={variant}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

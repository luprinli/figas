import { FileText } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function InvoiceIcon({ className, size = 20 }: Props) {
  return <FileText size={size} className={className} />;
}

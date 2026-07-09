import { Receipt } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function PaymentIcon({ className, size = 20 }: Props) {
  return <Receipt size={size} className={className} />;
}

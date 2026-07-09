import { CreditCard } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function CreditCardIcon({ className, size = 20 }: Props) {
  return <CreditCard size={size} className={className} />;
}

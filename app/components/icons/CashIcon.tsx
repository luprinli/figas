import { Banknote } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function CashIcon({ className, size = 20 }: Props) {
  return <Banknote size={size} className={className} />;
}

import { RefreshCcw } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function RefundIcon({ className, size = 20 }: Props) {
  return <RefreshCcw size={size} className={className} />;
}

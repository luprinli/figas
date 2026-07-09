import { ArrowUpCircle } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function TopUpIcon({ className, size = 20 }: Props) {
  return <ArrowUpCircle size={size} className={className} />;
}

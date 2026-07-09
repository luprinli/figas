import { Package } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function FreightIcon({ className, size = 20 }: Props) {
  return <Package size={size} className={className} />;
}

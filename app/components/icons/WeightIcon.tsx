import { Scale } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function WeightIcon({ className, size = 20 }: Props) {
  return <Scale size={size} className={className} />;
}

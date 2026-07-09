import { Calendar } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function CalendarIcon({ className, size = 20 }: Props) {
  return <Calendar size={size} className={className} />;
}

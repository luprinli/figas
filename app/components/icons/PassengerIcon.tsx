import { User } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function PassengerIcon({ className, size = 20 }: Props) {
  return <User size={size} className={className} />;
}

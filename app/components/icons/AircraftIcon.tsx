import { Plane } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function AircraftIcon({ className, size = 20 }: Props) {
  return <Plane size={size} className={className} />;
}

import { Route } from "lucide-react";

interface Props {
  className?: string;
  size?: number;
}

export default function ItineraryIcon({ className, size = 20 }: Props) {
  return <Route size={size} className={className} />;
}

interface Props {
  className?: string;
}

export default function ItineraryIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M9 18q-.825 0-1.412-.587T7 16t.588-1.412T9 14t1.413.588T11 16t-.587 1.413T9 18m6 0q-.825 0-1.412-.587T13 16t.588-1.412T15 14t1.413.588T17 16t-.587 1.413T15 18M3 8V6h18v2zm3 8q-.825 0-1.412-.587T4 14V6q0-.825.588-1.412T6 4h12q.825 0 1.413.588T20 6v8q0 .825-.587 1.413T18 16z" />
    </svg>
  );
}

interface Props {
  className?: string;
}

export default function FlightPathArc({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-none stroke-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 19c4-6 14-6 18 0" />
      <path d="M18 19h3v-3" />
    </svg>
  );
}

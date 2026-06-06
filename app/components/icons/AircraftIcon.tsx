interface Props {
  className?: string;
}

export default function AircraftIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M21 14v-2l-8-4V4a1 1 0 0 0-1-1 1 1 0 0 0-1 1v4l-8 4v2l8-2v5l-2 1.5V20l3-.5 3 .5v-1.5L13 17v-5l8 2Z" />
    </svg>
  );
}

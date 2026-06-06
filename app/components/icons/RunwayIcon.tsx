interface Props {
  className?: string;
}

export default function RunwayIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M3 11h18v2H3z" />
      <path d="M5 8h2v8H5zM9 8h2v8H9zM13 8h2v8h-2zM17 8h2v8h-2z" />
      <path d="M11 5h2v3h-2zM11 16h2v3h-2z" />
    </svg>
  );
}

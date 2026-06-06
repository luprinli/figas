interface Props {
  className?: string;
}

export default function CalendarIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M9 10v2H7v-2zm4 0v2h-2v-2zm4 0v2h-2v-2zm2-7h-1V1h-2v2H8V1H6v2H5q-.825 0-1.412.588T3 5v14q0 .825.588 1.413T5 21h14q.825 0 1.413-.587T21 19V5q0-.825-.587-1.412T19 3m0 16H5V8h14z" />
    </svg>
  );
}

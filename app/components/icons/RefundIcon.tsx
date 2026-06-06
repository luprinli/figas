interface Props {
  className?: string;
}

export default function RefundIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
      <path d="M12 6v2c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3h-2c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1V8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3h-2c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1V6z" />
      <path d="M11 5h2v2h-2zM11 17h2v2h-2z" />
    </svg>
  );
}

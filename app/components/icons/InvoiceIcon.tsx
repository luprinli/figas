interface Props {
  className?: string;
}

export default function InvoiceIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
      <path d="M8 12h8v2H8zm0 4h8v2H8zm0-8h5v2H8z" />
    </svg>
  );
}

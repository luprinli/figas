interface Props {
  className?: string;
}

export default function BoardingPassIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M4 4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4zm0 2h16v2H4V6zm0 4h16v2H4v-2zm0 4h16v2H4v-2zm0 4h16v2H4v-2z" />
      <path d="M7 8h2v2H7V8zm0 4h2v2H7v-2zm0 4h2v2H7v-2z" />
    </svg>
  );
}

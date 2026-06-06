interface Props {
  className?: string;
}

export default function BarcodeIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M2 5h2v14H2V5zm4 0h1v14H6V5zm3 0h2v14H9V5zm3 0h1v14h-1V5zm4 0h2v14h-2V5zm3 0h1v14h-1V5zm-2 0h1v14h-1V5z" />
    </svg>
  );
}

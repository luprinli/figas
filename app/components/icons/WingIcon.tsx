interface Props {
  className?: string;
}

export default function WingIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M21.5 14.5c-.5-.5-1.5-1-2.5-1.5l-5-2-2-4-2-1v3l2 3-4 1-2-2H4v2l2 2 3 1 4 1 4 2c1 .5 2 1 2.5 1.5s1.5.5 2 .5c.5 0 1-.2 1-.8s-.5-1.2-1.5-1.7z" />
    </svg>
  );
}

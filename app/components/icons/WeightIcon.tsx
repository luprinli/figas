interface Props {
  className?: string;
}

export default function WeightIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M12 3q1.05 0 1.775.725T14.5 5.5q0 .5-.175.925T13.85 7.2l1.55 4.3H20v2H4v-2h4.6l1.55-4.3q-.3-.35-.475-.775T9.5 5.5q0-1.05.725-1.775T12 3m0 2q-.2 0-.35.15t-.15.35.15.35.35.15.35-.15.15-.35-.15-.35T12 5m-1 4.5h2l-.7-1.95q-.15.05-.3.075T12 7.65t-.3-.025-.3-.075zM4 14v5h16v-5h2v5q0 .825-.587 1.413T20 21H4q-.825 0-1.412-.587T2 19v-5z" />
    </svg>
  );
}

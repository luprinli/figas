interface Props {
  className?: string;
}

export default function CompassIcon({ className = "w-5 h-5" }: Props) {
  return (
    <svg
      className={`${className} fill-current`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M12 2q2.075 0 3.9.788t3.175 2.137 2.137 3.175T22 12t-.788 3.9-2.137 3.175-3.175 2.138T12 22t-3.9-.788-3.175-2.137-2.138-3.175T2 12t.788-3.9 2.137-3.175T8.1 2.788 12 2m0 2q-3.35 0-5.675 2.325T4 12t2.325 5.675T12 20t5.675-2.325T20 12t-2.325-5.675T12 4m-2 10 5-3-5-3z" />
    </svg>
  );
}

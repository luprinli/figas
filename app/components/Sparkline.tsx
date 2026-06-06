export interface SparklineProps {
  data: number[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export default function Sparkline({
  data,
  labels,
  width = 200,
  height = 40,
  color = "#2563eb",
  className = "",
}: SparklineProps) {
  if (data.length < 2) return null;

  const pad = 2;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);

  const points = data
    .map((d, i) => {
      const x = pad + i * stepX;
      const y = pad + height - pad * 2 - ((d - min) / range) * (height - pad * 2 - 4);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block align-middle ${className}`}
      style={{ width, height }}
      role="img"
      aria-label={labels ? `Trend: ${labels.join(", ")}` : "Trend sparkline"}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pad + (data.length - 1) * stepX}
        cy={pad + height - pad * 2 - ((data[data.length - 1] - min) / range) * (height - pad * 2 - 4)}
        r="3"
        fill={color}
      />
    </svg>
  );
}

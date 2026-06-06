interface CGEnvelopeChartProps {
  points: Array<{
    label: string;
    cgMM: number;
    weightKg: number;
  }>;
  envelope: {
    forwardLimitMM: number;
    aftLimitMM: number;
    mtowKg: number;
  };
  className?: string;
}

export default function CGEnvelopeChart({
  points,
  envelope,
  className = "",
}: CGEnvelopeChartProps) {
  const width = 320;
  const height = 240;
  const pad = { top: 30, right: 30, bottom: 40, left: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xMin = envelope.forwardLimitMM - 50;
  const xMax = envelope.aftLimitMM + 50;
  const yMin = 0;
  const yMax = envelope.mtowKg + 200;

  const xScale = (mm: number) => pad.left + ((mm - xMin) / (xMax - xMin)) * plotW;
  const yScale = (kg: number) => pad.top + plotH - ((kg - yMin) / (yMax - yMin)) * plotH;

  const envelopePath = [
    `M${xScale(envelope.forwardLimitMM)},${yScale(0)}`,
    `L${xScale(envelope.forwardLimitMM)},${yScale(envelope.mtowKg)}`,
    `L${xScale(envelope.aftLimitMM)},${yScale(envelope.mtowKg)}`,
    `L${xScale(envelope.aftLimitMM)},${yScale(0)}`,
    "Z",
  ].join(" ");

  const yTicks = 5;
  const xTicks = 6;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full max-w-sm ${className}`}
      role="img"
      aria-label="CG Envelope Chart"
    >
      {/* Grid lines */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const kg = yMin + ((yMax - yMin) * i) / yTicks;
        return (
          <line
            key={`yg-${i}`}
            x1={pad.left}
            y1={yScale(kg)}
            x2={width - pad.right}
            y2={yScale(kg)}
            stroke="#e2e8f0"
            strokeDasharray="4 2"
          />
        );
      })}
      {Array.from({ length: xTicks + 1 }).map((_, i) => {
        const mm = xMin + ((xMax - xMin) * i) / xTicks;
        return (
          <line
            key={`xg-${i}`}
            x1={xScale(mm)}
            y1={pad.top}
            x2={xScale(mm)}
            y2={height - pad.bottom}
            stroke="#e2e8f0"
            strokeDasharray="4 2"
          />
        );
      })}

      {/* Envelope polygon */}
      <polygon points={envelopePath.replace(/[MLZ]/g, (m) => (m === "Z" ? "" : m === "M" ? "" : ",")).replace(/[A-Z]/g, "")} fill="rgba(37, 99, 235, 0.08)" stroke="#2563eb" strokeWidth="2" />
      <path d={envelopePath} fill="rgba(37, 99, 235, 0.08)" stroke="#2563eb" strokeWidth="2" />

      {/* Limit labels */}
      <text x={xScale(envelope.forwardLimitMM)} y={height - 8} textAnchor="middle" fontSize="9" fill="#64748b">
        {envelope.forwardLimitMM.toFixed(0)}
      </text>
      <text x={xScale(envelope.aftLimitMM)} y={height - 8} textAnchor="middle" fontSize="9" fill="#64748b">
        {envelope.aftLimitMM.toFixed(0)}
      </text>
      <text x={pad.left - 6} y={yScale(envelope.mtowKg) + 4} textAnchor="end" fontSize="9" fill="#64748b">
        {envelope.mtowKg}
      </text>

      {/* CG points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={xScale(p.cgMM)}
            cy={yScale(p.weightKg)}
            r="4"
            fill="#dc2626"
            stroke="#fff"
            strokeWidth="1.5"
          />
          <text
            x={xScale(p.cgMM) + 8}
            y={yScale(p.weightKg) - 6}
            fontSize="9"
            fill="#475569"
            fontWeight="600"
          >
            {p.label}
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={width / 2} y={height - 2} textAnchor="middle" fontSize="10" fill="#94a3b8">
        CG Arm (mm)
      </text>
      <text
        x={12}
        y={height / 2}
        textAnchor="middle"
        fontSize="10"
        fill="#94a3b8"
        transform={`rotate(-90, 12, ${height / 2})`}
      >
        Weight (kg)
      </text>

      {/* Axis lines */}
      <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#cbd5e1" />
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#cbd5e1" />
    </svg>
  );
}

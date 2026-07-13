interface PassengerRow {
  id: number;
  seat: string;
  name: string;
  origin: string;
  destination: string;
  clothedWeightKg: number;
  baggageWeightKg: number;
  boarded: boolean;
}

interface ManifestJourneyProps {
  passengers: PassengerRow[];
  stopCodes: string[];
  className?: string;
}

const STOP_W = 62;
const ROW_H = 28;
const LABEL_W = 186;
const CIRCLE_R = 4;
const ARROW_W = 6;

function sortPassengers(passengers: PassengerRow[], stopCodes: string[]): PassengerRow[] {
  return [...passengers].sort((a, b) => {
    const aFromIdx = stopCodes.indexOf(a.origin);
    const bFromIdx = stopCodes.indexOf(b.origin);
    const aToIdx = stopCodes.indexOf(a.destination);
    const bToIdx = stopCodes.indexOf(b.destination);

    // First sort by boarding point (STY first)
    if (aFromIdx !== bFromIdx) return aFromIdx - bFromIdx;

    // Same boarding point: sort by destination (STY last)
    return aToIdx - bToIdx;
  });
}

export default function ManifestJourney({ passengers, stopCodes, className }: ManifestJourneyProps) {
  const sorted = sortPassengers(passengers, stopCodes);
  const chartW = stopCodes.length * STOP_W;

  return (
    <div className={`overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${className ?? ""}`}>
      {/* ── Section label ── */}
      <div className="px-4 pt-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Passenger Manifest</h3>
      </div>

      {/* ── Stop headers ── */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 text-[10px] font-medium text-slate-500 dark:text-slate-500">
        <div className="shrink-0 px-2 py-1.5" style={{ width: LABEL_W }}>
          <span>Passenger</span>
        </div>
        {stopCodes.map((code, i) => (
          <div
            key={`${code}-${i}`}
            className={`shrink-0 border-l border-slate-100 dark:border-slate-700 px-1 py-1.5 text-center ${code === "STY" ? "font-bold text-cyan-600" : ""}`}
            style={{ width: STOP_W }}
          >
            {code}
          </div>
        ))}
      </div>

      {/* ── Passenger rows ── */}
      {sorted.map((p) => {
        const originIdx = stopCodes.indexOf(p.origin);
        const destIdx = stopCodes.indexOf(p.destination);
        const lineY = ROW_H / 2;

        return (
          <div key={p.id} className="flex border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
            {/* Label column */}
            <div className="shrink-0 px-2 py-1.5 flex items-center" style={{ width: LABEL_W }}>
              <span className="rounded bg-slate-100 dark:bg-slate-700 px-1 py-0 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 leading-tight mr-1.5">
                {p.seat}
              </span>
              <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{p.name}</span>
              <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">{p.clothedWeightKg}kg</span>
            </div>

            {/* Journey SVG */}
            {originIdx >= 0 && destIdx >= 0 ? (
              <svg width={chartW} height={ROW_H} className="shrink-0">
                {/* Line from origin to destination */}
                <line
                  x1={originIdx * STOP_W + STOP_W / 2}
                  y1={lineY}
                  x2={destIdx * STOP_W + STOP_W / 2 - ARROW_W}
                  y2={lineY}
                  stroke={"var(--color-teal)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.6"
                />

                {/* Boarding circle (filled) */}
                <circle
                  cx={originIdx * STOP_W + STOP_W / 2}
                  cy={lineY}
                  r={CIRCLE_R}
                  fill={"var(--color-teal)"}
                />

                {/* Alighting arrowhead */}
                {destIdx > originIdx && (
                  <polyline
                    points={`${destIdx * STOP_W + STOP_W / 2 - ARROW_W},${lineY - ARROW_W / 2} ${destIdx * STOP_W + STOP_W / 2},${lineY} ${destIdx * STOP_W + STOP_W / 2 - ARROW_W},${lineY + ARROW_W / 2}`}
                    fill="none"
                    stroke={"var(--color-teal)"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Intermediate stop dots */}
                {stopCodes.map((_, i) => {
                  if (i > originIdx && i < destIdx) {
                    return (
                      <circle
                        key={`dot-${i}`}
                        cx={i * STOP_W + STOP_W / 2}
                        cy={lineY}
                        r="1.5"
                        fill={"var(--color-teal)"}
                        opacity="0.35"
                      />
                    );
                  }
                  return null;
                })}
              </svg>
            ) : (
              <div className="flex items-center shrink-0" style={{ width: chartW, height: ROW_H }}>
                <span className="pl-3 text-[10px] text-slate-300 dark:text-slate-500">—</span>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Baggage row ── */}
      {passengers.reduce((s, p) => s + p.baggageWeightKg, 0) > 0 && (
        <div className="flex border-t-2 border-slate-200 dark:border-slate-700">
          <div className="shrink-0 px-2 py-1.5 flex items-center" style={{ width: LABEL_W }}>
            <span className="text-[10px] font-medium text-amber-600">Aft Hold (Baggage)</span>
            <span className="ml-auto text-[10px] text-amber-600 tabular-nums">
              {passengers.reduce((s, p) => s + p.baggageWeightKg, 0)}kg
            </span>
          </div>
          <svg width={chartW} height={ROW_H} className="shrink-0">
            <line x1={0} y1={ROW_H / 2} x2={chartW} y2={ROW_H / 2} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
          </svg>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700">
        <span className="inline-flex items-center gap-1">
          <svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill={"var(--color-teal)"} /></svg> Board
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="14" height="10">
            <polyline points="2,2 8,5 2,8" fill="none" stroke={"var(--color-teal)"} strokeWidth="1.5" strokeLinecap="round" />
          </svg> Alight
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke={"var(--color-teal)"} strokeWidth="1.5" opacity="0.5" /></svg> In transit
        </span>
      </div>
    </div>
  );
}

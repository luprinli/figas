import { useState } from "react";

interface CashKeypadProps {
  onEnter: (val: string) => void;
  onQuick: (val: number) => void;
  quickAmounts?: number[];
}

const DEFAULT_QUICK_AMOUNTS = [10, 20, 50];

export default function CashKeypad({ onEnter, onQuick, quickAmounts = DEFAULT_QUICK_AMOUNTS }: CashKeypadProps) {
  const [input, setInput] = useState("");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "\u21B5"];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {quickAmounts.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onQuick(v)}
            className="px-3 py-1.5 text-xs font-medium rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:scale-95 transition-transform"
          >
            £{v}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 rounded px-3 py-1 min-w-[120px] text-right">
          £{input || "0.00"}
        </div>
        <button
          type="button"
          onClick={() => { if (input) { onEnter(input); setInput(""); } }}
          disabled={!input}
          className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none dark:opacity-60 active:scale-95 transition-transform"
        >
          Enter
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 min-w-[200px] w-48">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (k === "C") setInput("");
              else if (k === "\u21B5") { if (input) { onEnter(input); setInput(""); } }
              else setInput(input + k);
            }}
            className={`min-h-[44px] min-w-[44px] text-sm font-medium rounded active:scale-95 transition-transform ${
              k === "C"
                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                : k === "\u21B5"
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

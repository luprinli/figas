import { useState } from "react";
import Button from "../Button";

interface CardProcessorProps {
  onComplete: (approved: boolean, ref: string) => void;
  mockDelay?: number;
}

export default function CardProcessor({ onComplete, mockDelay = 2000 }: CardProcessorProps) {
  const [state, setState] = useState<"idle" | "processing" | "approved" | "declined">("idle");

  const process = () => {
    setState("processing");
    setTimeout(() => setState("approved"), mockDelay);
  };

  const statusClasses: Record<typeof state, string> = {
    idle: "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600",
    processing: "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700",
    approved: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700",
    declined: "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700",
  };

  return (
    <div className="space-y-3">
      <div className={`p-4 rounded-lg border text-center ${statusClasses[state]}`}>
        {state === "idle" && (
          <p className="text-sm text-slate-600 dark:text-slate-300">Card terminal ready</p>
        )}
        {state === "processing" && (
          <p className="text-sm text-amber-700 dark:text-amber-400 animate-pulse">Processing&hellip;</p>
        )}
        {state === "approved" && (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">&checkmark; Approved</p>
        )}
        {state === "declined" && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">&cross; Declined</p>
        )}
      </div>
      {state === "idle" && (
        <Button color="primary" onClick={process}>Process Card</Button>
      )}
      {state === "approved" && (
        <Button color="success" onClick={() => onComplete(true, `CARD-${Date.now()}`)}>
          Confirm Card Payment
        </Button>
      )}
      {state === "declined" && (
        <Button variant="outlined" onClick={() => setState("idle")}>Retry</Button>
      )}
    </div>
  );
}

import { useState } from "react";
import Button from "./Button";

function generateAuthRef(): string {
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `AUTH-${Date.now().toString(36).toUpperCase()}-${random}`;
}

interface CardPaymentSimulatorProps {
  onComplete: (approved: boolean, ref: string) => void;
}

export default function CardPaymentSimulator({ onComplete }: CardPaymentSimulatorProps) {
  const [state, setState] = useState<"idle" | "processing" | "approved" | "declined">("idle");

  const process = () => {
    setState("processing");
    setTimeout(() => setState("approved"), 2000);
  };

  const statusClass =
    state === "idle"
      ? "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600"
      : state === "processing"
        ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700"
        : state === "approved"
          ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700"
          : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700";

  return (
    <div className="space-y-3">
      <div className={`p-4 rounded-lg border text-center ${statusClass}`} aria-live="polite" role="status">
        {state === "idle" && <p className="text-sm text-slate-600 dark:text-slate-300">Card terminal ready</p>}
        {state === "processing" && <p className="text-sm text-amber-700 dark:text-amber-400 animate-pulse" role="alert">Processing&hellip;</p>}
        {state === "approved" && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">&checkmark; Approved</p>}
        {state === "declined" && <p className="text-sm font-medium text-red-700 dark:text-red-400" role="alert">&cross; Declined</p>}
      </div>
      {state === "idle" && <Button color="primary" onClick={process}>Process Card</Button>}
      {state === "approved" && (
        <Button color="success" onClick={() => onComplete(true, generateAuthRef())}>Confirm</Button>
      )}
      {state === "declined" && <Button variant="outlined" onClick={() => setState("idle")}>Retry</Button>}
    </div>
  );
}

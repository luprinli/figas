import { FileText } from "lucide-react";

export interface FlightNotesProps {
    operational_notes: string | null;
}

export default function FlightNotes({ operational_notes }: FlightNotesProps) {
    if (!operational_notes) return null;

    return (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 p-2 text-[11px] text-amber-800 dark:text-amber-400 dark:text-amber-400">
            <FileText size={14} className="mt-0.5 flex-shrink-0" strokeWidth={1.5} absoluteStrokeWidth />
            <span className="whitespace-pre-line leading-relaxed">{operational_notes}</span>
        </div>
    );
}

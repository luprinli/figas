export interface FlightNotesProps {
    operational_notes: string | null;
}

export default function FlightNotes({ operational_notes }: FlightNotesProps) {
    if (!operational_notes) return null;

    return (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 p-2 text-[11px] text-amber-800 dark:text-amber-400 dark:text-amber-400">
            <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <line x1="5" y1="5" x2="11" y2="5" />
                <line x1="5" y1="8" x2="11" y2="8" />
                <line x1="5" y1="11" x2="9" y2="11" />
            </svg>
            <span className="whitespace-pre-line leading-relaxed">{operational_notes}</span>
        </div>
    );
}

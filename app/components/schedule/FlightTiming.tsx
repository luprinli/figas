// FlightTiming is no longer used directly — timing has been absorbed into
// the FlightCard top line. This file is kept as a barrel re-export in case
// other consumers still import from it.

export interface FlightTimingProps {
    departure_time: string | null;
    arrival_time: string | null;
    duration_minutes: number | null;
    check_in_time: string | null;
    computedDeparture?: string | null;
}

export default function FlightTiming(_props: FlightTimingProps) {
    return null;
}

/**
 * Shared scheduling types used by both client and server modules.
 *
 * These types are extracted from server-only modules so that client components
 * can import them without triggering Vite pre-transform warnings about server
 * module dependencies (e.g., PrismaClient).
 */

// ── Route Suggestion Types (from suggest-route.server.ts) ────────────────────

export interface RouteSuggestionLeg {
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    distance_nm: number | null;
}

export interface RouteSuggestion {
    suggested_legs: RouteSuggestionLeg[];
    total_distance_nm: number;
    stop_count: number;
    aircraft_recommendation: string | null;
    weight_warnings: string[];
}

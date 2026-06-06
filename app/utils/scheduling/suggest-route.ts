/**
 * Re-export barrel for suggest-route.
 *
 * The actual implementation has moved to suggest-route.server.ts to
 * prevent Vite pre-transform warnings when client components import
 * types from this module.
 *
 * Server-only code should import directly from "./suggest-route.server".
 * Client components should import types from "./scheduling-types".
 */

export {
    getDistance,
    suggestRoute,
    clearSuggestionCaches,
} from "./suggest-route.server";

export type {
    RouteSuggestionLeg,
    RouteSuggestion,
} from "./scheduling-types";

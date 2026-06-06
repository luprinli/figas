/**
 * Re-export barrel for fuel-data.
 *
 * The actual implementation has moved to fuel-data.server.ts to
 * prevent Vite pre-transform warnings when client components import
 * from this module.
 *
 * Server-only code should import directly from "./fuel-data.server".
 */

export {
    getFuelKg,
    clearFuelRulesCache,
} from "./fuel-data.server";

/**
 * Flight validation utility.
 *
 * Pure client-side function that validates a flight given its passengers,
 * legs, aircraft, and aerodrome data. No UI dependencies, no database calls, no async.
 *
 * Validates:
 * - Distance vs aircraft max range
 * - Seat count vs passenger count
 * - Per-stop MTOW and MLW constraints (including per-destination aerodrome limits
 *   and runway derating for strips < 400m)
 * - Fuel requirements
 * - Provides violation suggestions
 *
 * Weight components included in takeoff weight:
 * - Empty (tare) weight
 * - Pilot/crew weight
 * - Passenger body weight
 * - Passenger baggage weight
 * - Freight/cargo weight
 * - Fuel weight
 */

import { applyRunwayDerating } from "./runway-derating";

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface ValidationPassenger {
    id: number | string;
    name: string;
    origin_code: string;
    destination_code: string;
    /** clothed_weight_kg from booking_leg_passengers (formerly clothed_body_weight_kg on passengers table) */
    clothed_weight_kg: number;
    baggage_weight_kg: number;
}

export interface ValidationLeg {
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    distance_nm: number | null;
}

export interface ValidationAircraft {
    type: string;
    registration: string;
    seat_count: number;
    max_takeoff_weight_kg: number;
    max_landing_weight_kg: number;
    empty_weight_kg: number;
    fuel_capacity_kg: number;
    fuel_burn_rate_kg_per_hour: number;
    cruise_speed_kt: number;
    max_range_nm: number;
}

/**
 * Per-destination aerodrome data for dynamic MTOW/MLW limits.
 * If not provided for a stop, the aircraft structural limits are used.
 */
export interface ValidationAerodrome {
    code: string;
    /** Per-aerodrome MTOW limit (kg). null = use aircraft structural limit. */
    mtow_limit_kg: number | null;
    /** Per-aerodrome MLW limit (kg). null = use aircraft structural limit. */
    mlw_limit_kg: number | null;
    /** Runway length (m). Used for derating on strips < 400m. null = assume adequate. */
    runway_length: number | null;
}

export interface PerStopValidation {
    stop_code: string;
    stop_index: number;
    /** Cumulative passenger count up to this stop */
    passenger_count: number;
    /** Total weight (empty + crew + passengers + baggage + freight + fuel) at takeoff from this stop */
    takeoff_weight_kg: number;
    /** Effective MTOW limit (MIN of aircraft structural MTOW, aerodrome limit, runway-derated) */
    mtow_kg: number;
    /** Percentage of effective MTOW used */
    mtow_used_pct: number;
    /** Estimated weight at landing (takeoff weight - fuel burnt on this leg) */
    landing_weight_kg: number;
    /** Effective MLW limit (MIN of aircraft structural MLW, aerodrome limit, runway-derated) */
    mlw_kg: number;
    /** Percentage of effective MLW used */
    mlw_used_pct: number;
    /** Fuel on board at takeoff from this stop (kg) */
    fuel_on_board_kg: number;
    /** Fuel burnt on leg from this stop to next (kg) */
    fuel_burnt_kg: number;
    /** Status: 'ok' | 'warning' | 'violation' */
    mtow_status: "ok" | "warning" | "violation";
    mlw_status: "ok" | "warning" | "violation";
    /** Pilot/crew weight included in takeoff weight (kg) */
    pilot_weight_kg: number;
    /** Freight/cargo weight included in takeoff weight (kg) */
    freight_weight_kg: number;
    /** Whether the MTOW was derated due to short runway */
    runway_derated: boolean;
    /** If derated, the original MTOW before derating */
    mtow_before_derate_kg: number | null;
}

export interface ViolationSuggestion {
    type: "remove_passenger" | "reduce_fuel" | "use_larger_aircraft";
    passenger_id?: number | string;
    passenger_name?: string;
    /** How much weight this would save (kg) */
    weight_saving_kg: number;
    /** Human-readable description */
    description: string;
}

export interface FlightValidationResult {
    /** Overall status */
    status: "ok" | "warning" | "violation";
    /** Total route distance (nm) */
    total_distance_nm: number;
    /** Estimated flight time (hours) */
    estimated_flight_time_hours: number;
    /** Total fuel required including reserves (kg) */
    total_fuel_required_kg: number;
    /** Fuel capacity of the aircraft (kg) */
    fuel_capacity_kg: number;
    /** Percentage of fuel capacity used */
    fuel_used_pct: number;
    /** Whether total distance exceeds aircraft max range */
    range_exceeded: boolean;
    /** Whether total passengers exceed seat count */
    seat_count_exceeded: boolean;
    /** Passenger count */
    passenger_count: number;
    /** Seat count */
    seat_count: number;
    /** Per-stop validation details */
    per_stop: PerStopValidation[];
    /** Binding constraint description */
    binding_constraint: string | null;
    /** Suggested resolutions for violations */
    suggestions: ViolationSuggestion[];
    /** Weight warnings (reused from existing suggest-route) */
    weight_warnings: string[];
}

/**
 * Pre-computed fuel and distance data for a leg pair.
 * These values are computed server-side and passed in to avoid
 * client-side DB calls.
 */
export interface LegFuelAndDistance {
    /** Fuel consumption in kg for this leg */
    fuel_kg: number;
    /** Distance in nautical miles for this leg */
    distance_nm: number;
}

/**
 * Pre-computed fuel and distance lookup for all legs in a flight.
 * Keyed by "ORIGIN→DEST" (uppercase).
 */
export type FuelAndDistanceMap = Map<string, LegFuelAndDistance>;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Estimate fuel burn for a leg using distance and aircraft burn rate.
 * Used as fallback when pre-computed fuel data is 0.
 */
function estimateFuelBurn(
    distanceNm: number,
    burnRateKgPerHour: number,
    cruiseSpeedKt: number
): number {
    if (distanceNm <= 0 || cruiseSpeedKt <= 0) return 0;
    const flightHours = distanceNm / cruiseSpeedKt;
    return Math.round(burnRateKgPerHour * flightHours);
}

/**
 * Compute the 45-minute reserve fuel.
 */
function computeReserve(burnRateKgPerHour: number): number {
    return Math.round(burnRateKgPerHour * 0.75);
}

// ── Helpers for effective MTOW/MLW ────────────────────────────────────────────

/**
 * Compute the effective MTOW for a destination stop.
 *
 * Effective MTOW = MIN(aircraft structural MTOW, aerodrome MTOW limit),
 * then derated for short runways (< 400m: 5% reduction per 100m below 400m).
 *
 * @param aircraftMtow - Aircraft structural MTOW (kg)
 * @param aerodrome - Per-destination aerodrome data (or null if unknown)
 * @returns [effectiveMtowKg, wasDerated, mtowBeforeDerateKg]
 */
function computeEffectiveMtow(
    aircraftMtow: number,
    aerodrome: ValidationAerodrome | null
): [number, boolean, number | null] {
    // Start with aircraft structural limit
    let effectiveMtowKg = aircraftMtow;

    // Apply aerodrome limit if available
    if (aerodrome?.mtow_limit_kg != null && aerodrome.mtow_limit_kg > 0) {
        effectiveMtowKg = Math.min(effectiveMtowKg, aerodrome.mtow_limit_kg);
    }

    const mtowBeforeDerateKg = effectiveMtowKg;

    // Apply runway derating for strips < 400m
    const deratedMtowKg = applyRunwayDerating(effectiveMtowKg, aerodrome?.runway_length ?? null);
    const wasDerated = deratedMtowKg !== effectiveMtowKg;
    effectiveMtowKg = deratedMtowKg;

    return [effectiveMtowKg, wasDerated, wasDerated ? mtowBeforeDerateKg : null];
}

/**
 * Compute the effective MLW for a destination stop.
 *
 * Effective MLW = MIN(aircraft structural MLW, aerodrome MLW limit),
 * then derated for short runways (< 400m: 5% reduction per 100m below 400m).
 */
function computeEffectiveMlw(
    aircraftMlw: number,
    aerodrome: ValidationAerodrome | null
): number {
    let effectiveMlwKg = aircraftMlw;

    if (aerodrome?.mlw_limit_kg != null && aerodrome.mlw_limit_kg > 0) {
        effectiveMlwKg = Math.min(effectiveMlwKg, aerodrome.mlw_limit_kg);
    }

    return applyRunwayDerating(effectiveMlwKg, aerodrome?.runway_length ?? null);
}

/**
 * Build a lookup key for the fuel/distance map.
 */
function legKey(origin: string, destination: string): string {
    return `${origin.toUpperCase()}→${destination.toUpperCase()}`;
}

// ── Main validation function ───────────────────────────────────────────────────

/**
 * Validate a flight given its passengers, legs, aircraft, and aerodrome data.
 *
 * This is a pure function with no side effects. It computes:
 * - Distance vs max range
 * - Flight time
 * - Fuel requirements (leg fuel + 45-min reserve)
 * - Per-stop MTOW and MLW checks (including per-destination aerodrome limits
 *   and runway derating for strips < 400m)
 * - Seat count check
 * - Binding constraint identification
 * - Violation suggestions
 *
 * Weight components included in takeoff weight:
 * - Empty (tare) weight
 * - Pilot/crew weight
 * - Passenger body weight
 * - Passenger baggage weight
 * - Freight/cargo weight
 * - Fuel weight
 *
 * @param passengers - Array of passengers on the flight
 * @param legs - Array of legs in the flight route
 * @param aircraft - Aircraft assigned to the flight
 * @param options - Optional configuration
 * @param options.pilotWeightKg - Total pilot/crew weight (default: 160 kg for 2 pilots)
 * @param options.freightWeightKg - Total freight/cargo weight (default: 0 kg)
 * @param options.aerodromes - Per-destination aerodrome data for dynamic MTOW/MLW limits
 * @param options.fuelAndDistance - Pre-computed fuel and distance data keyed by "ORIG→DEST"
 * @returns FlightValidationResult with detailed validation data
 */
export async function validateFlight(
    passengers: ValidationPassenger[],
    legs: ValidationLeg[],
    aircraft: ValidationAircraft,
    options?: {
        pilotWeightKg?: number;
        freightWeightKg?: number;
        aerodromes?: ValidationAerodrome[];
        /** Pre-computed fuel and distance data to avoid DB calls from client */
        fuelAndDistance?: FuelAndDistanceMap;
    }
): Promise<FlightValidationResult> {
    const weightWarnings: string[] = [];
    const pilotWeightKg = options?.pilotWeightKg ?? 160; // 2 pilots × 80 kg
    const freightWeightKg = options?.freightWeightKg ?? 0;
    const aerodromes = options?.aerodromes ?? [];
    const fuelAndDistance = options?.fuelAndDistance ?? new Map();

    // Build aerodrome lookup map
    const aerodromeMap = new Map<string, ValidationAerodrome>();
    for (const a of aerodromes) {
        aerodromeMap.set(a.code.toUpperCase(), a);
    }

    // ── Helper: get distance for a leg ───────────────────────────────────────
    function getLegDistance(origin: string, destination: string): number {
        const key = legKey(origin, destination);
        const entry = fuelAndDistance.get(key);
        if (entry && entry.distance_nm > 0) return entry.distance_nm;
        return 0;
    }

    // ── Helper: get fuel for a leg ───────────────────────────────────────────
    function getLegFuel(origin: string, destination: string): number {
        const key = legKey(origin, destination);
        const entry = fuelAndDistance.get(key);
        if (entry && entry.fuel_kg > 0) return entry.fuel_kg;
        return 0;
    }

    // ── 1. Distance check ────────────────────────────────────────────────────
    let totalDistanceNm = 0;
    const unknownDistanceLegs: number[] = [];

    for (const leg of legs) {
        let dist = leg.distance_nm;
        if (dist === null || dist === undefined) {
            // Try to look up from pre-computed data
            dist = getLegDistance(leg.origin_code, leg.destination_code);
        }
        if (dist === null || dist === undefined || dist <= 0) {
            unknownDistanceLegs.push(leg.leg_sequence);
            dist = 0;
        }
        totalDistanceNm += dist;
    }

    if (unknownDistanceLegs.length > 0) {
        weightWarnings.push(
            `Distance unknown for leg(s) ${unknownDistanceLegs.join(", ")} — treated as 0 nm`
        );
    }

    const rangeExceeded = totalDistanceNm > aircraft.max_range_nm;

    // ── 2. Flight time ───────────────────────────────────────────────────────
    const estimatedFlightTimeHours =
        aircraft.cruise_speed_kt > 0
            ? Math.round((totalDistanceNm / aircraft.cruise_speed_kt) * 100) / 100
            : 0;

    // ── 3. Fuel calculation ──────────────────────────────────────────────────
    let totalLegFuelKg = 0;

    for (const leg of legs) {
        let fuelKg = getLegFuel(leg.origin_code, leg.destination_code);
        if (fuelKg <= 0) {
            // Estimate from distance
            const dist =
                leg.distance_nm ?? getLegDistance(leg.origin_code, leg.destination_code);
            fuelKg = estimateFuelBurn(
                dist,
                aircraft.fuel_burn_rate_kg_per_hour,
                aircraft.cruise_speed_kt
            );
        }
        totalLegFuelKg += fuelKg;
    }

    const reserveKg = computeReserve(aircraft.fuel_burn_rate_kg_per_hour);
    const totalFuelRequiredKg = totalLegFuelKg + reserveKg;
    const fuelCapacityKg = aircraft.fuel_capacity_kg;
    const fuelUsedPct =
        fuelCapacityKg > 0
            ? Math.round((totalFuelRequiredKg / fuelCapacityKg) * 100)
            : 0;

    // Fuel on board is total fuel required, capped at fuel capacity
    const fuelOnBoardKg = Math.min(totalFuelRequiredKg, fuelCapacityKg);

    // ── 4. Per-stop MTOW/MLW ────────────────────────────────────────────────
    const perStop: PerStopValidation[] = [];

    // Sort legs by leg_sequence
    const sortedLegs = [...legs].sort((a, b) => a.leg_sequence - b.leg_sequence);

    // Track cumulative passengers and remaining fuel
    let cumulativePassengerWeight = 0;
    let cumulativePassengerCount = 0;
    let remainingFuelKg = fuelOnBoardKg;

    for (let i = 0; i < sortedLegs.length; i++) {
        const leg = sortedLegs[i];
        const stopCode = leg.origin_code.toUpperCase();

        // Passengers boarding at this stop
        const boardingPassengers = passengers.filter(
            (p) => p.origin_code.toUpperCase() === stopCode
        );

        // Passengers deplaning at this stop (destination is this stop)
        const deplaningPassengers = passengers.filter(
            (p) => p.destination_code.toUpperCase() === stopCode
        );

        // Add boarding passengers to cumulative count
        for (const p of boardingPassengers) {
            cumulativePassengerCount++;
            cumulativePassengerWeight +=
                p.clothed_weight_kg + p.baggage_weight_kg;
        }

        // Fuel on board at takeoff from this stop
        const fuelAtStopKg = remainingFuelKg;

        // ── Takeoff weight: empty + crew + passengers + baggage + freight + fuel ──
        const takeoffWeightKg =
            aircraft.empty_weight_kg +
            pilotWeightKg +
            cumulativePassengerWeight +
            freightWeightKg +
            fuelAtStopKg;

        // ── Effective MTOW (per-origin, with runway derating) ─────────────────
        // MTOW limits and runway derating apply at the ORIGIN aerodrome
        // (where the aircraft actually takes off).
        const originAerodrome = aerodromeMap.get(stopCode) ?? null;

        const [effectiveMtowKg, runwayDerated, mtowBeforeDerateKg] =
            computeEffectiveMtow(aircraft.max_takeoff_weight_kg, originAerodrome);

        // ── Effective MLW (per-destination, with runway derating) ────────────
        // MLW limits and runway derating apply at the DESTINATION aerodrome
        // (where the aircraft lands).
        const destinationCode = leg.destination_code.toUpperCase();
        const destAerodrome = aerodromeMap.get(destinationCode) ?? null;

        const mtowUsedPct =
            effectiveMtowKg > 0
                ? Math.round((takeoffWeightKg / effectiveMtowKg) * 1000) / 10
                : 0;

        let mtowStatus: "ok" | "warning" | "violation";
        if (takeoffWeightKg > effectiveMtowKg) {
            mtowStatus = "violation";
        } else if (mtowUsedPct > 90) {
            mtowStatus = "warning";
        } else {
            mtowStatus = "ok";
        }

        // ── Fuel burnt on this leg ───────────────────────────────────────────
        let fuelBurntKg = getLegFuel(leg.origin_code, leg.destination_code);
        if (fuelBurntKg <= 0) {
            const dist =
                leg.distance_nm ?? getLegDistance(leg.origin_code, leg.destination_code);
            fuelBurntKg = estimateFuelBurn(
                dist,
                aircraft.fuel_burn_rate_kg_per_hour,
                aircraft.cruise_speed_kt
            );
        }

        // Landing weight = takeoff weight - fuel burnt
        const landingWeightKg = takeoffWeightKg - fuelBurntKg;

        // ── Effective MLW (per-destination, with runway derating) ────────────
        const effectiveMlwKg = computeEffectiveMlw(
            aircraft.max_landing_weight_kg,
            destAerodrome
        );

        const mlwUsedPct =
            effectiveMlwKg > 0
                ? Math.round((landingWeightKg / effectiveMlwKg) * 1000) / 10
                : 0;

        let mlwStatus: "ok" | "warning" | "violation";
        if (landingWeightKg > effectiveMlwKg) {
            mlwStatus = "violation";
        } else if (mlwUsedPct > 90) {
            mlwStatus = "warning";
        } else {
            mlwStatus = "ok";
        }

        perStop.push({
            stop_code: stopCode,
            stop_index: i,
            passenger_count: cumulativePassengerCount,
            takeoff_weight_kg: Math.round(takeoffWeightKg),
            mtow_kg: effectiveMtowKg,
            mtow_used_pct: mtowUsedPct,
            landing_weight_kg: Math.round(landingWeightKg),
            mlw_kg: effectiveMlwKg,
            mlw_used_pct: mlwUsedPct,
            fuel_on_board_kg: Math.round(fuelAtStopKg),
            fuel_burnt_kg: Math.round(fuelBurntKg),
            mtow_status: mtowStatus,
            mlw_status: mlwStatus,
            pilot_weight_kg: pilotWeightKg,
            freight_weight_kg: freightWeightKg,
            runway_derated: runwayDerated,
            mtow_before_derate_kg: mtowBeforeDerateKg,
        });

        // Subtract fuel burnt for next leg
        remainingFuelKg = Math.max(0, remainingFuelKg - fuelBurntKg);

        // Remove deplaning passengers for next stop
        for (const p of deplaningPassengers) {
            cumulativePassengerCount--;
            cumulativePassengerWeight -=
                p.clothed_weight_kg + p.baggage_weight_kg;
        }
    }

    // ── 5. Seat count ────────────────────────────────────────────────────────
    const passengerCount = passengers.length;
    const seatCountExceeded = passengerCount > aircraft.seat_count;

    // ── 6. Status determination ──────────────────────────────────────────────
    const hasViolation = perStop.some(
        (s) => s.mtow_status === "violation" || s.mlw_status === "violation"
    );
    const hasWarning = perStop.some(
        (s) => s.mtow_status === "warning" || s.mlw_status === "warning"
    );

    let status: "ok" | "warning" | "violation";
    if (hasViolation || rangeExceeded || seatCountExceeded) {
        status = "violation";
    } else if (hasWarning) {
        status = "warning";
    } else {
        status = "ok";
    }

    // ── 7. Binding constraint ────────────────────────────────────────────────
    let bindingConstraint: string | null = null;
    let lowestMargin = Infinity;

    // Check range
    if (rangeExceeded) {
        const margin = totalDistanceNm - aircraft.max_range_nm;
        if (margin < lowestMargin) {
            lowestMargin = margin;
            bindingConstraint = `Range exceeded (${totalDistanceNm} nm > ${aircraft.max_range_nm} nm)`;
        }
    } else {
        const margin = aircraft.max_range_nm - totalDistanceNm;
        if (margin < lowestMargin) {
            lowestMargin = margin;
            bindingConstraint = `Range (${Math.round((totalDistanceNm / aircraft.max_range_nm) * 100)}% of ${aircraft.max_range_nm} nm)`;
        }
    }

    // Check seat count
    if (seatCountExceeded) {
        const margin = passengerCount - aircraft.seat_count;
        if (margin < lowestMargin) {
            lowestMargin = margin;
            bindingConstraint = `Seat count exceeded (${passengerCount} > ${aircraft.seat_count})`;
        }
    } else {
        const margin = aircraft.seat_count - passengerCount;
        if (margin < lowestMargin) {
            lowestMargin = margin;
            bindingConstraint = `Seats (${passengerCount} of ${aircraft.seat_count})`;
        }
    }

    // Check per-stop constraints
    for (const stop of perStop) {
        // MTOW margin
        const mtowMargin = stop.mtow_kg - stop.takeoff_weight_kg;
        if (mtowMargin < lowestMargin) {
            lowestMargin = mtowMargin;
            bindingConstraint = `MTOW at ${stop.stop_code} (${stop.mtow_used_pct}%)`;
        }

        // MLW margin
        const mlwMargin = stop.mlw_kg - stop.landing_weight_kg;
        if (mlwMargin < lowestMargin) {
            lowestMargin = mlwMargin;
            bindingConstraint = `MLW at ${stop.stop_code} (${stop.mlw_used_pct}%)`;
        }
    }

    // Check fuel
    const fuelMargin = fuelCapacityKg - totalFuelRequiredKg;
    if (fuelMargin < lowestMargin) {
        lowestMargin = fuelMargin;
        bindingConstraint = `Fuel capacity (${fuelUsedPct}% used)`;
    }

    // ── 8. Violation suggestions ─────────────────────────────────────────────
    const suggestions: ViolationSuggestion[] = [];

    if (status === "violation") {
        // Sort passengers by total weight (heaviest first)
        const sortedPassengers = [...passengers].sort((a, b) => {
            const weightA = a.clothed_weight_kg + a.baggage_weight_kg;
            const weightB = b.clothed_weight_kg + b.baggage_weight_kg;
            return weightB - weightA;
        });

        // Determine how much weight needs to be shed
        let weightToShed = 0;

        if (bindingConstraint?.startsWith("MTOW")) {
            // Find the stop with the worst MTOW violation
            const worstStop = perStop.reduce((worst, curr) =>
                curr.mtow_used_pct > worst.mtow_used_pct ? curr : worst
            );
            weightToShed = worstStop.takeoff_weight_kg - worstStop.mtow_kg;
        } else if (bindingConstraint?.startsWith("MLW")) {
            const worstStop = perStop.reduce((worst, curr) =>
                curr.mlw_used_pct > worst.mlw_used_pct ? curr : worst
            );
            weightToShed = worstStop.landing_weight_kg - worstStop.mlw_kg;
        } else if (bindingConstraint?.startsWith("Range")) {
            weightToShed = 0; // Can't fix range by removing passengers alone
        } else if (bindingConstraint?.startsWith("Seat")) {
            weightToShed = 0; // Handled by seat count suggestion below
        } else if (bindingConstraint?.startsWith("Fuel")) {
            weightToShed = totalFuelRequiredKg - fuelCapacityKg;
        }

        if (weightToShed > 0) {
            let accumulatedSaving = 0;
            for (const p of sortedPassengers) {
                if (accumulatedSaving >= weightToShed) break;
                const pWeight = p.clothed_weight_kg + p.baggage_weight_kg;
                accumulatedSaving += pWeight;
                suggestions.push({
                    type: "remove_passenger",
                    passenger_id: p.id,
                    passenger_name: p.name,
                    weight_saving_kg: pWeight,
                    description: `Remove ${p.name} (${pWeight} kg) to save ${pWeight} kg`,
                });
            }
        }

        // If seat count exceeded, suggest removing passengers
        if (seatCountExceeded) {
            const excess = passengerCount - aircraft.seat_count;
            for (let i = 0; i < Math.min(excess, sortedPassengers.length); i++) {
                const p = sortedPassengers[i];
                const pWeight = p.clothed_weight_kg + p.baggage_weight_kg;
                // Only add if not already suggested
                if (!suggestions.find((s) => s.passenger_id === p.id)) {
                    suggestions.push({
                        type: "remove_passenger",
                        passenger_id: p.id,
                        passenger_name: p.name,
                        weight_saving_kg: pWeight,
                        description: `Remove ${p.name} to free a seat (${pWeight} kg)`,
                    });
                }
            }
        }

        // Suggest larger aircraft if range exceeded or weight issues
        if (rangeExceeded || weightToShed > 0) {
            suggestions.push({
                type: "use_larger_aircraft",
                weight_saving_kg: 0,
                description: "Use a larger aircraft with higher MTOW/MLW and greater range",
            });
        }

        // Suggest fuel reduction if fuel capacity exceeded
        if (totalFuelRequiredKg > fuelCapacityKg) {
            suggestions.push({
                type: "reduce_fuel",
                weight_saving_kg: totalFuelRequiredKg - fuelCapacityKg,
                description: `Reduce fuel load by ${totalFuelRequiredKg - fuelCapacityKg} kg (or add a refueling stop)`,
            });
        }
    }

    return {
        status,
        total_distance_nm: totalDistanceNm,
        estimated_flight_time_hours: estimatedFlightTimeHours,
        total_fuel_required_kg: totalFuelRequiredKg,
        fuel_capacity_kg: fuelCapacityKg,
        fuel_used_pct: fuelUsedPct,
        range_exceeded: rangeExceeded,
        seat_count_exceeded: seatCountExceeded,
        passenger_count: passengerCount,
        seat_count: aircraft.seat_count,
        per_stop: perStop,
        binding_constraint: bindingConstraint,
        suggestions,
        weight_warnings: weightWarnings,
    };
}

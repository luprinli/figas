import { useState, useCallback, useMemo } from "react";
import { useFetcher } from "@remix-run/react";
import {
  computeClientWeightBalance,
  type WbInput,
  type WbOutput,
  type WbPassenger,
  type WbAircraft,
  type WbLeg,
} from "../utils/weight-balance/calculator.client";

interface WbApiResponse {
  error?: string;
  aircraft?: WbAircraft;
  legs?: WbLeg[];
  passengers?: WbPassenger[];
  pilotWeightKg?: number;
  startingFuelKg?: number;
  reserveFuelKg?: number;
  distanceMap?: Record<string, number>;
  meta?: {
    flightNumber: string;
    aircraftRegistration: string;
    aircraftType: string;
  };
}

interface WbOverrideState {
  passengerWeights: Record<number, number>;
  baggageWeights: Record<number, number>;
  freightWeight: number;
  fuelOnBoard: number;
  pilotWeight: number;
}

export function useWeightBalance(flightId: number | null) {
  const fetcher = useFetcher<WbApiResponse>();
  const [overrides, setOverrides] = useState<WbOverrideState>({
    passengerWeights: {},
    baggageWeights: {},
    freightWeight: 0,
    fuelOnBoard: 0,
    pilotWeight: 0,
  });

  const initialData = fetcher.data && !fetcher.data.error ? fetcher.data : null;

  const hasLoaded = fetcher.state === "idle" && fetcher.data != null;

  const baseInput: WbInput | null = useMemo(() => {
    if (!initialData?.aircraft || !initialData?.legs) return null;
    const fuelOnBoard =
      overrides.fuelOnBoard > 0
        ? overrides.fuelOnBoard
        : initialData.startingFuelKg ?? 45;
    const pilotWeight =
      overrides.pilotWeight > 0
        ? overrides.pilotWeight
        : initialData.pilotWeightKg ?? 80;
    return {
      aircraft: initialData.aircraft,
      legs: initialData.legs.map((l) => ({
        ...l,
        freightWeightKg:
          overrides.freightWeight > 0
            ? overrides.freightWeight
            : l.freightWeightKg ?? 0,
      })),
      passengers: (initialData.passengers ?? []).map((p) => ({
        ...p,
        clothedWeightKg:
          overrides.passengerWeights[p.id] ?? p.clothedWeightKg,
        baggageWeightKg:
          overrides.baggageWeights[p.id] ?? p.baggageWeightKg,
      })),
      pilotWeightKg: pilotWeight,
      startingFuelKg: fuelOnBoard,
      reserveFuelKg: initialData.reserveFuelKg,
      distanceMap: initialData.distanceMap ?? {},
    };
  }, [initialData, overrides]);

  const result: WbOutput | null = useMemo(() => {
    if (!baseInput) return null;
    return computeClientWeightBalance(baseInput);
  }, [baseInput]);

  const load = useCallback(() => {
    if (flightId == null) return;
    fetcher.load(`/api/flight/${flightId}/wb-data`);
  }, [flightId, fetcher]);

  const recalculate = useCallback(() => {
    // force re-render by toggling override state
    setOverrides((prev) => ({ ...prev }));
  }, []);

  const updatePassenger = useCallback(
    (passengerId: number, clothedKg: number, baggageKg: number) => {
      setOverrides((prev) => ({
        ...prev,
        passengerWeights: { ...prev.passengerWeights, [passengerId]: clothedKg },
        baggageWeights: { ...prev.baggageWeights, [passengerId]: baggageKg },
      }));
    },
    []
  );

  const updateFuel = useCallback((fuelKg: number) => {
    setOverrides((prev) => ({ ...prev, fuelOnBoard: fuelKg }));
  }, []);

  const updateFreight = useCallback((freightKg: number) => {
    setOverrides((prev) => ({ ...prev, freightWeight: freightKg }));
  }, []);

  const updatePilotWeight = useCallback((weightKg: number) => {
    setOverrides((prev) => ({ ...prev, pilotWeight: weightKg }));
  }, []);

  const resetOverrides = useCallback(() => {
    setOverrides({
      passengerWeights: {},
      baggageWeights: {},
      freightWeight: 0,
      fuelOnBoard: 0,
      pilotWeight: 0,
    });
  }, []);

  return {
    data: result,
    isLoading: fetcher.state === "loading",
    isLoaded: hasLoaded,
    error: fetcher.data?.error ?? null,
    meta: initialData?.meta ?? null,
    load,
    recalculate,
    updatePassenger,
    updateFuel,
    updateFreight,
    updatePilotWeight,
    resetOverrides,
    overrides,
  };
}

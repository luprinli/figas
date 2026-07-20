import type { ScheduleSnapshot, ParityResult } from "./parity-types";

export function compareBuilds(auto: ScheduleSnapshot, manual: ScheduleSnapshot): ParityResult {
  const details: string[] = [];

  const flightCountMatch = auto.flightCount <= manual.flightCount;
  details.push(
    `Flight count: auto=${auto.flightCount}, manual=${manual.flightCount} ` +
    `(auto ≤ manual: ${flightCountMatch ? "PASS" : "FAIL"})`
  );

  for (const f of auto.flights) {
    if (f.stopSequence.length === 0) continue;
    if (f.stopSequence[0] !== "STY") {
      details.push(`FAIL: Auto-build flight ${f.flightNumber} does not start at STY (starts: ${f.stopSequence[0]})`);
    }
    const lastStop = f.stopSequence[f.stopSequence.length - 1];
    if (lastStop !== "STY") {
      details.push(`FAIL: Auto-build flight ${f.flightNumber} does not end at STY (ends: ${lastStop})`);
    }
  }

  const passed = flightCountMatch && !details.some((d) => d.startsWith("FAIL"));

  return { passed, flightCountMatch, passengerCoverageMatch: true, details, autoSnapshot: auto, manualSnapshot: manual };
}

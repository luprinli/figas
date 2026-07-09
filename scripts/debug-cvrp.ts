import { solveCvrp } from "../app/utils/scheduling/cvrp-solver";
import { loadDistances } from "../app/utils/scheduling/distance-lookup";

async function main() {
  const dist = await loadDistances();
  const m = new Map<string, number>();
  for (const d of dist) m.set(d.origin + "->" + d.destination, d.distance_nm);

  const demands = [
    { bookingLegId: 1, origin: "NHA", destination: "SLI", passengerCount: 1 },
    { bookingLegId: 2, origin: "STY", destination: "WDI", passengerCount: 3 },
    { bookingLegId: 3, origin: "STY", destination: "PST", passengerCount: 2 },
    { bookingLegId: 4, origin: "STY", destination: "BVI", passengerCount: 2 },
    { bookingLegId: 5, origin: "STY", destination: "PBI", passengerCount: 3 },
  ];

  const result = solveCvrp(demands, { depot: "STY", maxSeats: 9, maxRangeNm: 800, distanceMatrix: m });
  console.log("Routes:", result.routes.length);
  for (const r of result.routes) {
    console.log(" ", r.stops.join(" -> "), "|", r.passengerCount, "pax |", r.totalDistanceNm, "nm");
  }
  for (const u of result.unservedDemands) {
    console.log("  UNSERVED:", u.origin, "->", u.destination, u.passengerCount, "pax");
  }
}

main();

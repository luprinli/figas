import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { loadsheetRepository, canEditLoadsheet, canEnterActualData, isImmutable } from "../utils/loadsheet/loadsheet-repository.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { updateAirframeHoursFromActual, computeActualMinutes } from "../utils/airframe-hours.server";
import { createLoadsheetFromFlight } from "../utils/loadsheet/create-loadsheet.server";
import { countAssignedByFlightId } from "../utils/repositories/booking-leg-passenger";
import { requireUser } from "../utils/layout.server";
import { hasPermission, requirePermission } from "../utils/permissions.server";
import { formatTime } from "../utils/format-time";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { userId } = await requireUser(request);
  const flightId = Number(params.flightId);
  if (!flightId) throw new Response("Flight ID required", { status: 400 });

  console.log("[LoadsheetLoader] REQUEST — flightId:", flightId, "userId:", userId);

  let loadsheet = await loadsheetRepository.findByFlightId(flightId);
  if (!loadsheet) {
    console.log("[LoadsheetLoader] PATH: no existing loadsheet, creating from flight");
    const createdId = await createLoadsheetFromFlight(flightId);
    loadsheet = createdId ? await loadsheetRepository.findById(createdId) : null;
  } else {
    const currentCount = await countAssignedByFlightId(flightId);
    if (currentCount !== loadsheet.total_pax) {
      console.log("[LoadsheetLoader] PATH: pax count mismatch — loadsheet:", loadsheet.total_pax, "actual:", currentCount, "— regenerating");
      await loadsheetRepository.deleteByFlightId(flightId);
      const createdId = await createLoadsheetFromFlight(flightId);
      loadsheet = createdId ? await loadsheetRepository.findById(createdId) : null;
    } else {
      console.log("[LoadsheetLoader] PATH: existing loadsheet found, pax count OK —", loadsheet.total_pax, "pax");
    }
  }

  if (!loadsheet) throw new Response("Loadsheet not found", { status: 404 });

  const passengers = await loadsheetRepository.findPassengers(loadsheet.id);
  let sectors = await loadsheetRepository.findSectors(loadsheet.id);

  if (sectors.length === 0) {
    console.log("[LoadsheetLoader] PATH: sectors empty, regenerating loadsheet");
    await loadsheetRepository.deleteByFlightId(flightId);
    const createdId = await createLoadsheetFromFlight(flightId);
    const regenerated = createdId ? await loadsheetRepository.findById(createdId) : null;
    if (!regenerated) {
      throw new Response("Failed to regenerate loadsheet", { status: 500 });
    }
    loadsheet = regenerated;
    sectors = await loadsheetRepository.findSectors(loadsheet.id);
  }

  console.log("[LoadsheetLoader] RESPONSE — loadsheet.id:", loadsheet.id, "status:", loadsheet.status, "pax:", loadsheet.total_pax, "sectors:", sectors.length, "passengers:", passengers.length);

  // ── Flight metadata (number, pilot, aircraft) ───────────────────────────
  const flight = (await kdb.selectFrom("flights").select(["flight_number", "departure_time", "arrival_time"]).where("id", "=", flightId).execute())[0] ?? null;
  const pilot = loadsheet.pilot_id
    ? (await kdb.selectFrom("pilots").select("name").where("id", "=", Number(loadsheet.pilot_id)).execute())[0] ?? null
    : null;
  const aircraft = loadsheet.aircraft_id
    ? (await kdb.selectFrom("aircraft").select(["registration", "type"]).where("id", "=", Number(loadsheet.aircraft_id)).execute())[0] ?? null
    : null;

  // ── Passenger names + origin/destination ────────────────────────────────
  const passengerIds = passengers.map((p) => p.booking_passenger_id);
  const passengerNames: Record<number, string> = {};
  const passengerLegData: Record<number, { origin: string; destination: string }> = {};
  if (passengerIds.length > 0) {
    const nameRows = await sql<{ id: number | bigint; name: string }>`
      SELECT bp.id, CONCAT(bp.first_name, ' ', bp.last_name) AS name
       FROM booking_passengers bp
       WHERE bp.id = ANY(${passengerIds}::int[])
    `.execute(kdb);
    for (const r of nameRows.rows) {
      passengerNames[Number(r.id)] = r.name;
    }
  }
  const legIds = [...new Set(passengers.map((p) => p.booking_leg_id))];
  if (legIds.length > 0) {
    const legRows = await sql<{ id: number | bigint; origin_code: string; destination_code: string }>`
      SELECT id, origin_code, destination_code FROM booking_legs WHERE id = ANY(${legIds}::int[])
    `.execute(kdb);
    for (const r of legRows.rows) {
      passengerLegData[Number(r.id)] = { origin: r.origin_code, destination: r.destination_code };
    }
  }

  // ── Build route stops (STY → ... → STY) ────────────────────────────────
  const stopCodes: string[] = ["STY"];
  for (const s of sectors) {
    if (s.destination_code && s.destination_code !== "STY") {
      if (!stopCodes.includes(s.destination_code)) stopCodes.push(s.destination_code);
    }
  }
  if (stopCodes[stopCodes.length - 1] !== "STY") stopCodes.push("STY");

  const canPerformInFlight = await hasPermission(Number(userId), "loadsheet:edit");

  return json({
    loadsheet: {
      ...loadsheet,
      created_at: loadsheet.created_at?.toString() ?? null,
      updated_at: loadsheet.updated_at?.toString() ?? null,
      finalized_at: loadsheet.finalized_at?.toString() ?? null,
      archived_at: loadsheet.archived_at?.toString() ?? null,
    },
    flightNumber: flight?.flight_number ?? `Flight #${flightId}`,
    departureTime: flight?.departure_time ? new Date(String(flight.departure_time)).toISOString() : null,
    pilotName: pilot?.name ?? "Unassigned",
    aircraftRegistration: aircraft?.registration ?? "Unassigned",
    aircraftType: aircraft?.type ?? "",
    passengers: passengers.map((p) => ({
      id: p.id,
      seat: `${p.seat_row ?? "?"}${p.seat_side ?? ""}`,
      name: passengerNames[p.booking_passenger_id] ?? `Passenger #${p.booking_passenger_id}`,
      bookingLegId: p.booking_leg_id,
      origin: passengerLegData[p.booking_leg_id]?.origin ?? "?",
      destination: passengerLegData[p.booking_leg_id]?.destination ?? "?",
      clothedWeightKg: Number(p.clothed_weight_kg ?? 0),
      baggageWeightKg: Number(p.baggage_weight_kg ?? 0),
      boarded: p.boarded,
    })),
    sectors: sectors.map((s) => ({
      ...s,
      etd: formatTime(s.etd),
      eta: formatTime(s.eta),
      atd: formatTime(s.atd),
      ata: formatTime(s.ata),
    })),
    stopCodes,
    canEdit: canEditLoadsheet(loadsheet.status) && canPerformInFlight,
    canEnterActual: canEnterActualData(loadsheet.status) && canPerformInFlight,
    isLocked: isImmutable(loadsheet.status),
    canPerformInFlight,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const flightId = Number(params.flightId);

  console.log("[LoadsheetAction] intent:", intent, "flightId:", flightId, "userId:", userId);

  await requirePermission(request, "loadsheet:edit");

  const loadsheet = await loadsheetRepository.findByFlightId(flightId);
  if (!loadsheet) return json({ error: "Not found" }, { status: 404 });

  switch (intent) {
    case "regenerate": {
      await loadsheetRepository.deleteByFlightId(flightId);
      const newId = await createLoadsheetFromFlight(flightId);
      if (!newId) {
        return json({ error: "Failed to regenerate loadsheet" }, { status: 500 });
      }
      return json({ success: true });
    }
    case "toggle-boarding": {
      const passengerId = Number(formData.get("passengerId"));
      const current = formData.get("boarded") === "true";
      if (!canEnterActualData(loadsheet.status)) {
        return json({ error: "Cannot modify this loadsheet" }, { status: 400 });
      }
      await loadsheetRepository.updatePassengerBoarding(passengerId, !current);
      return json({ success: true });
    }
    case "update-sector": {
      const sectorId = Number(formData.get("sectorId"));
      const atd = formData.get("atd")?.toString() || null;
      const ata = formData.get("ata")?.toString() || null;
      if (!canEnterActualData(loadsheet.status)) {
        return json({ error: "Cannot modify sector times" }, { status: 400 });
      }
      let actualTimeMin: number | null = null;
      if (atd && ata) {
        const [atdH, atdM] = atd.split(":").map(Number);
        const [ataH, ataM] = ata.split(":").map(Number);
        actualTimeMin = (ataH * 60 + ataM) - (atdH * 60 + atdM);
        if (actualTimeMin < 0) actualTimeMin += 24 * 60;
      }
      await loadsheetRepository.updateSectorATD(sectorId, atd, ata, actualTimeMin);

      // Also update flight_legs.atd/ata for persistence
      const sector = (await kdb.selectFrom("loadsheet_sectors").select("flight_leg_id").where("id", "=", sectorId).execute())[0] ?? null;
      if (sector?.flight_leg_id) {
        await kdb.updateTable("flight_legs").set({
          atd: atd ? new Date(`1970-01-01T${atd}:00Z`) : null,
          ata: ata ? new Date(`1970-01-01T${ata}:00Z`) : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).where("id", "=", sector.flight_leg_id).execute();

        // Update aircraft hours using actual flight time
        if (atd && ata) {
          const actualMin = computeActualMinutes(atd, ata);
          if (actualMin > 0) {
            const leg = (await kdb.selectFrom("flight_legs")
              .select(["flight_id"])
              .where("id", "=", sector.flight_leg_id)
              .execute())[0] ?? null;
            if (leg?.flight_id) {
              const flight = (await kdb.selectFrom("flights")
                .select("aircraft_id")
                .where("id", "=", leg.flight_id)
                .execute())[0] ?? null;
              if (flight?.aircraft_id) {
                await updateAirframeHoursFromActual(flight.aircraft_id, actualMin);
              }
            }
          }
        }
      }

      return json({ success: true });
    }
    case "finalize": {
      if (!canEditLoadsheet(loadsheet.status) && loadsheet.status !== "active") {
        return json({ error: "Can only finalize active loadsheets" }, { status: 400 });
      }
      const checksum = "";
      await loadsheetRepository.finalize(loadsheet.id, Number(userId), checksum);
      await loadsheetRepository.logAudit({ loadsheet_id: loadsheet.id, action: "finalized", actor_id: Number(userId) });
      return json({ success: true });
    }
    case "sign-off": {
      if (!canEditLoadsheet(loadsheet.status) && loadsheet.status !== "active") {
        return json({ error: "Can only sign off active or editable loadsheets" }, { status: 400 });
      }
      const hasManifestPerm = await hasPermission(Number(userId), "flight:manage-manifest");
      if (!hasManifestPerm) {
        return json({ error: "Missing required permission: flight:manage-manifest" }, { status: 403 });
      }
      const sectors = await loadsheetRepository.findSectors(loadsheet.id);
      const violations = sectors.filter(
        (s) => s.tow_status === "violation" || s.cog_status === "violation"
      );
      if (violations.length > 0) {
        return json({
          error: `Cannot sign off: ${violations.length} sector(s) have W&B violations. Resolve violations before sign-off.`,
          violations: violations.map((v) => ({
            legSequence: v.leg_sequence,
            origin: v.origin_code,
            destination: v.destination_code,
            towStatus: v.tow_status,
            cogStatus: v.cog_status,
          })),
        }, { status: 400 });
      }
      const checksum = sectors
        .map((s) => `${s.leg_sequence}:${s.takeoff_weight_kg}:${s.cog_position_mm}`)
        .join("|");
      await loadsheetRepository.finalize(loadsheet.id, Number(userId), checksum);
      await loadsheetRepository.logAudit({
        loadsheet_id: loadsheet.id,
        action: "signed_off",
        actor_id: Number(userId),
      });
      return json({ success: true, signedOffBy: Number(userId) });
    }
    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
}

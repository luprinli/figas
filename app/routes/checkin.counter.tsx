import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState, useMemo, useEffect, useCallback } from "react";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { getUserId } from "../utils/auth.server";
import { db } from "../utils/db.server";
import Button from "../components/Button";
import PrintButton, { buildBaggageTagOptions } from "../components/PrintButton";
import DatePicker from "../components/DatePicker";
import { TourTrigger } from "../components/TourTrigger";
import { checkinCounterTour } from "../utils/tour/definitions/checkin-counter";

export const meta: MetaFunction = () => [{ title: "Check-In Counter - FIGAS" }];

const MAX_FREE_BAGGAGE_KG = 20;
const EXCESS_RATE_PER_KG = 5;
const QUICK_CASH = [10, 20, 50];

interface LineItem {
  id: string;
  label: string;
  amount: number;
  type: "excess_baggage";
  quantity?: number;
  unitPrice?: number;
}

interface PaymentEntry {
  id: string;
  method: "cash" | "card" | "invoice" | "deferred";
  amount: number;
  reference?: string;
  cardState?: "idle" | "processing" | "approved" | "declined";
}

interface FlightPassenger {
  legPassengerId: number;
  bookingLegId: number;
  bookingId: number;
  passengerId: number;
  firstName: string;
  lastName: string;
  email: string;
  origin: string;
  destination: string;
  legSequence: number;
  checkedIn: boolean;
  bodyWeightKg: number | null;
  baggageWeightKg: number;
  seatNumber: string | null;
  bookingReference: string;
}

interface PaymentRecord {
  id: number;
  amount: number;
  method: string;
  bookingReference: string;
  passengerName: string;
  timestamp: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const flightId = url.searchParams.get("flightId");
  const selectedDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  if (!flightId) {
    const flights = await db.query(
      `SELECT f.id, f.flight_number, f.departure_time, f.status,
         ao.code AS origin_code, ad.code AS destination_code,
         a.registration,
         COUNT(blp.id) FILTER (WHERE blp.checked_in = true)::int AS checked_count,
         COUNT(blp.id)::int AS total_count
       FROM flights f
       JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
       JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
       LEFT JOIN aircraft a ON a.id = f.aircraft_id
       LEFT JOIN booking_legs bl ON bl.flight_id = f.id
       LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
       WHERE f.departure_time::date = $1
       GROUP BY f.id, f.flight_number, f.departure_time, f.status, ao.code, ad.code, a.registration
       ORDER BY f.departure_time ASC`,
      [selectedDate]
    );
    const allFlights = await db.query(
      `SELECT f.id, f.flight_number FROM flights f WHERE f.departure_time::date = $1 ORDER BY f.flight_number`, [selectedDate]
    );
    return json({ mode: "select" as const, flights: flights.rows, today: selectedDate, allFlights: allFlights.rows });
  }

  const flight = await db.query(
    `SELECT f.id, f.flight_number, f.departure_time, f.status,
       ao.code AS origin_code, ad.code AS destination_code,
       COALESCE(a.registration, 'Unassigned') AS registration,
       COALESCE(a.empty_weight_kg, 1627) AS empty_weight_kg,
       COALESCE(a.max_takeoff_weight_kg, 2994) AS mtow_kg
     FROM flights f
     JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
     JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
     LEFT JOIN aircraft a ON a.id = f.aircraft_id
     WHERE f.id = $1`,
    [Number(flightId)]
  );
  if (flight.rows.length === 0) return json({ mode: "select" as const, flights: [], today: "" });

  const passengers = await db.query(
    `SELECT blp.id AS leg_passenger_id, blp.booking_leg_id, bl.booking_id, blp.checked_in,
       blp.clothed_weight_kg, blp.baggage_weight_kg, blp.seat_number,
       bp.id AS passenger_id, bp.first_name, bp.last_name, bp.email, bp.clothed_body_weight_kg,
       bl.origin_code, bl.destination_code, bl.leg_sequence,
       b.booking_reference
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE bl.flight_id = $1 AND b.status NOT IN ('cancelled')
     ORDER BY bl.leg_sequence, bp.last_name, bp.first_name`,
    [Number(flightId)]
  );

  const tillPayments = await db.query(
    `SELECT p.id, p.amount_gbp AS amount, p.method, COALESCE(b.booking_reference, '—') AS booking_reference,
       p.created_at AS timestamp
     FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id
     WHERE p.created_at::date = CURRENT_DATE
     ORDER BY p.created_at DESC LIMIT 20`
  );

  const mapped: FlightPassenger[] = (passengers.rows as Array<Record<string, unknown>>).map((r) => ({
    legPassengerId: Number(r.leg_passenger_id),
    bookingLegId: Number(r.booking_leg_id),
    bookingId: Number(r.booking_id),
    passengerId: Number(r.passenger_id),
    firstName: String(r.first_name),
    lastName: String(r.last_name),
    email: String(r.email ?? ""),
    origin: String(r.origin_code),
    destination: String(r.destination_code),
    legSequence: Number(r.leg_sequence),
    checkedIn: Boolean(r.checked_in),
    bodyWeightKg: r.clothed_weight_kg ? Number(r.clothed_weight_kg) : r.clothed_body_weight_kg ? Number(r.clothed_body_weight_kg) : null,
    baggageWeightKg: Number(r.baggage_weight_kg ?? 0),
    seatNumber: r.seat_number ? String(r.seat_number) : null,
    bookingReference: String(r.booking_reference),
  }));

  return json({
    mode: "checkin" as const,
    flight: flight.rows[0] as Record<string, unknown>,
    passengers: mapped,
    tillPayments: tillPayments.rows as unknown as PaymentRecord[],
    today: new Date().toISOString().slice(0, 10),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const userId = Number(await getUserId(request) ?? 0);

  if (intent === "checkin-with-payment") {
    const legPaxId = Number(formData.get("leg_pax_id"));
    const bodyWt = parseFloat(formData.get("body_weight_kg")?.toString() ?? "0");
    const bagWt = parseFloat(formData.get("baggage_weight_kg")?.toString() ?? "0");
    const flightId = formData.get("flight_id")?.toString();
    const paymentsJson = formData.get("payments")?.toString() ?? "[]";
    const payments: Array<{ method: string; amount: number; reference?: string }> = JSON.parse(paymentsJson);
    const weightOverrideCode = formData.get("weight_override_code")?.toString() || "";

    if (bodyWt > 0) {
      await db.query(
        `UPDATE booking_passengers SET clothed_body_weight_kg = $1, updated_at = NOW() WHERE id = (SELECT booking_passenger_id FROM booking_leg_passengers WHERE id = $2)`,
        [bodyWt, legPaxId]
      );
    }
    await bookingLegPassengerRepository.update(legPaxId, { baggage_weight_kg: bagWt, ...(bodyWt > 0 ? { clothed_weight_kg: bodyWt } : {}) });

    if (weightOverrideCode) {
      await db.query(
        `INSERT INTO payments (booking_id, amount, amount_gbp, method, status, transaction_reference, created_at)
         VALUES ((SELECT bl.booking_id FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE blp.id = $1), 0, 0, 'weight_override', 'completed', $2, NOW())`,
        [legPaxId, `WGT-OVERRIDE-${weightOverrideCode}-${Date.now()}`]
      );
    }

    const totalAmount = payments.reduce((s, p) => s + p.amount, 0);
    if (totalAmount > 0 && payments.length > 0) {
      for (const p of payments) {
        await db.query(
          `INSERT INTO payments (booking_id, amount, amount_gbp, method, status, transaction_reference, created_at)
           VALUES ((SELECT bl.booking_id FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE blp.id = $1), $2, $2, $3, 'completed', $4, NOW())`,
          [legPaxId, p.amount, p.method, p.reference || `POS-${Date.now()}-${p.method}`]
        );
      }
    }
    await bookingLegPassengerRepository.checkIn(legPaxId, userId);
    return redirect(`/checkin/counter?flightId=${flightId}`);
  }

  if (intent === "batch-checkin") {
    const flightId = formData.get("flight_id")?.toString();
    if (!flightId) return json({ error: "Flight ID required" }, { status: 400 });

    const unchecked = await db.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT blp.id
       FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       WHERE bl.flight_id = $1 AND blp.checked_in = false`,
      [Number(flightId)]
    );

    if (unchecked.length === 0) {
      return json({ error: "All passengers already checked in" }, { status: 400 });
    }

    for (const p of unchecked) {
      await bookingLegPassengerRepository.checkIn(p.id, userId);
    }

    return redirect(`/checkin/counter?flightId=${flightId}&batch=${unchecked.length}`);
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

/* ── Flight Select Screen ─────────────────────────────────────────────── */
function FlightSelect({ flights, today }: { flights: Array<Record<string, unknown>>; today: string }) {
  const [, setSearchParams] = useSearchParams();
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Check-In Counter</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Date:</span>
          <DatePicker value={today} onChange={(d) => setSearchParams({ date: d })} label="" />
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Select Flight — {new Date(today).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
          {flights.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">No flights scheduled for today.</div>
          ) : flights.map((f) => {
            const ci = Number(f.checked_count ?? 0);
            const tp = Number(f.total_count ?? 1);
            const pct = tp > 0 ? Math.round((ci / tp) * 100) : 0;
            return (
              <a key={String(f.id)} href={`/checkin/counter?flightId=${f.id}`}
                className="flex items-center justify-between px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center gap-6 min-w-0">
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{String(f.flight_number)}</p>
                    <p className="text-xs text-slate-500">{new Date(String(f.departure_time)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-200">{String(f.origin_code)} → {String(f.destination_code)}</p>
                    <p className="text-xs text-slate-500">{String(f.registration ?? "Unassigned aircraft")}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${String(f.status) === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{String(f.status)}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-32">
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 text-right">{ci}/{tp} checked in</p>
                  </div>
                  <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">Check In →</span>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Cash Keypad ──────────────────────────────────────────────────────── */
function CashKeypad({ onEnter, onQuick }: { onEnter: (val: string) => void; onQuick: (val: number) => void }) {
  const [input, setInput] = useState("");
  const keys = ["1","2","3","4","5","6","7","8","9","C","0","↵"];
  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {QUICK_CASH.map((v) => <button key={v} type="button" onClick={() => onQuick(v)} className="px-3 py-1.5 text-xs font-medium rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100">£{v}</button>)}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 rounded px-3 py-1 min-w-[100px] text-right">£{input || "0.00"}</div>
        <button type="button" onClick={() => { if (input) { onEnter(input); setInput(""); } }} className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700">Enter</button>
      </div>
      <div className="grid grid-cols-3 gap-1 w-40">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => { if (k==="C") setInput(""); else if (k==="↵") { if (input) { onEnter(input); setInput(""); } } else setInput(input+k); }}
            className={`h-9 text-sm font-medium rounded ${k==="C"?"bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400":k==="↵"?"bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400":"bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"}`}>{k}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Card Processor ───────────────────────────────────────────────────── */
function CardProcessor({ onComplete }: { onComplete: (approved: boolean, ref: string) => void }) {
  const [s, setS] = useState<"idle"|"processing"|"approved"|"declined">("idle");
  return (
    <div className="space-y-3">
      <div className={`p-4 rounded-lg border text-center ${s==="idle"?"bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600":s==="processing"?"bg-amber-50 dark:bg-amber-900/30 border-amber-200":s==="approved"?"bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200":"bg-red-50 dark:bg-red-900/30 border-red-200"}`}>
        {s==="idle"&&<p className="text-sm text-slate-600 dark:text-slate-300">Terminal ready</p>}
        {s==="processing"&&<p className="text-sm text-amber-700 dark:text-amber-400 animate-pulse">Processing...</p>}
        {s==="approved"&&<p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ Approved</p>}
        {s==="declined"&&<p className="text-sm font-medium text-red-700 dark:text-red-400">✗ Declined</p>}
      </div>
      {s==="idle"&&<Button color="primary" onClick={()=>{setS("processing");setTimeout(()=>setS("approved"),2000)}}>Process Card</Button>}
      {s==="approved"&&<Button color="success" onClick={()=>onComplete(true,`CARD-${Date.now()}`)}>Confirm</Button>}
      {s==="declined"&&<Button variant="outlined" onClick={()=>setS("idle")}>Retry</Button>}
    </div>
  );
}

/* ── Check-In Workflow ────────────────────────────────────────────────── */
function CheckinWorkflow({ flight, passengers, tillPayments }: { flight: Record<string, unknown>; passengers: FlightPassenger[]; tillPayments: PaymentRecord[] }) {
  const flightId = String(flight.id);
  const [selectedPassenger, setSelectedPassenger] = useState<FlightPassenger | null>(null);
  const [bodyWeight, setBodyWeight] = useState(70);
  const [baggageWeight, setBaggageWeight] = useState(0);
  const [manualOverrideCode, setManualOverrideCode] = useState("");

  // POS state
  const [posActive, setPosActive] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [paymentStep, setPaymentStep] = useState<"method"|"cash"|"card"|"invoice"|"deferred">("method");
  const [authorizationCode, setAuthorizationCode] = useState("");

  const excessBaggage = Math.max(0, baggageWeight - MAX_FREE_BAGGAGE_KG);
  const excessCharge = excessBaggage * EXCESS_RATE_PER_KG;

  const totalDue = useMemo(() => lineItems.reduce((s,i)=>s+i.amount,0), [lineItems]);
  const totalPaid = useMemo(() => payments.reduce((s,p)=>s+p.amount,0), [payments]);
  const remaining = totalDue - totalPaid;
  const isBalanced = Math.abs(remaining) < 0.01;
  const weightsValid = bodyWeight >= 20;

  const recalc = useCallback(() => {
    const items: LineItem[] = [];
    if (excessCharge > 0) items.push({ id:"excess", label:`Excess Baggage (${excessBaggage}kg × £${EXCESS_RATE_PER_KG}/kg)`, amount:excessCharge, type:"excess_baggage", quantity:excessBaggage, unitPrice:EXCESS_RATE_PER_KG });
    setLineItems(items);
  }, [excessCharge, excessBaggage]);
  useEffect(() => { recalc(); }, [recalc]);

  const selectPax = (p: FlightPassenger) => {
    if (p.checkedIn || p.origin !== "STY") { setSelectedPassenger(p); setPosActive(false); return; }
    setSelectedPassenger(p);
    setBodyWeight(p.bodyWeightKg ?? 70);
    setBaggageWeight(p.baggageWeightKg || 0);
    setPosActive(true);
    setPayments([]);
    setPaymentStep("method");
  };

  const voidTransaction = () => { setPayments([]); setPaymentStep("method"); setLineItems([]); };
  const addCash = (v: number) => { setPayments([...payments, { id: `p-${Date.now()}`, method:"cash", amount:v }]); setPaymentStep("method"); };
  const addCard = (approved: boolean, ref: string) => { if (approved && remaining > 0) { setPayments([...payments, { id: `p-${Date.now()}`, method:"card", amount:remaining, reference:ref, cardState:"approved" }]); } setPaymentStep("method"); };
  const addInvoice = () => { if (remaining > 0 && authorizationCode) { setPayments([...payments, { id: `p-${Date.now()}`, method:"invoice", amount:remaining, reference:authorizationCode }]); setPaymentStep("method"); setAuthorizationCode(""); } };
  const addDeferred = () => { setPayments([...payments, { id: `p-${Date.now()}`, method:"deferred", amount:remaining }]); setPaymentStep("method"); };
  const removePayment = (id: string) => setPayments(payments.filter(p=>p.id!==id));

  const pax = selectedPassenger;
  const [flightFilter, setFlightFilter] = useState("all");
  const uncheckin = passengers.filter(p => !p.checkedIn && (flightFilter === "all" || String(flight.id) === flightFilter));
  const checked = passengers.filter(p=>p.checkedIn).length;

  return (
    <div className="p-4 space-y-4">
      {/* Flight header */}
      <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700">
        <div className="flex items-center gap-4">
          <span className="font-bold text-slate-800 dark:text-slate-100">{String(flight.flight_number)}</span>
          <span className="text-sm text-slate-600 dark:text-slate-300">{String(flight.origin_code)} → {String(flight.destination_code)}</span>
          <span className="text-sm text-slate-500">{String(flight.registration)}</span>
        </div>
        <div className="flex items-center gap-3">
          <TourTrigger config={checkinCounterTour} />
          <Form method="post" onSubmit={(e) => { if (!confirm(`Check in all ${uncheckin.length} unchecked passengers?`)) e.preventDefault(); }}>
            <input type="hidden" name="intent" value="batch-checkin" />
            <input type="hidden" name="flight_id" value={String(flight.id)} />
            <button type="submit" disabled={uncheckin.length === 0}
              className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Batch Check-in ({uncheckin.length})
            </button>
          </Form>
          <span className="text-sm text-slate-600">{checked}/{passengers.length} checked in</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* COL 1: Passenger Manifest */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800" data-tour="checkin-manifest">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Passengers ({uncheckin.length})</h3>
              <select value={flightFilter} onChange={e => setFlightFilter(e.target.value)} className="ml-auto text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-300">
                <option value="all">This Flight</option>
              </select>
            </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
            {passengers.length===0?<div className="px-3 py-8 text-center text-sm text-slate-500">No passengers</div>:passengers.map(p=>(
              <button key={p.legPassengerId} type="button" onClick={()=>selectPax(p)}
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${selectedPassenger?.legPassengerId===p.legPassengerId?'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200':'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${p.checkedIn?'text-emerald-700 dark:text-emerald-400 line-through':'text-slate-800 dark:text-slate-100'}`}>{p.firstName} {p.lastName}</p>
                  <p className="text-[11px] text-slate-500">{p.bookingReference}</p>
                </div>
                {p.checkedIn&&<span className="text-xs text-emerald-600">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* COL 2: Weights Entry + POS Trigger */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {pax ? `${pax.firstName} ${pax.lastName}` : "Select a passenger"}
          </h3>

          {!pax && <p className="text-sm text-slate-500 py-8 text-center">Select a passenger to begin check-in.</p>}
          {pax && pax.checkedIn && <div className="py-8 text-center"><p className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Already checked in</p><p className="text-sm text-slate-500 mt-1">{pax.firstName} {pax.lastName}</p></div>}
          {pax && !pax.checkedIn && pax.origin !== "STY" && (
            <div className="py-4 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 mb-3">
                <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">⛔ Remote Check-In</span>
              </div>
              <p className="text-xs text-slate-500">Passenger boards at <span className="font-semibold">{pax.origin}</span> — will be checked in by pilot at departure stop.</p>
            </div>
          )}
          {pax && !pax.checkedIn && pax.origin === "STY" && (
            <>
              <div>
                <label htmlFor="counter-body-weight" className="block text-xs text-slate-500 mb-1">Body Weight (kg)</label>
                <div className="flex items-center gap-1"><input id="counter-body-weight" type="number" value={bodyWeight} onChange={e=>setBodyWeight(Number(e.target.value))} step="0.1" min="20" max="200" className="block w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
                  <button type="button" onClick={()=>setBodyWeight(70)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-500">70</button>
                  <button type="button" onClick={()=>setBodyWeight(85)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-500">85</button>
                </div>
              </div>
              <div>
                <label htmlFor="counter-baggage-weight" className="block text-xs text-slate-500 mb-1">Baggage (kg)</label>
                <div className="flex items-center gap-1"><input id="counter-baggage-weight" type="number" value={baggageWeight} onChange={e=>setBaggageWeight(Number(e.target.value))} step="0.1" min="0" max="100" className="block w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
                  <button type="button" onClick={()=>setBaggageWeight(0)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-500">0</button>
                  <button type="button" onClick={()=>setBaggageWeight(15)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-500">15</button>
                  <button type="button" onClick={()=>setBaggageWeight(20)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-500">20</button>
                </div>
                {excessCharge>0&&<p className="mt-1 text-xs text-amber-600">⚠ Excess {excessBaggage}kg × £{EXCESS_RATE_PER_KG} = £{excessCharge.toFixed(2)}</p>}
              </div>
            </>
          )}
        </div>

        {/* COL 3: POS Terminal (active when posActive) */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden" data-tour="checkin-pos">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">POS Terminal</h3>
            {posActive && <span className="text-[10px] text-emerald-600 font-medium">ACTIVE</span>}
          </div>

          {!posActive ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <p>Select a passenger from the manifest to activate the POS terminal.</p>
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4 mt-4 text-left">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Today&rsquo;s Transactions</p>
                <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                  {tillPayments.slice(0,8).map((tp,i)=>(<div key={i} className="flex justify-between text-[11px]"><span className="text-slate-500">{tp.bookingReference}</span><span className="tabular-nums">£{Number(tp.amount).toFixed(2)}</span><span className="text-slate-500 capitalize">{tp.method.replace("_"," ")}</span></div>))}
                </div>
                {tillPayments.length>0&&<p className="text-xs font-medium mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">Till: £{tillPayments.reduce((s,tp)=>s+Number(tp.amount),0).toFixed(2)}</p>}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {/* Charges */}
              <div className="p-3 space-y-1">
                {lineItems.length===0?<p className="text-xs text-slate-500">No charges due</p>:lineItems.map(i=>(<div key={i.id} className="flex justify-between text-xs"><span>{i.label}</span><span className="tabular-nums font-medium">£{i.amount.toFixed(2)}</span></div>))}
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-100 dark:border-slate-700"><span>TOTAL</span><span>£{totalDue.toFixed(2)}</span></div>
              </div>

              {/* Payments list */}
              <div className="p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Paid</span><span className="tabular-nums font-medium">£{totalPaid.toFixed(2)}</span></div>
                {isBalanced&&<div className="text-xs text-emerald-600 font-medium">Balanced</div>}
                {payments.map(p=>(<div key={p.id} className="flex justify-between text-[11px]"><span className="capitalize">{p.method}</span><span className="tabular-nums">£{p.amount.toFixed(2)}</span><button onClick={()=>removePayment(p.id)} className="text-red-500">✕</button></div>))}
              </div>

              {/* Payment Methods (only if not balanced) */}
              {!isBalanced && paymentStep==="method" && (
                <div className="p-3 flex flex-wrap gap-1.5">
                  <Button variant="outlined" onClick={()=>setPaymentStep("cash")}>Cash</Button>
                  <Button variant="outlined" onClick={()=>setPaymentStep("card")}>Card</Button>
                  <Button variant="outlined" onClick={()=>setPaymentStep("invoice")}>Invoice</Button>
                  <Button variant="outlined" onClick={()=>setPaymentStep("deferred")}>Pay on Arrival</Button>
                </div>
              )}

              {paymentStep==="cash" && <div className="p-3"><CashKeypad onEnter={v=>addCash(Number(v))} onQuick={v=>addCash(v)}/><button onClick={()=>setPaymentStep("method")} className="text-xs text-slate-500 mt-2">Cancel</button></div>}
              {paymentStep==="card" && <div className="p-3"><CardProcessor onComplete={(a,r)=>addCard(a,r)}/><button onClick={()=>setPaymentStep("method")} className="text-xs text-slate-500 mt-2">Cancel</button></div>}
              {paymentStep==="invoice" && <div className="p-3 space-y-2"><p className="text-xs">Amount: £{remaining.toFixed(2)}</p><input value={authorizationCode} onChange={e=>setAuthorizationCode(e.target.value)} placeholder="PO / Auth Ref" className="block w-full rounded border px-2 py-1 text-xs" /><div className="flex gap-2"><Button color="primary" onClick={addInvoice} disabled={!authorizationCode}>Confirm</Button><Button variant="outlined" onClick={()=>setPaymentStep("method")}>Cancel</Button></div></div>}
              {paymentStep==="deferred" && <div className="p-3 space-y-2"><p className="text-xs">Flag £{remaining.toFixed(2)} for collection at destination.</p><div className="flex gap-2"><Button color="warning" onClick={addDeferred}>Flag</Button><Button variant="outlined" onClick={()=>setPaymentStep("method")}>Cancel</Button></div></div>}

              {/* Manual override & Quick actions */}
              <div className="p-3 space-y-2">
                <input value={manualOverrideCode} onChange={e=>setManualOverrideCode(e.target.value)} placeholder="Weight override code" className="block w-full rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs dark:bg-slate-700" />
                <div className="flex flex-wrap gap-1">
                  {pax && (
                    <PrintButton
                      options={buildBaggageTagOptions({
                        name: `${pax.firstName} ${pax.lastName}`,
                        bookingRef: pax.bookingReference,
                        flightNumber: String(flight.flight_number),
                        origin: pax.origin,
                        destination: pax.destination,
                        weight: bodyWeight,
                        baggageWeight: baggageWeight,
                        seat: pax.seatNumber ?? undefined,
                        date: new Date().toLocaleDateString(),
                      })}
                      label="Print Tags"
                      variant="outlined"
                      className="text-[10px] px-2 py-0.5"
                    />
                  )}
                  <button onClick={voidTransaction} className="text-[10px] px-2 py-0.5 rounded border border-red-200 dark:border-red-700 text-red-500">❌ Void</button>
                </div>
              </div>

              {/* Complete Sale */}
              <div className="p-3" data-tour="checkin-complete">
                <Form method="post">
                  <input type="hidden" name="intent" value="checkin-with-payment" />
                  <input type="hidden" name="leg_pax_id" value={pax?.legPassengerId ?? 0} />
                  <input type="hidden" name="body_weight_kg" value={bodyWeight} />
                  <input type="hidden" name="baggage_weight_kg" value={baggageWeight} />
                  <input type="hidden" name="flight_id" value={flightId} />
                  <input type="hidden" name="authorization_code" value={authorizationCode} />
                  <input type="hidden" name="weight_override_code" value={manualOverrideCode} />
                  <input type="hidden" name="payments" value={JSON.stringify(payments.map(p=>({method:p.method, amount:p.amount, reference:p.reference})))} />
                  <Button type="submit" color="primary" className="w-full" disabled={!isBalanced || !weightsValid}>
                    {!isBalanced ? `Balance: £${remaining.toFixed(2)}` : `✓ Complete Sale — £${totalDue.toFixed(2)}`}
                  </Button>
                </Form>
                {!isBalanced && <p className="text-[10px] text-slate-500 mt-1 text-center">Balance payments before completing</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckinCounter() {
  const data = useLoaderData<typeof loader>();
  if (data.mode === "select") return <FlightSelect flights={data.flights as Array<Record<string, unknown>>} today={data.today} />;
  return <CheckinWorkflow flight={data.flight} passengers={data.passengers} tillPayments={data.tillPayments} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700"><div className="text-center"><div className="text-5xl font-bold text-slate-300">{error.status}</div><h1 className="text-xl font-semibold">Something went wrong</h1><p className="text-sm text-slate-500">{error.statusText}</p><button onClick={()=>window.location.reload()} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Try Again</button></div></div>;
  }
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700"><div className="text-center"><h1 className="text-xl font-semibold">Unexpected Error</h1><p className="text-sm text-slate-500">An unexpected error occurred.</p><button onClick={()=>window.location.reload()} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Try Again</button></div></div>;
}

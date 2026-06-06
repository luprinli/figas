import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useFetcher } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { db } from "../utils/db.server";
import { requireUser } from "../utils/layout.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import Button from "../components/Button";
import PrintButton from "../components/PrintButton";

export const meta = () => [{ title: "POS Terminal - FIGAS" }];

const MAX_FREE_BAGGAGE_KG = 20;
const EXCESS_RATE_PER_KG = 5;
const QUICK_CASH = [10, 20, 50, 100];

interface LineItem {
  id: string;
  label: string;
  amount: number;
  type: "fare" | "excess_baggage" | "freight" | "tax" | "discount";
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

interface SaleSession {
  agentName: string;
  flightId: string;
  flightNumber: string;
  passengerName: string;
  passengerId: number;
  legPassengerId: number;
  bookingId: number;
  bodyWeightKg: number;
  baggageWeightKg: number;
  payloadTotal: number;
  payloadCapacity: number;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { userId, userIdentity } = await requireUser(request);
  await requirePermission(request, Permission.CHECKIN_PROCESS);
  const url = new URL(request.url);
  const flightId = url.searchParams.get("flightId");
  const paxId = url.searchParams.get("pax");

  if (!flightId || !paxId) {
    return json({ session: null });
  }

  const [flight, pax] = await Promise.all([
    db.query(
      `SELECT f.id, f.flight_number, a.max_takeoff_weight_kg, a.empty_weight_kg
       FROM flights f LEFT JOIN aircraft a ON a.id = f.aircraft_id WHERE f.id = $1`,
      [Number(flightId)]
    ),
    db.query(
      `SELECT blp.id AS leg_pax_id, blp.booking_leg_id, bl.booking_id,
         bp.first_name, bp.last_name, COALESCE(blp.clothed_weight_kg, bp.clothed_body_weight_kg, 70) AS body_kg,
         COALESCE(blp.baggage_weight_kg, 0) AS baggage_kg
       FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
       WHERE blp.id = $1`,
      [Number(paxId)]
    ),
  ]);

  if (!flight.rows.length || !pax.rows.length) {
    return json({ session: null });
  }

  const f = flight.rows[0] as Record<string, unknown>;
  const p = pax.rows[0] as Record<string, unknown>;
  const mtow = Number(f.max_takeoff_weight_kg ?? 2994);
  const empty = Number(f.empty_weight_kg ?? 1627);
  const capacity = mtow - empty;

  const session: SaleSession = {
    agentName: userIdentity?.name ?? "Agent",
    flightId: String(f.id),
    flightNumber: String(f.flight_number),
    passengerName: `${p.first_name} ${p.last_name}`,
    passengerId: Number(paxId),
    legPassengerId: Number(p.leg_pax_id),
    bookingId: Number(p.booking_id),
    bodyWeightKg: Number(p.body_kg ?? 70),
    baggageWeightKg: Number(p.baggage_kg ?? 0),
    payloadTotal: Number(p.body_kg ?? 70) + Number(p.baggage_kg ?? 0),
    payloadCapacity: capacity,
  };

  return json({ session });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "process-card") {
    // Mock card processing
    const amount = parseFloat(formData.get("amount")?.toString() ?? "0");
    await new Promise((r) => setTimeout(r, 2000));
    const approved = amount < 5000; // Mock: approve under £5000
    return json({ cardResult: approved ? "approved" : "declined", amount });
  }

  if (intent === "finalize") {
    const legPaxId = Number(formData.get("leg_pax_id"));
    const bodyWt = parseFloat(formData.get("body_weight_kg")?.toString() ?? "0");
    const bagWt = parseFloat(formData.get("baggage_weight_kg")?.toString() ?? "0");
    const flightId = formData.get("flight_id")?.toString();
    const paymentsJson = formData.get("payments")?.toString() ?? "[]";
    const payments: Array<{ method: string; amount: number; reference?: string }> = JSON.parse(paymentsJson);
    const authorizationCode = formData.get("authorization_code")?.toString() || "";
    const weightOverrideCode = formData.get("weight_override_code")?.toString() || "";

    if (bodyWt > 0) {
      await db.query(
        `UPDATE booking_passengers SET clothed_body_weight_kg = $1, updated_at = NOW() WHERE id = (SELECT booking_passenger_id FROM booking_leg_passengers WHERE id = $2)`,
        [bodyWt, legPaxId]
      );
    }

    await bookingLegPassengerRepository.update(legPaxId, {
      baggage_weight_kg: bagWt,
      ...(bodyWt > 0 ? { clothed_weight_kg: bodyWt } : {}),
    });

    // Record weight override in audit log if manual justification provided
    if (weightOverrideCode) {
      await db.query(
        `INSERT INTO payments (booking_id, amount, amount_gbp, method, status, transaction_reference, created_at)
         VALUES ((SELECT bl.booking_id FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE blp.id = $1), 0, 0, 'weight_override', 'completed', $2, NOW())`,
        [legPaxId, `WGT-OVERRIDE-${weightOverrideCode}-${Date.now()}`]
      );
    }

    const totalAmount = payments.reduce((s, p) => s + p.amount, 0);
    if (totalAmount > 0 && payments.length > 0) {
      // Determine if this is split payment (multiple methods)
      for (const p of payments) {
        const ref = p.reference || (authorizationCode ? `AUTH-${authorizationCode}` : `POS-${Date.now()}-${p.method}`);
        await db.query(
          `INSERT INTO payments (booking_id, amount, amount_gbp, method, status, transaction_reference, created_at)
           VALUES ((SELECT bl.booking_id FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE blp.id = $1), $2, $2, $3, 'completed', $4, NOW())`,
          [legPaxId, p.amount, p.method, ref]
        );
      }
    }

    await bookingLegPassengerRepository.checkIn(legPaxId, 0);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

function CashKeypad({ onEnter, onQuick }: { onEnter: (val: string) => void; onQuick: (val: number) => void }) {
  const [input, setInput] = useState("");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "↵"];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {QUICK_CASH.map((val) => (
          <button key={val} type="button" onClick={() => onQuick(val)} className="px-3 py-1.5 text-xs font-medium rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50">
            £{val}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 rounded px-3 py-1 min-w-[100px] text-right">
          £{input || "0.00"}
        </div>
        <button type="button" onClick={() => { if (input) { onEnter(input); setInput(""); } }} className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700">Enter</button>
      </div>
      <div className="grid grid-cols-3 gap-1 w-40">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => {
            if (k === "C") setInput("");
            else if (k === "↵") { if (input) { onEnter(input); setInput(""); } }
            else setInput(input + k);
          }} className={`h-9 text-sm font-medium rounded ${k === "C" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" : k === "↵" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"}`}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function CardProcessor({ onComplete }: { onComplete: (approved: boolean, ref: string) => void }) {
  const [state, setState] = useState<"idle" | "processing" | "approved" | "declined">("idle");

  const process = () => {
    setState("processing");
    setTimeout(() => setState("approved"), 2000);
  };

  return (
    <div className="space-y-3">
      <div className={`p-4 rounded-lg border text-center ${
        state === "idle" ? "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600" :
        state === "processing" ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700" :
        state === "approved" ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700" :
        "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700"
      }`}>
        {state === "idle" && <p className="text-sm text-slate-600 dark:text-slate-300">Card terminal ready</p>}
        {state === "processing" && <p className="text-sm text-amber-700 dark:text-amber-400 animate-pulse">Processing...</p>}
        {state === "approved" && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ Approved</p>}
        {state === "declined" && <p className="text-sm font-medium text-red-700 dark:text-red-400">✗ Declined</p>}
      </div>
      {state === "idle" && (
        <Button color="primary" onClick={process}>Process Card</Button>
      )}
      {state === "approved" && (
        <Button color="success" onClick={() => onComplete(true, `CARD-${Date.now()}`)}>Confirm Card Payment</Button>
      )}
      {state === "declined" && (
        <Button variant="outlined" onClick={() => setState("idle")}>Retry</Button>
      )}
    </div>
  );
}

export default function PosTerminal() {
  const { session } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [paymentStep, setPaymentStep] = useState<"method" | "cash" | "card" | "invoice" | "deferred">("method");
  const [activeMethod, setActiveMethod] = useState<string>("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [bodyWeight, setBodyWeight] = useState(session?.bodyWeightKg ?? 70);
  const [baggageWeight, setBaggageWeight] = useState(session?.baggageWeightKg ?? 0);
  const [manualOverrideCode, setManualOverrideCode] = useState("");

  const excessBaggage = Math.max(0, baggageWeight - MAX_FREE_BAGGAGE_KG);
  const excessCharge = excessBaggage * EXCESS_RATE_PER_KG;

  const totalDue = useMemo(() => lineItems.reduce((s, i) => s + i.amount, 0), [lineItems]);
  const totalPaid = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const remaining = totalDue - totalPaid;
  const isBalanced = Math.abs(remaining) < 0.01;
  const weightsValid = bodyWeight >= 20 && baggageWeight >= 0 && (baggageWeight > 0 ? true : true);

  const recalculateItems = useCallback(() => {
    const items: LineItem[] = [];
    if (excessCharge > 0) {
      items.push({ id: "excess", label: `Excess Baggage (${excessBaggage} kg × £${EXCESS_RATE_PER_KG}/kg)`, amount: excessCharge, type: "excess_baggage", quantity: excessBaggage, unitPrice: EXCESS_RATE_PER_KG });
    }
    setLineItems(items);
  }, [excessCharge, excessBaggage]);

  useEffect(() => { recalculateItems(); }, [recalculateItems]);

  const addCashPayment = (amount: number) => {
    setPayments([...payments, { id: `pmt-${Date.now()}`, method: "cash", amount }]);
    setPaymentStep("method");
  };

  const addCardPayment = (approved: boolean, ref: string) => {
    if (approved && remaining > 0) {
      setPayments([...payments, { id: `pmt-${Date.now()}`, method: "card", amount: remaining, reference: ref, cardState: "approved" }]);
    }
    setPaymentStep("method");
  };

  const addInvoicePayment = () => {
    if (remaining > 0 && authorizationCode) {
      setPayments([...payments, { id: `pmt-${Date.now()}`, method: "invoice", amount: remaining, reference: authorizationCode }]);
      setPaymentStep("method");
      setAuthorizationCode("");
    }
  };

  const addDeferredPayment = () => {
    setPayments([...payments, { id: `pmt-${Date.now()}`, method: "deferred", amount: remaining }]);
    setPaymentStep("method");
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter((p) => p.id !== id));
  };

  const finalizeSale = () => {
    const formData = new FormData();
    formData.set("intent", "finalize");
    formData.set("leg_pax_id", String(session?.legPassengerId ?? 0));
    formData.set("body_weight_kg", String(bodyWeight));
    formData.set("baggage_weight_kg", String(baggageWeight));
    formData.set("flight_id", session?.flightId ?? "");
    formData.set("authorization_code", authorizationCode);
    formData.set("weight_override_code", manualOverrideCode);
    formData.set("payments", JSON.stringify(payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference }))));
    fetcher.submit(formData, { method: "post" });
  };

  if (!session) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-12 text-center">
          <p className="text-slate-500">No session active. Select a passenger from the check-in counter.</p>
        </div>
      </div>
    );
  }

  const payloadPct = session.payloadCapacity > 0 ? Math.round((session.payloadTotal / session.payloadCapacity) * 100) : 0;

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Agent Display */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Session Bar */}
        <div className={`px-4 py-3 rounded-lg border ${payloadPct > 100 ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700' : payloadPct > 90 ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700' : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700'}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{session.flightNumber}</span>
              <span className="text-sm text-slate-600 dark:text-slate-300">Agent: {session.agentName}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600 dark:text-slate-300">{session.passengerName}</span>
              <span className="text-slate-500">|</span>
              <span className={`font-semibold ${payloadPct > 100 ? 'text-red-600' : payloadPct > 90 ? 'text-amber-600' : 'text-emerald-600'}`}>{session.payloadTotal} / {session.payloadCapacity} kg ({payloadPct}%)</span>
            </div>
          </div>
        </div>

        {/* Weights */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Passenger Weights</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Body Weight (kg)</label>
              <input type="number" value={bodyWeight} onChange={(e) => setBodyWeight(Number(e.target.value))} step="0.1" min="20" max="200" className="block w-28 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Baggage (kg)</label>
              <input type="number" value={baggageWeight} onChange={(e) => setBaggageWeight(Number(e.target.value))} step="0.1" min="0" max="100" className="block w-28 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
          </div>
          {excessCharge > 0 && (
            <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
              <p className="text-xs text-amber-700 dark:text-amber-400">Excess baggage: {excessBaggage} kg × £{EXCESS_RATE_PER_KG} = £{excessCharge.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Itemized List */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Charges</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {lineItems.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">No additional charges</div>
            ) : (
              lineItems.map((item) => (
                <div key={item.id} className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
                  <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">£{item.amount.toFixed(2)}</span>
                </div>
              ))
            )}
            <div className="px-4 py-2.5 flex justify-between text-sm font-bold bg-slate-50 dark:bg-slate-700">
              <span>Total Due</span>
              <span className="tabular-nums text-lg">£{totalDue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Summary & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Transaction Summary</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-200">£{totalDue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tax / VAT (0%)</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-200">£0.00</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-bold text-base">
                <span className="text-slate-800 dark:text-slate-100">TOTAL DUE</span>
                <span className="tabular-nums text-slate-900 dark:text-slate-100">£{totalDue.toFixed(2)}</span>
              </div>
              {isBalanced && totalPaid > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                  <span>Change Due</span>
                  <span className="tabular-nums">£{Math.max(0, totalPaid - totalDue).toFixed(2)}</span>
                </div>
              )}
            </div>
            {/* Weight override justification */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              <label className="block text-xs text-slate-500 mb-1">Weight Override Code (if manual entry)</label>
              <input
                type="text"
                value={manualOverrideCode}
                onChange={(e) => setManualOverrideCode(e.target.value)}
                placeholder="e.g. Scale Malfunction - Manual Entry"
                className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <PrintButton
                options={{
                  title: "FIGAS Boarding Pass",
                  header: "Boarding Pass & Baggage Tags",
                  subheader: `${session.passengerName} — ${session.flightNumber}`,
                  sections: [
                    { heading: "Passenger", rows: [{ label: "Name", value: session.passengerName }, { label: "Flight", value: session.flightNumber }, { label: "Body Weight", value: `${bodyWeight} kg` }, { label: "Baggage", value: `${baggageWeight} kg` }] },
                    { heading: "Charges", rows: lineItems.length > 0 ? lineItems.map(i=>({ label: i.label, value: `£${i.amount.toFixed(2)}` })) : [{ label: "No charges", value: "£0.00" }] },
                  ],
                  footer: "FIGAS Flight Operations — Uncontrolled when printed",
                }}
                label="🖨️ Print Boarding Pass & Bag Tags"
                variant="outlined"
                className="w-full text-left text-sm"
              />
              <button type="button" onClick={() => { /* Hardware: trigger cash drawer relay */ alert("Cash drawer signal sent"); }} className="w-full text-left px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                💵 Open Cash Drawer
              </button>
              <button type="button" onClick={() => { setPayments([]); setPaymentStep("method"); setLineItems([]); }} className="w-full text-left px-3 py-2 rounded border border-red-200 dark:border-red-700 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                ❌ Void Transaction
              </button>
            </div>
          </div>
        </div>

        {/* Payments */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Payments</h3>
            <span className={`text-xs font-medium ${isBalanced ? 'text-emerald-600' : remaining > 0 ? 'text-amber-600' : 'text-red-600'}`}>
              {isBalanced ? 'Balanced' : `Remaining: £${remaining.toFixed(2)}`}
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {payments.map((p) => (
              <div key={p.id} className="px-4 py-2 flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="capitalize text-slate-600 dark:text-slate-300">{p.method}</span>
                  {p.reference && <span className="text-xs text-slate-500 font-mono">{p.reference}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">£{p.amount.toFixed(2)}</span>
                  <button type="button" onClick={() => removePayment(p.id)} className="text-xs text-red-500 hover:text-red-700">✕</button>
                </div>
              </div>
            ))}
            {payments.length === 0 && <div className="px-4 py-4 text-center text-sm text-slate-500">No payments recorded</div>}
          </div>

          {!isBalanced && remaining > 0 && paymentStep === "method" && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
              <Button variant="outlined" onClick={() => { setPaymentStep("cash"); setActiveMethod("cash"); }}>Cash</Button>
              <Button variant="outlined" onClick={() => { setPaymentStep("card"); setActiveMethod("card"); }}>Card</Button>
              <Button variant="outlined" onClick={() => { setPaymentStep("invoice"); setActiveMethod("invoice"); }}>Invoice</Button>
              <Button variant="outlined" onClick={() => { setPaymentStep("deferred"); setActiveMethod("deferred"); }}>Pay on Arrival</Button>
            </div>
          )}

          {paymentStep === "cash" && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
              <CashKeypad onEnter={(v) => addCashPayment(parseFloat(v))} onQuick={(v) => addCashPayment(v)} />
              <button type="button" onClick={() => setPaymentStep("method")} className="text-xs text-slate-500 hover:text-slate-700 mt-2">Cancel</button>
            </div>
          )}

          {paymentStep === "card" && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
              <CardProcessor onComplete={(approved, ref) => addCardPayment(approved, ref)} />
              <button type="button" onClick={() => setPaymentStep("method")} className="text-xs text-slate-500 hover:text-slate-700 mt-2">Cancel</button>
            </div>
          )}

          {paymentStep === "invoice" && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">Amount to Invoice: £{remaining.toFixed(2)}</p>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">Authorization / PO Reference</label>
                <input type="text" value={authorizationCode} onChange={(e) => setAuthorizationCode(e.target.value)} placeholder="e.g. PO-2026-001" className="block w-60 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button color="primary" onClick={addInvoicePayment} disabled={!authorizationCode}>Confirm Invoice</Button>
                <Button variant="outlined" onClick={() => setPaymentStep("method")}>Cancel</Button>
              </div>
            </div>
          )}

          {paymentStep === "deferred" && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">Flag £{remaining.toFixed(2)} for collection at destination station.</p>
              <div className="flex gap-2">
                <Button color="warning" onClick={addDeferredPayment}>Flag for Collection</Button>
                <Button variant="outlined" onClick={() => setPaymentStep("method")}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        {/* Finalize */}
        <div className="flex items-center gap-3">
          <Button color="primary" onClick={finalizeSale} disabled={!isBalanced || !weightsValid}>✓ Complete Sale</Button>
          {!isBalanced && <span className="text-xs text-slate-500">Balance payments before completing</span>}
          {!weightsValid && <span className="text-xs text-amber-600">Weights must be valid</span>}
        </div>
      </div>

      {/* Customer Display */}
      <div className="w-full lg:w-80 shrink-0">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 text-white p-6 space-y-4 sticky top-4">
          <div className="text-center">
            <p className="text-sm font-bold tracking-widest text-slate-400 uppercase">FIGAS</p>
            <p className="text-xs text-slate-500">{session.flightNumber}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold">£{totalDue.toFixed(2)}</p>
            <p className="text-xs text-slate-400 mt-1">Total Due</p>
          </div>
          <div className="border-t border-slate-700 pt-3 space-y-1">
            <p className="text-sm">{session.passengerName}</p>
            <p className="text-xs text-slate-400">Body: {bodyWeight} kg | Baggage: {baggageWeight} kg</p>
            {excessCharge > 0 && <p className="text-xs text-amber-400">Excess Baggage: £{excessCharge.toFixed(2)}</p>}
          </div>
          {isBalanced && totalPaid > 0 && (
            <div className="text-center pt-3 border-t border-slate-700">
              <p className="text-emerald-400 font-bold text-lg">✓ PAID</p>
              {payments.map((p) => (
                <p key={p.id} className="text-xs text-slate-400 capitalize">{p.method} — £{p.amount.toFixed(2)}</p>
              ))}
            </div>
          )}
          {!isBalanced && remaining > 0 && (
            <div className="text-center pt-3 border-t border-slate-700">
              <p className="text-amber-400 font-medium">Awaiting Payment</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <div className="p-6 text-center text-slate-500">Error {error.status}: {error.statusText}</div>;
  }
  return <div className="p-6 text-center text-slate-500">An unexpected error occurred.</div>;
}

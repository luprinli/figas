import type { Page } from "@playwright/test";
import { SchedulePage } from "../pages/schedule-page";
import type { ScheduleSnapshot, FlightSnapshot } from "./parity-types";

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

async function getFlightNumberFromCard(page: Page, cardIndex: number): Promise<string> {
  const card = page.locator('[data-testid="flight-card"]').nth(cardIndex);
  const flightNumberEl = card.locator("span.text-base.font-bold.text-cyan-800").first();
  const text = await flightNumberEl.textContent().catch(() => null);
  return text?.trim() ?? `unknown-${cardIndex}`;
}

async function extractFlightStops(page: Page, flightCardIndex: number): Promise<string[]> {
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);
  const stopSpans = card.locator("span.text-sm.font-bold.text-slate-800");
  const count = await stopSpans.count();
  const stops: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await stopSpans.nth(i).textContent();
    if (text?.trim()) stops.push(text.trim());
  }
  return stops;
}

async function extractPassengerNames(page: Page, flightCardIndex: number): Promise<string[]> {
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);

  const loadsheetBtn = card.locator('button:has-text("Loadsheet")').first();
  const btnVisible = await loadsheetBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!btnVisible) return [];

  await loadsheetBtn.click();
  await page.waitForTimeout(800);

  const names: string[] = [];
  const passengerRows = page.locator('[data-testid="passenger-row"]');
  const rowCount = await passengerRows.count();
  for (let i = 0; i < rowCount; i++) {
    const text = await passengerRows.nth(i).textContent();
    if (text) {
      const cleaned = normalizeName(text);
      if (cleaned.length > 1 && !cleaned.startsWith("No") && !cleaned.includes("passenger")) {
        names.push(cleaned);
      }
    }
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return names;
}

async function extractAircraftPilotFromCard(page: Page, cardIndex: number): Promise<{ aircraft: string | null; pilot: string | null }> {
  const card = page.locator('[data-testid="flight-card"]').nth(cardIndex);
  const pillButtons = card.locator("button.rounded-full.border.px-2.py-0\\,5, button.rounded-full.border.px-2.py-0\\.5");

  let aircraft: string | null = null;
  let pilot: string | null = null;

  const buttonCount = await pillButtons.count();
  for (let i = 0; i < buttonCount; i++) {
    const text = await pillButtons.nth(i).textContent().catch(() => "");
    const trimmed = text?.trim() ?? "";
    if (!trimmed || trimmed === "Pilot" || trimmed === "Aircraft" || trimmed === "TBC" || trimmed === "Assigning...") continue;

    const svgCount = await pillButtons.nth(i).locator("svg").count();
    if (svgCount === 0) continue;

    const svgViewBox = await pillButtons.nth(i).locator("svg").first().getAttribute("viewBox").catch(() => "");
    if (svgViewBox === "0 0 16 16" && !pilot) {
      pilot = trimmed;
    } else if (svgViewBox === "0 0 24 24" && !aircraft) {
      aircraft = trimmed;
    }
  }

  return { aircraft, pilot };
}

export async function captureScheduleSnapshot(
  page: Page,
  schedulePage: SchedulePage,
  phase: "auto" | "manual",
  unassignedBefore: number,
): Promise<ScheduleSnapshot> {
  const startTime = Date.now();
  const flightCount = await schedulePage.getFlightCardCount();

  const flights: FlightSnapshot[] = [];
  for (let i = 0; i < flightCount; i++) {
    const flightNumber = await getFlightNumberFromCard(page, i);
    const stops = await extractFlightStops(page, i);
    const names = await extractPassengerNames(page, i);
    const { aircraft, pilot } = await extractAircraftPilotFromCard(page, i);

    flights.push({
      flightNumber,
      originCode: stops[0] ?? "STY",
      destinationCode: stops[stops.length - 1] ?? "STY",
      stopSequence: stops,
      legCount: stops.length >= 2 ? stops.length - 1 : 0,
      passengerCount: names.length,
      passengerNames: names.sort(),
      totalDistanceNm: 0,
      aircraftRegistration: aircraft,
      aircraftType: null,
      pilotName: pilot,
    });
  }

  const totalAssigned = flights.reduce((s, f) => s + f.passengerCount, 0);

  return {
    phase,
    timestamp: new Date().toISOString(),
    flightCount,
    flights,
    passengerCoverage: {
      totalUnassignedBefore: unassignedBefore,
      totalAssigned,
      coveragePct: unassignedBefore > 0 ? Math.round((totalAssigned / unassignedBefore) * 100) : 0,
    },
    warnings: [],
    errors: [],
    elapsedMs: Date.now() - startTime,
  };
}

export { extractFlightStops, extractPassengerNames };

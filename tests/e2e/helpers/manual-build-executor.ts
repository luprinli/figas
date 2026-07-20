import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SchedulePage } from "../pages/schedule-page";
import { dragBookingToDraftFlight } from "./drag-simulator";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ParityConfig {
  targetDate: string;
  depotCode: string;
  aerodromeCodes: string[];
  bookings: Array<{
    ref: string;
    origin: string;
    dest: string;
    passengerCount: number;
    names: string[];
  }>;
}

function loadConfig(): ParityConfig {
  const configPath = resolve(__dirname, "parity-config.json");
  return JSON.parse(readFileSync(configPath, "utf-8")) as ParityConfig;
}

async function waitForStable(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

async function getBookingIdFromItem(item: Locator): Promise<number> {
  const idAttr = await item.getAttribute("id").catch(() => "");
  return parseInt((idAttr ?? "").replace("booking-", ""), 10) || 0;
}

export async function executeManualBuild(
  page: Page,
  schedulePage: SchedulePage,
): Promise<void> {
  const config = loadConfig();

  await schedulePage.goto(config.targetDate);
  await waitForStable(page);
  await page.waitForSelector('[data-testid="booking-item"]', { timeout: 10_000 });

  const showAllBtn = page.locator('button:has-text("Show all")').first();
  if (await showAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await showAllBtn.click();
    await page.waitForTimeout(500);
  }

  const bookingCount = await schedulePage.getUnassignedBookingCount();
  console.log(`Manual build — starting with ${bookingCount} unassigned bookings`);
  expect(bookingCount, "Should have seed bookings for manual build").toBeGreaterThanOrEqual(5);

  const firstBItem = page.locator('[data-testid="booking-item"]').first();
  const primaryId = await getBookingIdFromItem(firstBItem);
  if (primaryId <= 0) throw new Error("Invalid booking item ID");

  await dragBookingToDraftFlight(page, primaryId);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const flightCount = await schedulePage.getFlightCardCount();
  console.log(`Manual build complete: ${flightCount} flight(s)`);

  if (flightCount === 0) {
    console.log("  WARNING: No flight created — aborting manual build");
  }
}

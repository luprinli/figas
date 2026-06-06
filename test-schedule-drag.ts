import { chromium, type Page } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate to login
  await page.goto("http://localhost:5174/login");
  await page.waitForLoadState("networkidle");

  // Fill in credentials from .env
  await page.fill('input[name="email"]', "ops@figas.gov.fk");
  await page.fill('input[name="password"]', "figas2024!");
  await page.click('button[type="submit"]');

  // Wait for redirect to schedule page
  await page.waitForURL("**/operations/schedule**", { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  // Take screenshot of initial state
  await page.screenshot({ path: "schedule-initial.png", fullPage: true });

  // Get unassigned bookings count
  const unassignedText = await page.locator("text=Unassigned Passengers").count();
  console.log("Unassigned Passengers text found:", unassignedText);

  // Try to find draggable booking items
  const bookingItems = await page.locator('[class*="DraggableBookingItem"]').all();
  console.log("Draggable booking items found:", bookingItems.length);

  // Try to find flight cards
  const flightCards = await page.locator('[class*="FlightCard"], [class*="SortableDroppableFlightCard"]').all();
  console.log("Flight cards found:", flightCards.length);

  // Get page content for debugging
  console.log("Page title:", await page.title());
  console.log("Page URL:", page.url());

  // Look for unassigned passengers text
  const unassignedPool = await page.locator("text=Unassigned Passengers").count();
  console.log("Unassigned Passengers text found:", unassignedPool);

  // Try to get all text content to see what's on the page
  const bodyText = await page.locator("body").innerText();
  console.log("Body text (first 800 chars):", bodyText.substring(0, 800));

  // Keep browser open for manual inspection
  console.log("Browser is open. Press Ctrl+C to exit.");
  await new Promise(() => {});
}

main().catch(console.error);

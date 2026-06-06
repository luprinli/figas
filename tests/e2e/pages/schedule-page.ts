import { type Page, type Locator, expect } from "@playwright/test";

export class SchedulePage {
  readonly page: Page;
  readonly datePickerButton: Locator;
  readonly unassignedHeading: Locator;
  readonly draggableItems: Locator;
  readonly scheduleBoard: Locator;
  readonly draftFlightPlaceholder: Locator;
  readonly scheduleStatusBar: Locator;
  readonly autoBuildButton: Locator;
  readonly approveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.datePickerButton = page.locator('button:has(svg)').first();
    this.unassignedHeading = page.getByRole("heading", { name: "Unassigned Passengers" });
    this.draggableItems = page.locator('[draggable="true"]');
    this.scheduleBoard = page.locator('[data-testid="schedule-board"]');
    this.draftFlightPlaceholder = page.locator("text=Draft Flight").first();
    this.scheduleStatusBar = page.locator('[data-testid="schedule-status-bar"]');
    this.autoBuildButton = page.getByRole("button", { name: /auto.?build/i });
    this.approveButton = page.getByRole("button", { name: /approve/i });
  }

  async goto(date?: string) {
    const url = date ? `/operations/schedule?date=${date}` : "/operations/schedule";
    await this.page.goto(url);
    await this.page.waitForLoadState("networkidle");
  }

  async getUnassignedBookingCount(): Promise<number> {
    return this.draggableItems.count();
  }

  async selectDate(day: string) {
    await this.datePickerButton.click();
    await this.page.waitForTimeout(500);
    const dayButton = this.page.locator(`button:not([aria-label]) >> text=/^${day}$/`).first();
    if (await dayButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dayButton.click();
    } else {
      const nextMonthBtn = this.page.locator('button[aria-label="Next month"]');
      if (await nextMonthBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await nextMonthBtn.click();
        await this.page.waitForTimeout(300);
        const dayButtonAgain = this.page.locator(`button:not([aria-label]) >> text=/^${day}$/`).first();
        await dayButtonAgain.click();
      }
    }
    await this.page.waitForTimeout(1000);
    await this.page.waitForLoadState("networkidle");
  }

  async expectNoErrors() {
    const errorText = this.page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);
  }

  async expectEmptyState() {
    const body = this.page.locator("body");
    await expect(body).toContainText(/no schedule|No schedule|No flights|no flights/i, { timeout: 10_000 });
  }

  async expectFlightCardsVisible() {
    const flightCards = this.page.locator('[data-testid="flight-card"]');
    await expect(flightCards.first()).toBeVisible({ timeout: 10_000 });
  }

  async getFlightCardCount(): Promise<number> {
    return this.page.locator('[data-testid="flight-card"]').count();
  }

  async clickAutoBuild() {
    if (await this.autoBuildButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await this.autoBuildButton.click();
      await this.page.waitForLoadState("networkidle");
    }
  }

  async clickApprove() {
    if (await this.approveButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await this.approveButton.click();
      await this.page.waitForLoadState("networkidle");
    }
  }
}

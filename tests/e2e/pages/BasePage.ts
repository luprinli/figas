import { type Page } from "@playwright/test";

export abstract class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForLoad() {
    await this.page.waitForLoadState("networkidle");
  }

  async waitForVisible(selector: string, timeout = 10_000) {
    await this.page.locator(selector).first().waitFor({ state: "visible", timeout });
  }

  async getToast(): Promise<string | null> {
    const toast = this.page.locator('[role="status"], .toast, [data-testid="toast"]').first();
    if (await toast.isVisible({ timeout: 3_000 }).catch(() => false)) {
      return (await toast.textContent()) ?? null;
    }
    return null;
  }

  async goTo(path: string) {
    await this.page.goto(path);
    await this.waitForLoad();
  }

  async expectNoErrors() {
    const errorText = this.page.locator("text=Internal Server Error");
    await this.page.waitForLoadState("networkidle");
    const count = await errorText.count();
    if (count > 0) {
      throw new Error(`Found ${count} server error(s) on page`);
    }
  }
}

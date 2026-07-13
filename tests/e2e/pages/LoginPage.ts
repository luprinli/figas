import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator(".text-red-600, .text-red-500, [data-testid='login-error']");
  }

  async login(email: string, password: string) {
    await this.goTo("/login");
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForURL(
      (url) => !url.pathname.includes("/login"),
      { timeout: 15_000 }
    );
    await this.waitForLoad();
  }

  async expectLoginError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 5_000 });
  }

  async expectOnLoginPage() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }
}

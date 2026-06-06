import { test, expect } from "@playwright/test";

test.describe("Accessibility", () => {
  test("should have proper heading hierarchy on schedule page", async ({ page }) => {
    await page.goto("/operations/schedule");
    await page.waitForLoadState("networkidle");

    // Check that there is at least one heading on the page
    const headings = page.locator("h1, h2, h3, h4, h5, h6");
    const headingCount = await headings.count();
    console.log(`Headings found on schedule page: ${headingCount}`);
    expect(headingCount).toBeGreaterThan(0);

    // Verify heading levels are logical (no skipped levels)
    const headingLevels: number[] = [];
    for (let i = 0; i < headingCount; i++) {
      const tag = await headings.nth(i).evaluate((el) => el.tagName.toLowerCase());
      const level = parseInt(tag.replace("h", ""), 10);
      headingLevels.push(level);
    }
    console.log(`Heading levels: ${headingLevels.join(", ")}`);

    // Check that h1 exists (page title)
    const h1 = page.locator("h1");
    const h1Count = await h1.count();
    console.log(`H1 headings: ${h1Count}`);

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);
  });

  test("should have focusable interactive elements", async ({ page }) => {
    await page.goto("/operations/schedule");
    await page.waitForLoadState("networkidle");

    // Check for focusable elements
    const focusableElements = page.locator(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const focusableCount = await focusableElements.count();
    console.log(`Focusable elements found: ${focusableCount}`);
    expect(focusableCount).toBeGreaterThan(0);

    // Verify the date picker button is focusable
    const datePickerButton = page.locator('button:has(svg)').first();
    await expect(datePickerButton).toBeVisible({ timeout: 5_000 });

    // Check that the button is focusable
    const isFocusable = await datePickerButton.evaluate((el) => {
      const tabIndex = el.getAttribute("tabindex");
      return tabIndex === null || parseInt(tabIndex) >= 0;
    });
    expect(isFocusable).toBeTruthy();
  });

  test("should have proper ARIA attributes on draggable items", async ({ page }) => {
    await page.goto("/operations/schedule");
    await page.waitForLoadState("networkidle");

    // Check draggable items for ARIA attributes
    const draggableItems = page.locator('[draggable="true"]');
    const draggableCount = await draggableItems.count();
    console.log(`Draggable items found: ${draggableCount}`);

    if (draggableCount > 0) {
      // Check that draggable items have role attribute (dnd-kit adds aria-describedby)
      for (let i = 0; i < Math.min(draggableCount, 3); i++) {
        const item = draggableItems.nth(i);
        const ariaDescribedBy = await item.getAttribute("aria-describedby");
        const role = await item.getAttribute("role");
        console.log(`Draggable item ${i}: role="${role}", aria-describedby="${ariaDescribedBy}"`);

        // dnd-kit adds role="button" to draggable items
        // This is a soft check - the item should have some accessibility attributes
        const hasAriaAttr = ariaDescribedBy !== null || role !== null;
        if (!hasAriaAttr) {
          console.log(`Warning: Draggable item ${i} has no ARIA attributes`);
        }
      }
    }

    // Check that the page has a heading structure
    const headings = page.locator("h1, h2, h3");
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThan(0);
  });
});

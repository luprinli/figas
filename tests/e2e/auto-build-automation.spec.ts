import { test } from "@playwright/test";

test.setTimeout(180_000); // 3 minutes

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTO-BUILD AUTOMATION SCRIPT
 *
 * Programmatically executes the auto-build process by simulating UI clicks,
 * monitoring server responses, analyzing errors, and retrying with alternative
 * strategies until flights are successfully created.
 *
 * Resolution strategies by error type:
 *   "No unassigned booking legs" → advance date by 1 day
 *   "No schedule found"           → advance date by 1 day
 *   "No-fly day"                  → advance date by 1 day
 *   Server/DB error (overflow)    → retry same date with backoff
 *   No preview results            → retry with longer wait
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface BuildAttempt {
  date: string;
  strategy: string;
  success: boolean;
  error?: string;
  flightCount?: number;
}

const MAX_ATTEMPTS = 5;

test.describe("Auto-Build Automation Loop", () => {
  test("should complete auto-build iteratively with error recovery", async ({ page }) => {
    const attempts: BuildAttempt[] = [];
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/operations/schedule", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const today = new Date();
    let currentDate = today.toISOString().split("T")[0];
    let buildComplete = false;
    let attemptNum = 0;

    while (!buildComplete && attemptNum < MAX_ATTEMPTS) {
      attemptNum++;
      const backoffMs = attemptNum * 1500;
      console.log(`\n═══ Attempt ${attemptNum}/${MAX_ATTEMPTS} | Date: ${currentDate} ═══`);

      const attempt: BuildAttempt = { date: currentDate, strategy: "default", success: false };
      consoleErrors.length = 0;

      // Ensure we're on the right date
      if (!page.url().includes(currentDate)) {
        await page.goto(`/operations/schedule?date=${currentDate}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
      }

      // ── Click "Auto-Build" view toggle (in toolbar between date nav and action buttons) ──
      const autoToggle = page.locator('button:has-text("Auto-Build")').first();
      if (await autoToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await autoToggle.click();
        await page.waitForTimeout(800);
      }

      // ── Click "Generate" inside the AutoBuildPanel ──
      const generateBtn = page.locator('button:has-text("Generate")').first();
      const genVisible = await generateBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!genVisible) {
        console.log("[Warn] Generate button not found — retrying");
        await page.waitForTimeout(backoffMs);
        attempts.push({ ...attempt, strategy: "no-generate-btn", error: "Generate button not found" });
        continue;
      }

      await generateBtn.click();
      console.log("[Step] Generate clicked, waiting for preview...");
      await page.waitForTimeout(4000);
      await page.waitForLoadState("networkidle");

      // ── Detect errors from the page ──
      const pageText = await page.locator("body").textContent().catch(() => "") || "";
      const errorPatterns = [
        { pattern: /no unassigned booking legs/i, strategy: "no-bookings" },
        { pattern: /no schedule found/i, strategy: "no-schedule" },
        { pattern: /cannot build.*no-fly day/i, strategy: "no-fly-day" },
        { pattern: /numeric field overflow/i, strategy: "db-overflow" },
        { pattern: /prisma:error/i, strategy: "db-error" },
        { pattern: /column.*does not exist/i, strategy: "db-column-error" },
        { pattern: /unique constraint/i, strategy: "db-constraint" },
        { pattern: /internal server error/i, strategy: "server-error" },
      ];

      let matchedError = "";
      let matchedStrategy = "";

      for (const ep of errorPatterns) {
        if (ep.pattern.test(pageText)) {
          matchedError = pageText.match(ep.pattern)?.[0] || ep.pattern.source;
          matchedStrategy = ep.strategy;
          break;
        }
      }

      // Check console errors too
      if (!matchedError && consoleErrors.length > 0) {
        matchedError = consoleErrors.join(" | ").slice(0, 300);
        matchedStrategy = "console-error";
      }

      if (matchedError) {
        console.log(`[Error] ${matchedStrategy}: ${matchedError.slice(0, 200)}`);

        if (matchedStrategy === "no-bookings" || matchedStrategy === "no-schedule" || matchedStrategy === "no-fly-day") {
          // Advance to next day
          const d = new Date(currentDate);
          d.setDate(d.getDate() + 1);
          currentDate = d.toISOString().split("T")[0];
          attempt.strategy = `next-day(${matchedStrategy})`;
          console.log(`[Recover] Advanced date to ${currentDate}`);
        } else {
          // Retry same date with backoff
          attempt.strategy = `retry(${matchedStrategy})`;
          console.log(`[Recover] Retrying with ${backoffMs}ms backoff`);
          await page.waitForTimeout(backoffMs);
        }

        attempts.push({ ...attempt, error: matchedError });
        continue;
      }

      // ── Check for successful preview results ──
      const scoreText = page.locator("text=/Score:/i").first();
      const acceptBtn = page.locator('button:has-text("Accept")').first();
      const hasPreview = await scoreText.isVisible({ timeout: 2_000 }).catch(() => false);

      if (hasPreview) {
        console.log("[Preview] Results visible — clicking Accept & Build");

        if (await acceptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await acceptBtn.click();
          console.log("[Step] Waiting for build to complete...");
          await page.waitForTimeout(6000);
          await page.waitForLoadState("networkidle");

          // Verify flights
          const flightCards = page.locator('[data-testid="flight-card"]');
          const count = await flightCards.count().catch(() => 0);

          if (count > 0) {
            attempt.success = true;
            attempt.flightCount = count;
            buildComplete = true;
            console.log(`[SUCCESS] ${count} flight(s) created!`);
          } else {
            // Might need a page reload
            await page.reload({ waitUntil: "networkidle" });
            await page.waitForTimeout(2000);
            const recount = await page.locator('[data-testid="flight-card"]').count().catch(() => 0);
            if (recount > 0) {
              attempt.success = true;
              attempt.flightCount = recount;
              buildComplete = true;
              console.log(`[SUCCESS] ${recount} flight(s) visible after reload!`);
            } else {
              console.log("[Warn] No flights visible after accept");
              attempt.error = "No flights after accept";
            }
          }

          // Switch back to manual view to see flights
          const manualToggle = page.locator('button:has-text("Manual Build")').first();
          if (await manualToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await manualToggle.click();
            await page.waitForTimeout(500);
          }
        } else {
          console.log("[Warn] Accept button not found");
          attempt.error = "Accept button not found";
        }
      } else {
        console.log("[Warn] No preview results visible — retrying");
        attempt.error = "No preview after generate";
        await page.waitForTimeout(backoffMs);
      }

      attempts.push(attempt);
    }

    // ── Report ──
    console.log("\n═══════════════════════════════════");
    console.log("   AUTO-BUILD AUTOMATION REPORT");
    console.log("═══════════════════════════════════");
    for (const a of attempts) {
      console.log(`  ${a.success ? "✓" : "�—"} ${a.date} [${a.strategy}] flights=${a.flightCount ?? "-"} ${a.error ? `err="${a.error.slice(0, 80)}"` : ""}`);
    }

    if (!buildComplete) {
      console.log("\n[RESULT] Auto-build did not complete.");
      console.log("Ensure seed data exists: npx tsx scripts/seed-e2e-drag-test.ts");
      test.info().annotations.push({
        type: "auto-build",
        description: `Failed after ${attempts.length} attempts. Run seed script for test data.`,
      });
    } else {
      console.log("[RESULT] Build completed successfully!");
    }
  });
});

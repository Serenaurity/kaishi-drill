import { expect, test, type Page } from "@playwright/test";

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
}

async function criticalViolations(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  return page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: { run(root: Document, options: object): Promise<{ violations: AxeViolation[] }> };
    }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter((violation) => violation.impact === "critical");
  });
}

test("core setup pages have no critical axe violations", async ({ page }) => {
  for (const route of ["/", "/import", "/kana", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await criticalViolations(page), `critical axe violations at ${route}`).toEqual([]);
  }
});

test("honors the operating system reduced-motion preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/kana");
  expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const duration = await page.getByRole("button", { name: "Check all" }).evaluate((button) =>
    getComputedStyle(button).transitionDuration,
  );
  expect(["0.01ms", "0.00001s", "1e-05s"]).toContain(duration);
});

test("keeps dashboard content inside a 375px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kaishi Drill" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await expect(page.locator(".metric-grid article")).toHaveCount(4);
});

import { expect, test } from "@playwright/test";

test("reopens the shell offline after first load", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kaishi Drill" })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole("link", { name: /kana trainer/i })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

import { expect, test } from "@playwright/test";

test("persists daily study limits and restores the recommendation", async ({ page }) => {
  await page.goto("/settings");
  const newLimit = page.getByLabel("New cards per day");
  const reviewLimit = page.getByLabel("Maximum reviews per day");
  await expect(newLimit).toHaveValue("20");
  await expect(reviewLimit).toHaveValue("200");

  await newLimit.fill("12");
  await reviewLimit.fill("150");
  await page.getByRole("button", { name: "Save study limits" }).click();
  await expect(page.getByRole("status")).toContainText("Study limits saved");
  await page.reload();
  await expect(newLimit).toHaveValue("12");
  await expect(reviewLimit).toHaveValue("150");

  await page.getByRole("button", { name: /use recommended limits/i }).click();
  await page.getByRole("button", { name: "Save study limits" }).click();
  await page.reload();
  await expect(newLimit).toHaveValue("20");
  await expect(reviewLimit).toHaveValue("200");
});

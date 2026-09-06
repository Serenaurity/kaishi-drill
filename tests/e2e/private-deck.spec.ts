import { expect, test } from "@playwright/test";

const packagePath = process.env.KAISHI_PRIVATE_PACKAGE;

test("imports the private Kaishi package and preserves its first study position", async ({ page }) => {
  test.skip(!packagePath, "Set KAISHI_PRIVATE_PACKAGE to run the private deck acceptance check");
  test.setTimeout(5 * 60_000);

  await page.goto("/import");
  await page.getByLabel("Anki package").setInputFiles(packagePath!);
  await page.getByRole("button", { name: "Import package" }).click();
  await expect(page.getByRole("heading", { name: "Deck imported" })).toBeVisible({ timeout: 4 * 60_000 });
  await expect(page.getByText(/1,501 notes, 1,382 images and 2,972 audio files/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue from Anki" })).toBeDisabled();

  await page.getByRole("button", { name: "Start Fresh" }).click();
  await expect(page.getByText(/3,000 reading and meaning cards are ready/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Begin vocabulary study" }).click();
  await expect(page.locator("#study-word")).toHaveText("私");
  await expect(page.locator(".prompt-sentence")).not.toBeEmpty();
  await expect(page.getByRole("button", { name: "Play word audio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play sentence audio" })).toBeVisible();
});

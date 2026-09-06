import { expect, test } from "@playwright/test";

test("runs a Kana drill and uses the official local stroke-order asset", async ({ page }) => {
  await page.goto("/kana");
  await page.getByLabel("Hiragana Basic").check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByLabel("Romaji")).toBeFocused();
  await expect(page.locator(".stroke-order img").first()).toBeVisible();

  await page.getByLabel("Romaji").fill("zzz");
  await page.getByLabel("Romaji").press("Enter");
  await expect(page.getByRole("heading", { name: "Incorrect" })).toBeVisible();
  await expect(page.getByText(/accepted answer/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Incorrect" })).toHaveCount(0);
  await expect(page.getByLabel("Romaji")).toBeFocused();
});

test("focus mode starts with the most recent mistake", async ({ page }) => {
  await page.goto("/kana");
  await page.getByLabel("Hiragana Basic").check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const missedKana = (await page.locator("#kana-prompt").textContent())?.trim();
  await page.getByLabel("Romaji").fill("zzz");
  await page.getByRole("button", { name: "Check" }).click();
  const accepted = ((await page.locator(".kana-feedback strong").textContent()) ?? "").split("/")[0]!.trim();

  await page.goto("/kana");
  await page.getByLabel("Hiragana Basic").check();
  await page.getByLabel("Focus recent mistakes").check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator("#kana-prompt")).toHaveText(missedKana ?? "");
  await page.getByLabel("Romaji").fill(accepted);
  await page.getByLabel("Romaji").press("Enter");
  await expect(page.locator("#kana-prompt")).not.toHaveText(missedKana ?? "");
  await expect(page.getByRole("heading", { name: "Correct" })).toHaveCount(0);
  await expect(page.getByLabel("Romaji")).toBeFocused();
  await expect(page.getByLabel("Romaji")).toHaveValue("");
});

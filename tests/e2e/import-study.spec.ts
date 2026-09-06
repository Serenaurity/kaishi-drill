import { expect, test } from "@playwright/test";
import { importDeck, revealCurrentAnswer } from "./helpers";

test("imports, starts fresh, reviews with the keyboard and preserves progress", async ({ page }) => {
  await importDeck(page, "fresh");
  await page.getByRole("link", { name: "Begin vocabulary study" }).click();
  await revealCurrentAnswer(page);
  await page.keyboard.press("3");
  await expect(page.getByLabel("Your answer")).toHaveValue("");

  await page.getByRole("link", { name: "Kaishi Drill" }).click();
  await page.reload();
  const today = page.locator(".metric-grid article").filter({ hasText: "Today" });
  await expect(today.locator("strong")).toContainText("1");
});

test("continue mode carries imported Anki history into the dashboard", async ({ page }) => {
  await importDeck(page, "continue");
  await page.goto("/");
  await expect(page.getByText("1 lifetime vocabulary reviews")).toBeVisible();
});

test("keeps malicious note markup inert and never fetches remote note media", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.invalid")) remoteRequests.push(request.url());
  });
  await importDeck(page, "fresh");
  await page.getByRole("link", { name: "Begin vocabulary study" }).click();

  let sawMarkupNote = false;
  let sawMissingMedia = false;
  for (let index = 0; index < 4; index += 1) {
    const word = (await page.locator("#study-word").textContent())?.trim();
    if (word === "学ぶ") {
      sawMissingMedia = true;
      await expect(page.locator(".prompt-media")).toContainText("Image unavailable");
    }
    const revealed = await revealCurrentAnswer(page);
    if (revealed.word === "語") {
      sawMarkupNote = true;
      const feedback = page.locator(".answer-feedback");
      await expect(feedback).toContainText("safe note");
      await expect(feedback.locator("script, [onclick], [onerror]")).toHaveCount(0);
    }
    await page.keyboard.press("3");
    if (index < 3) {
      await expect(page.getByLabel("Your answer")).toBeEnabled();
      await expect(page.getByLabel("Your answer")).toHaveValue("");
    }
  }

  expect(sawMarkupNote).toBe(true);
  expect(sawMissingMedia).toBe(true);
  expect(remoteRequests).toEqual([]);
});

test("rejects a stale rating from a duplicate tab", async ({ context, page }) => {
  await importDeck(page, "fresh");
  await page.goto("/study");
  const secondPage = await context.newPage();
  await secondPage.goto("/study");
  await expect(secondPage.locator("#study-word")).toHaveText(await page.locator("#study-word").innerText());

  await revealCurrentAnswer(page);
  await revealCurrentAnswer(secondPage);
  await page.getByRole("button", { name: /good/i }).click();
  await secondPage.getByRole("button", { name: /good/i }).click();
  await expect(secondPage.getByRole("alert")).toContainText("changed in another tab");
});

test("exports progress, resets it and restores it against the same deck", async ({ page }) => {
  await importDeck(page, "fresh");
  await page.goto("/study");
  await revealCurrentAnswer(page);
  await page.getByRole("button", { name: /good/i }).click();
  await expect(page.getByLabel("Your answer")).toHaveValue("");

  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress backup" }).first().click();
  const backupPath = await (await downloadPromise).path();
  if (!backupPath) throw new Error("Playwright did not provide the downloaded backup path");

  await page.getByRole("button", { name: "Reset progress", exact: true }).click();
  await page.getByRole("button", { name: "Confirm reset progress" }).click();
  await expect(page.getByRole("status")).toContainText("progress reset complete");
  await page.goto("/study");
  await expect(page.getByRole("heading", { name: "Nothing due right now" })).toBeVisible();

  await importDeck(page, "fresh");
  await page.goto("/settings");
  await page.getByLabel("Progress backup file").setInputFiles(backupPath);
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByRole("status")).toContainText("Progress restored");
  await page.goto("/");
  const today = page.locator(".metric-grid article").filter({ hasText: "Today" });
  await expect(today.locator("strong")).toContainText("1");
});

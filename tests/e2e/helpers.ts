import { expect, type Page } from "@playwright/test";

export const SYNTHETIC_PACKAGE = "test-results/fixtures/synthetic-kaishi.apkg";

export async function importDeck(page: Page, mode: "fresh" | "continue" = "fresh") {
  await page.goto("/import");
  await page.getByLabel("Anki package").setInputFiles(SYNTHETIC_PACKAGE);
  await page.getByRole("button", { name: "Import package" }).click();
  await expect(page.getByRole("heading", { name: "Deck imported" })).toBeVisible();
  await expect(page.getByText(/2 notes, 1 images and 2 audio files/)).toBeVisible();
  await page.getByRole("button", {
    name: mode === "fresh" ? "Start Fresh" : "Continue from Anki",
  }).click();
  await expect(page.getByRole("heading", { name: "Study setup complete" })).toBeVisible();
}

const answers = {
  "語": { Reading: "go", "English meaning": "word" },
  "学ぶ": { Reading: "manabu", "English meaning": "to learn" },
} as const;

export async function revealCurrentAnswer(page: Page) {
  const word = (await page.locator("#study-word").textContent())?.trim() as keyof typeof answers;
  const skill = (await page.locator(".skill-label").textContent())?.trim() as keyof (typeof answers)["語"];
  const answer = answers[word]?.[skill];
  if (!answer) throw new Error(`No synthetic answer for ${String(word)} / ${String(skill)}`);
  await page.getByLabel("Your answer").fill(answer);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByRole("heading", { name: "Correct" })).toBeVisible();
  return { word, skill, answer };
}

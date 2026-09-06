import type { KaishiDb } from "./db";

export async function getActiveDeckId(db: KaishiDb): Promise<string | undefined> {
  const value = (await db.settings.get("activeDeckId"))?.value;
  return typeof value === "string" ? value : undefined;
}

export async function setActiveDeckId(db: KaishiDb, id: string): Promise<void> {
  await db.settings.put({ key: "activeDeckId", value: id });
}

export interface StudyLimits {
  newPerDay: number;
  reviewsPerDay: number;
}

function validLimit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9_999
    ? value
    : fallback;
}

export async function getStudyLimits(db: KaishiDb): Promise<StudyLimits> {
  const [newSetting, reviewSetting] = await Promise.all([
    db.settings.get("dailyNewLimit"),
    db.settings.get("dailyReviewLimit"),
  ]);
  return {
    newPerDay: validLimit(newSetting?.value, 20),
    reviewsPerDay: validLimit(reviewSetting?.value, 200),
  };
}

export async function setStudyLimits(db: KaishiDb, limits: StudyLimits): Promise<void> {
  for (const [label, value] of [
    ["New cards per day", limits.newPerDay],
    ["Maximum reviews per day", limits.reviewsPerDay],
  ] as const) {
    if (!Number.isInteger(value)) throw new Error(`${label} must be a whole number`);
    if (value < 0 || value > 9_999) throw new Error(`${label} must be between 0 and 9999`);
  }
  await db.settings.bulkPut([
    { key: "dailyNewLimit", value: limits.newPerDay },
    { key: "dailyReviewLimit", value: limits.reviewsPerDay },
  ]);
}

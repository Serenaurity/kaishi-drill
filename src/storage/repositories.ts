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
  return typeof value === "number" && Number.isInteger(value) && value >= 0
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

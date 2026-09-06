import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { ReviewEventRecord } from "../../domain/models";
import { createNewSchedule } from "../study/scheduler";
import { deleteKaishiDb, openKaishiDb, type KaishiDb } from "../../storage/db";
import { createDashboardService } from "./dashboard-service";

const NOW = new Date("2026-09-05T12:00:00.000Z");
let db: KaishiDb;
let name: string;

beforeEach(async () => {
  name = `dashboard-${crypto.randomUUID()}`;
  db = openKaishiDb(name);
  await db.decks.add({
    id: "deck", ankiDeckId: "1", name: "Kaishi", packageSha256: "hash",
    importedAt: NOW.toISOString(), importMode: "continue", schemaVersion: 1,
  });
  await db.settings.put({ key: "activeDeckId", value: "deck" });
  await db.notes.add({
    id: "note", deckId: "deck", ankiNoteId: "1", word: "語", reading: "ご",
    meaning: "word", wordFurigana: "", sentence: "", sentenceMeaning: "",
    sentenceFurigana: "", notes: "", pitchAccent: "", pitchAccentNotes: "", frequency: "",
  });
  await db.skillCards.bulkAdd([
    { id: "note:reading", noteId: "note", sourceAnkiCardId: "1", skill: "reading", createdAt: NOW.toISOString() },
    { id: "note:meaning", noteId: "note", sourceAnkiCardId: "1", skill: "meaning", createdAt: NOW.toISOString() },
  ]);
});

afterEach(async () => {
  db.close();
  await deleteKaishiDb(name);
});

function event(id: string, grade: ReviewEventRecord["grade"]): ReviewEventRecord {
  const previousSchedule = createNewSchedule(id.includes("reading") ? "note:reading" : "note:meaning", NOW);
  return {
    id,
    skillCardId: previousSchedule.skillCardId,
    occurredAt: NOW.toISOString(),
    localDate: "2026-09-05",
    timezone: "Asia/Bangkok",
    answer: "answer",
    grade,
    suggestedRating: grade === "correct" ? "good" : "again",
    selectedRating: grade === "correct" ? "good" : "again",
    responseMs: 700,
    previousSchedule,
    nextSchedule: { ...previousSchedule, revision: 1 },
  };
}

it("counts imported Anki reviews once and new skill reviews by event", async () => {
  await db.ankiReviews.add({
    id: "anki-review", deckId: "deck", sourceAnkiCardId: "1",
    occurredAt: "2026-09-01T00:00:00.000Z", rating: 3, reviewType: 1,
    interval: 10, lastInterval: 5, responseMs: 500,
  });
  await db.reviewEvents.bulkAdd([event("review-reading", "correct"), event("review-meaning", "incorrect")]);
  await db.dailyActivity.add({
    id: "local:2026-09-05", profileId: "local", localDate: "2026-09-05",
    vocabularyReviews: 2, kanaAttempts: 0,
  });
  const model = await createDashboardService(db).loadDashboard(NOW, "Asia/Bangkok");
  expect(model.lifetimeVocabularyReviews).toBe(3);
  expect(model.today.vocabularyReviews).toBe(2);
  expect(model.vocabularyAccuracy).toBe(0.5);
});

it("uses the Bangkok local date at the UTC midnight boundary", async () => {
  await db.dailyActivity.add({
    id: "local:2026-09-05", profileId: "local", localDate: "2026-09-05",
    vocabularyReviews: 4, kanaAttempts: 3,
  });
  const model = await createDashboardService(db).loadDashboard(
    new Date("2026-09-04T18:00:00.000Z"),
    "Asia/Bangkok",
  );
  expect(model.today).toEqual({ vocabularyReviews: 4, kanaAttempts: 3 });
});

it("calculates a consecutive shared-activity streak", async () => {
  await db.dailyActivity.bulkAdd(["2026-09-03", "2026-09-04", "2026-09-05"].map((localDate) => ({
    id: `local:${localDate}`, profileId: "local" as const, localDate,
    vocabularyReviews: 0, kanaAttempts: 1,
  })));
  expect((await createDashboardService(db).loadDashboard(NOW, "Asia/Bangkok")).streakDays).toBe(3);
  await db.dailyActivity.delete("local:2026-09-04");
  expect((await createDashboardService(db).loadDashboard(NOW, "Asia/Bangkok")).streakDays).toBe(1);
});

it("returns exactly 26 weeks of bounded activity cells", async () => {
  const activity = (await createDashboardService(db).loadDashboard(NOW, "Asia/Bangkok")).activity;
  expect(activity).toHaveLength(26 * 7);
  expect(activity[0]?.localDate).toBe("2026-03-08");
  expect(activity.at(-1)?.localDate).toBe("2026-09-05");
});

it("reports due reviews, remaining new cards and weak Kana", async () => {
  const due = createNewSchedule("note:reading", NOW);
  const fresh = createNewSchedule("note:meaning", NOW);
  await db.schedules.bulkAdd([
    { ...due, state: "review", stability: 5, difficulty: 5 },
    fresh,
  ]);
  await db.kanaSkills.add({
    id: "hiragana:ぬ", attempts: 4, correct: 1, streak: 0,
    lastSeenAt: NOW.toISOString(), lastWrongAt: NOW.toISOString(), meanResponseMs: 900,
  });
  const model = await createDashboardService(db).loadDashboard(NOW, "Asia/Bangkok");
  expect(model.dueVocabulary).toBe(1);
  expect(model.newVocabularyAvailable).toBe(1);
  expect(model.weakKana[0]?.id).toBe("hiragana:ぬ");
});

it("forecasts the next 14 local days while excluding New and overdue cards", async () => {
  await db.skillCards.bulkAdd([
    { id: "note:extra", noteId: "note", sourceAnkiCardId: "2", skill: "reading", createdAt: NOW.toISOString() },
    { id: "note:overdue", noteId: "note", sourceAnkiCardId: "3", skill: "reading", createdAt: NOW.toISOString() },
  ]);
  await db.schedules.bulkAdd([
    { ...createNewSchedule("note:reading", NOW), state: "review", dueAt: "2026-09-05T17:00:00.000Z", stability: 5, difficulty: 5 },
    { ...createNewSchedule("note:meaning", NOW), dueAt: "2026-09-05T18:00:00.000Z" },
    { ...createNewSchedule("note:extra", NOW), state: "learning", dueAt: "2026-09-19T16:59:59.000Z", stability: 1, difficulty: 5 },
    { ...createNewSchedule("note:overdue", NOW), state: "review", dueAt: "2026-09-04T00:00:00.000Z", stability: 5, difficulty: 5 },
  ]);

  const forecast = (await createDashboardService(db).loadDashboard(NOW, "Asia/Bangkok")).futureDue;
  expect(forecast).toHaveLength(14);
  expect(forecast[0]).toEqual({ localDate: "2026-09-06", reviews: 1 });
  expect(forecast.at(-1)).toEqual({ localDate: "2026-09-19", reviews: 1 });
  expect(forecast.reduce((sum, day) => sum + day.reviews, 0)).toBe(2);
});

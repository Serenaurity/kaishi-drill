import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createNewSchedule } from "../features/study/scheduler";
import { deleteKaishiDb, openKaishiDb, type KaishiDb } from "./db";
import {
  exportProgress,
  resetData,
  restoreProgress,
  validateProgressBackup,
} from "./backup";

const names: string[] = [];
const connections: KaishiDb[] = [];
const NOW = new Date("2026-09-05T12:00:00.000Z");

function database(prefix: string): KaishiDb {
  const name = `${prefix}-${crypto.randomUUID()}`;
  names.push(name);
  const db = openKaishiDb(name);
  connections.push(db);
  return db;
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

async function seedDeck(db: KaishiDb, hash = "package-hash") {
  await db.decks.add({
    id: "deck", ankiDeckId: "1", name: "Kaishi", packageSha256: hash,
    importedAt: NOW.toISOString(), importMode: "continue", schemaVersion: 1,
  });
  await db.imports.add({
    id: "deck", deckId: "deck", packageSha256: hash, packageVersion: 3,
    importedAt: NOW.toISOString(), importMode: "continue", notes: 1, cards: 1,
    images: 1, audio: 1, reviews: 0, warnings: [], schedulingAvailable: true,
  });
  await db.settings.put({ key: "activeDeckId", value: "deck" });
  await db.notes.add({
    id: "note", deckId: "deck", ankiNoteId: "1", word: "語", reading: "ご",
    meaning: "word", wordFurigana: "", sentence: "", sentenceMeaning: "",
    sentenceFurigana: "", notes: "", pitchAccent: "", pitchAccentNotes: "", frequency: "",
  });
  await db.skillCards.add({
    id: "note:reading", noteId: "note", sourceAnkiCardId: "1", skill: "reading", createdAt: NOW.toISOString(),
  });
}

afterEach(async () => {
  connections.splice(0).forEach((db) => db.close());
  await Promise.all(names.splice(0).map((name) => deleteKaishiDb(name)));
});

it("round-trips progress without embedding deck media", async () => {
  const source = database("backup-source");
  await seedDeck(source);
  const schedule = createNewSchedule("note:reading", NOW);
  await source.schedules.add(schedule);
  await source.reviewEvents.add({
    id: "review", skillCardId: schedule.skillCardId, occurredAt: NOW.toISOString(),
    localDate: "2026-09-05", timezone: "Asia/Bangkok", answer: "go", grade: "correct",
    suggestedRating: "good", selectedRating: "good", responseMs: 500,
    previousSchedule: schedule, nextSchedule: { ...schedule, revision: 1 },
  });
  await source.media.add({
    id: "media", deckId: "deck", filename: "word.mp3", mimeType: "audio/mpeg",
    byteLength: 10, blob: new Blob(["data:audio"]),
  });
  await source.kanaSkills.add({ id: "hiragana:ぬ", attempts: 1, correct: 0, streak: 0, meanResponseMs: 800 });
  await source.dailyActivity.add({
    id: "local:2026-09-05", profileId: "local", localDate: "2026-09-05", vocabularyReviews: 1, kanaAttempts: 1,
  });
  const blob = await exportProgress(source);
  const json = await blobText(blob);
  expect(json).not.toContain("data:audio");

  const target = database("backup-target");
  await seedDeck(target);
  await restoreProgress(target, validateProgressBackup(JSON.parse(json)));
  expect(await target.reviewEvents.count()).toBe(1);
  expect(await target.kanaSkills.count()).toBe(1);
  expect(await target.media.count()).toBe(0);
});

it("rejects unknown schema versions and package mismatches", async () => {
  expect(() => validateProgressBackup({ schemaVersion: 2 })).toThrow(/schema version/i);
  const source = database("mismatch-source");
  await seedDeck(source, "source-hash");
  const backup = validateProgressBackup(JSON.parse(await blobText(await exportProgress(source))));
  const target = database("mismatch-target");
  await seedDeck(target, "target-hash");
  await expect(restoreProgress(target, backup)).rejects.toThrow(/package/i);
});

it("rolls back all progress tables when restore fails", async () => {
  const source = database("rollback-source");
  await seedDeck(source);
  await source.schedules.add(createNewSchedule("note:reading", NOW));
  const backup = validateProgressBackup(JSON.parse(await blobText(await exportProgress(source))));
  const target = database("rollback-target");
  await seedDeck(target);
  await target.schedules.add({ ...createNewSchedule("note:reading", NOW), revision: 9 });
  vi.spyOn(target.dailyActivity, "bulkPut").mockRejectedValueOnce(new Error("write failed"));
  await expect(restoreProgress(target, backup)).rejects.toThrow("write failed");
  expect((await target.schedules.get("note:reading"))?.revision).toBe(9);
});

it("resets progress while preserving imported notes and media", async () => {
  const db = database("reset-progress");
  await seedDeck(db);
  await db.schedules.add(createNewSchedule("note:reading", NOW));
  await db.media.add({ id: "media", deckId: "deck", filename: "x.webp", mimeType: "image/webp", byteLength: 1, blob: new Blob(["x"]) });
  await resetData(db, "progress");
  expect(await db.schedules.count()).toBe(0);
  expect(await db.skillCards.count()).toBe(0);
  expect(await db.notes.count()).toBe(1);
  expect(await db.media.count()).toBe(1);
});

it("clears every local table for an all-data reset", async () => {
  const db = database("reset-all");
  await seedDeck(db);
  await resetData(db, "all");
  expect((await Promise.all(db.tables.map((table) => table.count()))).every((count) => count === 0)).toBe(true);
});

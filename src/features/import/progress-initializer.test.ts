import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type {
  DeckRecord,
  ImportedAnkiCardRecord,
  ImportedAnkiReviewRecord,
  ImportRecord,
  NoteRecord,
} from "../../domain/models";
import { deleteKaishiDb, openKaishiDb, type KaishiDb } from "../../storage/db";
import { initializeProgress } from "./progress-initializer";

const NOW = new Date("2026-09-05T00:00:00.000Z");
const DECK_ID = "deck";
const opened: Array<{ name: string; db: KaishiDb }> = [];

function note(id: string): NoteRecord {
  return {
    id: `${DECK_ID}:${id}`,
    deckId: DECK_ID,
    ankiNoteId: id,
    word: `word-${id}`,
    reading: "ことば",
    meaning: "word",
    wordFurigana: "",
    sentence: "言葉です。",
    sentenceMeaning: "It is a word.",
    sentenceFurigana: "",
    notes: "",
    pitchAccent: "",
    pitchAccentNotes: "",
    frequency: id,
  };
}

function card(noteId: string, reviewed = false): ImportedAnkiCardRecord {
  return {
    id: `${DECK_ID}:card-${noteId}`,
    deckId: DECK_ID,
    noteId: `${DECK_ID}:${noteId}`,
    sourceAnkiCardId: `card-${noteId}`,
    state: reviewed ? 2 : 0,
    queue: reviewed ? 2 : 0,
    due: 0,
    interval: reviewed ? 12 : 0,
    reps: reviewed ? 4 : 0,
    lapses: reviewed ? 1 : 0,
    stability: reviewed ? 12.5 : undefined,
    difficulty: reviewed ? 5.4 : undefined,
    lastReviewAt: reviewed ? "2026-08-28T00:00:00.000Z" : undefined,
  };
}

async function setup(options: { schedulingAvailable: boolean; notes?: number }) {
  const name = `progress-${crypto.randomUUID()}`;
  const db = openKaishiDb(name);
  opened.push({ name, db });
  await db.open();
  const deck: DeckRecord = {
    id: DECK_ID,
    ankiDeckId: "1",
    name: "Kaishi 1.5k",
    packageSha256: "hash",
    importedAt: NOW.toISOString(),
    importMode: "fresh",
    schemaVersion: 1,
  };
  const imported: ImportRecord = {
    id: DECK_ID,
    deckId: DECK_ID,
    packageSha256: "hash",
    packageVersion: 3,
    importedAt: NOW.toISOString(),
    importMode: "fresh",
    notes: options.notes ?? 1,
    cards: options.notes ?? 1,
    images: 0,
    audio: 0,
    reviews: options.schedulingAvailable ? 1 : 0,
    warnings: [],
    schedulingAvailable: options.schedulingAvailable,
  };
  const notes = Array.from({ length: options.notes ?? 1 }, (_, index) => note(`${index + 1}`));
  const cards = notes.map((value, index) => card(value.ankiNoteId, options.schedulingAvailable && index === 0));
  await db.decks.put(deck);
  await db.imports.put(imported);
  await db.notes.bulkPut(notes);
  await db.ankiCards.bulkPut(cards);
  if (options.schedulingAvailable) {
    const review: ImportedAnkiReviewRecord = {
      id: "review-1",
      deckId: DECK_ID,
      sourceAnkiCardId: cards[0]!.sourceAnkiCardId,
      occurredAt: "2026-08-28T00:00:00.000Z",
      rating: 3,
      reviewType: 1,
      interval: 12,
      lastInterval: 5,
      responseMs: 900,
    };
    await db.ankiReviews.put(review);
  }
  return db;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map(async ({ name, db }) => {
    db.close();
    await deleteKaishiDb(name);
  }));
});

describe("progress initialization", () => {
  it("creates two new skill schedules per note in Fresh mode", async () => {
    const db = await setup({ schedulingAvailable: true, notes: 2 });
    const report = await initializeProgress({ deckId: DECK_ID, mode: "fresh", now: NOW }, db);

    expect(report.skillCardsCreated).toBe(4);
    expect(await db.schedules.where("state").equals("new").count()).toBe(4);
    expect(await db.ankiReviews.count()).toBe(0);
  });

  it("seeds both skills and stores imported reviews once in Continue mode", async () => {
    const db = await setup({ schedulingAvailable: true });
    const report = await initializeProgress({ deckId: DECK_ID, mode: "continue", now: NOW }, db);

    expect(report.seededSchedules).toBe(2);
    expect((await db.schedules.toArray()).every((value) => value.seededFromAnki)).toBe(true);
    expect(await db.ankiReviews.count()).toBe(1);
    expect((await db.decks.get(DECK_ID))?.importMode).toBe("continue");
  });

  it("rejects Continue when scheduling information is absent", async () => {
    const db = await setup({ schedulingAvailable: false });
    await expect(
      initializeProgress({ deckId: DECK_ID, mode: "continue", now: NOW }, db),
    ).rejects.toThrow(/scheduling information/i);
  });

  it("falls back to a New schedule when imported memory state is invalid", async () => {
    const db = await setup({ schedulingAvailable: true });
    await db.ankiCards.update(`${DECK_ID}:card-1`, { stability: -1, difficulty: 99 });
    const report = await initializeProgress({ deckId: DECK_ID, mode: "continue", now: NOW }, db);

    expect(report.warnings).toEqual([expect.stringMatching(/invalid memory state/i)]);
    expect((await db.schedules.toArray()).every((value) => value.state === "new")).toBe(true);
  });

  it("is idempotent when the same mode is initialized again", async () => {
    const db = await setup({ schedulingAvailable: true });
    await initializeProgress({ deckId: DECK_ID, mode: "continue", now: NOW }, db);
    const second = await initializeProgress({ deckId: DECK_ID, mode: "continue", now: NOW }, db);

    expect(await db.skillCards.count()).toBe(2);
    expect(await db.schedules.count()).toBe(2);
    expect(await db.ankiReviews.count()).toBe(1);
    expect(second.skillCardsCreated).toBe(0);
  });
});

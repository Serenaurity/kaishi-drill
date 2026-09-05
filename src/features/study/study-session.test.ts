import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { DeckRecord, NoteRecord, SkillCardRecord } from "../../domain/models";
import { deleteKaishiDb, openKaishiDb, type KaishiDb } from "../../storage/db";
import { setActiveDeckId } from "../../storage/repositories";
import { createNewSchedule, createScheduler, DEFAULT_SCHEDULER_CONFIG } from "./scheduler";
import { createStudySession, ScheduleConflictError } from "./study-session";

const NOW = new Date("2026-09-05T00:00:00.000Z");
const DECK_ID = "deck";
const NOTE_ID = "deck:note";
const CARD_ID = "deck:note:reading";
const opened: Array<{ name: string; db: KaishiDb }> = [];

async function setup() {
  const name = `session-${crypto.randomUUID()}`;
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
  const note: NoteRecord = {
    id: NOTE_ID,
    deckId: DECK_ID,
    ankiNoteId: "note",
    word: "学校",
    reading: "がっこう",
    meaning: "school",
    wordFurigana: "学校[がっこう]",
    sentence: "学校へ行く。",
    sentenceMeaning: "Go to school.",
    sentenceFurigana: "",
    notes: "",
    pitchAccent: "",
    pitchAccentNotes: "",
    frequency: "100",
  };
  const card: SkillCardRecord = {
    id: CARD_ID,
    noteId: NOTE_ID,
    sourceAnkiCardId: "card",
    skill: "reading",
    createdAt: NOW.toISOString(),
  };
  await db.decks.put(deck);
  await db.notes.put(note);
  await db.skillCards.put(card);
  await db.schedules.put(createNewSchedule(CARD_ID, NOW));
  await setActiveDeckId(db, DECK_ID);
  const scheduler = createScheduler({ ...DEFAULT_SCHEDULER_CONFIG, enableFuzz: false });
  return {
    db,
    deps: {
      db,
      scheduler,
      now: () => new Date(NOW),
      timezone: () => "Asia/Bangkok",
    },
  };
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map(async ({ name, db }) => {
    db.close();
    await deleteKaishiDb(name);
  }));
});

describe("study session", () => {
  it("writes event, schedule and daily count in one transaction", async () => {
    const { db, deps } = await setup();
    const session = createStudySession(deps);
    await session.loadNext();
    session.submitAnswer("gakkou", 1_400);
    await session.confirmRating("good");

    expect(await db.reviewEvents.count()).toBe(1);
    expect((await db.schedules.get(CARD_ID))?.revision).toBe(1);
    expect((await db.dailyActivity.get("local:2026-09-05"))?.vocabularyReviews).toBe(1);
  });

  it("rejects rating before reveal and a second confirmation", async () => {
    const { deps } = await setup();
    const session = createStudySession(deps);
    await session.loadNext();
    await expect(session.confirmRating("good")).rejects.toThrow(/answer before rating/i);
    session.submitAnswer("gakkou", 500);
    await session.confirmRating("good");
    await expect(session.confirmRating("good")).rejects.toThrow(/no revealed answer/i);
  });

  it("detects a stale schedule revision without writing an event", async () => {
    const { db, deps } = await setup();
    const session = createStudySession(deps);
    await session.loadNext();
    session.submitAnswer("gakkou", 500);
    await db.schedules.update(CARD_ID, { revision: 9 });

    await expect(session.confirmRating("good")).rejects.toBeInstanceOf(ScheduleConflictError);
    expect(await db.reviewEvents.count()).toBe(0);
  });

  it("rolls back every write when the answer transaction fails", async () => {
    const { db, deps } = await setup();
    db.reviewEvents.hook("creating", () => {
      throw new Error("simulated storage failure");
    });
    const session = createStudySession(deps);
    await session.loadNext();
    session.submitAnswer("gakkou", 500);

    await expect(session.confirmRating("good")).rejects.toThrow(/simulated storage failure/i);
    expect((await db.schedules.get(CARD_ID))?.revision).toBe(0);
    expect(await db.reviewEvents.count()).toBe(0);
    expect(await db.dailyActivity.count()).toBe(0);
  });

  it("shows the same due card after refresh before rating confirmation", async () => {
    const { db, deps } = await setup();
    const first = createStudySession(deps);
    expect((await first.loadNext())?.card.id).toBe(CARD_ID);
    first.submitAnswer("gakkou", 500);

    const refreshed = createStudySession({ ...deps, db });
    expect((await refreshed.loadNext())?.card.id).toBe(CARD_ID);
    expect(await db.reviewEvents.count()).toBe(0);
  });
});

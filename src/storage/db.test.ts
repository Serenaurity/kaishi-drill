import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { deleteKaishiDb, openKaishiDb } from "./db";

it("opens schema version one with every required store", async () => {
  const name = `kaishi-test-${crypto.randomUUID()}`;
  const db = openKaishiDb(name);
  await db.open();
  expect(db.tables.map((table) => table.name).sort()).toEqual([
    "ankiCards",
    "ankiReviews",
    "dailyActivity",
    "decks",
    "imports",
    "kanaSkills",
    "media",
    "notes",
    "reviewEvents",
    "schedules",
    "settings",
    "skillCards",
  ]);
  db.close();
  await deleteKaishiDb(name);
});

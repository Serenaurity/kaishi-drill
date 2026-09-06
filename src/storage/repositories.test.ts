import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { deleteKaishiDb, openKaishiDb, type KaishiDb } from "./db";
import { getStudyLimits, setStudyLimits } from "./repositories";

let db: KaishiDb;
let name: string;

beforeEach(() => {
  name = `repositories-${crypto.randomUUID()}`;
  db = openKaishiDb(name);
});

afterEach(async () => {
  db.close();
  await deleteKaishiDb(name);
});

it("uses the Anki-compatible limits by default and persists user changes", async () => {
  await expect(getStudyLimits(db)).resolves.toEqual({ newPerDay: 20, reviewsPerDay: 200 });
  await setStudyLimits(db, { newPerDay: 40, reviewsPerDay: 300 });
  await expect(getStudyLimits(db)).resolves.toEqual({ newPerDay: 40, reviewsPerDay: 300 });
});

it("rejects invalid limits before writing either setting", async () => {
  await expect(setStudyLimits(db, { newPerDay: 12.5, reviewsPerDay: 300 }))
    .rejects.toThrow(/whole number/i);
  await expect(setStudyLimits(db, { newPerDay: 20, reviewsPerDay: 10_000 }))
    .rejects.toThrow(/0 and 9999/i);
  await expect(getStudyLimits(db)).resolves.toEqual({ newPerDay: 20, reviewsPerDay: 200 });
});

import "fake-indexeddb/auto";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildModernPackage } from "../../../tests/fixtures/build-modern-package";
import { buildSyntheticCollection } from "../../../tests/fixtures/synthetic-collection";
import { deleteKaishiDb, openKaishiDb, type KaishiDb } from "../../storage/db";
import { getActiveDeckId, importPackage } from "./import-service";
import type { ImportDependencies, ImportProgress } from "./types";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const databases: Array<{ db: KaishiDb; name: string }> = [];

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => `${process.cwd()}${wasmUrl}` });
});

afterEach(async () => {
  while (databases.length > 0) {
    const item = databases.pop()!;
    item.db.close();
    await deleteKaishiDb(item.name);
  }
});

function openTestDb(): KaishiDb {
  const name = `import-${crypto.randomUUID()}`;
  const db = openKaishiDb(name);
  databases.push({ db, name });
  return db;
}

async function digest(algorithm: "SHA-1" | "SHA-256", bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(algorithm, bytes.slice().buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function packageFixture(includeSentenceAudio = true): Promise<Blob> {
  const wordImage = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]);
  const wordAudio = new Uint8Array([0x49, 0x44, 0x33, 1]);
  const sentenceAudio = new Uint8Array([0x49, 0x44, 0x33, 2]);
  const media = [
    { name: "word.webp", bytes: wordImage, sha1: new Uint8Array(await crypto.subtle.digest("SHA-1", wordImage)) },
    { name: "word.mp3", bytes: wordAudio, sha1: new Uint8Array(await crypto.subtle.digest("SHA-1", wordAudio)) },
  ];
  if (includeSentenceAudio) {
    media.push({
      name: "sentence.mp3",
      bytes: sentenceAudio,
      sha1: new Uint8Array(await crypto.subtle.digest("SHA-1", sentenceAudio)),
    });
  }
  return buildModernPackage({ collectionBytes: buildSyntheticCollection(SQL), media });
}

function dependencies(db: KaishiDb, progress: ImportProgress[] = []): ImportDependencies {
  return {
    db,
    now: () => new Date("2026-09-05T00:00:00.000Z"),
    sha256: (bytes) => digest("SHA-256", bytes),
    sha1: (bytes) => digest("SHA-1", bytes),
    progress: (event) => progress.push(event),
  };
}

describe("atomic package import", () => {
  it("writes normalized deck records, source scheduling and media in one import", async () => {
    const db = openTestDb();
    const progress: ImportProgress[] = [];
    const report = await importPackage(
      { source: await packageFixture(), filename: "synthetic.apkg" },
      dependencies(db, progress),
    );

    expect(report).toMatchObject({
      notes: 2,
      cards: 2,
      images: 1,
      audio: 2,
      reviews: 1,
      reviewedCards: 1,
      schedulingAvailable: true,
    });
    expect(await getActiveDeckId(db)).toBe(report.deckId);
    expect(await db.notes.count()).toBe(2);
    expect(await db.ankiCards.count()).toBe(2);
    expect(await db.ankiReviews.count()).toBe(1);
    expect(await db.media.count()).toBe(3);
    const firstNote = await db.notes.where("ankiNoteId").equals("100").first();
    expect(firstNote?.pictureMediaId).toBeDefined();
    expect(firstNote).not.toHaveProperty("pictureFilename");
    expect(progress.map((event) => event.stage)).toEqual(
      expect.arrayContaining([
        "validate-package",
        "read-collection",
        "map-notes",
        "decode-media",
        "write-database",
        "complete",
      ]),
    );
  });

  it("keeps the previous active deck and rolls back all incoming data when a media write fails", async () => {
    const db = openTestDb();
    await db.settings.put({ key: "activeDeckId", value: "existing" });
    db.media.hook("creating", (_primaryKey, record) => {
      if (record.filename === "sentence.mp3") {
        throw new Error("sentence.mp3 write failed");
      }
    });

    await expect(
      importPackage(
        { source: await packageFixture(), filename: "synthetic.apkg" },
        dependencies(db),
      ),
    ).rejects.toThrow(/sentence\.mp3 write failed/i);
    expect(await getActiveDeckId(db)).toBe("existing");
    expect(await db.decks.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.ankiCards.count()).toBe(0);
    expect(await db.media.count()).toBe(0);
    expect(await db.ankiReviews.count()).toBe(0);
    expect(await db.imports.count()).toBe(0);
  });

  it("deduplicates optional missing-media warnings", async () => {
    const db = openTestDb();
    const report = await importPackage(
      { source: await packageFixture(false), filename: "synthetic.colpkg" },
      dependencies(db),
    );
    expect(report.warnings).toEqual(["Missing referenced media: sentence.mp3"]);
  });

  it("does not write when cancellation was already requested", async () => {
    const db = openTestDb();
    const controller = new AbortController();
    controller.abort();
    await expect(
      importPackage(
        { source: await packageFixture(), filename: "synthetic.apkg" },
        { ...dependencies(db), signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await db.decks.count()).toBe(0);
  });
});

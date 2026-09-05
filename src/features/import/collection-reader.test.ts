import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSyntheticCollection } from "../../../tests/fixtures/synthetic-collection";
import { parseAnkiCardData } from "./anki-scheduling";
import { readKaishiCollection } from "./collection-reader";
import { extractMediaReferences, mapKaishiNote } from "./kaishi-mapping";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => `${process.cwd()}${wasmUrl}` });
});

describe("Kaishi collection reader", () => {
  it("maps only Kaishi notes, cards, scheduling state and review history", async () => {
    const result = await readKaishiCollection(buildSyntheticCollection(SQL));

    expect(result.notes).toHaveLength(2);
    expect(result.cards).toHaveLength(2);
    expect(result.reviews).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      word: "語",
      reading: "ご",
      meaning: "word; language",
      pictureFilename: "word.webp",
      wordAudioFilename: "word.mp3",
      sentenceAudioFilename: "sentence.mp3",
    });
    expect(result.cards[0]).toMatchObject({
      id: "200",
      memoryState: { stability: 12.5, difficulty: 6.2 },
      lastReviewAt: "2023-11-14T22:13:20.000Z",
    });
    expect(result.notes.some((note) => note.word.includes("foreign"))).toBe(false);
    expect(result.reviews.some((review) => review.sourceAnkiCardId === "999")).toBe(false);
  });

  it("does not fall back to an unrelated deck or notetype", async () => {
    await expect(
      readKaishiCollection(
        buildSyntheticCollection(SQL, { deckName: "Vocabulary", notetypeName: "Basic" }),
      ),
    ).rejects.toThrow(/no kaishi deck/i);
  });

  it("rejects a Kaishi notetype that lacks a required field", async () => {
    await expect(
      readKaishiCollection(buildSyntheticCollection(SQL, { missingField: "Word Meaning" })),
    ).rejects.toThrow(/missing required field word meaning/i);
  });

  it("rejects duplicate note and card identifiers", async () => {
    await expect(
      readKaishiCollection(buildSyntheticCollection(SQL, { duplicateNoteId: true })),
    ).rejects.toThrow(/duplicate note id/i);
    await expect(
      readKaishiCollection(buildSyntheticCollection(SQL, { duplicateCardId: true })),
    ).rejects.toThrow(/duplicate card id/i);
  });

  it("treats malformed scheduling JSON and remote media as unavailable", async () => {
    const result = await readKaishiCollection(
      buildSyntheticCollection(SQL, { malformedCardData: true }),
    );
    expect(result.cards[0]?.memoryState).toBeUndefined();
    expect(result.notes[1]?.pictureFilename).toBeUndefined();
    expect(result.notes[1]?.wordAudioFilename).toBeUndefined();
  });

  it("sanitizes unsafe markup and keeps the approved display tags", () => {
    const note = mapKaishiNote(
      {
        id: "1",
        mid: "2",
        tags: "",
        flds:
          '語\x1fご\x1fword; language\x1f\x1f\x1fSentence\x1f\x1f\x1f\x1f<strong onclick="bad()">safe</strong><script>x</script>',
      },
      [
        { ord: 0, name: "Word" },
        { ord: 1, name: "Word Reading" },
        { ord: 2, name: "Word Meaning" },
        { ord: 5, name: "Sentence" },
        { ord: 9, name: "Notes" },
      ],
    );
    expect(note.notes).toBe("<strong>safe</strong>");
    expect(note.notes).not.toMatch(/onclick|script/i);
    expect(parseAnkiCardData('{"s":12.5,"d":6.2}')).toEqual({
      stability: 12.5,
      difficulty: 6.2,
    });
    expect(
      extractMediaReferences({ Picture: '<img src="https://bad.invalid/image.webp">' })
        .pictureFilename,
    ).toBeUndefined();
  });
});

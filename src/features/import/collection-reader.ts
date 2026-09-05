import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { parseAnkiCardData } from "./anki-scheduling";
import { mapKaishiNote } from "./kaishi-mapping";
import type {
  AnkiNoteRow,
  FieldDefinition,
  ImportedAnkiCard,
  ImportedAnkiReview,
  NormalizedCollection,
} from "./types";

type Row = Record<string, unknown>;

const REQUIRED_FIELDS = ["Word", "Word Reading", "Word Meaning", "Sentence"] as const;
const normalizeName = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en");

let sqlPromise: ReturnType<typeof initSqlJs> | undefined;

function locateSqlWasm(): string {
  if (typeof process !== "undefined" && process.versions?.node && wasmUrl.startsWith("/")) {
    return `${process.cwd()}${wasmUrl}`;
  }
  return wasmUrl;
}

function loadSqlJs() {
  sqlPromise ??= initSqlJs({ locateFile: locateSqlWasm });
  return sqlPromise;
}

function queryRows(
  db: { exec(query: string): Array<{ columns: string[]; values: unknown[][] }> },
  query: string,
): Row[] {
  const result = db.exec(query)[0];
  return result
    ? result.values.map((values) =>
        Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
      )
    : [];
}

function safeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid ${label} in Anki collection`);
  }
  return number;
}

function safeNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${label} in Anki collection`);
  }
  return number;
}

function selectKaishiRow(rows: Row[], kind: "deck" | "notetype"): Row {
  const namedRows = rows.filter((row) => typeof row.name === "string");
  const exact = namedRows.find((row) => normalizeName(String(row.name)) === "kaishi 1.5k");
  if (exact) {
    return exact;
  }

  const candidates = namedRows.filter((row) => {
    const name = normalizeName(String(row.name));
    return name.includes("kaishi") && (kind === "notetype" || !name.includes("::"));
  });
  if (candidates.length === 0) {
    throw new Error(`No Kaishi ${kind} found`);
  }
  if (candidates.length > 1) {
    throw new Error(`Multiple Kaishi ${kind}s found; rename the intended Kaishi 1.5k ${kind}`);
  }
  return candidates[0]!;
}

function toIsoTimestamp(value: unknown, label: string): string {
  const milliseconds = safeInteger(value, label);
  const timestamp = new Date(milliseconds);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`Invalid ${label} in Anki collection`);
  }
  return timestamp.toISOString();
}

export async function readKaishiCollection(bytes: Uint8Array): Promise<NormalizedCollection> {
  const SQL = await loadSqlJs();
  let db: InstanceType<typeof SQL.Database>;
  try {
    db = new SQL.Database(bytes);
  } catch (error) {
    throw new Error("The Anki collection database could not be opened", { cause: error });
  }

  try {
    const deckRows = queryRows(db, "select id, name from decks");
    const notetypeRows = queryRows(db, "select id, name from notetypes");
    const rootDeck = selectKaishiRow(deckRows, "deck");
    const notetype = selectKaishiRow(notetypeRows, "notetype");
    const rootDeckName = normalizeName(String(rootDeck.name));
    const deckIds = deckRows
      .filter((row) => {
        if (typeof row.name !== "string") {
          return false;
        }
        const name = normalizeName(row.name);
        return name === rootDeckName || name.startsWith(`${rootDeckName}::`);
      })
      .map((row) => safeInteger(row.id, "deck ID"));
    const notetypeId = safeInteger(notetype.id, "notetype ID");
    const deckIdList = deckIds.join(",");

    const fields = queryRows(
      db,
      `select ord, name from fields where ntid=${notetypeId}`,
    ).map(
      (row) =>
        ({
          ord: safeInteger(row.ord, "field ordinal"),
          name: String(row.name),
        }) satisfies FieldDefinition,
    );
    const fieldNames = new Set(fields.map((field) => field.name));
    for (const field of REQUIRED_FIELDS) {
      if (!fieldNames.has(field)) {
        throw new Error(`Kaishi notetype is missing required field ${field}`);
      }
    }

    const noteRows = queryRows(
      db,
      `select n.id, n.mid, n.flds, n.tags
       from notes n
       where n.mid=${notetypeId}
         and exists (
           select 1 from cards c where c.nid=n.id and c.did in (${deckIdList})
         )`,
    );
    const noteIds = new Set<string>();
    const notes = noteRows.map((row) => {
      const note = {
        id: String(row.id),
        mid: String(row.mid),
        flds: String(row.flds),
        tags: String(row.tags),
      } satisfies AnkiNoteRow;
      if (noteIds.has(note.id)) {
        throw new Error(`Duplicate note ID: ${note.id}`);
      }
      noteIds.add(note.id);
      return mapKaishiNote(note, fields);
    });
    if (notes.length === 0) {
      throw new Error("The Kaishi deck contains no matching notes");
    }

    const cardRows = queryRows(
      db,
      `select c.id, c.nid, c.queue, c.type, c.due, c.ivl, c.reps, c.lapses, c.data
       from cards c
       join notes n on n.id=c.nid
       where n.mid=${notetypeId} and c.did in (${deckIdList})`,
    );
    const cardIds = new Set<string>();
    const cards: ImportedAnkiCard[] = cardRows.map((row) => {
      const id = String(row.id);
      if (cardIds.has(id)) {
        throw new Error(`Duplicate card ID: ${id}`);
      }
      cardIds.add(id);
      return {
        id,
        noteId: String(row.nid),
        state: safeInteger(row.type, "card state"),
        queue: safeInteger(row.queue, "card queue"),
        due: safeNumber(row.due, "card due value"),
        interval: safeNumber(row.ivl, "card interval"),
        reps: safeInteger(row.reps, "card repetitions"),
        lapses: safeInteger(row.lapses, "card lapses"),
        memoryState: parseAnkiCardData(String(row.data ?? "")),
      };
    });

    const reviewRows = queryRows(
      db,
      `select r.id, r.cid, r.ease, r.type, r.ivl, r.lastIvl, r.time
       from revlog r
       join cards c on c.id=r.cid
       join notes n on n.id=c.nid
       where n.mid=${notetypeId} and c.did in (${deckIdList})`,
    );
    const reviewIds = new Set<string>();
    const reviews = reviewRows.map((row) => {
      const id = String(row.id);
      if (reviewIds.has(id)) {
        throw new Error(`Duplicate review ID: ${id}`);
      }
      reviewIds.add(id);
      return {
        id,
        sourceAnkiCardId: String(row.cid),
        occurredAt: toIsoTimestamp(row.id, "review timestamp"),
        rating: safeInteger(row.ease, "review rating"),
        reviewType: safeInteger(row.type, "review type"),
        interval: safeNumber(row.ivl, "review interval"),
        lastInterval: safeNumber(row.lastIvl, "previous review interval"),
        responseMs: safeNumber(row.time, "review response time"),
      } satisfies ImportedAnkiReview;
    });

    const lastReviewByCard = new Map<string, string>();
    for (const review of reviews) {
      const previous = lastReviewByCard.get(review.sourceAnkiCardId);
      if (!previous || previous < review.occurredAt) {
        lastReviewByCard.set(review.sourceAnkiCardId, review.occurredAt);
      }
    }
    for (const card of cards) {
      card.lastReviewAt = lastReviewByCard.get(card.id);
    }

    return {
      deck: {
        ankiDeckId: String(rootDeck.id),
        name: String(rootDeck.name),
      },
      notes,
      cards,
      reviews,
    };
  } finally {
    db.close();
  }
}

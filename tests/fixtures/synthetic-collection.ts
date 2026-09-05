export interface SyntheticCollectionOptions {
  deckName?: string;
  notetypeName?: string;
  missingField?: string;
  duplicateNoteId?: boolean;
  duplicateCardId?: boolean;
  malformedCardData?: boolean;
}

interface SyntheticDatabase {
  run(sql: string, params?: Array<number | string | Uint8Array | null>): void;
  export(): Uint8Array;
  close(): void;
}

interface SyntheticSqlJs {
  Database: new () => SyntheticDatabase;
}

const FIELD_NAMES = [
  "Word",
  "Word Reading",
  "Word Meaning",
  "Word Furigana",
  "Word Audio",
  "Sentence",
  "Sentence Meaning",
  "Sentence Furigana",
  "Sentence Audio",
  "Notes",
  "Pitch Accent",
  "Pitch Accent Notes",
  "Frequency",
  "Picture",
] as const;

function joinedFields(values: Partial<Record<(typeof FIELD_NAMES)[number], string>>): string {
  return FIELD_NAMES.map((name) => values[name] ?? "").join("\x1f");
}

export function buildSyntheticCollection(
  SQL: SyntheticSqlJs,
  options: SyntheticCollectionOptions = {},
): Uint8Array {
  const db = new SQL.Database();
  try {
    db.run("create table decks (id integer, name text)");
    db.run("create table notetypes (id integer, name text)");
    db.run("create table fields (ntid integer, ord integer, name text)");
    db.run("create table notes (id integer, mid integer, flds text, tags text)");
    db.run(
      "create table cards (id integer, nid integer, did integer, queue integer, type integer, due integer, ivl integer, reps integer, lapses integer, data text)",
    );
    db.run(
      "create table revlog (id integer, cid integer, ease integer, type integer, ivl integer, lastIvl integer, time integer)",
    );

    db.run("insert into decks values (?, ?), (?, ?), (?, ?), (?, ?)", [
      1,
      "Default",
      42,
      options.deckName ?? "KaIsHi 1.5K",
      43,
      `${options.deckName ?? "KaIsHi 1.5K"}::Core`,
      99,
      "Unrelated deck",
    ]);
    db.run("insert into notetypes values (?, ?), (?, ?)", [
      7,
      options.notetypeName ?? "KAISHI 1.5k",
      8,
      "Basic",
    ]);

    FIELD_NAMES.forEach((name, ordinal) => {
      if (name !== options.missingField) {
        db.run("insert into fields values (?, ?, ?)", [7, ordinal, name]);
      }
    });
    db.run("insert into fields values (8, 0, 'Front'), (8, 1, 'Back')");

    const firstNote = joinedFields({
      Word: "語",
      "Word Reading": "ご",
      "Word Meaning": 'word; language<script>alert("x")</script>',
      "Word Furigana": "語[ご]",
      "Word Audio": "[sound:word.mp3]",
      Sentence: "Sentence",
      "Sentence Meaning": "Example meaning",
      "Sentence Furigana": "Sentence furigana",
      "Sentence Audio": "[sound:sentence.mp3]",
      Notes: '<strong onclick="bad()">safe note</strong>',
      Frequency: "1",
      Picture: '<img src="word.webp" onerror="bad()">',
    });
    const secondNote = joinedFields({
      Word: "学ぶ",
      "Word Reading": "まなぶ",
      "Word Meaning": "to learn",
      Sentence: "Learn every day",
      Picture: '<img src="https://example.invalid/remote.webp">',
    });
    db.run("insert into notes values (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)", [
      100,
      7,
      firstNote,
      " kaishi ",
      101,
      7,
      secondNote,
      "",
      900,
      8,
      "foreign front\x1fforeign back",
      "",
    ]);
    if (options.duplicateNoteId) {
      db.run("insert into notes values (?, ?, ?, ?)", [100, 7, firstNote, ""]);
    }

    db.run("insert into cards values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      200,
      100,
      42,
      2,
      2,
      20,
      12,
      5,
      1,
      options.malformedCardData ? "{" : '{"s":12.5,"d":6.2,"dr":0.91,"pos":0}',
    ]);
    db.run("insert into cards values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      201,
      101,
      43,
      0,
      0,
      30,
      0,
      0,
      0,
      "{}",
    ]);
    db.run("insert into cards values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      999,
      900,
      99,
      2,
      2,
      1,
      50,
      20,
      2,
      '{"s":50,"d":5}',
    ]);
    if (options.duplicateCardId) {
      db.run("insert into cards values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        200,
        100,
        42,
        2,
        2,
        20,
        12,
        5,
        1,
        "{}",
      ]);
    }

    db.run("insert into revlog values (?, ?, ?, ?, ?, ?, ?)", [
      1_700_000_000_000,
      200,
      3,
      1,
      12,
      5,
      850,
    ]);
    db.run("insert into revlog values (?, ?, ?, ?, ?, ?, ?)", [
      1_700_000_000_001,
      999,
      1,
      1,
      50,
      10,
      900,
    ]);

    return db.export();
  } finally {
    db.close();
  }
}

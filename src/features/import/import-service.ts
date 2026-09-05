import type {
  DeckRecord,
  ImportedAnkiCardRecord,
  ImportedAnkiReviewRecord,
  MediaRecord,
  NoteRecord,
} from "../../domain/models";
import { getActiveDeckId, setActiveDeckId } from "../../storage/repositories";
import { readKaishiCollection } from "./collection-reader";
import { readPackage } from "./package-reader";
import type {
  ImportDependencies,
  ImportProgress,
  ImportReport,
  ImportRequest,
  NormalizedNote,
} from "./types";

const MEDIA_PROGRESS_BATCH = 100;
const MEDIA_PROGRESS_INTERVAL_MS = 250;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Import cancelled", "AbortError");
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extensionMime(filename: string): string | undefined {
  const position = filename.lastIndexOf(".");
  return position >= 0 ? MIME_BY_EXTENSION[filename.slice(position).toLowerCase()] : undefined;
}

function signatureMime(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE"
  ) {
    return "audio/wav";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    String.fromCharCode(...bytes.subarray(1, 4)) === "PNG"
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === "OggS") {
    return "audio/ogg";
  }
  if (
    bytes.length >= 3 &&
    String.fromCharCode(...bytes.subarray(0, 3)) === "ID3"
  ) {
    return "audio/mpeg";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  return undefined;
}

function resolveMimeType(filename: string, bytes: Uint8Array, warnings: Set<string>): string {
  const fromExtension = extensionMime(filename);
  const fromSignature = signatureMime(bytes);
  if (fromSignature && fromExtension && fromSignature !== fromExtension) {
    warnings.add(`Media signature differs from its extension: ${filename}`);
  }
  if (!fromSignature && !fromExtension) {
    warnings.add(`Unsupported media type retained but not displayed: ${filename}`);
  }
  return fromSignature ?? fromExtension ?? "application/octet-stream";
}

function mapNote(
  deckId: string,
  note: NormalizedNote,
  mediaByName: Map<string, string>,
): NoteRecord {
  return {
    id: `${deckId}:${note.ankiNoteId}`,
    deckId,
    ankiNoteId: note.ankiNoteId,
    word: note.word,
    reading: note.reading,
    meaning: note.meaning,
    wordFurigana: note.wordFurigana,
    sentence: note.sentence,
    sentenceMeaning: note.sentenceMeaning,
    sentenceFurigana: note.sentenceFurigana,
    notes: note.notes,
    pitchAccent: note.pitchAccent,
    pitchAccentNotes: note.pitchAccentNotes,
    frequency: note.frequency,
    pictureMediaId: note.pictureFilename
      ? mediaByName.get(note.pictureFilename)
      : undefined,
    wordAudioMediaId: note.wordAudioFilename
      ? mediaByName.get(note.wordAudioFilename)
      : undefined,
    sentenceAudioMediaId: note.sentenceAudioFilename
      ? mediaByName.get(note.sentenceAudioFilename)
      : undefined,
  };
}

function emitProgress(
  dependencies: ImportDependencies,
  event: ImportProgress,
): void {
  dependencies.progress(event);
}

export async function importPackage(
  input: ImportRequest,
  dependencies: ImportDependencies,
): Promise<ImportReport> {
  abortIfNeeded(dependencies.signal);
  if (!/\.(apkg|colpkg)$/i.test(input.filename)) {
    throw new Error("Choose an .apkg or .colpkg Anki package");
  }
  if (input.source.size === 0) {
    throw new Error("The selected Anki package is empty");
  }

  emitProgress(dependencies, {
    stage: "validate-package",
    completed: 0,
    total: 1,
    message: "Validating package",
  });
  const packageReader = await readPackage(input.source, dependencies.signal);

  try {
    emitProgress(dependencies, {
      stage: "read-collection",
      completed: 0,
      total: 1,
      message: "Reading collection",
    });
    const collection = await readKaishiCollection(await packageReader.readCollection());
    abortIfNeeded(dependencies.signal);

    emitProgress(dependencies, {
      stage: "map-notes",
      completed: collection.notes.length,
      total: collection.notes.length,
      message: "Mapping Kaishi notes",
    });
    const packageSha256 = await dependencies.sha256(
      new Uint8Array(await input.source.arrayBuffer()),
    );
    const deckId = await dependencies.sha256(
      new TextEncoder().encode(`${packageSha256}:${collection.deck.ankiDeckId}`),
    );
    const importedAt = dependencies.now().toISOString();
    const mediaEntries = await packageReader.listMedia();
    const media: MediaRecord[] = [];
    const warnings = new Set<string>();
    let lastProgressAt = Date.now();

    emitProgress(dependencies, {
      stage: "decode-media",
      completed: 0,
      total: mediaEntries.length,
      message: "Decoding media",
    });
    for (let index = 0; index < mediaEntries.length; index += 1) {
      abortIfNeeded(dependencies.signal);
      const entry = mediaEntries[index]!;
      const data = await packageReader.readMedia(entry);
      const expectedSha1 = toHex(entry.sha1);
      const actualSha1 = (await dependencies.sha1(data)).toLowerCase();
      if (actualSha1 !== expectedSha1) {
        throw new Error(`Media checksum mismatch: ${entry.filename}`);
      }
      const mimeType = resolveMimeType(entry.filename, data, warnings);
      media.push({
        id: `${deckId}:${expectedSha1}:${entry.zipEntry}`,
        deckId,
        filename: entry.filename,
        mimeType,
        byteLength: data.byteLength,
        blob: new Blob([data.slice().buffer], { type: mimeType }),
      });

      const completed = index + 1;
      const now = Date.now();
      if (
        completed % MEDIA_PROGRESS_BATCH === 0 ||
        completed === mediaEntries.length ||
        now - lastProgressAt >= MEDIA_PROGRESS_INTERVAL_MS
      ) {
        emitProgress(dependencies, {
          stage: "decode-media",
          completed,
          total: mediaEntries.length,
          message: "Decoding media",
        });
        lastProgressAt = now;
      }
    }

    const mediaByName = new Map(media.map((record) => [record.filename, record.id]));
    const notes = collection.notes.map((note) => mapNote(deckId, note, mediaByName));
    for (const note of collection.notes) {
      for (const filename of [
        note.pictureFilename,
        note.wordAudioFilename,
        note.sentenceAudioFilename,
      ]) {
        if (filename && !mediaByName.has(filename)) {
          warnings.add(`Missing referenced media: ${filename}`);
        }
      }
    }

    const cards: ImportedAnkiCardRecord[] = collection.cards.map((card) => ({
      id: `${deckId}:${card.id}`,
      deckId,
      noteId: `${deckId}:${card.noteId}`,
      sourceAnkiCardId: card.id,
      state: card.state,
      queue: card.queue,
      due: card.due,
      interval: card.interval,
      reps: card.reps,
      lapses: card.lapses,
      stability: card.memoryState?.stability,
      difficulty: card.memoryState?.difficulty,
      lastReviewAt: card.lastReviewAt,
    }));
    const reviews: ImportedAnkiReviewRecord[] = collection.reviews.map((review) => ({
      ...review,
      deckId,
    }));
    const reviewedCards = collection.cards.filter(
      (card) => card.reps > 0 || card.memoryState !== undefined,
    ).length;
    const schedulingAvailable = reviewedCards > 0;
    const imageCount = media.filter((record) => record.mimeType.startsWith("image/")).length;
    const audioCount = media.filter((record) => record.mimeType.startsWith("audio/")).length;
    const warningList = [...warnings].sort();
    const deck: DeckRecord = {
      id: deckId,
      ankiDeckId: collection.deck.ankiDeckId,
      name: collection.deck.name,
      packageSha256,
      importedAt,
      importMode: "fresh",
      schemaVersion: 1,
    };

    abortIfNeeded(dependencies.signal);
    emitProgress(dependencies, {
      stage: "write-database",
      completed: 0,
      total: 1,
      message: "Saving locally",
    });
    await dependencies.db.transaction(
      "rw",
      [
        dependencies.db.decks,
        dependencies.db.notes,
        dependencies.db.ankiCards,
        dependencies.db.media,
        dependencies.db.ankiReviews,
        dependencies.db.imports,
        dependencies.db.settings,
      ],
      async () => {
        abortIfNeeded(dependencies.signal);
        await dependencies.db.decks.put(deck);
        await dependencies.db.notes.bulkPut(notes);
        await dependencies.db.ankiCards.bulkPut(cards);
        await dependencies.db.media.bulkPut(media);
        await dependencies.db.ankiReviews.bulkPut(reviews);
        await dependencies.db.imports.put({
          id: deckId,
          deckId,
          packageSha256,
          packageVersion: packageReader.version,
          importedAt,
          importMode: "fresh",
          notes: notes.length,
          cards: cards.length,
          images: imageCount,
          audio: audioCount,
          reviews: reviews.length,
          warnings: warningList,
          schedulingAvailable,
        });
        abortIfNeeded(dependencies.signal);
        await setActiveDeckId(dependencies.db, deckId);
      },
    );

    emitProgress(dependencies, {
      stage: "complete",
      completed: 1,
      total: 1,
      message: "Import complete",
    });
    return {
      importId: deckId,
      deckId,
      notes: notes.length,
      cards: cards.length,
      images: imageCount,
      audio: audioCount,
      reviews: reviews.length,
      reviewedCards,
      schedulingAvailable,
      warnings: warningList,
    };
  } finally {
    await packageReader.close();
  }
}

export { getActiveDeckId };

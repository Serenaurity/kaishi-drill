import type {
  AnkiNoteRow,
  FieldDefinition,
  NormalizedFields,
  NormalizedNote,
  NoteMediaReferences,
} from "./types";
import { localImage, sanitizeDisplay, sound } from "./sanitize";

export function mapKaishiNote(
  row: AnkiNoteRow,
  fields: FieldDefinition[],
): NormalizedNote {
  const parts = row.flds.split("\x1f");
  const values: NormalizedFields = {};
  for (const field of fields) {
    values[field.name] = parts[field.ord] ?? "";
  }
  return {
    ankiNoteId: row.id,
    word: sanitizeDisplay(values.Word),
    reading: sanitizeDisplay(values["Word Reading"]),
    meaning: sanitizeDisplay(values["Word Meaning"]),
    wordFurigana: sanitizeDisplay(values["Word Furigana"] ?? ""),
    sentence: sanitizeDisplay(values.Sentence),
    sentenceMeaning: sanitizeDisplay(values["Sentence Meaning"] ?? ""),
    sentenceFurigana: sanitizeDisplay(values["Sentence Furigana"] ?? ""),
    notes: sanitizeDisplay(values.Notes ?? ""),
    pitchAccent: sanitizeDisplay(values["Pitch Accent"] ?? ""),
    pitchAccentNotes: sanitizeDisplay(values["Pitch Accent Notes"] ?? ""),
    frequency: (values.Frequency ?? "").trim(),
    ...extractMediaReferences(values),
  };
}

export function extractMediaReferences(fields: NormalizedFields): NoteMediaReferences {
  return {
    pictureFilename: localImage(fields.Picture ?? ""),
    wordAudioFilename: sound(fields["Word Audio"] ?? ""),
    sentenceAudioFilename: sound(fields["Sentence Audio"] ?? ""),
  };
}

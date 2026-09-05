import type {
  ImportedAnkiReviewRecord,
  NoteRecord,
} from "../../domain/models";
import type { KaishiDb } from "../../storage/db";

export interface PackageMetadata {
  version: 1 | 2 | 3;
}

export interface MediaManifestEntry {
  zipEntry: string;
  filename: string;
  byteLength: number;
  sha1: Uint8Array;
}

export interface PackageReader {
  readonly version: 1 | 2 | 3;
  readCollection(): Promise<Uint8Array>;
  listMedia(): Promise<MediaManifestEntry[]>;
  readMedia(entry: MediaManifestEntry): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface FieldDefinition {
  ord: number;
  name: string;
}

export interface AnkiNoteRow {
  id: string;
  mid: string;
  flds: string;
  tags: string;
}

export interface ImportedMemoryState {
  stability: number;
  difficulty: number;
}

export interface ImportedAnkiCard {
  id: string;
  noteId: string;
  state: number;
  queue: number;
  due: number;
  interval: number;
  reps: number;
  lapses: number;
  memoryState?: ImportedMemoryState;
  lastReviewAt?: string;
}

export type ImportedAnkiReview = Omit<ImportedAnkiReviewRecord, "deckId">;
export type NormalizedFields = Record<string, string>;

export interface NoteMediaReferences {
  pictureFilename?: string;
  wordAudioFilename?: string;
  sentenceAudioFilename?: string;
}

export interface NormalizedNote
  extends Omit<
    NoteRecord,
    "id" | "deckId" | "pictureMediaId" | "wordAudioMediaId" | "sentenceAudioMediaId"
  > {
  pictureFilename?: string;
  wordAudioFilename?: string;
  sentenceAudioFilename?: string;
}

export interface NormalizedCollection {
  deck: { ankiDeckId: string; name: string };
  notes: NormalizedNote[];
  cards: ImportedAnkiCard[];
  reviews: ImportedAnkiReview[];
  schedulerParameters?: number[];
}

export interface ImportRequest {
  source: Blob;
  filename: string;
}

export type ImportStage =
  | "validate-package"
  | "read-collection"
  | "map-notes"
  | "decode-media"
  | "write-database"
  | "complete";

export interface ImportProgress {
  stage: ImportStage;
  completed: number;
  total: number;
  message: string;
}

export interface ImportReport {
  importId: string;
  deckId: string;
  notes: number;
  cards: number;
  images: number;
  audio: number;
  reviews: number;
  reviewedCards: number;
  schedulingAvailable: boolean;
  warnings: string[];
}

export interface ImportDependencies {
  db: KaishiDb;
  signal?: AbortSignal;
  now(): Date;
  sha256(bytes: Uint8Array): Promise<string>;
  sha1(bytes: Uint8Array): Promise<string>;
  progress(event: ImportProgress): void;
}

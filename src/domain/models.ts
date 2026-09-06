export type Skill = "reading" | "meaning";
export type Rating = "again" | "hard" | "good" | "easy";
export type ImportMode = "fresh" | "continue";

export interface DeckRecord {
  id: string;
  ankiDeckId: string;
  name: string;
  packageSha256: string;
  importedAt: string;
  importMode: ImportMode;
  schemaVersion: 1;
}

export interface NoteRecord {
  id: string;
  deckId: string;
  ankiNoteId: string;
  word: string;
  reading: string;
  meaning: string;
  wordFurigana: string;
  sentence: string;
  sentenceMeaning: string;
  sentenceFurigana: string;
  notes: string;
  pitchAccent: string;
  pitchAccentNotes: string;
  frequency: string;
  pictureMediaId?: string;
  wordAudioMediaId?: string;
  sentenceAudioMediaId?: string;
}

export interface ImportedAnkiCardRecord {
  id: string;
  deckId: string;
  noteId: string;
  sourceAnkiCardId: string;
  state: number;
  queue: number;
  due: number;
  interval: number;
  reps: number;
  lapses: number;
  stability?: number;
  difficulty?: number;
  lastReviewAt?: string;
}

export interface SkillCardRecord {
  id: string;
  noteId: string;
  sourceAnkiCardId: string;
  sourceNewPosition?: number;
  skill: Skill;
  createdAt: string;
}

export interface ScheduleRecord {
  skillCardId: string;
  revision: number;
  state: "new" | "learning" | "review" | "relearning";
  dueAt: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewAt?: string;
  scheduler: "ts-fsrs";
  schedulerVersion: string;
  parametersHash: string;
  seededFromAnki: boolean;
}

export interface ReviewEventRecord {
  id: string;
  skillCardId: string;
  occurredAt: string;
  localDate: string;
  timezone: string;
  answer: string;
  grade: "correct" | "close" | "incorrect";
  suggestedRating: Rating;
  selectedRating: Rating;
  responseMs: number;
  previousSchedule: ScheduleRecord;
  nextSchedule: ScheduleRecord;
}

export interface ImportedAnkiReviewRecord {
  id: string;
  deckId: string;
  sourceAnkiCardId: string;
  occurredAt: string;
  rating: number;
  reviewType: number;
  interval: number;
  lastInterval: number;
  responseMs: number;
}

export interface MediaRecord {
  id: string;
  deckId: string;
  filename: string;
  mimeType: string;
  byteLength: number;
  blob: Blob;
}

export interface KanaSkillRecord {
  id: string;
  attempts: number;
  correct: number;
  streak: number;
  lastSeenAt?: string;
  lastWrongAt?: string;
  meanResponseMs: number;
}

export interface DailyActivityRecord {
  id: string;
  profileId: "local";
  localDate: string;
  vocabularyReviews: number;
  kanaAttempts: number;
}

export interface ImportRecord {
  id: string;
  deckId: string;
  packageSha256: string;
  packageVersion: 1 | 2 | 3;
  importedAt: string;
  importMode: ImportMode;
  notes: number;
  cards: number;
  images: number;
  audio: number;
  reviews: number;
  warnings: string[];
  schedulingAvailable: boolean;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

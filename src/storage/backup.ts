import type {
  DailyActivityRecord,
  ImportedAnkiReviewRecord,
  KanaSkillRecord,
  ReviewEventRecord,
  ScheduleRecord,
  SettingRecord,
} from "../domain/models";
import type { KaishiDb } from "./db";
import { getActiveDeckId } from "./repositories";

export interface ProgressBackupV1 {
  schemaVersion: 1;
  exportedAt: string;
  deckId: string;
  packageSha256: string;
  settings: SettingRecord[];
  schedules: ScheduleRecord[];
  reviewEvents: ReviewEventRecord[];
  ankiReviews: ImportedAnkiReviewRecord[];
  kanaSkills: KanaSkillRecord[];
  dailyActivity: DailyActivityRecord[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as UnknownRecord;
}

function string(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) throw new Error(`${label} must be a string`);
  return value;
}

function dateString(value: unknown, label: string): string {
  const result = string(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} must be a valid date`);
  return result;
}

function number(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`${label} must be a valid number`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  const result = number(value, label, minimum);
  if (!Number.isInteger(result)) throw new Error(`${label} must be a whole number`);
  return result;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function validateSchedule(value: unknown, label: string): ScheduleRecord {
  const item = record(value, label);
  string(item.skillCardId, `${label}.skillCardId`);
  integer(item.revision, `${label}.revision`);
  if (!["new", "learning", "review", "relearning"].includes(String(item.state))) throw new Error(`${label}.state is invalid`);
  dateString(item.dueAt, `${label}.dueAt`);
  number(item.stability, `${label}.stability`);
  number(item.difficulty, `${label}.difficulty`);
  integer(item.elapsedDays, `${label}.elapsedDays`);
  integer(item.scheduledDays, `${label}.scheduledDays`);
  integer(item.reps, `${label}.reps`);
  integer(item.lapses, `${label}.lapses`);
  if (item.lastReviewAt !== undefined) dateString(item.lastReviewAt, `${label}.lastReviewAt`);
  if (item.scheduler !== "ts-fsrs") throw new Error(`${label}.scheduler is invalid`);
  string(item.schedulerVersion, `${label}.schedulerVersion`);
  string(item.parametersHash, `${label}.parametersHash`);
  if (typeof item.seededFromAnki !== "boolean") throw new Error(`${label}.seededFromAnki must be boolean`);
  return item as unknown as ScheduleRecord;
}

function ensureUnique<T>(items: T[], key: (item: T) => string, label: string): void {
  const keys = items.map(key);
  if (new Set(keys).size !== keys.length) throw new Error(`${label} contains duplicate ids`);
}

export function validateProgressBackup(value: unknown): ProgressBackupV1 {
  const root = record(value, "Backup");
  if (root.schemaVersion !== 1) throw new Error("Unsupported backup schema version");
  const exportedAt = dateString(root.exportedAt, "exportedAt");
  const deckId = string(root.deckId, "deckId");
  const packageSha256 = string(root.packageSha256, "packageSha256");

  const settings = array(root.settings, "settings").map((value, index) => {
    const item = record(value, `settings[${index}]`);
    string(item.key, `settings[${index}].key`);
    if (!("value" in item)) throw new Error(`settings[${index}].value is required`);
    return item as unknown as SettingRecord;
  });
  const schedules = array(root.schedules, "schedules").map((item, index) => validateSchedule(item, `schedules[${index}]`));
  const reviewEvents = array(root.reviewEvents, "reviewEvents").map((value, index) => {
    const item = record(value, `reviewEvents[${index}]`);
    string(item.id, `reviewEvents[${index}].id`);
    string(item.skillCardId, `reviewEvents[${index}].skillCardId`);
    dateString(item.occurredAt, `reviewEvents[${index}].occurredAt`);
    string(item.localDate, `reviewEvents[${index}].localDate`);
    string(item.timezone, `reviewEvents[${index}].timezone`);
    string(item.answer, `reviewEvents[${index}].answer`, true);
    if (!["correct", "close", "incorrect"].includes(String(item.grade))) throw new Error(`reviewEvents[${index}].grade is invalid`);
    if (!["again", "hard", "good", "easy"].includes(String(item.suggestedRating))) throw new Error(`reviewEvents[${index}].suggestedRating is invalid`);
    if (!["again", "hard", "good", "easy"].includes(String(item.selectedRating))) throw new Error(`reviewEvents[${index}].selectedRating is invalid`);
    integer(item.responseMs, `reviewEvents[${index}].responseMs`);
    validateSchedule(item.previousSchedule, `reviewEvents[${index}].previousSchedule`);
    validateSchedule(item.nextSchedule, `reviewEvents[${index}].nextSchedule`);
    return item as unknown as ReviewEventRecord;
  });
  const ankiReviews = array(root.ankiReviews, "ankiReviews").map((value, index) => {
    const item = record(value, `ankiReviews[${index}]`);
    string(item.id, `ankiReviews[${index}].id`);
    string(item.deckId, `ankiReviews[${index}].deckId`);
    string(item.sourceAnkiCardId, `ankiReviews[${index}].sourceAnkiCardId`);
    dateString(item.occurredAt, `ankiReviews[${index}].occurredAt`);
    integer(item.rating, `ankiReviews[${index}].rating`);
    integer(item.reviewType, `ankiReviews[${index}].reviewType`);
    number(item.interval, `ankiReviews[${index}].interval`);
    number(item.lastInterval, `ankiReviews[${index}].lastInterval`);
    integer(item.responseMs, `ankiReviews[${index}].responseMs`);
    return item as unknown as ImportedAnkiReviewRecord;
  });
  const kanaSkills = array(root.kanaSkills, "kanaSkills").map((value, index) => {
    const item = record(value, `kanaSkills[${index}]`);
    string(item.id, `kanaSkills[${index}].id`);
    integer(item.attempts, `kanaSkills[${index}].attempts`);
    integer(item.correct, `kanaSkills[${index}].correct`);
    integer(item.streak, `kanaSkills[${index}].streak`);
    if (item.lastSeenAt !== undefined) dateString(item.lastSeenAt, `kanaSkills[${index}].lastSeenAt`);
    if (item.lastWrongAt !== undefined) dateString(item.lastWrongAt, `kanaSkills[${index}].lastWrongAt`);
    number(item.meanResponseMs, `kanaSkills[${index}].meanResponseMs`);
    if ((item.correct as number) > (item.attempts as number)) throw new Error(`kanaSkills[${index}].correct exceeds attempts`);
    return item as unknown as KanaSkillRecord;
  });
  const dailyActivity = array(root.dailyActivity, "dailyActivity").map((value, index) => {
    const item = record(value, `dailyActivity[${index}]`);
    string(item.id, `dailyActivity[${index}].id`);
    if (item.profileId !== "local") throw new Error(`dailyActivity[${index}].profileId is invalid`);
    string(item.localDate, `dailyActivity[${index}].localDate`);
    integer(item.vocabularyReviews, `dailyActivity[${index}].vocabularyReviews`);
    integer(item.kanaAttempts, `dailyActivity[${index}].kanaAttempts`);
    return item as unknown as DailyActivityRecord;
  });

  ensureUnique(settings, (item) => item.key, "settings");
  ensureUnique(schedules, (item) => item.skillCardId, "schedules");
  ensureUnique(reviewEvents, (item) => item.id, "reviewEvents");
  ensureUnique(ankiReviews, (item) => item.id, "ankiReviews");
  ensureUnique(kanaSkills, (item) => item.id, "kanaSkills");
  ensureUnique(dailyActivity, (item) => item.id, "dailyActivity");
  if (ankiReviews.some((item) => item.deckId !== deckId)) throw new Error("Backup contains review history for another deck");

  return structuredClone({
    schemaVersion: 1,
    exportedAt,
    deckId,
    packageSha256,
    settings,
    schedules,
    reviewEvents,
    ankiReviews,
    kanaSkills,
    dailyActivity,
  });
}

function sorted<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

export async function exportProgress(db: KaishiDb): Promise<Blob> {
  const deckId = await getActiveDeckId(db);
  if (!deckId) throw new Error("Import a deck before exporting progress");
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error("The active deck could not be found");
  const notes = await db.notes.where("deckId").equals(deckId).toArray();
  const noteIds = new Set(notes.map((note) => note.id));
  const skillCards = await db.skillCards.filter((card) => noteIds.has(card.noteId)).toArray();
  const skillCardIds = new Set(skillCards.map((card) => card.id));
  const [settings, schedules, reviewEvents, ankiReviews, kanaSkills, dailyActivity] = await Promise.all([
    db.settings.toArray(),
    db.schedules.filter((item) => skillCardIds.has(item.skillCardId)).toArray(),
    db.reviewEvents.filter((item) => skillCardIds.has(item.skillCardId)).toArray(),
    db.ankiReviews.where("deckId").equals(deckId).toArray(),
    db.kanaSkills.toArray(),
    db.dailyActivity.toArray(),
  ]);
  const backup: ProgressBackupV1 = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    deckId,
    packageSha256: deck.packageSha256,
    settings: sorted(settings, (item) => item.key),
    schedules: sorted(schedules, (item) => item.skillCardId),
    reviewEvents: sorted(reviewEvents, (item) => item.id),
    ankiReviews: sorted(ankiReviews, (item) => item.id),
    kanaSkills: sorted(kanaSkills, (item) => item.id),
    dailyActivity: sorted(dailyActivity, (item) => item.id),
  };
  return new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" });
}

export async function restoreProgress(db: KaishiDb, value: ProgressBackupV1): Promise<void> {
  const backup = validateProgressBackup(value);
  const deck = await db.decks.get(backup.deckId);
  if (!deck || deck.packageSha256 !== backup.packageSha256) {
    throw new Error("Import the matching deck package before restoring this backup");
  }
  const notes = await db.notes.where("deckId").equals(backup.deckId).toArray();
  const noteIds = new Set(notes.map((note) => note.id));
  const skillCards = await db.skillCards.filter((card) => noteIds.has(card.noteId)).toArray();
  const skillCardIds = new Set(skillCards.map((card) => card.id));
  if (backup.schedules.some((item) => !skillCardIds.has(item.skillCardId)) ||
      backup.reviewEvents.some((item) => !skillCardIds.has(item.skillCardId))) {
    throw new Error("Backup progress does not match the imported deck cards");
  }
  const settings = backup.settings.filter((item) => item.key !== "activeDeckId");
  settings.push({ key: "activeDeckId", value: backup.deckId });
  await db.transaction(
    "rw",
    [db.settings, db.schedules, db.reviewEvents, db.ankiReviews, db.kanaSkills, db.dailyActivity],
    async () => {
      await Promise.all([
        db.settings.clear(), db.schedules.clear(), db.reviewEvents.clear(),
        db.ankiReviews.clear(), db.kanaSkills.clear(), db.dailyActivity.clear(),
      ]);
      await db.settings.bulkPut(settings);
      await db.schedules.bulkPut(backup.schedules);
      await db.reviewEvents.bulkPut(backup.reviewEvents);
      await db.ankiReviews.bulkPut(backup.ankiReviews);
      await db.kanaSkills.bulkPut(backup.kanaSkills);
      await db.dailyActivity.bulkPut(backup.dailyActivity);
    },
  );
}

export async function resetData(db: KaishiDb, scope: "session" | "progress" | "all"): Promise<void> {
  if (scope === "session") {
    await db.settings.bulkDelete(["studySessionDraft", "kanaSessionDraft"]);
    return;
  }
  if (scope === "progress") {
    await db.transaction(
      "rw",
      [db.skillCards, db.schedules, db.reviewEvents, db.ankiReviews, db.kanaSkills, db.dailyActivity, db.settings],
      async () => {
        await Promise.all([
          db.skillCards.clear(), db.schedules.clear(), db.reviewEvents.clear(),
          db.ankiReviews.clear(), db.kanaSkills.clear(), db.dailyActivity.clear(),
          db.settings.bulkDelete(["studySessionDraft", "kanaSessionDraft"]),
        ]);
      },
    );
    return;
  }
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

import type { KanaSkillRecord } from "../../domain/models";
import { localDateInTimeZone } from "../../domain/dates";
import { seededOrder } from "../../domain/seeded-order";
import type { KaishiDb } from "../../storage/db";
import { KANA_CATALOG, type KanaEntry } from "./kana-catalog";
import { gradeKana, type KanaGrade } from "./kana-grader";

export interface KanaAttempt {
  entryId: string;
  correct: boolean;
  responseMs: number;
  occurredAt: string;
}

export interface KanaRepository {
  list(): Promise<KanaSkillRecord[]>;
  record(attempt: KanaAttempt): Promise<KanaSkillRecord>;
}

export interface KanaRepositoryDependencies {
  now(): Date;
  timezone(): string;
}

export interface KanaSessionConfig {
  mode: "standard" | "focus";
  seed: string;
  entries?: readonly KanaEntry[];
  now?: () => Date;
}

export interface KanaSession {
  next(): Promise<KanaEntry | undefined>;
  answer(value: string, responseMs: number): Promise<KanaGrade>;
}

function responseTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function createDexieKanaRepository(
  db: KaishiDb,
  dependencies: KanaRepositoryDependencies,
): KanaRepository {
  return {
    list: () => db.kanaSkills.toArray(),
    async record(attempt) {
      const occurredAt = new Date(attempt.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) throw new Error("Kana attempt date is invalid");
      const timezone = dependencies.timezone();
      const localDate = localDateInTimeZone(occurredAt, timezone);
      const activityId = `local:${localDate}`;
      let updated: KanaSkillRecord | undefined;
      await db.transaction("rw", [db.kanaSkills, db.dailyActivity], async () => {
        const previous = await db.kanaSkills.get(attempt.entryId);
        const attempts = (previous?.attempts ?? 0) + 1;
        updated = {
          id: attempt.entryId,
          attempts,
          correct: (previous?.correct ?? 0) + Number(attempt.correct),
          streak: attempt.correct ? (previous?.streak ?? 0) + 1 : 0,
          lastSeenAt: occurredAt.toISOString(),
          lastWrongAt: attempt.correct ? previous?.lastWrongAt : occurredAt.toISOString(),
          meanResponseMs: Math.round(
            (((previous?.meanResponseMs ?? 0) * (previous?.attempts ?? 0)) + responseTime(attempt.responseMs)) / attempts,
          ),
        };
        const existingActivity = await db.dailyActivity.get(activityId);
        await db.kanaSkills.put(updated);
        await db.dailyActivity.put({
          id: activityId,
          profileId: "local",
          localDate,
          vocabularyReviews: existingActivity?.vocabularyReviews ?? 0,
          kanaAttempts: (existingActivity?.kanaAttempts ?? 0) + 1,
        });
      });
      if (!updated) throw new Error("Kana attempt could not be saved");
      return updated;
    },
  };
}

export function createKanaSession(
  config: KanaSessionConfig,
  repository: KanaRepository,
): KanaSession {
  const now = config.now ?? (() => new Date());
  const candidates = config.entries ?? KANA_CATALOG;
  let queue: KanaEntry[] | undefined;
  let current: KanaEntry | undefined;

  async function prepare(): Promise<KanaEntry[]> {
    const shuffled = seededOrder(candidates, config.seed, (entry) => entry.id);
    if (config.mode !== "focus") return shuffled;
    const skills = await repository.list();
    const mistakes = new Map(skills
      .filter((skill) => skill.lastWrongAt)
      .map((skill) => [skill.id, skill.lastWrongAt!]));
    const weak = shuffled
      .filter((entry) => mistakes.has(entry.id))
      .sort((a, b) => Date.parse(mistakes.get(b.id)!) - Date.parse(mistakes.get(a.id)!));
    const weakIds = new Set(weak.map((entry) => entry.id));
    return [...weak, ...shuffled.filter((entry) => !weakIds.has(entry.id))];
  }

  return {
    async next() {
      queue ??= await prepare();
      current ??= queue.shift();
      return current;
    },
    async answer(value, responseMs) {
      if (!current) throw new Error("Start a Kana prompt before answering");
      const grade = gradeKana(value, current);
      await repository.record({
        entryId: current.id,
        correct: grade.correct,
        responseMs: responseTime(responseMs),
        occurredAt: now().toISOString(),
      });
      current = undefined;
      return grade;
    },
  };
}

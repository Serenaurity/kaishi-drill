import type {
  DailyActivityRecord,
  NoteRecord,
  Rating,
  ReviewEventRecord,
  ScheduleRecord,
  SkillCardRecord,
} from "../../domain/models";
import type { KaishiDb } from "../../storage/db";
import { getActiveDeckId, getStudyLimits } from "../../storage/repositories";
import { deriveEnglishAliases, gradeEnglish } from "./grading/english";
import { gradeReading } from "./grading/reading";
import type { GradeResult } from "./grading/types";
import { buildStudyQueue, localDateInTimeZone } from "./queue";
import type { SchedulePreview, Scheduler } from "./scheduler";

export interface StudyPrompt {
  card: SkillCardRecord;
  note: NoteRecord;
  schedule: ScheduleRecord;
  scheduleRevision: number;
  intervals: Record<Rating, SchedulePreview>;
}

export interface StudySessionDependencies {
  db: KaishiDb;
  scheduler: Scheduler;
  now(): Date;
  timezone(): string;
}

export interface StudySession {
  loadNext(): Promise<StudyPrompt | undefined>;
  submitAnswer(answer: string, responseMs: number): GradeResult;
  confirmRating(rating: Rating): Promise<StudyPrompt | undefined>;
}

interface PendingAnswer {
  answer: string;
  responseMs: number;
  grade: GradeResult;
}

export class ScheduleConflictError extends Error {
  constructor() {
    super("This card changed in another tab. Reload the prompt before rating it.");
    this.name = "ScheduleConflictError";
  }
}

export function createStudySession(dependencies: StudySessionDependencies): StudySession {
  let currentPrompt: StudyPrompt | undefined;
  let pending: PendingAnswer | undefined;
  let confirming = false;

  async function loadNext(): Promise<StudyPrompt | undefined> {
    if (pending && currentPrompt) return currentPrompt;
    const deckId = await getActiveDeckId(dependencies.db);
    if (!deckId) {
      currentPrompt = undefined;
      return undefined;
    }
    const notes = await dependencies.db.notes.where("deckId").equals(deckId).toArray();
    const noteById = new Map(notes.map((note) => [note.id, note]));
    const skillCards = await dependencies.db.skillCards
      .filter((card) => noteById.has(card.noteId))
      .toArray();
    const cardById = new Map(skillCards.map((card) => [card.id, card]));
    const schedules = await dependencies.db.schedules
      .filter((schedule) => cardById.has(schedule.skillCardId))
      .toArray();
    const now = dependencies.now();
    const timezone = dependencies.timezone();
    const localDate = localDateInTimeZone(now, timezone);
    const eventsToday = await dependencies.db.reviewEvents
      .where("localDate")
      .equals(localDate)
      .filter((event) => cardById.has(event.skillCardId))
      .toArray();
    const limits = await getStudyLimits(dependencies.db);
    const queue = buildStudyQueue({
      now,
      timezone,
      schedules,
      skillCards,
      completedToday: {
        newCards: eventsToday.filter((event) => event.previousSchedule.state === "new").length,
        reviews: eventsToday.filter((event) => event.previousSchedule.state !== "new").length,
      },
      limits,
      seed: `${localDate}:${deckId}`,
    });
    const card = queue.length > 0 ? cardById.get(queue[0]!) : undefined;
    const schedule = card ? schedules.find((value) => value.skillCardId === card.id) : undefined;
    const note = card ? noteById.get(card.noteId) : undefined;
    if (!card || !schedule || !note) {
      currentPrompt = undefined;
      pending = undefined;
      return undefined;
    }
    currentPrompt = {
      card,
      note,
      schedule,
      scheduleRevision: schedule.revision,
      intervals: dependencies.scheduler.preview(schedule, now),
    };
    pending = undefined;
    return currentPrompt;
  }

  return {
    loadNext,
    submitAnswer(answer, responseMs) {
      if (!currentPrompt) throw new Error("There is no study prompt to answer");
      if (pending) throw new Error("The current answer is already revealed");
      const grade = currentPrompt.card.skill === "reading"
        ? gradeReading(answer, [currentPrompt.note.reading])
        : gradeEnglish(answer, deriveEnglishAliases(currentPrompt.note.meaning));
      pending = {
        answer,
        responseMs: Number.isFinite(responseMs) ? Math.max(0, Math.round(responseMs)) : 0,
        grade,
      };
      return grade;
    },
    async confirmRating(rating) {
      if (!currentPrompt) throw new Error("There is no revealed answer to rate");
      if (!pending) throw new Error("Submit an answer before rating");
      if (confirming) throw new Error("This answer is already being saved");
      confirming = true;
      const prompt = currentPrompt;
      const answer = pending;
      const reviewedAt = dependencies.now();
      const timezone = dependencies.timezone();
      const localDate = localDateInTimeZone(reviewedAt, timezone);
      try {
        await dependencies.db.transaction(
          "rw",
          [dependencies.db.schedules, dependencies.db.reviewEvents, dependencies.db.dailyActivity],
          async () => {
            const stored = await dependencies.db.schedules.get(prompt.card.id);
            if (!stored || stored.revision !== prompt.scheduleRevision) {
              throw new ScheduleConflictError();
            }
            const transition = dependencies.scheduler.answer(stored, rating, reviewedAt);
            const event: ReviewEventRecord = {
              id: crypto.randomUUID(),
              skillCardId: prompt.card.id,
              occurredAt: reviewedAt.toISOString(),
              localDate,
              timezone,
              answer: answer.answer,
              grade: answer.grade.grade,
              suggestedRating: answer.grade.suggestedRating,
              selectedRating: rating,
              responseMs: answer.responseMs,
              previousSchedule: transition.previous,
              nextSchedule: transition.next,
            };
            const activityId = `local:${localDate}`;
            const existing = await dependencies.db.dailyActivity.get(activityId);
            const activity: DailyActivityRecord = {
              id: activityId,
              profileId: "local",
              localDate,
              vocabularyReviews: (existing?.vocabularyReviews ?? 0) + 1,
              kanaAttempts: existing?.kanaAttempts ?? 0,
            };
            await dependencies.db.schedules.put(transition.next);
            await dependencies.db.reviewEvents.add(event);
            await dependencies.db.dailyActivity.put(activity);
          },
        );
        currentPrompt = undefined;
        pending = undefined;
        return await loadNext();
      } finally {
        confirming = false;
      }
    },
  };
}

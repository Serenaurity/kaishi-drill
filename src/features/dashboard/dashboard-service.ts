import type { KanaSkillRecord } from "../../domain/models";
import { localDateInTimeZone } from "../../domain/dates";
import type { KaishiDb } from "../../storage/db";
import { getActiveDeckId, getStudyLimits } from "../../storage/repositories";

export interface DashboardModel {
  dueVocabulary: number;
  newVocabularyAvailable: number;
  lifetimeVocabularyReviews: number;
  today: { vocabularyReviews: number; kanaAttempts: number };
  streakDays: number;
  activity: Array<{ localDate: string; vocabularyReviews: number; kanaAttempts: number }>;
  futureDue: Array<{ localDate: string; reviews: number }>;
  vocabularyAccuracy: number;
  weakKana: KanaSkillRecord[];
}

export interface DashboardService {
  loadDashboard(now: Date, timezone: string): Promise<DashboardModel>;
}

function shiftLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarRange(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => shiftLocalDate(end, index - days + 1));
}

export function createDashboardService(db: KaishiDb): DashboardService {
  return {
    async loadDashboard(now, timezone) {
      if (Number.isNaN(now.getTime())) throw new Error("Dashboard date is invalid");
      const todayDate = localDateInTimeZone(now, timezone);
      const activeDeckId = await getActiveDeckId(db);
      const notes = activeDeckId ? await db.notes.where("deckId").equals(activeDeckId).toArray() : [];
      const noteIds = new Set(notes.map((note) => note.id));
      const skillCards = await db.skillCards.filter((card) => noteIds.has(card.noteId)).toArray();
      const skillCardIds = new Set(skillCards.map((card) => card.id));
      const [schedules, reviewEvents, importedReviews, activityRows, kanaSkills, limits] = await Promise.all([
        db.schedules.filter((schedule) => skillCardIds.has(schedule.skillCardId)).toArray(),
        db.reviewEvents.filter((event) => skillCardIds.has(event.skillCardId)).toArray(),
        activeDeckId ? db.ankiReviews.where("deckId").equals(activeDeckId).toArray() : [],
        db.dailyActivity.where("localDate").belowOrEqual(todayDate).toArray(),
        db.kanaSkills.toArray(),
        getStudyLimits(db),
      ]);

      const nowTime = now.getTime();
      const dueSchedules = schedules.filter((schedule) => {
        const dueAt = Date.parse(schedule.dueAt);
        return Number.isFinite(dueAt) && dueAt <= nowTime;
      });
      const newCompletedToday = reviewEvents.filter((event) =>
        event.localDate === todayDate && event.previousSchedule.state === "new").length;
      const dueVocabulary = dueSchedules.filter((schedule) => schedule.state !== "new").length;
      const newVocabularyAvailable = Math.min(
        dueSchedules.filter((schedule) => schedule.state === "new").length,
        Math.max(0, limits.newPerDay - newCompletedToday),
      );

      const todayRow = activityRows.find((row) => row.localDate === todayDate);
      const today = {
        vocabularyReviews: todayRow?.vocabularyReviews ?? 0,
        kanaAttempts: todayRow?.kanaAttempts ?? 0,
      };
      const activityByDate = new Map(activityRows.map((row) => [row.localDate, {
        vocabularyReviews: row.vocabularyReviews,
        kanaAttempts: row.kanaAttempts,
      }]));
      for (const review of importedReviews) {
        const occurredAt = new Date(review.occurredAt);
        if (Number.isNaN(occurredAt.getTime())) continue;
        const localDate = localDateInTimeZone(occurredAt, timezone);
        const existing = activityByDate.get(localDate) ?? { vocabularyReviews: 0, kanaAttempts: 0 };
        activityByDate.set(localDate, {
          vocabularyReviews: existing.vocabularyReviews + 1,
          kanaAttempts: existing.kanaAttempts,
        });
      }

      const activeDates = new Set([...activityByDate]
        .filter(([, counts]) => counts.vocabularyReviews + counts.kanaAttempts > 0)
        .map(([localDate]) => localDate));
      let streakCursor = activeDates.has(todayDate) ? todayDate : shiftLocalDate(todayDate, -1);
      let streakDays = 0;
      while (activeDates.has(streakCursor)) {
        streakDays += 1;
        streakCursor = shiftLocalDate(streakCursor, -1);
      }

      const correctReviews = reviewEvents.filter((event) => event.grade === "correct").length;
      const weakKana = kanaSkills
        .filter((skill) => skill.attempts > skill.correct)
        .sort((a, b) =>
          (b.attempts - b.correct) - (a.attempts - a.correct) ||
          Date.parse(b.lastWrongAt ?? "") - Date.parse(a.lastWrongAt ?? "") ||
          a.id.localeCompare(b.id),
        )
        .slice(0, 12);
      const activity = calendarRange(todayDate, 26 * 7).map((localDate) => ({
        localDate,
        ...(activityByDate.get(localDate) ?? { vocabularyReviews: 0, kanaAttempts: 0 }),
      }));
      const futureDates = Array.from({ length: 14 }, (_, index) => shiftLocalDate(todayDate, index + 1));
      const futureCounts = new Map(futureDates.map((localDate) => [localDate, 0]));
      for (const schedule of schedules) {
        const dueAt = Date.parse(schedule.dueAt);
        if (schedule.state === "new" || !Number.isFinite(dueAt) || dueAt <= nowTime) continue;
        const localDate = localDateInTimeZone(new Date(dueAt), timezone);
        const count = futureCounts.get(localDate);
        if (count !== undefined) futureCounts.set(localDate, count + 1);
      }
      const futureDue = futureDates.map((localDate) => ({
        localDate,
        reviews: futureCounts.get(localDate) ?? 0,
      }));

      return {
        dueVocabulary,
        newVocabularyAvailable,
        lifetimeVocabularyReviews: importedReviews.length + reviewEvents.length,
        today,
        streakDays,
        activity,
        futureDue,
        vocabularyAccuracy: reviewEvents.length > 0 ? correctReviews / reviewEvents.length : 0,
        weakKana,
      };
    },
  };
}

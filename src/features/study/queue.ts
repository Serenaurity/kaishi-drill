import type { ScheduleRecord, SkillCardRecord } from "../../domain/models";
import { localDateInTimeZone } from "../../domain/dates";
import { seededHash } from "../../domain/seeded-order";

export { localDateInTimeZone } from "../../domain/dates";

export type SkillCardId = string;

export interface QueueLimits {
  newPerDay: number;
  reviewsPerDay: number;
}

export interface QueueInput {
  now: Date;
  timezone: string;
  schedules: ScheduleRecord[];
  skillCards: SkillCardRecord[];
  completedToday: { newCards: number; reviews: number };
  limits: QueueLimits;
  seed: string;
}

interface QueueItem {
  id: string;
  noteId: string;
  sourceAnkiCardId: string;
  sourceNewPosition?: number;
  schedule: ScheduleRecord;
  rank: number;
}

function retrievability(schedule: ScheduleRecord, now: Date): number {
  if (!schedule.lastReviewAt || schedule.stability <= 0) return 1;
  const lastReviewAt = Date.parse(schedule.lastReviewAt);
  if (!Number.isFinite(lastReviewAt)) return 1;
  const elapsedDays = Math.max(0, (now.getTime() - lastReviewAt) / 86_400_000);
  const decay = -0.1542;
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  return Math.pow(1 + factor * elapsedDays / (9 * schedule.stability), decay);
}

function compareDue(a: QueueItem, b: QueueItem): number {
  return Date.parse(a.schedule.dueAt) - Date.parse(b.schedule.dueAt);
}

function compareNew(a: QueueItem, b: QueueItem): number {
  const aPosition = Number.isSafeInteger(a.sourceNewPosition)
    ? a.sourceNewPosition!
    : Number.POSITIVE_INFINITY;
  const bPosition = Number.isSafeInteger(b.sourceNewPosition)
    ? b.sourceNewPosition!
    : Number.POSITIVE_INFINITY;
  return aPosition - bPosition ||
    a.sourceAnkiCardId.localeCompare(b.sourceAnkiCardId, undefined, { numeric: true }) ||
    a.id.localeCompare(b.id);
}

function separateSiblings(items: QueueItem[]): QueueItem[] {
  const result: QueueItem[] = [];
  for (const rank of [0, 1, 2]) {
    const remaining = items.filter((item) => item.rank === rank);
    while (remaining.length > 0) {
      const previousNoteId = result.at(-1)?.noteId;
      const counts = new Map<string, number>();
      for (const item of remaining) {
        counts.set(item.noteId, (counts.get(item.noteId) ?? 0) + 1);
      }
      let selected = -1;
      let selectedCount = -1;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index]!;
        if (candidate.noteId === previousNoteId) continue;
        const count = counts.get(candidate.noteId) ?? 0;
        if (count > selectedCount) {
          selected = index;
          selectedCount = count;
        }
      }
      if (selected < 0) selected = 0;
      result.push(remaining.splice(selected, 1)[0]!);
    }
  }
  return result;
}

export function buildStudyQueue(input: QueueInput): SkillCardId[] {
  const nowTime = input.now.getTime();
  if (!Number.isFinite(nowTime)) throw new Error("Queue date is invalid");
  localDateInTimeZone(input.now, input.timezone);
  const cards = new Map(input.skillCards.map((card) => [card.id, card]));
  const dueItems = input.schedules.flatMap((schedule): QueueItem[] => {
    const card = cards.get(schedule.skillCardId);
    const dueAt = Date.parse(schedule.dueAt);
    if (!card || !Number.isFinite(dueAt) || dueAt > nowTime) return [];
    const rank = schedule.state === "learning" || schedule.state === "relearning"
      ? 0
      : schedule.state === "review" ? 1 : 2;
    return [{
      id: card.id,
      noteId: card.noteId,
      sourceAnkiCardId: card.sourceAnkiCardId,
      sourceNewPosition: card.sourceNewPosition,
      schedule,
      rank,
    }];
  });

  const tie = (item: QueueItem) => seededHash(`${input.seed}:${item.id}`);
  const learning = dueItems
    .filter((item) => item.rank === 0)
    .sort((a, b) => compareDue(a, b) || tie(a) - tie(b) || a.id.localeCompare(b.id));
  const reviews = dueItems
    .filter((item) => item.rank === 1)
    .sort((a, b) =>
      compareDue(a, b) ||
      retrievability(a.schedule, input.now) - retrievability(b.schedule, input.now) ||
      tie(a) - tie(b) ||
      a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, input.limits.reviewsPerDay - input.completedToday.reviews));
  const newCards = dueItems
    .filter((item) => item.rank === 2)
    .sort(compareNew)
    .slice(0, Math.max(0, input.limits.newPerDay - input.completedToday.newCards));

  return separateSiblings([...learning, ...reviews, ...newCards]).map((item) => item.id);
}

import { describe, expect, it } from "vitest";
import type { ScheduleRecord, SkillCardRecord } from "../../domain/models";
import { buildStudyQueue, localDateInTimeZone, type QueueInput } from "./queue";
import { createNewSchedule } from "./scheduler";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function skill(id: string, noteId = id.split(":")[0]!): SkillCardRecord {
  return {
    id,
    noteId,
    sourceAnkiCardId: id,
    skill: id.endsWith(":meaning") ? "meaning" : "reading",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function schedule(
  id: string,
  state: ScheduleRecord["state"],
  dueAt = "2026-09-05T00:00:00.000Z",
  overrides: Partial<ScheduleRecord> = {},
): ScheduleRecord {
  return {
    ...createNewSchedule(id, new Date(dueAt)),
    state,
    dueAt,
    stability: state === "new" ? 0 : 4,
    difficulty: state === "new" ? 0 : 5,
    reps: state === "new" ? 0 : 2,
    lastReviewAt: state === "new" ? undefined : "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function input(cards: SkillCardRecord[], schedules: ScheduleRecord[], overrides: Partial<QueueInput> = {}): QueueInput {
  return {
    now: NOW,
    timezone: "Asia/Bangkok",
    schedules,
    skillCards: cards,
    completedToday: { newCards: 0, reviews: 0 },
    limits: { newPerDay: 20, reviewsPerDay: 200 },
    seed: "2026-09-05:local",
    ...overrides,
  };
}

describe("study queue", () => {
  it("orders learning before review before new and separates sibling skills", () => {
    const cards = [
      skill("learning:reading", "learning"),
      skill("review-a:reading", "review-a"),
      skill("review-b:reading", "review-b"),
      skill("review-a:meaning", "review-a"),
      skill("new:reading", "new"),
    ];
    const schedules = [
      schedule("learning:reading", "learning"),
      schedule("review-a:reading", "review"),
      schedule("review-b:reading", "review"),
      schedule("review-a:meaning", "review"),
      schedule("new:reading", "new"),
    ];

    const ids = buildStudyQueue(input(cards, schedules));
    expect(ids[0]).toBe("learning:reading");
    expect(ids.slice(1, 4).every((id) => id.startsWith("review-"))).toBe(true);
    expect(ids.at(-1)).toBe("new:reading");
    for (let index = 1; index < ids.length; index += 1) {
      const current = cards.find((card) => card.id === ids[index])!;
      const previous = cards.find((card) => card.id === ids[index - 1])!;
      expect(current.noteId).not.toBe(previous.noteId);
    }
  });

  it("applies the remaining review and new limits", () => {
    const reviews = Array.from({ length: 10 }, (_, index) => skill(`review-${index}:reading`));
    const newCards = Array.from({ length: 10 }, (_, index) => skill(`new-${index}:reading`));
    const schedules = [
      ...reviews.map((card) => schedule(card.id, "review")),
      ...newCards.map((card) => schedule(card.id, "new")),
    ];
    const ids = buildStudyQueue(input([...reviews, ...newCards], schedules, {
      completedToday: { reviews: 198, newCards: 18 },
    }));

    expect(ids.filter((id) => id.startsWith("review-")).length).toBe(2);
    expect(ids.filter((id) => id.startsWith("new-")).length).toBe(2);
  });

  it("orders overdue review cards by due time", () => {
    const cards = [skill("later:reading"), skill("earlier:reading")];
    const schedules = [
      schedule("later:reading", "review", "2026-09-05T10:00:00.000Z"),
      schedule("earlier:reading", "review", "2026-09-03T10:00:00.000Z"),
    ];
    expect(buildStudyQueue(input(cards, schedules))).toEqual(["earlier:reading", "later:reading"]);
  });

  it("uses lower retrievability before the seeded tie-breaker when due times match", () => {
    const cards = [skill("stable:reading"), skill("weak:reading")];
    const schedules = [
      schedule("stable:reading", "review", undefined, { stability: 30 }),
      schedule("weak:reading", "review", undefined, { stability: 2 }),
    ];
    expect(buildStudyQueue(input(cards, schedules))[0]).toBe("weak:reading");
  });

  it("is stable for one seed and changes new-card order for another seed", () => {
    const cards = Array.from({ length: 12 }, (_, index) => skill(`new-${index}:reading`));
    const schedules = cards.map((card) => schedule(card.id, "new"));
    const first = buildStudyQueue(input(cards, schedules, { seed: "day-a" }));
    const repeated = buildStudyQueue(input(cards, schedules, { seed: "day-a" }));
    const changed = buildStudyQueue(input(cards, schedules, { seed: "day-b" }));

    expect(first).toEqual(repeated);
    expect(changed).not.toEqual(first);
  });

  it("computes the local day across a Bangkok midnight boundary", () => {
    expect(localDateInTimeZone(new Date("2026-09-05T16:59:59Z"), "Asia/Bangkok")).toBe("2026-09-05");
    expect(localDateInTimeZone(new Date("2026-09-05T17:00:00Z"), "Asia/Bangkok")).toBe("2026-09-06");
  });
});

import { describe, expect, it } from "vitest";
import type { Rating } from "../../domain/models";
import {
  createNewSchedule,
  createScheduler,
  DEFAULT_SCHEDULER_CONFIG,
} from "./scheduler";
import { FIXED_NOW, scheduleFixture } from "./scheduler-fixtures";

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

describe("FSRS scheduler adapter", () => {
  it("uses the exact installed scheduler version in every transition", () => {
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG);
    const before = createNewSchedule("note:reading", FIXED_NOW);
    const result = scheduler.answer(before, "good", FIXED_NOW);

    expect(result.next.scheduler).toBe("ts-fsrs");
    expect(result.next.schedulerVersion).toBe("5.2.3");
    expect(result.next.parametersHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.next.revision).toBe(1);
  });

  it.each(["new", "learning", "review", "relearning"] as const)(
    "produces deterministic transitions from %s",
    (state) => {
      const scheduler = createScheduler({
        ...DEFAULT_SCHEDULER_CONFIG,
        enableFuzz: false,
      });
      const before =
        state === "new"
          ? createNewSchedule("fixture:new", FIXED_NOW)
          : scheduleFixture(state);

      const first = RATINGS.map((rating) => scheduler.answer(before, rating, FIXED_NOW));
      const second = RATINGS.map((rating) => scheduler.answer(before, rating, FIXED_NOW));

      expect(first).toEqual(second);
      expect(first.map(({ next }) => ({
        ratingState: next.state,
        dueAt: next.dueAt,
        scheduledDays: next.scheduledDays,
        reps: next.reps,
        lapses: next.lapses,
      }))).toMatchSnapshot();
    },
  );

  it("previews ratings in nondecreasing due-time order", () => {
    const scheduler = createScheduler({
      ...DEFAULT_SCHEDULER_CONFIG,
      enableFuzz: false,
    });
    const preview = scheduler.preview(createNewSchedule("note:meaning", FIXED_NOW), FIXED_NOW);
    const dueTimes = RATINGS.map((rating) => Date.parse(preview[rating].dueAt));

    expect(dueTimes[0]).toBeLessThanOrEqual(dueTimes[1]!);
    expect(dueTimes[1]).toBeLessThanOrEqual(dueTimes[2]!);
    expect(dueTimes[2]).toBeLessThanOrEqual(dueTimes[3]!);
  });

  it("does not mutate the input schedule while previewing or answering", () => {
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG);
    const before = createNewSchedule("note:reading", FIXED_NOW);
    const snapshot = structuredClone(before);

    scheduler.preview(before, FIXED_NOW);
    scheduler.answer(before, "again", FIXED_NOW);

    expect(before).toEqual(snapshot);
  });
});

import type { ScheduleRecord } from "../../domain/models";

export const FIXED_NOW = new Date("2026-09-05T00:00:00.000Z");

export function scheduleFixture(
  state: ScheduleRecord["state"],
  overrides: Partial<ScheduleRecord> = {},
): ScheduleRecord {
  return {
    skillCardId: `fixture:${state}`,
    revision: 0,
    state,
    dueAt: FIXED_NOW.toISOString(),
    stability: state === "new" ? 0 : 4.5,
    difficulty: state === "new" ? 0 : 5.2,
    elapsedDays: state === "new" ? 0 : 3,
    scheduledDays: state === "new" ? 0 : 3,
    reps: state === "new" ? 0 : 3,
    lapses: state === "relearning" ? 1 : 0,
    lastReviewAt:
      state === "new" ? undefined : "2026-09-02T00:00:00.000Z",
    scheduler: "ts-fsrs",
    schedulerVersion: "5.2.3",
    parametersHash: "fixture",
    seededFromAnki: false,
    ...overrides,
  };
}

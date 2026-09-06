import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { Rating, ScheduleRecord, SkillCardRecord, NoteRecord } from "../../domain/models";
import type { GradeResult } from "./grading/types";
import { createNewSchedule, type SchedulePreview } from "./scheduler";
import { ScheduleConflictError, type StudyPrompt, type StudySession } from "./study-session";
import { StudyPage } from "./StudyPage";

const NOW = new Date("2026-09-05T00:00:00.000Z");
const schedule: ScheduleRecord = createNewSchedule("note:reading", NOW);
const card: SkillCardRecord = {
  id: "note:reading",
  noteId: "note",
  sourceAnkiCardId: "card",
  skill: "reading",
  createdAt: NOW.toISOString(),
};
const note: NoteRecord = {
  id: "note",
  deckId: "deck",
  ankiNoteId: "1",
  word: "学校",
  reading: "がっこう",
  meaning: "school",
  wordFurigana: "学校[がっこう]",
  sentence: "学校へ行く。",
  sentenceMeaning: "Go to school.",
  sentenceFurigana: "",
  notes: "Common noun",
  pitchAccent: "0",
  pitchAccentNotes: "Heiban",
  frequency: "100",
};
const interval: SchedulePreview = { dueAt: "2026-09-06T00:00:00.000Z", scheduledDays: 1 };
const intervals = Object.fromEntries(
  (["again", "hard", "good", "easy"] as Rating[]).map((rating) => [rating, interval]),
) as Record<Rating, SchedulePreview>;
const prompt: StudyPrompt = { card, note, schedule, scheduleRevision: 0, intervals };

function fakeSession(overrides: Partial<StudySession> = {}): StudySession {
  return {
    loadNext: vi.fn().mockResolvedValue(prompt),
    submitAnswer: vi.fn().mockReturnValue({
      grade: "correct",
      normalizedAnswer: "がっこう",
      matchedAlias: "がっこう",
      suggestedRating: "good",
      reason: "Reading matches an accepted answer.",
    } satisfies GradeResult),
    confirmRating: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

it("requires a typed answer before enabling rating buttons", async () => {
  const user = userEvent.setup();
  render(<StudyPage session={fakeSession()} />);
  expect(await screen.findByText("学校")).toBeVisible();
  expect(screen.getByRole("button", { name: /good/i })).toBeDisabled();
  await user.type(screen.getByLabelText(/your answer/i), "gakkou");
  await user.click(screen.getByRole("button", { name: /check/i }));
  expect(screen.getByText(/canonical answer/i)).toBeVisible();
  expect(screen.getByRole("button", { name: /good/i })).toBeEnabled();
});

it("keeps sentence and audio controls visible without duplicating them after reveal", async () => {
  const user = userEvent.setup();
  render(<StudyPage session={fakeSession()} />);

  expect(await screen.findByText("学校へ行く。")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Play word audio" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Play sentence audio" })).toHaveLength(1);
  await user.type(screen.getByLabelText(/your answer/i), "gakkou");
  await user.click(screen.getByRole("button", { name: /check/i }));
  expect(screen.getAllByRole("button", { name: "Play word audio" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Play sentence audio" })).toHaveLength(1);
});

it("uses rating shortcuts only after reveal", async () => {
  const user = userEvent.setup();
  const session = fakeSession();
  render(<StudyPage session={session} />);
  await screen.findByText("学校");
  await user.keyboard("3");
  expect(session.confirmRating).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText(/your answer/i), "gakkou");
  await user.click(screen.getByRole("button", { name: /check/i }));
  await user.keyboard("3");
  expect(session.confirmRating).toHaveBeenCalledWith("good");
});

it("shows a useful empty queue state", async () => {
  render(<StudyPage session={fakeSession({ loadNext: vi.fn().mockResolvedValue(undefined) })} />);
  expect(await screen.findByText(/nothing due right now/i)).toBeVisible();
  expect(screen.getByRole("link", { name: /import a deck/i })).toBeVisible();
});

it("labels a close answer in text and suggests Hard", async () => {
  const user = userEvent.setup();
  const session = fakeSession({
    submitAnswer: vi.fn().mockReturnValue({
      grade: "close",
      normalizedAnswer: "がこう",
      matchedAlias: "がっこう",
      suggestedRating: "hard",
      reason: "Reading is one small edit away; confirm the rating.",
    }),
  });
  render(<StudyPage session={session} />);
  await screen.findByText("学校");
  await user.type(screen.getByLabelText(/your answer/i), "gakou");
  await user.click(screen.getByRole("button", { name: /check/i }));
  expect(screen.getByText("Close")).toBeVisible();
  expect(screen.getByText(/suggested rating/i)).toHaveTextContent(/suggested rating:\s*hard/i);
});

it("explains how to recover from a schedule conflict", async () => {
  const user = userEvent.setup();
  const session = fakeSession({
    confirmRating: vi.fn().mockRejectedValue(new ScheduleConflictError()),
  });
  render(<StudyPage session={session} />);
  await screen.findByText("学校");
  await user.type(screen.getByLabelText(/your answer/i), "gakkou");
  await user.click(screen.getByRole("button", { name: /check/i }));
  await user.click(screen.getByRole("button", { name: /good/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/changed in another tab.*reload/i);
});

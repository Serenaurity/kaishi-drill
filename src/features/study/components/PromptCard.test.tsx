import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { NoteRecord, ScheduleRecord, SkillCardRecord } from "../../../domain/models";
import type { MediaRepository } from "../../media/media-repository";
import { createNewSchedule, type SchedulePreview } from "../scheduler";
import type { StudyPrompt } from "../study-session";
import { PromptCard } from "./PromptCard";

const now = new Date("2026-09-05T00:00:00.000Z");
const note: NoteRecord = {
  id: "note",
  deckId: "deck",
  ankiNoteId: "1",
  word: "語",
  reading: "ご",
  meaning: "word",
  wordFurigana: "語[ご]",
  sentence: "語を学ぶ。",
  sentenceMeaning: "Learn a word.",
  sentenceFurigana: "",
  notes: "",
  pitchAccent: "",
  pitchAccentNotes: "",
  frequency: "",
  pictureMediaId: "picture",
  wordAudioMediaId: "word-audio",
  sentenceAudioMediaId: "sentence-audio",
};
const card: SkillCardRecord = {
  id: "note:reading",
  noteId: note.id,
  sourceAnkiCardId: "card",
  skill: "reading",
  createdAt: now.toISOString(),
};
const schedule: ScheduleRecord = createNewSchedule(card.id, now);
const preview: SchedulePreview = { dueAt: now.toISOString(), scheduledDays: 0 };
const prompt: StudyPrompt = {
  card,
  note,
  schedule,
  scheduleRevision: 0,
  intervals: { again: preview, hard: preview, good: preview, easy: preview },
};

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:broken-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

it("replaces an image that fails to load with an explicit unavailable state", async () => {
  const repository: MediaRepository = {
    getBlob: vi.fn().mockResolvedValue(new Blob(["not an image"])),
  };
  render(<PromptCard prompt={prompt} repository={repository} />);
  const image = await screen.findByRole("img", { name: "Illustration for 語" });
  fireEvent.error(image);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Image unavailable")).toBeVisible();
});

it("shows the Japanese sentence and both audio controls on the prompt", async () => {
  const repository: MediaRepository = {
    getBlob: vi.fn().mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" })),
  };
  render(<PromptCard prompt={prompt} repository={repository} />);

  expect(await screen.findByText("語を学ぶ。")).toBeVisible();
  expect(await screen.findByRole("button", { name: "Play word audio" })).toBeVisible();
  expect(await screen.findByRole("button", { name: "Play sentence audio" })).toBeVisible();
});

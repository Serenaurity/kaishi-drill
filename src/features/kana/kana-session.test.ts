import { expect, it } from "vitest";
import { KANA_CATALOG } from "./kana-catalog";
import { gradeKana } from "./kana-grader";
import {
  createKanaSession,
  type KanaAttempt,
  type KanaRepository,
} from "./kana-session";
import type { KanaSkillRecord } from "../../domain/models";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function memoryRepository(initial: KanaSkillRecord[] = []): KanaRepository {
  const records = new Map(initial.map((record) => [record.id, record]));
  return {
    list: async () => [...records.values()],
    record: async (attempt: KanaAttempt) => {
      const previous = records.get(attempt.entryId);
      const attempts = (previous?.attempts ?? 0) + 1;
      const next: KanaSkillRecord = {
        id: attempt.entryId,
        attempts,
        correct: (previous?.correct ?? 0) + Number(attempt.correct),
        streak: attempt.correct ? (previous?.streak ?? 0) + 1 : 0,
        lastSeenAt: attempt.occurredAt,
        lastWrongAt: attempt.correct ? previous?.lastWrongAt : attempt.occurredAt,
        meanResponseMs: Math.round(
          (((previous?.meanResponseMs ?? 0) * (previous?.attempts ?? 0)) + attempt.responseMs) / attempts,
        ),
      };
      records.set(next.id, next);
      return next;
    },
  };
}

it("covers both scripts, marks and combinations with unique ids", () => {
  expect(new Set(KANA_CATALOG.map((entry) => entry.id)).size).toBe(KANA_CATALOG.length);
  expect(KANA_CATALOG.some((entry) => entry.kana === "あ" && entry.group === "basic")).toBe(true);
  expect(KANA_CATALOG.some((entry) => entry.kana === "ガ" && entry.group === "dakuten")).toBe(true);
  expect(KANA_CATALOG.some((entry) => entry.kana === "ぽ" && entry.group === "handakuten")).toBe(true);
  expect(KANA_CATALOG.some((entry) => entry.kana === "きゃ" && entry.group === "yoon")).toBe(true);
});

it.each([
  ["し", "shi"], ["し", "si"], ["ち", "chi"], ["ち", "ti"],
  ["つ", "tsu"], ["つ", "tu"], ["ふ", "fu"], ["ふ", "hu"],
  ["じ", "ji"], ["じ", "zi"], ["を", "wo"], ["を", "o"],
])("accepts %s as %s", (kana, answer) => {
  const entry = KANA_CATALOG.find((candidate) => candidate.kana === kana)!;
  expect(gradeKana(answer, entry)).toEqual({ correct: true, normalizedAnswer: answer });
});

it("prioritizes recent mistakes in focus mode", async () => {
  const repository = memoryRepository([{
    id: "hiragana:ぬ",
    attempts: 1,
    correct: 0,
    streak: 0,
    lastSeenAt: NOW.toISOString(),
    lastWrongAt: NOW.toISOString(),
    meanResponseMs: 900,
  }]);
  const prompt = await createKanaSession({ mode: "focus", seed: "fixed" }, repository).next();
  expect(prompt?.id).toBe("hiragana:ぬ");
});

it("updates mastery after every answer", async () => {
  const repository = memoryRepository();
  const entry = KANA_CATALOG.find((candidate) => candidate.kana === "あ")!;
  const session = createKanaSession({ mode: "standard", seed: "fixed", entries: [entry], now: () => NOW }, repository);
  expect((await session.next())?.id).toBe(entry.id);
  expect(await session.answer("a", 640)).toEqual({ correct: true, normalizedAnswer: "a" });
  expect(await repository.list()).toEqual([expect.objectContaining({
    id: entry.id,
    attempts: 1,
    correct: 1,
    streak: 1,
    meanResponseMs: 640,
  })]);
});

import type { KanaEntry } from "./kana-catalog";

export interface KanaGrade {
  correct: boolean;
  normalizedAnswer: string;
}

function normalizeRomaji(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[\s\-’']/g, "");
}

export function gradeKana(answer: string, entry: KanaEntry): KanaGrade {
  const normalizedAnswer = normalizeRomaji(answer);
  return {
    correct: normalizedAnswer.length > 0 && entry.romaji.some(
      (variant) => normalizeRomaji(variant) === normalizedAnswer,
    ),
    normalizedAnswer,
  };
}

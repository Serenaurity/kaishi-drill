import { damerauLevenshtein, normalizeReading } from "./kana-romaji";
import type { GradeResult } from "./types";

function result(
  grade: GradeResult["grade"],
  normalizedAnswer: string,
  matchedAlias: string | undefined,
  reason: string,
): GradeResult {
  return {
    grade,
    normalizedAnswer,
    matchedAlias,
    suggestedRating: grade === "correct" ? "good" : grade === "close" ? "hard" : "again",
    reason,
  };
}

export function gradeReading(answer: string, acceptedReadings: string[]): GradeResult {
  const normalizedAnswer = normalizeReading(answer);
  if (!normalizedAnswer) return result("incorrect", "", undefined, "Type a reading before grading.");
  const aliases = acceptedReadings
    .flatMap((reading) => reading.split(/[;,，、/／|]+/))
    .map((reading) => ({ original: reading.trim(), normalized: normalizeReading(reading) }))
    .filter((reading) => reading.normalized.length > 0);
  const exact = aliases.find((reading) => reading.normalized === normalizedAnswer);
  if (exact) return result("correct", normalizedAnswer, exact.original, "Reading matches an accepted answer.");
  const close = aliases.find((reading) =>
    Math.max(reading.normalized.length, normalizedAnswer.length) >= 3 &&
    damerauLevenshtein(normalizedAnswer, reading.normalized) <= 1,
  );
  if (close) return result("close", normalizedAnswer, close.original, "Reading is one small edit away; confirm the rating.");
  return result("incorrect", normalizedAnswer, undefined, "Reading does not match an accepted answer.");
}

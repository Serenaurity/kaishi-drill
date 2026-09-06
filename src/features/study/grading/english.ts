import { damerauLevenshtein } from "./kana-romaji";
import type { GradeResult } from "./types";

function normalizeEnglish(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenKey(value: string): string {
  return value.split(" ").filter(Boolean).sort().join(" ");
}

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

export function deriveEnglishAliases(gloss: string): string[] {
  const explicitAliases = gloss
    .normalize("NFKC")
    .replace(/\([^)]*\)/g, " ")
    .split(/[;,，；/／|]+/)
    .map((value) => normalizeEnglish(value))
    .filter(Boolean);
  const aliases = explicitAliases.flatMap((value) =>
    value.startsWith("to ") && value.length > 3
      ? [value, value.slice(3)]
      : [value],
  );
  return [...new Set(aliases)];
}

export function gradeEnglish(answer: string, aliases: string[]): GradeResult {
  const normalizedAnswer = normalizeEnglish(answer);
  if (!normalizedAnswer) return result("incorrect", "", undefined, "Type a meaning before grading.");
  const normalizedAliases = aliases
    .map((alias) => ({ original: alias, normalized: normalizeEnglish(alias) }))
    .filter((alias) => alias.normalized.length > 0);
  const exact = normalizedAliases.find((alias) =>
    alias.normalized === normalizedAnswer ||
    (alias.normalized.includes(" ") && tokenKey(alias.normalized) === tokenKey(normalizedAnswer)),
  );
  if (exact) return result("correct", normalizedAnswer, exact.original, "Meaning matches an explicit gloss alias.");
  const typo = normalizedAliases.find((alias) =>
    Math.max(alias.normalized.length, normalizedAnswer.length) >= 4 &&
    damerauLevenshtein(normalizedAnswer, alias.normalized) <= 1,
  );
  if (typo) return result("close", normalizedAnswer, typo.original, "Meaning has one likely typo; confirm the rating.");
  const answerTokens = new Set(normalizedAnswer.split(" "));
  const overlap = normalizedAliases.find((alias) =>
    alias.normalized.split(" ").some((token) => token.length > 2 && answerTokens.has(token)),
  );
  if (overlap) return result("close", normalizedAnswer, overlap.original, "A keyword overlaps, but the full meaning does not match.");
  return result("incorrect", normalizedAnswer, undefined, "Meaning does not match an explicit gloss alias.");
}

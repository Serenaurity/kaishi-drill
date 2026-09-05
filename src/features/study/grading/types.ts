import type { Rating } from "../../../domain/models";

export interface GradeResult {
  grade: "correct" | "close" | "incorrect";
  normalizedAnswer: string;
  matchedAlias?: string;
  suggestedRating: Rating;
  reason: string;
}

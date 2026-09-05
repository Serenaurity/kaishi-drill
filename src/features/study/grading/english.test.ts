import { describe, expect, it } from "vitest";
import { deriveEnglishAliases, gradeEnglish } from "./english";

describe("English meaning grading", () => {
  it("accepts an explicit gloss alias", () => {
    const aliases = deriveEnglishAliases("word; language (general)");
    expect(gradeEnglish("language", aliases).grade).toBe("correct");
  });

  it("accepts the same multiword alias in a different token order", () => {
    expect(gradeEnglish("photograph a take to", ["to take a photograph"]).grade).toBe("correct");
  });

  it("does not mark keyword overlap as correct", () => {
    const aliases = deriveEnglishAliases("to take a photograph");
    expect(gradeEnglish("take", aliases).grade).toBe("close");
  });

  it("treats one bounded typo as close, not silently exact", () => {
    expect(gradeEnglish("langauge", ["language"])).toMatchObject({
      grade: "close",
      suggestedRating: "hard",
    });
  });

  it("normalizes Unicode, case, punctuation and whitespace", () => {
    expect(gradeEnglish("  LANGUAGE! ", ["language"]).grade).toBe("correct");
  });

  it("keeps unrelated and empty answers incorrect", () => {
    expect(gradeEnglish("banana", ["language"]).grade).toBe("incorrect");
    expect(gradeEnglish("", ["language"])).toMatchObject({
      grade: "incorrect",
      suggestedRating: "again",
    });
  });
});

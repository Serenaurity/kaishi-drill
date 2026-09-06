import { describe, expect, it } from "vitest";
import { deriveEnglishAliases, gradeEnglish } from "./english";

describe("English meaning grading", () => {
  it("accepts an explicit gloss alias", () => {
    const aliases = deriveEnglishAliases("word; language (general)");
    expect(gradeEnglish("language", aliases).grade).toBe("correct");
  });

  it("accepts each comma-separated gloss independently", () => {
    const aliases = deriveEnglishAliases("lover, sweetheart");
    expect(aliases).toEqual(["lover", "sweetheart"]);
    expect(gradeEnglish("lover", aliases).grade).toBe("correct");
    expect(gradeEnglish("sweetheart", aliases).grade).toBe("correct");
  });

  it("accepts every verb gloss with or without its leading infinitive marker", () => {
    const aliases = deriveEnglishAliases("to welcome, to go out to meet, to invite");
    for (const answer of [
      "to welcome",
      "welcome",
      "to go out to meet",
      "go out to meet",
      "to invite",
      "invite",
    ]) {
      expect(gradeEnglish(answer, aliases).grade, answer).toBe("correct");
    }
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

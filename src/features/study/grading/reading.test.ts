import { describe, expect, it } from "vitest";
import { gradeReading } from "./reading";

describe("reading grading", () => {
  it.each([
    ["がっこう", "がっこう"],
    ["gakkou", "がっこう"],
    ["gakkō", "がっこう"],
    ["スーパー", "スーパー"],
    ["suupaa", "スーパー"],
    ["しんよう", "しんよう"],
    ["shinyou", "しんよう"],
    ["si", "し"],
    ["ti", "ち"],
    ["tu", "つ"],
    ["hu", "ふ"],
  ])("accepts %s for %s", (answer, reading) => {
    expect(gradeReading(answer, [reading]).grade).toBe("correct");
  });

  it("keeps small sokuon distinct from full tsu", () => {
    expect(gradeReading("がつこう", ["がっこう"]).grade).not.toBe("correct");
  });

  it("keeps ji and di distinct without an accepted alias", () => {
    expect(gradeReading("じ", ["ぢ"]).grade).not.toBe("correct");
  });

  it("marks one bounded typo as close", () => {
    expect(gradeReading("がこう", ["がっこう"])).toMatchObject({
      grade: "close",
      suggestedRating: "hard",
    });
  });

  it("treats an empty answer as incorrect", () => {
    expect(gradeReading("  ", ["ことば"])).toMatchObject({
      grade: "incorrect",
      suggestedRating: "again",
    });
  });
});

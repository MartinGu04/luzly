import { describe, expect, it } from "vitest";
import { initialsOf } from "./avatar";

describe("initialsOf", () => {
  it("takes first+last initial for a two-word name", () => {
    expect(initialsOf("דני בדיקה")).toBe("דב");
  });

  it("takes first+last initial for a multi-word name", () => {
    expect(initialsOf("נועה כהן לוי")).toBe("נל");
  });

  it("takes the first two characters for a single-word name", () => {
    expect(initialsOf("דני")).toBe("דנ");
  });

  it("never throws on a blank name", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});

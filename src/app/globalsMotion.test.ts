import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve(__dirname, "./globals.css"), "utf8");

describe("globals.css motion system", () => {
  it("35. defines a prefers-reduced-motion media query", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("disables every named ambient/entrance animation under reduced motion", () => {
    const reducedBlockMatch = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*)}\s*$/);
    expect(reducedBlockMatch).not.toBeNull();
    const reducedBlock = reducedBlockMatch?.[1] ?? "";

    for (const className of [
      "animate-pulse-dot",
      "animate-pulse-ring",
      "animate-fade-up",
      "animate-breathe",
      "animate-issue-pulse",
      "animate-login-now-drift",
    ]) {
      expect(reducedBlock).toContain(`.${className}`);
    }
  });

  it("defines the named keyframes referenced by the motion utility classes", () => {
    for (const keyframeName of [
      "pulse-dot",
      "pulse-ring",
      "fade-up",
      "breathe",
      "issue-pulse",
      "login-now-drift",
    ]) {
      expect(css).toContain(`@keyframes ${keyframeName}`);
    }
  });
});

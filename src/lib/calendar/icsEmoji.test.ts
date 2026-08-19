import { describe, expect, it } from "vitest";
import type { IcsEmojiInput } from "./icsEmoji";
import { icsEventEmoji, withEmojiPrefix } from "./icsEmoji";

function input(overrides: Partial<IcsEmojiInput> = {}): IcsEmojiInput {
  return { category: "shift", period: "day", dutyFamily: null, absenceKind: null, ...overrides };
}

describe("icsEventEmoji -- shift periods", () => {
  it("maps day shift to the sun", () => {
    expect(icsEventEmoji(input({ category: "shift", period: "day" }))).toBe("☀️");
  });

  it("maps night shift to the moon", () => {
    expect(icsEventEmoji(input({ category: "shift", period: "night" }))).toBe("🌙");
  });

  it("maps morning shift to sunrise", () => {
    expect(icsEventEmoji(input({ category: "shift", period: "morning" }))).toBe("🌅");
  });

  it("returns null for an unspecified-period shift -- never guesses", () => {
    expect(icsEventEmoji(input({ category: "shift", period: "unspecified" }))).toBeNull();
  });
});

describe("icsEventEmoji -- duty families (per PR's requested mapping)", () => {
  it("maps guard to the shield requested for the feed (differs from the in-app UI's guard emoji on purpose)", () => {
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "guard" }))).toBe("🛡️");
  });

  it("maps evacuation_on_call to the phone requested for the feed (differs from the in-app UI's ambulance emoji on purpose)", () => {
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "evacuation_on_call" }))).toBe("📞");
  });

  it("maps every kitchen variant to the same plate symbol", () => {
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "full_kitchen" }))).toBe("🍽️");
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "daily_kitchen" }))).toBe("🍽️");
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "weekend_kitchen" }))).toBe("🍽️");
  });

  it("maps reserve and callup, reused from the in-app UI's existing choices (not explicitly requested, but already established)", () => {
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "reserve" }))).toBe("🪖");
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "callup" }))).toBe("📞");
  });

  it("returns null for duty families with no fitting symbol (rasar, oxid) -- degrades gracefully, never invents one", () => {
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "rasar" }))).toBeNull();
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: "oxid" }))).toBeNull();
  });

  it("returns null for a duty Event with no dutyFamily at all", () => {
    expect(icsEventEmoji(input({ category: "duty", dutyFamily: null }))).toBeNull();
  });
});

describe("icsEventEmoji -- absence kinds", () => {
  it("maps vacation to the requested beach symbol", () => {
    expect(icsEventEmoji(input({ category: "absence", absenceKind: "vacation" }))).toBe("🏖️");
  });

  it("maps after to the requested house symbol (differs from the in-app UI's sunrise emoji on purpose)", () => {
    expect(icsEventEmoji(input({ category: "absence", absenceKind: "after" }))).toBe("🏠");
  });

  it("maps referral to the requested medical symbol", () => {
    expect(icsEventEmoji(input({ category: "absence", absenceKind: "referral" }))).toBe("🩺");
  });

  it("maps abroad, reused from the in-app UI's existing choice (not explicitly requested)", () => {
    expect(icsEventEmoji(input({ category: "absence", absenceKind: "abroad" }))).toBe("🏖️");
  });

  it("returns null for absence kinds with no fitting symbol (medical, day_off)", () => {
    expect(icsEventEmoji(input({ category: "absence", absenceKind: "medical" }))).toBeNull();
    expect(icsEventEmoji(input({ category: "absence", absenceKind: "day_off" }))).toBeNull();
  });

  it("returns null for an absence Event with no absenceKind at all", () => {
    expect(icsEventEmoji(input({ category: "absence", absenceKind: null }))).toBeNull();
  });
});

describe("icsEventEmoji never infers from rawValue/title text", () => {
  it("only reads the four typed fields -- identical structural input always produces the identical decision", () => {
    const withExtraFields = {
      ...input({ category: "shift", period: "day" }),
      rawValue: "לילה ???",
      title: "לילה ???",
    };
    expect(icsEventEmoji(withExtraFields)).toBe("☀️");
  });
});

describe("withEmojiPrefix", () => {
  it("prefixes with the emoji and a single space", () => {
    expect(withEmojiPrefix("☀️", 'אחמ"ש יום')).toBe('☀️ אחמ"ש יום');
  });

  it("returns the text unchanged (no leading space, no artifact) when emoji is null", () => {
    expect(withEmojiPrefix(null, "טקסט לא ידוע")).toBe("טקסט לא ידוע");
  });
});

import { describe, expect, it } from "vitest";
import { assignmentEmoji, dutyFamilyEmoji, type AssignmentEmojiInput } from "./emoji";

function input(overrides: Partial<AssignmentEmojiInput> = {}): AssignmentEmojiInput {
  return {
    category: "shift",
    period: "day",
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

describe("assignmentEmoji — shift periods", () => {
  it("maps day shift to sun", () => {
    expect(assignmentEmoji(input({ category: "shift", period: "day" }))).toBe("☀️");
  });

  it("maps night shift to moon", () => {
    expect(assignmentEmoji(input({ category: "shift", period: "night" }))).toBe("🌙");
  });

  it("maps morning shift to sunrise", () => {
    expect(assignmentEmoji(input({ category: "shift", period: "morning" }))).toBe("🌅");
  });

  it("returns null for an unspecified-period shift -- never guesses", () => {
    expect(assignmentEmoji(input({ category: "shift", period: "unspecified" }))).toBeNull();
  });
});

describe("assignmentEmoji — duty families", () => {
  it("maps known duty families", () => {
    expect(assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "guard" }))).toBe("🛡️");
    expect(assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "reserve" }))).toBe("🧩");
    expect(
      assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "evacuation_on_call" })),
    ).toBe("🚑");
    expect(assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "full_kitchen" }))).toBe(
      "🍽️",
    );
    expect(
      assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "weekend_kitchen" })),
    ).toBe("🍽️");
    expect(assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "callup" }))).toBe("📞");
  });

  it("returns null for a duty family with no fitting mapping", () => {
    expect(assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "rasar" }))).toBeNull();
    expect(assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: "oxid" }))).toBeNull();
  });

  it("returns null for a duty Event with no dutyFamily at all", () => {
    expect(assignmentEmoji(input({ category: "duty", period: "unspecified", dutyFamily: null }))).toBeNull();
  });
});

describe("assignmentEmoji — absence kinds", () => {
  it("maps vacation and abroad to a calm beach symbol", () => {
    expect(assignmentEmoji(input({ category: "absence", period: "unspecified", absenceKind: "vacation" }))).toBe(
      "🏖️",
    );
    expect(assignmentEmoji(input({ category: "absence", period: "unspecified", absenceKind: "abroad" }))).toBe(
      "🏖️",
    );
  });

  it("returns null for absence kinds with no fitting mapping", () => {
    expect(assignmentEmoji(input({ category: "absence", period: "unspecified", absenceKind: "medical" }))).toBeNull();
    expect(assignmentEmoji(input({ category: "absence", period: "unspecified", absenceKind: "day_off" }))).toBeNull();
    expect(assignmentEmoji(input({ category: "absence", period: "unspecified", absenceKind: "after" }))).toBeNull();
  });
});

describe("assignmentEmoji — unmapped categories never guess", () => {
  it("returns null for status/constraint/context/change_note/other/unknown", () => {
    for (const category of ["status", "constraint", "context", "change_note", "other", "unknown"] as const) {
      expect(assignmentEmoji(input({ category, period: "unspecified" }))).toBeNull();
    }
  });
});

describe("assignmentEmoji never infers from rawValue/title text", () => {
  it("the function signature has no rawValue/title field to read in the first place", () => {
    // Two Events with identical typed fields but wildly different free
    // text must produce the identical emoji decision -- proving the
    // mapping is driven only by category/period/dutyFamily/absenceKind.
    const a = input({ category: "shift", period: "day" });
    const b = input({ category: "shift", period: "day" });
    expect(assignmentEmoji(a)).toBe(assignmentEmoji(b));

    // TypeScript structural typing: passing a full PersonalEventView-like
    // object (with rawValue/title) still only reads the four typed fields.
    const withExtraFields = {
      ...input({ category: "shift", period: "day" }),
      rawValue: "לילה ???",
      title: "לילה ???",
    };
    expect(assignmentEmoji(withExtraFields)).toBe("☀️");
  });
});

describe("dutyFamilyEmoji", () => {
  it("maps a known duty family directly", () => {
    expect(dutyFamilyEmoji("guard")).toBe("🛡️");
  });

  it("returns null for a duty family with no fitting mapping", () => {
    expect(dutyFamilyEmoji("rasar")).toBeNull();
  });
});

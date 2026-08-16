import { describe, expect, it } from "vitest";
import { parseSearchIntent } from "./parseSearchIntent";

describe("parseSearchIntent — query parsing", () => {
  it("1. an exact person name parses as a person intent", () => {
    expect(parseSearchIntent("עילאי כהן")).toEqual({ kind: "person", query: "עילאי כהן" });
  });

  it("2. a partial person name parses as a person intent", () => {
    expect(parseSearchIntent("עיל")).toEqual({ kind: "person", query: "עיל" });
  });

  it("3. '19.8' parses as an explicit date intent", () => {
    expect(parseSearchIntent("19.8")).toEqual({
      kind: "date",
      date: { kind: "explicit", day: 19, month: 8 },
      raw: "19.8",
    });
  });

  it("3. '19/8' parses the same as '19.8'", () => {
    expect(parseSearchIntent("19/8")).toEqual({
      kind: "date",
      date: { kind: "explicit", day: 19, month: 8 },
      raw: "19/8",
    });
  });

  it("3. '19-8' parses the same as '19.8'", () => {
    expect(parseSearchIntent("19-8")).toEqual({
      kind: "date",
      date: { kind: "explicit", day: 19, month: 8 },
      raw: "19-8",
    });
  });

  it("4. a bare weekday query parses as a weekday date intent", () => {
    expect(parseSearchIntent("חמישי")).toEqual({
      kind: "date",
      date: { kind: "weekday", weekdayIndex: 4 },
      raw: "חמישי",
    });
    expect(parseSearchIntent("שבת")).toEqual({
      kind: "date",
      date: { kind: "weekday", weekdayIndex: 6 },
      raw: "שבת",
    });
  });

  it("4. 'יום חמישי' parses the same as bare 'חמישי' -- never misread as day-shift + weekday", () => {
    expect(parseSearchIntent("יום חמישי")).toEqual({
      kind: "date",
      date: { kind: "weekday", weekdayIndex: 4 },
      raw: "יום חמישי",
    });
  });

  it("5. 'לילה 19.8' parses as a shift intent", () => {
    expect(parseSearchIntent("לילה 19.8")).toEqual({
      kind: "shift",
      date: { kind: "explicit", day: 19, month: 8 },
      period: "night",
      raw: "לילה 19.8",
    });
  });

  it("5. 'יום 19.8' parses as a day-shift intent", () => {
    expect(parseSearchIntent("יום 19.8")).toEqual({
      kind: "shift",
      date: { kind: "explicit", day: 19, month: 8 },
      period: "day",
      raw: "יום 19.8",
    });
  });

  it("5. 'לילה חמישי' parses as a shift+weekday intent", () => {
    expect(parseSearchIntent("לילה חמישי")).toEqual({
      kind: "shift",
      date: { kind: "weekday", weekdayIndex: 4 },
      period: "night",
      raw: "לילה חמישי",
    });
  });

  it("5. 'משמרת לילה שבת' parses as a shift+weekday intent, ignoring the filler word", () => {
    expect(parseSearchIntent("משמרת לילה שבת")).toEqual({
      kind: "shift",
      date: { kind: "weekday", weekdayIndex: 6 },
      period: "night",
      raw: "משמרת לילה שבת",
    });
  });

  it("6. 'מי איתי בשבת' parses as a with_me intent with the resolved weekday+no period", () => {
    expect(parseSearchIntent("מי איתי בשבת")).toEqual({
      kind: "with_me",
      date: { kind: "weekday", weekdayIndex: 6 },
      period: null,
      raw: "מי איתי בשבת",
    });
  });

  it("מי איתי חמישי / ב19.8 / בלילה 19.8 all parse as with_me", () => {
    expect(parseSearchIntent("מי איתי חמישי")).toEqual({
      kind: "with_me",
      date: { kind: "weekday", weekdayIndex: 4 },
      period: null,
      raw: "מי איתי חמישי",
    });
    expect(parseSearchIntent("מי איתי ב19.8")).toEqual({
      kind: "with_me",
      date: { kind: "explicit", day: 19, month: 8 },
      period: null,
      raw: "מי איתי ב19.8",
    });
    expect(parseSearchIntent("מי איתי בלילה 19.8")).toEqual({
      kind: "with_me",
      date: { kind: "explicit", day: 19, month: 8 },
      period: "night",
      raw: "מי איתי בלילה 19.8",
    });
  });

  it("bare 'מי איתי' (no date) still parses as with_me, with a null date -- resolved against today at the resolution step", () => {
    expect(parseSearchIntent("מי איתי")).toEqual({ kind: "with_me", date: null, period: null, raw: "מי איתי" });
  });

  it("7. 'מתי אני ועילאי יחד' parses as a shared_shift intent", () => {
    expect(parseSearchIntent("מתי אני ועילאי יחד")).toEqual({
      kind: "shared_shift",
      personQuery: "עילאי",
      raw: "מתי אני ועילאי יחד",
    });
  });

  it("'מתי אנחנו יחד עילאי' and 'מתי אני עם עילאי' also parse as shared_shift", () => {
    expect(parseSearchIntent("מתי אנחנו יחד עילאי")).toEqual({
      kind: "shared_shift",
      personQuery: "עילאי",
      raw: "מתי אנחנו יחד עילאי",
    });
    expect(parseSearchIntent("מתי אני עם עילאי")).toEqual({
      kind: "shared_shift",
      personQuery: "עילאי",
      raw: "מתי אני עם עילאי",
    });
  });

  it("8. collapses repeated internal whitespace and trims surrounding whitespace before parsing", () => {
    expect(parseSearchIntent("   עילאי    כהן   ")).toEqual({ kind: "person", query: "עילאי כהן" });
    expect(parseSearchIntent("  לילה    19.8  ")).toEqual({
      kind: "shift",
      date: { kind: "explicit", day: 19, month: 8 },
      period: "night",
      raw: "לילה 19.8",
    });
  });

  it("8. tolerates '.', '/', and '-' interchangeably as the date punctuation", () => {
    const dot = parseSearchIntent("19.8");
    const slash = parseSearchIntent("19/8");
    const dash = parseSearchIntent("19-8");
    expect(dot.kind).toBe("date");
    expect(slash.kind).toBe("date");
    expect(dash.kind).toBe("date");
    if (dot.kind === "date" && slash.kind === "date" && dash.kind === "date") {
      expect(dot.date).toEqual(slash.date);
      expect(slash.date).toEqual(dash.date);
    }
  });

  it("9. an ambiguous partial name is still just parsed as a person query -- disambiguation happens at resolution, not parsing", () => {
    // Parsing never knows how many people a query might match; it only recognizes the shape of the query itself.
    expect(parseSearchIntent("א")).toEqual({ kind: "person", query: "א" });
  });

  it("10. nonsense input falls back to a person intent rather than an error -- resolution decides there's no match", () => {
    expect(parseSearchIntent("asdkjfh")).toEqual({ kind: "person", query: "asdkjfh" });
    expect(parseSearchIntent("12345")).toEqual({ kind: "person", query: "12345" });
  });

  it("empty/whitespace-only input parses as empty, not person", () => {
    expect(parseSearchIntent("")).toEqual({ kind: "empty" });
    expect(parseSearchIntent("   ")).toEqual({ kind: "empty" });
  });

  it("an unanchored bare period word with no date never becomes a shift intent -- falls back to person", () => {
    expect(parseSearchIntent("לילה")).toEqual({ kind: "person", query: "לילה" });
  });

  it("a bare period+date combo with a leftover unrecognized token never becomes a shift intent", () => {
    expect(parseSearchIntent("לילה 19.8 בערך")).toEqual({ kind: "person", query: "לילה 19.8 בערך" });
  });
});

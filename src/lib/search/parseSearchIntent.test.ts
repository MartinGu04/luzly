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
      personA: { kind: "self" },
      personB: { kind: "query", text: "עילאי" },
      raw: "מתי אני ועילאי יחד",
    });
  });

  it("'מתי אנחנו יחד עילאי' and 'מתי אני עם עילאי' also parse as shared_shift", () => {
    expect(parseSearchIntent("מתי אנחנו יחד עילאי")).toEqual({
      kind: "shared_shift",
      personA: { kind: "self" },
      personB: { kind: "query", text: "עילאי" },
      raw: "מתי אנחנו יחד עילאי",
    });
    expect(parseSearchIntent("מתי אני עם עילאי")).toEqual({
      kind: "shared_shift",
      personA: { kind: "self" },
      personB: { kind: "query", text: "עילאי" },
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

const SELF = { kind: "self" } as const;
function personQuery(text: string) {
  return { kind: "query", text } as const;
}

describe("parseSearchIntent — flexible shared_shift phrasing (self + person)", () => {
  const selfAndPerson = [
    "מתי אני ואיתי יחד",
    "מתי אני ואיתי ביחד",
    "מתי אני עם איתי",
    "מתי יש לי משמרת עם איתי",
    "מתי יש לי משמרת ביחד עם איתי",
    "מתי יש לי משמרת משותפת עם איתי",
    "מתי אני ואיתי באותה משמרת",
    "באיזה משמרת אני עם איתי",
    "באיזו משמרת אני עם איתי",
    "מתי המשמרת המשותפת שלי עם איתי",
  ];

  it.each(selfAndPerson)("'%s' resolves to shared_shift(self, \"איתי\") as a roster query, never the with_me trigger", (raw) => {
    const intent = parseSearchIntent(raw);
    expect(intent.kind).toBe("shared_shift");
    if (intent.kind !== "shared_shift") return;
    expect(intent.personA).toEqual(SELF);
    expect(intent.personB).toEqual(personQuery("איתי"));
  });

  it("'מתי איתי ואני ביחד' (reversed order) resolves to the same semantic pair, with self on the SECOND side", () => {
    const intent = parseSearchIntent("מתי איתי ואני ביחד");
    expect(intent).toEqual({
      kind: "shared_shift",
      personA: personQuery("איתי"),
      personB: SELF,
      raw: "מתי איתי ואני ביחד",
    });
  });

  it("a trailing '?' and extra internal whitespace are both tolerated", () => {
    expect(parseSearchIntent("מתי אני ואיתי ביחד?")).toEqual({
      kind: "shared_shift",
      personA: SELF,
      personB: personQuery("איתי"),
      raw: "מתי אני ואיתי ביחד",
    });
    expect(parseSearchIntent("מתי   אני   ואיתי   ביחד")).toEqual({
      kind: "shared_shift",
      personA: SELF,
      personB: personQuery("איתי"),
      raw: "מתי אני ואיתי ביחד",
    });
  });
});

describe("parseSearchIntent — flexible shared_shift phrasing (arbitrary person + person)", () => {
  it.each([
    "מתי מארק מאירסון וגדעון ביחד",
    "מתי מארק מאירסון וגדעון יחד",
    "מתי מארק מאירסון יחד עם גדעון",
    "מתי מארק מאירסון עם גדעון",
  ])("'%s' resolves to shared_shift(\"מארק מאירסון\", \"גדעון\") -- a multi-word name is never split on internal whitespace", (raw) => {
    const intent = parseSearchIntent(raw);
    expect(intent.kind).toBe("shared_shift");
    if (intent.kind !== "shared_shift") return;
    expect(intent.personA).toEqual(personQuery("מארק מאירסון"));
    expect(intent.personB).toEqual(personQuery("גדעון"));
  });

  it.each([
    "מתי טוביה וליה ביחד",
    "מתי יש לטוביה משמרת עם ליה",
    "מתי יש לטוביה משמרת ביחד עם ליה",
    "מתי יש לטוביה משמרת משותפת עם ליה",
  ])("'%s' resolves to shared_shift(\"טוביה\", \"ליה\") -- the ל in 'יש לטוביה' is stripped structurally, never a generic strip", (raw) => {
    const intent = parseSearchIntent(raw);
    expect(intent.kind).toBe("shared_shift");
    if (intent.kind !== "shared_shift") return;
    expect(intent.personA).toEqual(personQuery("טוביה"));
    expect(intent.personB).toEqual(personQuery("ליה"));
  });
});

describe("parseSearchIntent — shared_shift phrasing never interferes with unrelated intents", () => {
  it("'מי איתי' still resolves as with_me, never as a shared_shift query about a person named איתי", () => {
    expect(parseSearchIntent("מי איתי")).toEqual({ kind: "with_me", date: null, period: null, raw: "מי איתי" });
  });

  it("an ordinary person query containing 'עם' or 'יחד' as a name substring (no 'מתי' trigger) stays a person intent", () => {
    expect(parseSearchIntent("עמי כהן")).toEqual({ kind: "person", query: "עמי כהן" });
    expect(parseSearchIntent("יחדיה לוי")).toEqual({ kind: "person", query: "יחדיה לוי" });
  });

  it("plain person and date queries are entirely unaffected by the shared_shift grammar", () => {
    expect(parseSearchIntent("עילאי כהן")).toEqual({ kind: "person", query: "עילאי כהן" });
    expect(parseSearchIntent("19.8")).toEqual({ kind: "date", date: { kind: "explicit", day: 19, month: 8 }, raw: "19.8" });
  });
});

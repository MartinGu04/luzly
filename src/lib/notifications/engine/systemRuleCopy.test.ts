import { describe, expect, it } from "vitest";
import { applySystemRuleCopy } from "./systemRuleCopy";

describe("applySystemRuleCopy -- the ONE place a system reminder's built-in copy is combined with a manager override", () => {
  describe("static-body category (e.g. tomorrow_logistics_withdrawal, constraints_sunday, constraints_monday, logistics_withdrawal_noon_assigned/supervisor)", () => {
    it("null overrides leave the built-in title/body unchanged", () => {
      const result = applySystemRuleCopy(
        "tomorrow_logistics_withdrawal",
        { titleOverride: null, bodyOverride: null },
        { title: "📦 משיכות מהלוגיסטיקה מחר", body: "מחר אתה עושה משיכות בין 13:00–14:00." },
      );
      expect(result).toEqual({ title: "📦 משיכות מהלוגיסטיקה מחר", body: "מחר אתה עושה משיכות בין 13:00–14:00." });
    });

    it("a saved body override REPLACES the built-in body outright -- never a template substitution", () => {
      const result = applySystemRuleCopy(
        "constraints_sunday",
        { titleOverride: "כותרת מותאמת", bodyOverride: "תוכן מותאם לגמרי, בלי שום פרט דינמי" },
        { title: "📌 תזכורת לאילוצים", body: "יש אילוץ לשבוע הבא? אפשר לשלוח עד מחר." },
      );
      expect(result).toEqual({ title: "כותרת מותאמת", body: "תוכן מותאם לגמרי, בלי שום פרט דינמי" });
    });

    it("a body override containing the literal {details} text is still used verbatim for a static category -- it is just ordinary text there, never substituted", () => {
      const result = applySystemRuleCopy(
        "constraints_monday",
        { titleOverride: null, bodyOverride: "טקסט עם {details} בתוכו כמילה רגילה" },
        { title: "⏳ היום האחרון לאילוצים", body: "אפשר לשלוח אילוצים לשבוע הבא עד סוף היום." },
      );
      expect(result.body).toBe("טקסט עם {details} בתוכו כמילה רגילה");
    });
  });

  describe("dynamic-body category (e.g. tomorrow_shift, tomorrow_duty, tomorrow_logistics_withdrawal_supervisor, logistics_withdrawal_noon_team, almash_check_in)", () => {
    it("null body override leaves the trusted dynamic details untouched, verbatim", () => {
      const result = applySystemRuleCopy(
        "tomorrow_shift",
        { titleOverride: null, bodyOverride: null },
        { title: "⏰ המשמרת שלך מחר", body: "מחר ב־08:00 מתחילה משמרת יום שלך" },
      );
      expect(result).toEqual({ title: "⏰ המשמרת שלך מחר", body: "מחר ב־08:00 מתחילה משמרת יום שלך" });
    });

    it("a saved body override is a {details} TEMPLATE -- substituted with the real dynamic details, never replacing them", () => {
      const result = applySystemRuleCopy(
        "tomorrow_shift",
        { titleOverride: null, bodyOverride: "תזכורת חשובה 👀 {details}" },
        { title: "⏰ המשמרת שלך מחר", body: "מחר ב־08:00 מתחילה משמרת יום שלך" },
      );
      expect(result.body).toBe("תזכורת חשובה 👀 מחר ב־08:00 מתחילה משמרת יום שלך");
    });

    it("title override always fully replaces the built-in title, independent of body handling", () => {
      const result = applySystemRuleCopy(
        "tomorrow_duty",
        { titleOverride: "כותרת חדשה", bodyOverride: null },
        { title: "🪖 תורנות מתקרבת", body: "מחר אתה שומר — כדאי לבדוק את הפרטים" },
      );
      expect(result.title).toBe("כותרת חדשה");
      expect(result.body).toBe("מחר אתה שומר — כדאי לבדוק את הפרטים"); // dynamic facts preserved
    });

    it("an unresolved/fallback dynamic detail sentence is still exactly what gets substituted -- never a guessed/invented time", () => {
      const result = applySystemRuleCopy(
        "tomorrow_shift",
        { titleOverride: null, bodyOverride: "⚠️ {details}" },
        { title: "⏰ המשמרת שלך מחר", body: "מחר יש לך משמרת" }, // the real fallback sentence when the shift time can't be resolved
      );
      expect(result.body).toBe("⚠️ מחר יש לך משמרת");
    });
  });
});

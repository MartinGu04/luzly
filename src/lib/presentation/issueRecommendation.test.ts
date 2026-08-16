import { describe, expect, it } from "vitest";
import type { ManagerIssueRecommendation } from "@/lib/readModels/managerTypes";
import { buildIssueRecommendationView } from "./issueRecommendation";

function candidate(personId: string, personName: string) {
  return { personId, personName };
}

describe("buildIssueRecommendationView — no recommendation", () => {
  it("returns null when the input recommendation is null", () => {
    expect(buildIssueRecommendationView(null, "shift_coverage_missing", null)).toBeNull();
  });
});

describe("buildIssueRecommendationView — normal (primary) recommendation", () => {
  it("36. one candidate: 'לפי הסידור הקיים...' copy, singular", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [candidate("p1", "איתי אוליר")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.primaryText).toBe("לפי הסידור הקיים, אפשר לבדוק עם איתי אוליר לגבי הכיסוי.");
  });

  it("joins two candidates with 'או', never implying one is better", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [candidate("p1", "איתי אוליר"), candidate("p2", "עילאי שפירא")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.primaryText).toBe("לפי הסידור הקיים, אפשר לבדוק עם איתי אוליר או עילאי שפירא לגבי הכיסוי.");
  });

  it("joins three candidates with a comma list + final 'או'", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [candidate("p1", "א"), candidate("p2", "ב"), candidate("p3", "ג")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.primaryText).toBe("לפי הסידור הקיים, אפשר לבדוק עם א, ב או ג לגבי הכיסוי.");
  });

  it("37. always includes the exact disclaimer sentence", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "supervisor",
      primaryCandidates: [candidate("p1", "מאיה")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.disclaimer).toBe("ייתכנו אילוצים אישיים שלא מופיעים במערכת.");
  });

  it("includes the missing interval only for shift_coverage_partial, from the canonical analysis", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [candidate("p1", "איתי")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_partial", [
      { startMinute: 330, endMinute: 450 },
    ]);
    expect(view?.primaryText).toBe("לפי הסידור הקיים, אפשר לבדוק עם איתי לגבי הכיסוי בין 05:30–07:30.");
  });

  it("omits the interval for shift_coverage_missing even when missingIntervals is set", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [candidate("p1", "איתי")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", [
      { startMinute: 450, endMinute: 1170 },
    ]);
    expect(view?.primaryText).toBe("לפי הסידור הקיים, אפשר לבדוק עם איתי לגבי הכיסוי.");
  });

  it("never renders a nested last-resort section for a normal recommendation", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [candidate("p1", "איתי")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.lastResort).toBeNull();
  });

  it("never says 'available', 'free', 'best', or 'recommended person' anywhere in the copy", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [candidate("p1", "איתי"), candidate("p2", "עילאי")],
      fallbackCandidates: [],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_partial", [
      { startMinute: 330, endMinute: 450 },
    ]);
    const text = `${view?.primaryText} ${view?.disclaimer}`;
    for (const forbidden of ["זמין", "פנוי", "הטוב ביותר", "מומלץ לשבץ", "הבחירה הטובה"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("buildIssueRecommendationView — 38/39. technician last-resort (secondary, nested)", () => {
  it("shows the 'not found' statement at the top level, with no top-level disclaimer", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [],
      fallbackCandidates: [candidate("p1", "טוביה כהן")],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.primaryText).toBe("לא נמצאו טכנאים מתאימים לפי המידע הקיים.");
    expect(view?.disclaimer).toBeNull();
  });

  it("uses correct Hebrew singular agreement for exactly one fallback candidate", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [],
      fallbackCandidates: [candidate("p1", "טוביה כהן")],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.lastResort?.text).toBe(
      "לא נמצאו טכנאים רגילים מתאימים. לפי הסידור הקיים, אפשר לבדוק גם עם טוביה כהן, שמסומן גם כבעל יכולת טכנית.",
    );
  });

  it("exposes a collapsed, clearly-secondary lastResort disclosure", () => {
    const recommendation: ManagerIssueRecommendation = {
      missingRole: "technician",
      primaryCandidates: [],
      fallbackCandidates: [candidate("p1", "טוביה כהן"), candidate("p2", "רועי לוי")],
    };
    const view = buildIssueRecommendationView(recommendation, "shift_coverage_missing", null);
    expect(view?.lastResort?.triggerLabel).toBe("מוצא אחרון · הצג אפשרויות נוספות");
    expect(view?.lastResort?.text).toBe(
      "לא נמצאו טכנאים רגילים מתאימים. לפי הסידור הקיים, אפשר לבדוק גם עם טוביה כהן או רועי לוי, שמסומנים גם כבעלי יכולת טכנית.",
    );
    expect(view?.lastResort?.disclaimer).toBe(
      "האפשרויות האלו מוצגות כמוצא אחרון בלבד, וייתכנו אילוצים אישיים שלא מופיעים במערכת.",
    );
  });
});

describe("buildIssueRecommendationView — 40. zero primary + zero fallback", () => {
  it("never fabricates a view (guarded by the null recommendation input)", () => {
    expect(buildIssueRecommendationView(null, "shift_coverage_missing", null)).toBeNull();
  });
});

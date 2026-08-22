import { describe, expect, it } from "vitest";
import {
  computeDeliveryLatencySeconds,
  deliveryLatencyReferenceInstant,
  formatDeliveryDurationSeconds,
  formatJerusalemClockTime,
  formatJerusalemDateTime,
} from "./broadcastTiming";

describe("deliveryLatencyReferenceInstant / computeDeliveryLatencySeconds", () => {
  it("7. immediate broadcast (scheduledFor null) is measured from the batch's own created_at", () => {
    const input = {
      batchCreatedAt: "2026-08-22T21:46:00.000Z",
      scheduledFor: null,
      sentNowAt: null,
      firstSuccessfulPushAt: "2026-08-22T21:46:02.000Z",
    };
    expect(deliveryLatencyReferenceInstant(input)).toBe("2026-08-22T21:46:00.000Z");
    expect(computeDeliveryLatencySeconds(input)).toBe(2);
  });

  it("5. a normal scheduled dispatch is measured from scheduled_for, never the batch's own created_at", () => {
    const input = {
      batchCreatedAt: "2026-08-22T21:46:00.000Z", // the batch (dispatch) instant -- deliberately NOT the reference
      scheduledFor: "2026-08-22T21:46:00.000Z",
      sentNowAt: null,
      firstSuccessfulPushAt: "2026-08-22T21:46:04.000Z",
    };
    expect(deliveryLatencyReferenceInstant(input)).toBe("2026-08-22T21:46:00.000Z");
    expect(computeDeliveryLatencySeconds(input)).toBe(4);
  });

  it("6. a scheduled broadcast manually triggered via 'שלח עכשיו' is measured from sent_now_at, NOT the original (still-future) scheduled_for", () => {
    const input = {
      batchCreatedAt: "2026-08-22T21:46:00.000Z",
      scheduledFor: "2026-08-22T22:30:00.000Z", // far in the future -- would be a nonsensical negative latency if used
      sentNowAt: "2026-08-22T21:45:57.000Z",
      firstSuccessfulPushAt: "2026-08-22T21:46:00.000Z",
    };
    expect(deliveryLatencyReferenceInstant(input)).toBe("2026-08-22T21:45:57.000Z");
    expect(computeDeliveryLatencySeconds(input)).toBe(3);
  });

  it("4. no successful push -> latency stays null, never a fabricated duration", () => {
    const input = {
      batchCreatedAt: "2026-08-22T21:46:00.000Z",
      scheduledFor: null,
      sentNowAt: null,
      firstSuccessfulPushAt: null,
    };
    expect(computeDeliveryLatencySeconds(input)).toBeNull();
  });

  it("clamps a negative raw difference (clock skew) to zero rather than showing a negative duration", () => {
    const input = {
      batchCreatedAt: "2026-08-22T21:46:05.000Z",
      scheduledFor: null,
      sentNowAt: null,
      firstSuccessfulPushAt: "2026-08-22T21:46:00.000Z", // "before" the reference due to clock skew
    };
    expect(computeDeliveryLatencySeconds(input)).toBe(0);
  });

  it("returns null on a malformed timestamp rather than throwing or returning NaN", () => {
    expect(
      computeDeliveryLatencySeconds({
        batchCreatedAt: "not-a-real-date",
        scheduledFor: null,
        sentNowAt: null,
        firstSuccessfulPushAt: "2026-08-22T21:46:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("8. formatJerusalemClockTime -- Asia/Jerusalem, explicitly, never the host timezone", () => {
  it("formats a UTC instant into its Asia/Jerusalem (IDT, UTC+3 in August) clock time", () => {
    // 2026-08-22T18:46:00.000Z is a Saturday in August -- Israel Daylight Time (UTC+3).
    expect(formatJerusalemClockTime("2026-08-22T18:46:00.000Z")).toBe("21:46");
  });

  it("formats a UTC instant into its Asia/Jerusalem (IST, UTC+2 in winter) clock time", () => {
    // 2026-01-15T18:46:00.000Z -- winter, Israel Standard Time (UTC+2).
    expect(formatJerusalemClockTime("2026-01-15T18:46:00.000Z")).toBe("20:46");
  });

  it("fails safe on a malformed instant rather than throwing", () => {
    expect(formatJerusalemClockTime("not-a-real-date")).toBe("--:--");
  });
});

describe("3. formatJerusalemDateTime -- DD/MM HH:mm in Asia/Jerusalem, explicitly, never the host timezone", () => {
  it("formats a UTC instant into its Asia/Jerusalem (IDT, UTC+3 in August) date+time -- no year, no seconds", () => {
    // 2026-08-22T18:46:00.000Z -- August, Israel Daylight Time (UTC+3) -> 22/08 21:46.
    expect(formatJerusalemDateTime("2026-08-22T18:46:00.000Z")).toBe("22/08 21:46");
  });

  it("formats a UTC instant into its Asia/Jerusalem (IST, UTC+2 in winter) date+time", () => {
    // 2026-01-15T18:46:00.000Z -- winter, Israel Standard Time (UTC+2) -> 15/01 20:46.
    expect(formatJerusalemDateTime("2026-01-15T18:46:00.000Z")).toBe("15/01 20:46");
  });

  it("2. a scheduled notification crossing midnight (Asia/Jerusalem) rolls the DATE forward, not just the clock", () => {
    // 2026-08-22T20:58:00.000Z = 23:58 IDT on the 22nd.
    expect(formatJerusalemDateTime("2026-08-22T20:58:00.000Z")).toBe("22/08 23:58");
    // 2026-08-22T21:10:00.000Z = 00:10 IDT on the 23rd -- the UTC calendar day (22nd) is
    // NOT the Asia/Jerusalem calendar day (23rd); this must reflect the LOCAL date.
    expect(formatJerusalemDateTime("2026-08-22T21:10:00.000Z")).toBe("23/08 00:10");
  });

  it("zero-pads single-digit day/month/hour/minute", () => {
    // 2026-01-05T05:03:00.000Z = 07:03 IST on the 5th (winter, UTC+2).
    expect(formatJerusalemDateTime("2026-01-05T05:03:00.000Z")).toBe("05/01 07:03");
  });

  it("fails safe on a malformed instant rather than throwing", () => {
    expect(formatJerusalemDateTime("not-a-real-date")).toBe("--/-- --:--");
  });
});

describe("8. formatDeliveryDurationSeconds -- compact Hebrew duration, no milliseconds", () => {
  it("under 60 seconds: '<N> שנ׳'", () => {
    expect(formatDeliveryDurationSeconds(2)).toBe("2 שנ׳");
    expect(formatDeliveryDurationSeconds(0)).toBe("0 שנ׳");
    expect(formatDeliveryDurationSeconds(59.4)).toBe("59 שנ׳");
  });

  it("60+ seconds: '<M> דק׳ <S> שנ׳'", () => {
    expect(formatDeliveryDurationSeconds(72)).toBe("1 דק׳ 12 שנ׳");
    expect(formatDeliveryDurationSeconds(60)).toBe("1 דק׳ 0 שנ׳");
    expect(formatDeliveryDurationSeconds(125)).toBe("2 דק׳ 5 שנ׳");
  });

  it("rounds to the nearest whole second before splitting -- never a stray '60 שנ׳' remainder", () => {
    expect(formatDeliveryDurationSeconds(119.6)).toBe("2 דק׳ 0 שנ׳");
  });

  it("never shows milliseconds/fractional seconds", () => {
    expect(formatDeliveryDurationSeconds(2.7)).toBe("3 שנ׳");
  });
});

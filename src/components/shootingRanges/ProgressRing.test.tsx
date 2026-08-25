import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ProgressRing } from "./ProgressRing";

function circles(container: HTMLElement) {
  return Array.from(container.querySelectorAll("circle"));
}

describe("ProgressRing", () => {
  it("draws the arc's stroke-dashoffset from progress -- 1 (full) has offset 0, 0 (empty) has offset the full circumference", () => {
    const { container: full } = render(<ProgressRing progress={1} toneClassName="text-success" />);
    const { container: empty } = render(<ProgressRing progress={0} toneClassName="text-success" />);

    const [, fullArc] = circles(full);
    const [, emptyArc] = circles(empty);
    expect(Number(fullArc.getAttribute("stroke-dashoffset"))).toBeCloseTo(0, 5);
    expect(Number(emptyArc.getAttribute("stroke-dashoffset"))).toBeCloseTo(Number(emptyArc.getAttribute("stroke-dasharray")), 5);
  });

  describe("live marker", () => {
    it("is absent by default (showLiveMarker not passed)", () => {
      const { container } = render(<ProgressRing progress={0.5} toneClassName="text-success" />);
      expect(container.querySelector('[data-testid="progress-ring-live-marker"]')).toBeNull();
    });

    it("is absent when progress is exactly 0, even if showLiveMarker is requested -- nothing meaningful to mark at an empty ring", () => {
      const { container } = render(<ProgressRing progress={0} toneClassName="text-critical" showLiveMarker />);
      expect(container.querySelector('[data-testid="progress-ring-live-marker"]')).toBeNull();
    });

    it("renders when showLiveMarker is true and progress is above 0", () => {
      const { container } = render(<ProgressRing progress={0.5} toneClassName="text-success" showLiveMarker />);
      expect(container.querySelector('[data-testid="progress-ring-live-marker"]')).not.toBeNull();
    });

    it("uses the exact same tone class as the ring's own arc -- always visually matching", () => {
      const { container } = render(<ProgressRing progress={0.5} toneClassName="text-warning" showLiveMarker />);
      const marker = container.querySelector('[data-testid="progress-ring-live-marker"]');
      expect(marker?.getAttribute("class")).toContain("text-warning");
    });

    it("derives its position from the SAME progress fraction that draws the visible arc -- a different progress value moves the marker to a different point", () => {
      const { container: quarter } = render(<ProgressRing progress={0.25} toneClassName="text-success" showLiveMarker size={200} strokeWidth={10} />);
      const { container: threeQuarters } = render(<ProgressRing progress={0.75} toneClassName="text-success" showLiveMarker size={200} strokeWidth={10} />);

      const quarterMarker = quarter.querySelector('[data-testid="progress-ring-live-marker"]');
      const threeQuartersMarker = threeQuarters.querySelector('[data-testid="progress-ring-live-marker"]');
      expect(quarterMarker?.getAttribute("cx")).not.toBe(threeQuartersMarker?.getAttribute("cx"));
      expect(quarterMarker?.getAttribute("cy")).not.toBe(threeQuartersMarker?.getAttribute("cy"));

      // The marker sits exactly `radius` away from the ring's own center, for any progress value.
      const size = 200;
      const strokeWidth = 10;
      const center = size / 2;
      const radius = (size - strokeWidth) / 2;
      for (const marker of [quarterMarker, threeQuartersMarker]) {
        const cx = Number(marker?.getAttribute("cx"));
        const cy = Number(marker?.getAttribute("cy"));
        const distanceFromCenter = Math.hypot(cx - center, cy - center);
        expect(distanceFromCenter).toBeCloseTo(radius, 5);
      }
    });

    it("reuses the existing shared pulse animation class -- disabled globally under prefers-reduced-motion via globals.css, no bespoke reduced-motion handling here", () => {
      const { container } = render(<ProgressRing progress={0.5} toneClassName="text-success" showLiveMarker />);
      const marker = container.querySelector('[data-testid="progress-ring-live-marker"]');
      expect(marker?.getAttribute("class")).toContain("animate-pulse-dot");
    });
  });
});

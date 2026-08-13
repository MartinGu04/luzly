import type { ManagerFairnessChartSlice } from "@/lib/readModels/managerFairnessTypes";

/**
 * The ONLY shape this component ever receives -- safe chart segment data
 * (PR #15 §28), never the full `ManagerFairnessReadModel`, never raw sheet
 * cells. Server-rendered SVG, no chart library, no client JS: every slice
 * is plain arithmetic against the circle's own circumference.
 */
interface ManagerFairnessChartProps {
  slices: readonly ManagerFairnessChartSlice[];
}

const SIZE = 120;
const CENTER = SIZE / 2;
const RADIUS = 46;
const STROKE_WIDTH = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 1.4; // percentage points of visual gap between adjacent slices

// Validated 8-hue categorical palette (colorblind-safe adjacent ordering) --
// light/dark steps of the same eight hues, never a generated/cycled color.
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const MAX_NAMED_SLICES = 7;

function trimmedNumber(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

interface PreparedSlice {
  id: string;
  name: string;
  score: number;
  percentage: number;
  colorIndex: number | null; // null -> the neutral "אחרים" (other) fold
}

/**
 * At most `MAX_NAMED_SLICES` (7) slices ever get a named color -- exactly
 * as many `--fairness-series-N` CSS variables as are defined below. A
 * slice count of exactly `MAX_NAMED_SLICES + 1` (8) is NOT a special case
 * that keeps every slice named (that previously produced an undefined
 * `--fairness-series-8` reference) -- it folds the 8th slice into the same
 * "אחרים" aggregate as any larger count.
 */
function prepareSlices(slices: readonly ManagerFairnessChartSlice[]): PreparedSlice[] {
  if (slices.length <= MAX_NAMED_SLICES) {
    return slices.map((slice, index) => ({ ...slice, colorIndex: index }));
  }

  const named = slices.slice(0, MAX_NAMED_SLICES).map((slice, index) => ({ ...slice, colorIndex: index }));
  const rest = slices.slice(MAX_NAMED_SLICES);
  const other: PreparedSlice = {
    id: "other",
    name: `אחרים (${rest.length})`,
    score: rest.reduce((sum, slice) => sum + slice.score, 0),
    percentage: rest.reduce((sum, slice) => sum + slice.percentage, 0),
    colorIndex: null,
  };
  return [...named, other];
}

interface SegmentGeometry {
  slice: PreparedSlice;
  segmentLength: number;
  offset: number;
}

/** Pure, non-mutating pass computing each slice's `stroke-dasharray` length + cumulative `stroke-dashoffset` -- never mutated during render. */
function computeSegmentGeometry(prepared: readonly PreparedSlice[]): SegmentGeometry[] {
  const gap = prepared.length > 1 ? SEGMENT_GAP : 0;
  let cumulativePercentage = 0;

  return prepared.map((slice) => {
    const visiblePercentage = Math.max(slice.percentage - gap, 0);
    const segmentLength = (visiblePercentage / 100) * CIRCUMFERENCE;
    const offset = -((cumulativePercentage / 100) * CIRCUMFERENCE);
    cumulativePercentage += slice.percentage;
    return { slice, segmentLength, offset };
  });
}

/**
 * "חלוקת הניקוד הנוכחי בצוות" -- raw `currentScore` distribution only,
 * informational (PR #15 §27), never a fairness recommendation. Always
 * paired with a visible legend so the chart makes sense without hover
 * (PR #15 §29) -- an exempt person is still shown here, raw score only.
 */
export function ManagerFairnessChart({ slices }: ManagerFairnessChartProps) {
  if (slices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--overlay-soft)"
            strokeWidth={STROKE_WIDTH}
          />
        </svg>
        <p className="text-sm text-muted">אין עדיין נתוני ניקוד נוכחי להצגה בתרשים.</p>
      </div>
    );
  }

  const prepared = prepareSlices(slices);
  const geometry = computeSegmentGeometry(prepared);

  const lightVars = Object.fromEntries(
    SERIES_LIGHT.slice(0, MAX_NAMED_SLICES).map((hex, index) => [`--fairness-series-${index + 1}`, hex]),
  ) as React.CSSProperties;

  return (
    <figure
      className="luzly-fairness-chart flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6"
      style={lightVars}
    >
      {/* Dark-mode series colors -- same convention as globals.css: a media-guarded override for system dark, and an explicit override for the viewer's data-theme toggle. */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .luzly-fairness-chart {
            ${SERIES_DARK.slice(0, MAX_NAMED_SLICES).map((hex, index) => `--fairness-series-${index + 1}: ${hex};`).join(" ")}
          }
        }
        :root[data-theme="dark"] .luzly-fairness-chart {
          ${SERIES_DARK.slice(0, MAX_NAMED_SLICES).map((hex, index) => `--fairness-series-${index + 1}: ${hex};`).join(" ")}
        }
      `}</style>

      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="חלוקת הניקוד הנוכחי בצוות"
        className="shrink-0"
      >
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--overlay-faint)" strokeWidth={STROKE_WIDTH} />
          {geometry.map(({ slice, segmentLength, offset }) => {
            const color =
              slice.colorIndex === null ? "var(--muted-2)" : `var(--fairness-series-${slice.colorIndex + 1})`;

            return (
              <circle
                key={slice.id}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={color}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={`${segmentLength} ${CIRCUMFERENCE - segmentLength}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
              >
                <title>
                  {slice.name} · {trimmedNumber(slice.score)} · {Math.round(slice.percentage)}%
                </title>
              </circle>
            );
          })}
        </g>
      </svg>

      <ul className="w-full min-w-0 space-y-1.5" aria-label="מקרא התרשים">
        {prepared.map((slice) => (
          <li key={slice.id} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background:
                  slice.colorIndex === null ? "var(--muted-2)" : `var(--fairness-series-${slice.colorIndex + 1})`,
              }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{slice.name}</span>
            <span className="shrink-0 text-muted-2">{trimmedNumber(slice.score)}</span>
            <span className="shrink-0 font-medium text-muted">{Math.round(slice.percentage)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

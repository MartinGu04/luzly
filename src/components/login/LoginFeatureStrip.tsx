import { Bell, CalendarDays, PieChart, Users } from "lucide-react";
import { LOGIN_FEATURE_HIGHLIGHTS } from "@/lib/config/loginCopy";

const ICONS: Record<string, typeof Bell> = {
  alerts: Bell,
  planning: CalendarDays,
  transparency: Users,
  insights: PieChart,
};

const ICON_TONE: Record<string, string> = {
  alerts: "text-[#d98a9c]",
  planning: "text-[#6fc3f7]",
  transparency: "text-[#57cc8a]",
  insights: "text-[#f0a35f]",
};

/**
 * The login hero's bottom value-prop strip -- desktop only (the supplied
 * mobile reference has no equivalent section, so this never renders below
 * `lg`). Four short highlights, never real product metrics. A single
 * shared card (subtle fill + ring, matching the rest of the page's glass
 * surface language) rather than loose items floating on the canvas, with
 * icon badges styled consistently with the floating shift/duty cards
 * above it.
 */
export function LoginFeatureStrip() {
  return (
    <div className="hidden lg:block">
      <div className="grid grid-cols-4 gap-x-3 rounded-[2rem] bg-white/[0.035] px-5 py-5 ring-1 ring-white/10 xl:gap-x-6 xl:px-9 xl:py-7">
        {LOGIN_FEATURE_HIGHLIGHTS.map((feature, index) => {
          const Icon = ICONS[feature.key];
          return (
            <div
              key={feature.key}
              className={`flex items-center gap-2.5 xl:gap-4 ${index > 0 ? "border-s border-white/10 ps-3 xl:ps-6" : ""}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 xl:h-12 xl:w-12 xl:rounded-2xl">
                <Icon className={`h-4 w-4 xl:h-5 xl:w-5 ${ICON_TONE[feature.key]}`} aria-hidden="true" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white xl:text-base">{feature.title}</span>
                <span className="block text-xs text-white/55 xl:text-sm">{feature.subtitle}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

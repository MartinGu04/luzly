import { Bell, CalendarDays, PieChart, Users } from "lucide-react";
import { LOGIN_FEATURE_HIGHLIGHTS } from "@/lib/config/loginCopy";

const ICONS: Record<string, typeof Bell> = {
  alerts: Bell,
  planning: CalendarDays,
  transparency: Users,
  insights: PieChart,
};

const ICON_TONE: Record<string, string> = {
  alerts: "text-[#b39bfa]",
  planning: "text-[#6fc3f7]",
  transparency: "text-[#57cc8a]",
  insights: "text-[#f0a35f]",
};

/**
 * The login hero's bottom value-prop strip -- desktop only (the supplied
 * mobile reference has no equivalent section, so this never renders below
 * `lg`). Four short highlights, never real product metrics.
 */
export function LoginFeatureStrip() {
  return (
    <div className="hidden border-t border-white/10 pt-6 lg:flex lg:flex-wrap lg:items-center lg:gap-x-10 lg:gap-y-4">
      {LOGIN_FEATURE_HIGHLIGHTS.map((feature) => {
        const Icon = ICONS[feature.key];
        return (
          <div key={feature.key} className="flex items-center gap-2.5">
            <Icon className={`h-5 w-5 shrink-0 ${ICON_TONE[feature.key]}`} aria-hidden="true" strokeWidth={1.75} />
            <span className="text-sm">
              <span className="block font-semibold text-white">{feature.title}</span>
              <span className="block text-xs text-white/50">{feature.subtitle}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

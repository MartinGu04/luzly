/**
 * Centralized login copy -- single source of truth for strings the /login
 * route and its tests both need to agree on exactly. Redesigned for the
 * unified dark-canvas composition (visual reference supplied directly);
 * this copy is FINAL for that pass -- do not replace with other marketing
 * copy without a fresh design reference.
 */
export const LOGIN_HERO_EYEBROW = "ברוכים הבאים ל";
export const LOGIN_HERO_HEADLINE = "כל המשמרות שלך. במקום אחד.";
export const LOGIN_HERO_SUBTEXT = "ניהול משמרות, תורניות, ימי חופש וזמן — בצורה חכמה, פשוטה ומדויקת.";
export const LOGIN_AUTH_NOTE = "כניסה מאובטחת עם החשבון הארגוני שלך";
export const LOGIN_ERROR_MESSAGE = "לא הצלחנו להשלים את ההתחברות. אפשר לנסות שוב.";

export interface LoginFeatureHighlight {
  key: string;
  title: string;
  subtitle: string;
}

/** The desktop-only bottom feature strip -- four short value props, icon assignment lives with the component that renders them. */
export const LOGIN_FEATURE_HIGHLIGHTS: readonly LoginFeatureHighlight[] = [
  { key: "alerts", title: "התראות חכמות", subtitle: "לא מפספסים כלום" },
  { key: "planning", title: "תכנון קל וגמיש", subtitle: "מותאם לצוות שלך" },
  { key: "transparency", title: "שקיפות מלאה", subtitle: "כולם מעודכנים" },
  { key: "insights", title: "תמונה שלמה", subtitle: "בקרה, דוחות ותובנות" },
];

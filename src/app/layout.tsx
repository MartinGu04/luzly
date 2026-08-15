import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config/productName";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme/themeScript";
import { ServiceWorkerManager } from "@/components/pwa/ServiceWorkerManager";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  /**
   * iOS standalone-launch metadata (PR #28) -- `capable: true` is what
   * lets a Home Screen install open without Safari's browser chrome;
   * `title` is the name shown under the Home Screen icon (falls back to
   * the page title otherwise, which could get truncated differently).
   * `statusBarStyle: "default"` keeps the system status bar text dark on
   * a light background rather than forcing a fixed color scheme.
   */
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
};

/**
 * `themeColor` follows the SAME light/dark tokens as globals.css
 * (`--background`), so the browser/PWA chrome (address bar, task
 * switcher card) matches whichever theme is actually in effect. This is
 * Next's native per-scheme metadata support (resolved server-side to two
 * `<meta name="theme-color" media="...">` tags) -- not a client hook, so
 * there is nothing here for React to hydrate differently. It only tracks
 * `prefers-color-scheme`, same as the CSS `@media` rule; an explicit
 * in-app theme override (`data-theme`) intentionally does not change
 * these tags -- the PWA manifest's own fixed `theme_color` (see
 * `app/manifest.ts`) already gives installed icons/splash a single stable
 * brand color regardless of scheme, so this only needs to be "close
 * enough" for browser chrome, never a source of a fragile client hack.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#090b12" },
  ],
};

/**
 * The app shell (sidebar/nav) is rendered by the (app) route group's own
 * layout, not here — /login and /auth/callback must never show it, and
 * must never be gated behind the auth check that route group performs.
 *
 * The inline script must be the very first thing in `<body>` so it runs
 * before the browser paints anything, setting `data-theme` on `<html>`
 * before first paint -- this is what avoids a visible flash of the wrong
 * theme. It only ever sets a DOM attribute (see `themeScript.ts`); no
 * React component renders differently based on it, so there is no
 * server/client hydration mismatch to worry about.
 *
 * `ServiceWorkerManager` is mounted once here, at the true application
 * root, so it registers exactly once per full page load (not once per
 * client-side route) and covers /login and /auth/callback too -- a
 * standalone-installed PWA needs the login/callback flow to work
 * identically to the browser tab. It is a self-contained, feature-detected
 * client component; see `components/pwa` for why it never interferes with
 * authentication redirects (it renders nothing but an optional update
 * banner, and touches no auth/navigation state).
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          {children}
          <ServiceWorkerManager />
        </ThemeProvider>
      </body>
    </html>
  );
}

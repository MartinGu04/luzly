import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { APP_NAME } from "@/lib/config/productName";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme/themeScript";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "מלווה תזמון מבוסס Google Sheets",
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
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

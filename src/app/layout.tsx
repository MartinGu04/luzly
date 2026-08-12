import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "Luzly",
  description: "מלווה תזמון מבוסס Google Sheets",
};

/**
 * The app shell (sidebar/nav) is rendered by the (app) route group's own
 * layout, not here — /login and /auth/callback must never show it, and
 * must never be gated behind the auth check that route group performs.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}

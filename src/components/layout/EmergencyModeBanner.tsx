/**
 * The global, persistent "Emergency Mode is active" banner (spec section
 * 3) -- rendered once, inside `AppShell`, so every authenticated screen
 * shows it rather than each page rendering its own copy. Visible on both
 * desktop and mobile since it sits in the shared main column, above
 * `<main>`, ahead of both layout variants' content.
 */
export function EmergencyModeBanner() {
  return (
    <div
      role="status"
      data-testid="emergency-mode-banner"
      className="border-b border-critical/25 bg-critical/10 px-4 py-2.5 text-center text-sm font-medium text-critical sm:px-6 lg:px-10"
    >
      🚨 מצב חירום פעיל — המערכת מציגה את סידור החירום; תורנויות מושהות.
    </div>
  );
}

/**
 * "מטווחים" -- placeholder destination. No shooting-range functionality
 * exists yet; this only reserves the route and nav entry. The protected
 * `(app)` layout has already gated access by the time this renders (same
 * as every other route here), so this page needs no identity check or
 * data load of its own.
 */
export default function ShootingRangesPage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <p className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">בקרוב</p>
    </div>
  );
}

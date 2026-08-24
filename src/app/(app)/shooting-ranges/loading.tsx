/** Skeleton shaped like the real `/shooting-ranges` layout -- a single centered block. Same `.skeleton` shimmer convention as every other route's own `loading.tsx`. */
export default function ShootingRangesLoading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" aria-busy="true" aria-label="טוען">
      <div className="skeleton h-12 w-40 rounded-lg" />
    </div>
  );
}

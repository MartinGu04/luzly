/** Skeleton shaped like the real `/settings` layout -- title + one panel. Same `.skeleton` shimmer convention as every other route's own `loading.tsx`. */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="טוען הגדרות">
      <div className="skeleton h-7 w-24 rounded-lg" />
      <div className="skeleton h-48 rounded-xl" />
    </div>
  );
}

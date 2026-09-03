/** Skeleton shaped like the real dark cinematic countdown panel -- never fake numbers. */
export default function CountdownLoading() {
  return (
    <div
      className="flex min-h-[calc(100dvh-10rem)] flex-col items-center justify-center gap-6 rounded-3xl bg-[#05070a] px-4 py-16"
      aria-busy="true"
      aria-label="טוען את עד מתי"
    >
      <div className="skeleton h-10 w-56 rounded-lg" />
      <div className="skeleton h-4 w-40 rounded-lg" />
      <div className="skeleton h-28 w-64 rounded-2xl" />
      <div className="skeleton h-10 w-72 rounded-lg" />
    </div>
  );
}

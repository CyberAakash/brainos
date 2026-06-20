export function TimelinePlaceholder() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
      <div className="text-4xl">📅</div>
      <div className="text-lg font-medium text-zinc-600 dark:text-zinc-300">Timeline</div>
      <p className="text-sm text-center max-w-md">
        Chronological capture view coming in Phase 5. Filter by date, project, or type.
      </p>
    </div>
  );
}

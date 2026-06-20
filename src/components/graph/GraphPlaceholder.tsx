export function GraphPlaceholder() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
      <div className="text-4xl">🕸️</div>
      <div className="text-lg font-medium text-zinc-600 dark:text-zinc-300">Knowledge Graph</div>
      <p className="text-sm text-center max-w-md">
        Interactive graph visualization coming in Phase 2. Will show connections between captures via shared tags, projects, and references.
      </p>
    </div>
  );
}

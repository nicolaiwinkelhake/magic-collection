// Kleine, wiederverwendbare UI-Bausteine für einheitliche leere Zustände
// und Ladeanzeigen.

export function EmptyState({
  icon = "✨",
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="text-center py-14 px-4">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-zinc-300 font-medium">{title}</p>
      {hint && <p className="text-zinc-500 text-sm mt-1">{hint}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500 py-4">
      <span className="inline-block w-4 h-4 border-2 border-zinc-600 border-t-indigo-400 rounded-full animate-spin" />
      {label ?? "Lädt…"}
    </div>
  );
}

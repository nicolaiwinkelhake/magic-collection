// Sofortige Rückmeldung beim Seitenwechsel: Dieses Gerüst erscheint direkt
// nach dem Antippen, während der Server die Seite vorbereitet. Ohne es
// bleibt die alte Seite stehen, bis alles geladen ist – das fühlt sich
// an, als hätte die App den Tipp nicht bemerkt.
export default function Loading() {
  return (
    <main className="page max-w-5xl" data-loading aria-busy="true" aria-label="Seite wird geladen">
      <div className="animate-pulse space-y-4">
        <div className="h-9 w-40 rounded-xl bg-white/[0.07]" />
        <div className="h-28 rounded-3xl bg-white/[0.05]" />
        <div className="h-12 rounded-2xl bg-white/[0.05]" />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="aspect-[488/680] rounded-[10px] bg-white/[0.05]" />
          ))}
        </div>
      </div>
    </main>
  );
}

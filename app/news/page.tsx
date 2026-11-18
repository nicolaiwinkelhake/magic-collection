import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { RELEASES } from "@/lib/releaseNotes";

export const metadata = { title: "Neuigkeiten · Magic Collection" };

export default function NewsPage() {
  return (
    <main className="page max-w-2xl space-y-5">
      <PageHeader title="Neuigkeiten" subtitle="Was sich in der App getan hat" />
      {RELEASES.map((r) => (
        <section key={r.id} className="surface overflow-hidden">
          <header className="px-4 pt-4 pb-2">
            <p className="text-xs text-zinc-500">{new Date(r.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</p>
            <h2 className="font-semibold">{r.title}</h2>
          </header>
          <ul className="px-4 pb-2 divide-y divide-white/5">
            {r.items.map((it) => (
              <li key={it.title} className="flex gap-3 py-3">
                <span className="text-xl leading-none mt-0.5" aria-hidden>{it.icon}</span>
                <div className="min-w-0">
                  <p className="font-medium text-[15px]">{it.title}</p>
                  <p className="text-sm text-zinc-400 mt-0.5">{it.text}</p>
                  {it.href && (
                    <Link href={it.href} className="mt-1 inline-block text-sm text-violet-300 hover:text-violet-200">Ansehen →</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

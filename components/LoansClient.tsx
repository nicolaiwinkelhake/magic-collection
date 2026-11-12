"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";

type Loan = {
  id: string;
  card_name: string;
  quantity: number;
  status: "out" | "returned";
  note: string | null;
  created_at: string;
  returned_at: string | null;
  borrower_name: string | null;
  borrower_email: string | null;
};

export function LoansClient({ loans }: { loans: Loan[] }) {
  const router = useRouter();
  const [cardName, setCardName] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const out = loans.filter((l) => l.status === "out");
  const returned = loans.filter((l) => l.status === "returned");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardName, borrowerName, borrowerEmail, quantity, note }),
    });
    if (res.ok) {
      setCardName("");
      setBorrowerName("");
      setBorrowerEmail("");
      setQuantity("1");
      setNote("");
      setOpen(false);
      router.refresh();
    }
  }

  async function update(id: string, action: "return" | "delete") {
    await fetch("/api/loans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    router.refresh();
  }

  return (
    <main className="page max-w-2xl">
      <PageHeader title="Verliehen" subtitle="Karten, die gerade bei Freunden sind" />

      <div className="surface p-4">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-3 text-left font-medium">
          <span className="grid place-items-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-glow text-lg leading-none" aria-hidden>
            {open ? "−" : "+"}
          </span>
          <span className="flex-1">Neue Leihe erfassen</span>
          <span className={`text-zinc-500 transition ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </button>
        {open && (
          <form onSubmit={create} className="mt-3 space-y-3">
            <input
              className="input"
              placeholder="Kartenname"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              required
            />
            <div className="flex gap-3">
              <input
                className="input w-auto flex-1 min-w-0"
                placeholder="An wen? (Name)"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                required
              />
              <input
                type="number"
                min="1"
                className="input w-20"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <input
              className="input"
              placeholder="E-Mail des Freundes (optional, verknüpft den Account)"
              value={borrowerEmail}
              onChange={(e) => setBorrowerEmail(e.target.value)}
            />
            <input
              className="input"
              placeholder="Notiz (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn-primary">
              Speichern
            </button>
          </form>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="font-medium text-zinc-300">Aktuell verliehen</h2>
        {out.length === 0 ? (
          <p className="text-zinc-500 text-sm">Nichts verliehen.</p>
        ) : (
          out.map((l) => (
            <div
              key={l.id}
              className="surface rounded-xl flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {l.quantity}× {l.card_name}
                </p>
                <p className="text-xs text-zinc-500">
                  an {l.borrower_name}
                  {l.borrower_email ? ` (${l.borrower_email.split("@")[0]})` : ""} ·
                  seit {formatDate(l.created_at)}
                  {l.note ? ` · ${l.note}` : ""}
                </p>
              </div>
              <button
                onClick={() => update(l.id, "return")}
                className="text-emerald-400 hover:underline text-sm whitespace-nowrap"
              >
                Zurück
              </button>
            </div>
          ))
        )}
      </section>

      {returned.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-zinc-300">Zurückgegeben</h2>
          {returned.map((l) => (
            <div
              key={l.id}
              className="surface rounded-xl flex items-center justify-between px-4 py-2 text-zinc-500"
            >
              <span className="text-sm">
                {l.quantity}× {l.card_name} · {l.borrower_name}
              </span>
              <button
                onClick={() => update(l.id, "delete")}
                className="text-zinc-600 hover:text-red-400 text-xs"
              >
                Löschen
              </button>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

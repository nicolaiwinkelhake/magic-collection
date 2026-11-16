// Begründung eines Tauschvorschlags in Klartext (rein, getestet): warum die
// neue Karte rein soll und warum die alte raus kann – jeweils mit den Zahlen
// dahinter, damit man die Einschätzung selbst prüfen kann.
import { ROLE_LABEL, type CardRole } from "@/lib/cardRoles";
import type { DeckHealth, SwapIn, SwapOut } from "@/lib/deckDoctor";

const pct = (x: number) => `${Math.round(x * 100)} %`;
const list = (r: CardRole[]) => r.map((x) => ROLE_LABEL[x]).join(", ");

export function explainIn(add: SwapIn, out: SwapOut | undefined, health: DeckHealth, ctx: { commander: string; numDecks?: number | null }): string[] {
  const why: string[] = [];
  const decks = ctx.numDecks ? `${ctx.numDecks.toLocaleString("de-DE")} ` : "";
  let line = `${pct(add.inclusion)} der ${decks}${ctx.commander}-Decks auf EDHREC spielen sie`;
  if (out) line += out.inclusion == null ? ` – ${out.name} taucht dort kaum auf.` : ` – ${out.name} nur ${pct(out.inclusion)}.`;
  else line += ".";
  why.push(line);

  if (add.synergy >= 0.1) {
    why.push(`Synergie +${pct(add.synergy)}: läuft mit ${ctx.commander} deutlich häufiger als in anderen Decks dieser Farben – sie passt gezielt zur Strategie, nicht nur allgemein.`);
  } else if (add.inclusion >= 0.3) {
    why.push("Eher ein allgemein starker Standard (Staple) als eine Spezialkarte für diesen Commander.");
  }

  const gaps = health.checks.filter((c) => c.key !== "lands" && c.have < c.target);
  const filled = gaps.filter((g) => add.roles.includes(g.key as CardRole));
  if (filled.length) {
    why.push(`Füllt eine Lücke im Deck: ${filled.map((g) => `${g.label} (${g.have} von ${g.target})`).join(", ")}.`);
  } else if (out && add.roles.length && add.roles.some((r) => out.roles.includes(r))) {
    why.push(`Übernimmt dieselbe Aufgabe wie ${out.name} (${list(add.roles.filter((r) => out.roles.includes(r)))}), nur stärker bewertet.`);
  } else if (add.roles.length) {
    why.push(`Rolle im Deck: ${list(add.roles)}.`);
  }

  if (out) {
    const d = out.cmc - add.cmc;
    if (d >= 1) why.push(`${d} Mana günstiger als ${out.name} – macht die Kurve flacher (Ø jetzt ${health.avgCmc.toFixed(1).replace(".", ",")}).`);
    else if (d <= -2 && health.avgCmc > 3.4) why.push(`Achtung: ${-d} Mana teurer – die Kurve ist mit Ø ${health.avgCmc.toFixed(1).replace(".", ",")} schon hoch.`);
  }

  if (add.source === "collection") why.push("Liegt schon frei in deiner Sammlung – kostet nichts.");
  else if (add.source === "friend" && add.friend) why.push(`${add.friend.ownerName} hat sie – per Trade zu bekommen.`);
  else if (add.eur != null) why.push(`Zu kaufen ab ≈ ${add.eur.toFixed(2).replace(".", ",")} €.`);
  return why;
}

export function explainOut(out: SwapOut, ctx: { commander: string }): string[] {
  const why: string[] = [];
  why.push(
    out.inclusion == null
      ? `Taucht in der EDHREC-Liste für ${ctx.commander} nicht auf – kaum jemand spielt sie dort.`
      : `Nur ${pct(out.inclusion)} der ${ctx.commander}-Decks spielen sie.`,
  );
  if (out.synergy != null && out.synergy < 0) why.push(`Negative Synergie (${pct(out.synergy)}): in anderen Decks dieser Farben sogar häufiger als bei ${ctx.commander}.`);
  if (out.roles.length) why.push(`Rolle: ${list(out.roles)} – die übernimmt der Ersatz oder sie ist im Deck ausreichend vertreten.`);
  else why.push("Erfüllt keine der Kernrollen (Ramp, Kartenvorteil, Removal, Wipe) – oder ihre Rolle ist noch nicht ermittelt; dann selbst prüfen.");
  if (out.cmc >= 6) why.push(`${out.cmc} Mana – teure Karten machen das Deck langsamer.`);
  return why;
}

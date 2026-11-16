// Begründung eines Tauschvorschlags in Klartext (rein, getestet): warum die
// neue Karte rein soll und warum die alte raus kann – jeweils mit den Zahlen
// dahinter, damit man die Einschätzung selbst prüfen kann.
import { ROLE_LABEL, type CardRole } from "@/lib/cardRoles";
import type { DeckHealth, SwapIn, SwapOut } from "@/lib/deckDoctor";
import type { PairFit } from "@/lib/deckSynergy";

/** EDHREC-Kategorien auf der Commander-Seite */
export const EDHREC_LIST: Record<string, string> = {
  highsynergycards: "High Synergy",
  topcards: "Top-Karten",
  highliftcards: "auffällig oft dabei",
  gamechangers: "Game Changer",
  creatures: "Kreaturen",
  instants: "Spontanzauber",
  sorceries: "Hexereien",
  utilityartifacts: "Artefakte",
  manaartifacts: "Mana-Artefakte",
  enchantments: "Verzauberungen",
  planeswalkers: "Planeswalker",
  battles: "Schlachten",
  utilitylands: "Spezial-Länder",
  lands: "Länder",
};

export const BASE_ROLES = "Ramp, Kartenvorteil, Removal, Board Wipe, Tutor, Counterspell, Schutz, Rekursion";

const pct = (x: number) => `${Math.round(x * 100)} %`;
const list = (r: CardRole[]) => r.map((x) => ROLE_LABEL[x]).join(", ");

type Ctx = { commander: string; numDecks?: number | null; themes?: string[]; pairsIn?: PairFit | null; pairsOut?: PairFit | null };

const names = (p: PairFit, n = 3) => p.partners.slice(0, n).map((x) => x.name).join(", ") + (p.partners.length > n ? " …" : "");

export function explainIn(add: SwapIn, out: SwapOut | undefined, health: DeckHealth, ctx: Ctx): string[] {
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

  if (ctx.pairsIn?.known) {
    const n = ctx.pairsIn.partners.length;
    const o = ctx.pairsOut?.known ? ctx.pairsOut.partners.length : null;
    if (n) why.push(`Spielt man auffällig oft zusammen mit ${n} deiner Karten (${names(ctx.pairsIn)})${o != null ? ` – ${out?.name} nur mit ${o}` : ""}.`);
    else why.push("Mit keiner deiner Karten auffällig oft zusammen – passt eher zum Commander als zu deinen übrigen Karten.");
  }

  const cat = EDHREC_LIST[add.list];
  if (add.themes.length) why.push(`Passt zum Thema ${add.themes.join(", ")} – typisch für ${ctx.commander}${cat ? ` (EDHREC-Kategorie „${cat}“)` : ""}.`);
  else if (cat) why.push(`Auf der EDHREC-Seite von ${ctx.commander} unter „${cat}“ gelistet.`);

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

export function explainOut(out: SwapOut, ctx: Ctx): string[] {
  const why: string[] = [];
  why.push(
    out.inclusion == null
      ? `Taucht in der EDHREC-Liste für ${ctx.commander} nicht auf – kaum jemand spielt sie dort.`
      : `Nur ${pct(out.inclusion)} der ${ctx.commander}-Decks spielen sie.`,
  );
  if (out.synergy != null && out.synergy < 0) why.push(`Negative Synergie (${pct(out.synergy)}): in anderen Decks dieser Farben sogar häufiger als bei ${ctx.commander}.`);
  if (ctx.pairsOut) {
    if (!ctx.pairsOut.known) why.push("Bei EDHREC gibt es keine Daten zum Zusammenspiel – sie wird insgesamt kaum gespielt.");
    else if (ctx.pairsOut.partners.length >= 5) why.push(`Aber: spielt man oft zusammen mit ${ctx.pairsOut.partners.length} deiner Karten (${names(ctx.pairsOut)}) – womöglich Teil eines Plans; prüfen.`);
    else why.push(ctx.pairsOut.partners.length ? `Spielt man nur mit ${ctx.pairsOut.partners.length} deiner Karten auffällig oft zusammen (${names(ctx.pairsOut)}).` : "Wird mit keiner deiner Karten auffällig oft zusammen gespielt.");
  }
  if (out.themes.length) why.push(`Passt aber zum Thema ${out.themes.join(", ")} – prüfe, ob sie für deine Strategie wichtig ist.`);
  else if (ctx.themes?.length) why.push(`Kein Bezug zu den typischen Themen von ${ctx.commander} (${ctx.themes.slice(0, 4).join(", ")}).`);
  if (!out.rolesKnown) why.push("Ihre Rolle ist noch nicht ermittelt (wird nachgeladen) – hier selbst prüfen.");
  else if (out.roles.length) why.push(`Rolle: ${list(out.roles)} – die übernimmt der Ersatz oder sie ist im Deck ausreichend vertreten.`);
  else why.push(`Hat keine der Grundrollen, die jedes Commander-Deck braucht (${BASE_ROLES}).`);
  if (out.cmc >= 6) why.push(`${out.cmc} Mana – teure Karten machen das Deck langsamer.`);
  return why;
}

export type Card = {
  id: string;
  user_id: string;
  scryfall_id: string;
  name: string;
  // Deutscher Name: null = noch nicht ermittelt, "" = kein deutscher Druck
  name_de?: string | null;
  set_code: string | null;
  collector_number: string | null;
  image_url: string | null;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string[] | null;
  rarity: string | null;
  oracle_text: string | null;
  quantity: number;
  foil: boolean;
  price_eur: number | null;
  price_eur_foil: number | null;
  price_updated_at: string | null;
  condition: string;
  language: string;
  created_at: string;
  /** Ordner, in denen die Karte steht (beliebig viele) – Migration 015 */
  folder_ids?: string[];
};

export type Folder = {
  id: string;
  name: string;
  created_at: string;
};

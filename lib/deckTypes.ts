export type Deck = {
  id: string;
  user_id: string;
  name: string;
  commander_name: string;
  commander_image_url: string | null;
  color_identity: string[];
  created_at: string;
};

export type DeckCard = {
  id: string;
  deck_id: string;
  user_id: string;
  scryfall_id: string;
  name: string;
  image_url: string | null;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string[] | null;
  oracle_text: string | null;
  is_commander: boolean;
  price_eur: number | null;
  price_eur_foil: number | null;
  created_at: string;
};

export type Friendship = {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted";
  created_at: string;
};

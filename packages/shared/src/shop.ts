import type { ShopItem } from "./types.js";

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "matrix_cloak",
    name: "Matrix Cloak",
    description: "Cosmetic trail. You look like falling code.",
    cost: 50,
    kind: "cosmetic",
  },
  {
    id: "duck_hat",
    name: "Duck Hat",
    description: "A tiny rubber duck for your hitbox.",
    cost: 75,
    kind: "cosmetic",
  },
  {
    id: "stat_chip",
    name: "Stat Chip",
    description: "Gain +1 unspent stat point.",
    cost: 100,
    kind: "stat",
  },
  {
    id: "xp_tonic",
    name: "XP Tonic",
    description: "Drink 50 XP. Tastes like merge conflicts.",
    cost: 40,
    kind: "consumable",
  },
  {
    id: "emote_shipit",
    name: "Emote: shipit",
    description: "Unlock the shipit duel emote.",
    cost: 20,
    kind: "emote",
  },
];

export function shopItemById(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}

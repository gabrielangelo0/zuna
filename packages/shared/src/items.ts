import type { MonsterKind } from "./monsters.ts";

// Equipamentos: armas, escudos, elmos, armaduras e botas. Caem dos monstros, são vendidos
// na loja (ouro ou diamantes) e somam ataque, defesa, vida e mana ao personagem.
// A lista abaixo é a de fábrica: vai para o banco no primeiro arranque e depois quem manda é o painel.

export type EquipSlot = "weapon" | "shield" | "helmet" | "armor" | "boots";

export const EQUIP_SLOTS: readonly EquipSlot[] = ["helmet", "weapon", "armor", "shield", "boots"];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Arma",
  shield: "Escudo",
  helmet: "Capacete",
  armor: "Armadura",
  boots: "Botas",
};

export type ItemRarity = "comum" | "incomum" | "raro" | "epico" | "lendario";

export const ITEM_RARITIES: readonly ItemRarity[] = ["comum", "incomum", "raro", "epico", "lendario"];

export interface RarityDef {
  label: string;
  /** Cor da moldura, do nome e do brilho no chão. */
  color: number;
  /** Chance de cair a cada monstro derrotado (antes do multiplicador do painel). */
  dropChance: number;
  /** Força em relação a um item comum do mesmo nível. */
  power: number;
}

export const RARITY: Record<ItemRarity, RarityDef> = {
  comum: { label: "Comum", color: 0xc9d1dc, dropChance: 0.03, power: 1 },
  incomum: { label: "Incomum", color: 0x5ef08f, dropChance: 0.012, power: 1.2 },
  raro: { label: "Raro", color: 0x4aa8ff, dropChance: 0.004, power: 1.45 },
  epico: { label: "Épico", color: 0xb57bff, dropChance: 0.0012, power: 1.75 },
  lendario: { label: "Lendário", color: 0xffb13b, dropChance: 0.0003, power: 2.1 },
};

export interface GearStats {
  attack: number;
  defense: number;
  hp: number;
  mana: number;
}

export interface GearDef extends GearStats {
  id: string;
  name: string;
  slot: EquipSlot;
  /** Quadro do atlas de ícones (sprites/items.json). */
  icon: string;
  rarity: ItemRarity;
  /** Nível mínimo para usar. Também decide de quais monstros o item cai. */
  level: number;
  /** Preço na loja (0 = não vende por essa moeda). */
  priceGold: number;
  priceDiamonds: number;
  /** Ouro que o jogador recebe ao vender. */
  sellGold: number;
  /** Cai de monstros. */
  drops: boolean;
  /** Fora do jogo: não cai nem aparece na loja (quem já tem continua com ele). */
  enabled: boolean;
}

export const EMPTY_STATS: GearStats = { attack: 0, defense: 0, hp: 0, mana: 0 };

/** Itens na mochila, fora os equipados. */
export const BAG_SIZE = 30;

/** Atributos de um item pelo espaço, nível e raridade. `magic` troca parte do ataque por mana. */
export function baseGearStats(slot: EquipSlot, level: number, rarity: ItemRarity, magic = false): GearStats {
  const m = RARITY[rarity].power;
  const r = (value: number) => Math.max(0, Math.round(value * m));
  switch (slot) {
    case "weapon":
      return { attack: r((4 + level * 0.9) * (magic ? 0.8 : 1)), defense: 0, hp: 0, mana: magic ? r(10 + level * 2) : 0 };
    case "shield":
      return { attack: 0, defense: r(1 + level * 0.18), hp: r(level * 2), mana: magic ? r(8 + level * 2) : 0 };
    case "helmet":
      return { attack: 0, defense: r(1 + level * 0.1), hp: magic ? 0 : r(level * 1.2), mana: magic ? r(6 + level * 1.5) : 0 };
    case "armor":
      return { attack: 0, defense: r((1 + level * 0.22) * (magic ? 0.7 : 1)), hp: r(level * 3), mana: magic ? r(10 + level * 2) : 0 };
    case "boots":
      return { attack: 0, defense: r(0.5 + level * 0.08), hp: r(level * 1.5), mana: magic ? r(4 + level) : 0 };
  }
}

/** Valor de referência em ouro, base para o preço de loja e para a venda. */
export function gearValue(level: number, rarity: ItemRarity): number {
  return Math.round((60 + level ** 1.7 * 18) * RARITY[rarity].power ** 2);
}

interface FactoryRow {
  id: string;
  name: string;
  slot: EquipSlot;
  icon: string;
  rarity: ItemRarity;
  level: number;
  magic?: boolean;
  /** Vende na loja: ouro para comuns e incomuns, diamantes para épicos. Raros e lendários só caem. */
  shop?: boolean;
}

const FACTORY_ROWS: FactoryRow[] = [
  // Armas
  { id: "adaga-ferro", name: "Adaga de Ferro", slot: "weapon", icon: "dagger", rarity: "comum", level: 1, shop: true },
  { id: "espada-curta", name: "Espada Curta", slot: "weapon", icon: "sword", rarity: "comum", level: 6, shop: true },
  { id: "varinha-aprendiz", name: "Varinha de Aprendiz", slot: "weapon", icon: "wand", rarity: "comum", level: 8, magic: true, shop: true },
  { id: "varinha-ignea", name: "Varinha Ígnea", slot: "weapon", icon: "wand_ruby", rarity: "incomum", level: 12, magic: true },
  { id: "machado-batalha", name: "Machado de Batalha", slot: "weapon", icon: "axe", rarity: "comum", level: 15, shop: true },
  { id: "besta-leve", name: "Besta Leve", slot: "weapon", icon: "crossbow", rarity: "incomum", level: 18, shop: true },
  { id: "montante", name: "Montante", slot: "weapon", icon: "greatsword", rarity: "comum", level: 25, shop: true },
  { id: "cajado-arcano", name: "Cajado Arcano", slot: "weapon", icon: "staff", rarity: "incomum", level: 25, magic: true, shop: true },
  { id: "adaga-sombria", name: "Adaga Sombria", slot: "weapon", icon: "dagger_obsidian", rarity: "raro", level: 28 },
  { id: "lamina-osso", name: "Lâmina de Osso", slot: "weapon", icon: "bone_blade", rarity: "comum", level: 35, shop: true },
  { id: "besta-pesada", name: "Besta Pesada", slot: "weapon", icon: "heavy_crossbow", rarity: "incomum", level: 35, shop: true },
  { id: "espada-glacial", name: "Espada Glacial", slot: "weapon", icon: "sword_frost", rarity: "raro", level: 38 },
  { id: "cajado-gelo", name: "Cajado do Gelo", slot: "weapon", icon: "staff_frost", rarity: "epico", level: 40, magic: true, shop: true },
  { id: "machado-duplo", name: "Machado Duplo", slot: "weapon", icon: "greataxe", rarity: "comum", level: 45, shop: true },
  { id: "cajado-necromante", name: "Cajado do Necromante", slot: "weapon", icon: "bone_staff", rarity: "raro", level: 48, magic: true },
  { id: "machado-rubro", name: "Machado Rubro", slot: "weapon", icon: "axe_ruby", rarity: "raro", level: 55 },
  { id: "besta-dourada", name: "Besta Dourada", slot: "weapon", icon: "crossbow_gold", rarity: "epico", level: 55, shop: true },
  { id: "espada-real", name: "Espada Real", slot: "weapon", icon: "greatsword_royal", rarity: "incomum", level: 60, shop: true },
  { id: "montante-dourado", name: "Montante Dourado", slot: "weapon", icon: "greatsword_gold", rarity: "epico", level: 65, shop: true },
  { id: "machado-abismo", name: "Machado do Abismo", slot: "weapon", icon: "greataxe_obsidian", rarity: "lendario", level: 70 },
  { id: "lamina-rei", name: "Lâmina do Rei", slot: "weapon", icon: "sword_gold", rarity: "lendario", level: 80 },
  // Escudos
  { id: "escudo-madeira", name: "Escudo de Madeira", slot: "shield", icon: "shield_round", rarity: "comum", level: 1, shop: true },
  { id: "escudo-quadrado", name: "Escudo Quadrado", slot: "shield", icon: "shield_square", rarity: "comum", level: 8, shop: true },
  { id: "escudo-brasao", name: "Escudo de Brasão", slot: "shield", icon: "shield_badge", rarity: "comum", level: 15, shop: true },
  { id: "grimorio", name: "Grimório", slot: "shield", icon: "spellbook", rarity: "incomum", level: 18, magic: true, shop: true },
  { id: "escudo-carmesim", name: "Escudo Carmesim", slot: "shield", icon: "shield_square_ruby", rarity: "incomum", level: 22 },
  { id: "escudo-osso", name: "Escudo de Osso", slot: "shield", icon: "bone_shield_small", rarity: "comum", level: 25, shop: true },
  { id: "escudo-espinhos", name: "Escudo de Espinhos", slot: "shield", icon: "shield_spikes", rarity: "comum", level: 35, shop: true },
  { id: "escudo-gelido", name: "Escudo Gélido", slot: "shield", icon: "shield_round_frost", rarity: "raro", level: 38 },
  { id: "escudo-guardiao", name: "Escudo do Guardião", slot: "shield", icon: "bone_shield_large", rarity: "comum", level: 45, shop: true },
  { id: "egide-dourada", name: "Égide Dourada", slot: "shield", icon: "shield_badge_gold", rarity: "epico", level: 55, shop: true },
  { id: "escudo-real", name: "Escudo Real", slot: "shield", icon: "shield_badge_color", rarity: "incomum", level: 60, shop: true },
  { id: "escudo-abismo", name: "Escudo do Abismo", slot: "shield", icon: "bone_shield_large_obsidian", rarity: "lendario", level: 70 },
  // Capacetes
  { id: "capuz-viajante", name: "Capuz de Viajante", slot: "helmet", icon: "hood_rogue", rarity: "comum", level: 1, shop: true },
  { id: "chapeu-mago", name: "Chapéu de Mago", slot: "helmet", icon: "hat_mage", rarity: "comum", level: 8, magic: true, shop: true },
  { id: "elmo-urso", name: "Elmo de Urso", slot: "helmet", icon: "helm_barbarian", rarity: "incomum", level: 15, shop: true },
  { id: "elmo-cavaleiro", name: "Elmo de Cavaleiro", slot: "helmet", icon: "helm_knight", rarity: "comum", level: 25, shop: true },
  { id: "elmo-osso", name: "Elmo de Osso", slot: "helmet", icon: "helm_bone", rarity: "comum", level: 35, shop: true },
  { id: "elmo-glacial", name: "Elmo Glacial", slot: "helmet", icon: "helm_knight_frost", rarity: "raro", level: 40 },
  { id: "chapeu-necromante", name: "Chapéu do Necromante", slot: "helmet", icon: "hat_necro", rarity: "incomum", level: 45, magic: true, shop: true },
  { id: "elmo-infernal", name: "Elmo Infernal", slot: "helmet", icon: "helm_bone_ruby", rarity: "raro", level: 55 },
  { id: "chapeu-sombrio", name: "Chapéu Sombrio", slot: "helmet", icon: "hat_mage_obsidian", rarity: "epico", level: 55, magic: true, shop: true },
  { id: "elmo-real", name: "Elmo Real", slot: "helmet", icon: "helm_knight_gold", rarity: "epico", level: 60, shop: true },
  { id: "elmo-abismo", name: "Elmo do Abismo", slot: "helmet", icon: "helm_knight_obsidian", rarity: "lendario", level: 80 },
  // Armaduras
  { id: "tunica-couro", name: "Túnica de Couro", slot: "armor", icon: "tunic_rogue", rarity: "comum", level: 1, shop: true },
  { id: "manto-aprendiz", name: "Manto de Aprendiz", slot: "armor", icon: "robe_mage", rarity: "comum", level: 8, magic: true, shop: true },
  { id: "couraca-barbara", name: "Couraça Bárbara", slot: "armor", icon: "armor_barbarian", rarity: "comum", level: 15, shop: true },
  { id: "armadura-placas", name: "Armadura de Placas", slot: "armor", icon: "armor_knight", rarity: "comum", level: 25, shop: true },
  { id: "manto-gelo", name: "Manto do Gelo", slot: "armor", icon: "robe_mage_frost", rarity: "raro", level: 30, magic: true },
  { id: "armadura-osso", name: "Armadura de Osso", slot: "armor", icon: "armor_bone", rarity: "comum", level: 35, shop: true },
  { id: "armadura-glacial", name: "Armadura Glacial", slot: "armor", icon: "armor_knight_frost", rarity: "raro", level: 40 },
  { id: "manto-sombrio", name: "Manto Sombrio", slot: "armor", icon: "robe_mage_obsidian", rarity: "epico", level: 45, magic: true, shop: true },
  { id: "armadura-infernal", name: "Armadura Infernal", slot: "armor", icon: "armor_bone_ruby", rarity: "raro", level: 55 },
  { id: "armadura-real", name: "Armadura Real", slot: "armor", icon: "armor_knight_gold", rarity: "epico", level: 60, shop: true },
  { id: "armadura-abismo", name: "Armadura do Abismo", slot: "armor", icon: "armor_knight_obsidian", rarity: "lendario", level: 80 },
  // Botas
  { id: "botas-couro", name: "Botas de Couro", slot: "boots", icon: "legs_rogue", rarity: "comum", level: 1, shop: true },
  { id: "sapatos-tecido", name: "Sapatos de Tecido", slot: "boots", icon: "legs_mage", rarity: "comum", level: 8, magic: true, shop: true },
  { id: "botas-pele", name: "Botas de Pele", slot: "boots", icon: "legs_barbarian", rarity: "comum", level: 15, shop: true },
  { id: "grevas-ferro", name: "Grevas de Ferro", slot: "boots", icon: "legs_knight", rarity: "comum", level: 25, shop: true },
  { id: "botas-flamejantes", name: "Botas Flamejantes", slot: "boots", icon: "legs_mage_ruby", rarity: "incomum", level: 30, magic: true },
  { id: "grevas-glaciais", name: "Grevas Glaciais", slot: "boots", icon: "legs_knight_frost", rarity: "raro", level: 40 },
  { id: "grevas-reais", name: "Grevas Reais", slot: "boots", icon: "legs_knight_gold", rarity: "epico", level: 60, shop: true },
  { id: "grevas-abismo", name: "Grevas do Abismo", slot: "boots", icon: "legs_knight_obsidian", rarity: "lendario", level: 80 },
];

/** Épicos na loja custam diamantes (dá progresso garantido: nada de sorteio pago). */
function diamondPrice(level: number): number {
  return Math.round((120 + level * 6) / 10) * 10;
}

export const FACTORY_GEAR: readonly GearDef[] = FACTORY_ROWS.map((row) => {
  const value = gearValue(row.level, row.rarity);
  const epic = row.rarity === "epico";
  const goldShop = row.shop && (row.rarity === "comum" || row.rarity === "incomum");
  return {
    id: row.id,
    name: row.name,
    slot: row.slot,
    icon: row.icon,
    rarity: row.rarity,
    level: row.level,
    ...baseGearStats(row.slot, row.level, row.rarity, row.magic),
    priceGold: goldShop ? value : 0,
    priceDiamonds: row.shop && epic ? diamondPrice(row.level) : 0,
    sellGold: Math.max(1, Math.round(value / 5)),
    drops: true,
    enabled: true,
  };
});

// ---------------------------------------------------------------- catálogo em vigor

let gear = new Map<string, GearDef>(FACTORY_GEAR.map((item) => [item.id, item]));

/** Troca a lista em vigor (o servidor lê do banco; o cliente recebe do servidor). */
export function setGearCatalog(items: readonly GearDef[]) {
  gear = new Map(items.map((item) => [item.id, item]));
}

export function gearItem(id: string): GearDef | undefined {
  return gear.get(id);
}

export function gearList(): GearDef[] {
  return [...gear.values()];
}

/** Soma dos atributos dos itens equipados. */
export function sumStats(items: readonly (GearStats | undefined)[]): GearStats {
  const total = { ...EMPTY_STATS };
  for (const item of items) {
    if (!item) continue;
    total.attack += item.attack;
    total.defense += item.defense;
    total.hp += item.hp;
    total.mana += item.mana;
  }
  return total;
}

/** "+12 ataque · +5 defesa". */
export function describeStats(stats: GearStats): string[] {
  const lines: string[] = [];
  if (stats.attack) lines.push(`+${stats.attack} ataque`);
  if (stats.defense) lines.push(`+${stats.defense} defesa`);
  if (stats.hp) lines.push(`+${stats.hp} vida`);
  if (stats.mana) lines.push(`+${stats.mana} mana`);
  return lines;
}

// ---------------------------------------------------------------- drops

/** Nível de cada monstro: decide quais itens ele pode derrubar. */
export const MONSTER_LEVEL: Record<MonsterKind, number> = {
  rat: 1,
  snake: 2,
  wolf: 4,
  orc: 8,
  troll: 12,
  cyclops: 20,
  orcLeader: 18,
  fox: 9,
  mushroomBrute: 11,
  golem: 14,
  mushroomKing: 20,
  spikyBlob: 13,
  frog: 16,
  glub: 19,
  frogKing: 26,
  cactus: 25,
  wasp: 27,
  raptor: 30,
  cactusWarrior: 33,
  raptorAlpha: 40,
  yetiCub: 35,
  iceSpirit: 38,
  bison: 42,
  yetiElder: 50,
  skeleton: 45,
  ghostSkull: 48,
  skeletonMage: 52,
  necroLord: 62,
  imp: 60,
  blueDemon: 66,
  dragon: 85,
};

/** Um monstro derruba itens de até 20 níveis abaixo do dele (e só um pouco acima). */
const DROP_BELOW = 20;
const DROP_ABOVE = 2;

/**
 * Sorteia no máximo um item por monstro: tenta da raridade mais alta para a mais baixa.
 * Chefes sempre derrubam um item raro ou melhor, quando existe algum no nível deles.
 */
export function rollGear(random: () => number, monsterLevel: number, boss: boolean, rate: number): GearDef | null {
  const pool = gearList().filter(
    (item) => item.enabled && item.drops && item.level <= monsterLevel + DROP_ABOVE && item.level >= monsterLevel - DROP_BELOW,
  );
  if (pool.length === 0) return null;
  const pick = (rarity: ItemRarity) => {
    const options = pool.filter((item) => item.rarity === rarity);
    return options.length > 0 ? options[Math.floor(random() * options.length)]! : null;
  };
  for (const rarity of [...ITEM_RARITIES].reverse()) {
    const chance = RARITY[rarity].dropChance * rate * (boss ? 25 : 1);
    if (random() < chance) {
      const item = pick(rarity);
      if (item) return item;
    }
  }
  if (boss) {
    for (const rarity of ["raro", "incomum", "comum"] as const) {
      const item = pick(rarity);
      if (item) return item;
    }
  }
  return null;
}

// ---------------------------------------------------------------- inventário

/** Um item que o personagem tem. `equipped` vazio = na mochila. */
export interface OwnedItem {
  uid: number;
  itemId: string;
  equipped: EquipSlot | "";
}

export interface InventoryEvent {
  items: OwnedItem[];
  /** Soma dos equipados. */
  stats: GearStats;
}

export interface GearCatalogEvent {
  items: GearDef[];
}

/** Ícone no atlas de itens. */
export interface ItemAtlas {
  image: string;
  size: number;
  width: number;
  height: number;
  icons: Record<string, [number, number]>;
}

export function rarityCss(rarity: ItemRarity): string {
  return `#${RARITY[rarity].color.toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------- painel

export interface AdminGearRow {
  item: GearDef;
  /** Quantos personagens têm o item. */
  owners: number;
}

export interface AdminGearResponse {
  items: AdminGearRow[];
  dropRate: number;
  /** Ícones disponíveis no atlas. */
  icons: string[];
}

/** Criar (id vazio), mudar ou apagar um equipamento. */
export interface AdminGearRequest extends Partial<Omit<GearDef, "id">> {
  id: string;
  remove?: boolean;
}

export const GEAR_MAX_LEVEL = 9999;
export const GEAR_MAX_STAT = 100_000;
export const GEAR_MAX_PRICE = 100_000_000;

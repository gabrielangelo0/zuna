export type Currency = "gold" | "diamonds";
export type ItemKind = "outfit" | "pet" | "mount";

export interface ItemBonus {
  /** XP extra por monstro (0,05 = +5%). */
  xp?: number;
  /** Ouro extra no loot. */
  gold?: number;
  /** Multiplica o tempo de cada passo quando montado (0,8 = 25% mais rápido). */
  stepFactor?: number;
}

export interface CatalogItem {
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  /** 0 = liberado para todo mundo. */
  price: number;
  currency: Currency;
  bonus?: ItemBonus;
  /** Fora da loja quando falso. Quem já tem continua com o item. */
  enabled?: boolean;
}

/** O que o painel pode mudar num item do catálogo. Campo ausente = fica como veio de fábrica. */
export interface CatalogOverride {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: Currency;
  enabled?: boolean;
}

/** Sprite gerado pelo baker para cada item (packages/client/public/sprites/<id>). */
export function itemSpriteId(item: Pick<CatalogItem, "id" | "kind">): string {
  return `${item.kind}_${item.id}`;
}

/** Catálogo de fábrica. O que vale no jogo é `catalogList()`, que já traz as mudanças do painel. */
export const CATALOG: readonly CatalogItem[] = [
  // Roupas: cada uma é um modelo; pele, cabelo e as 3 cores são escolhidos pelo jogador.
  { id: "aventureiro", kind: "outfit", name: "Aventureiro", description: "Capa, túnica e uma adaga fiel.", price: 0, currency: "gold" },
  { id: "guerreiro", kind: "outfit", name: "Guerreiro", description: "Elmo de chifres, machado e escudo.", price: 0, currency: "gold" },
  { id: "cacador", kind: "outfit", name: "Caçador", description: "Capuz e duas adagas.", price: 0, currency: "gold" },
  { id: "mago", kind: "outfit", name: "Mago Arcano", description: "Chapéu de abas largas, manto e cajado.", price: 800, currency: "gold" },
  { id: "cavaleiroReal", kind: "outfit", name: "Cavaleiro Real", description: "Armadura completa, espada e escudo com brasão.", price: 300, currency: "diamonds" },
  { id: "sombrio", kind: "outfit", name: "Assassino Sombrio", description: "Um esqueleto encapuzado com lâmina curva.", price: 400, currency: "diamonds" },
  { id: "necromante", kind: "outfit", name: "Necromante", description: "Um esqueleto mago com cajado de ossos.", price: 450, currency: "diamonds" },

  // Mascotes: seguem o jogador e dão bônus.
  { id: "gato", kind: "pet", name: "Gato Tigrado", description: "Dá sorte no loot.", price: 200, currency: "gold", bonus: { gold: 0.03 } },
  { id: "galinha", kind: "pet", name: "Galinha", description: "Cisca moedas por onde passa.", price: 600, currency: "gold", bonus: { gold: 0.05 } },
  { id: "magoMirim", kind: "pet", name: "Mago Mirim", description: "Ensina algo em cada batalha.", price: 150, currency: "diamonds", bonus: { xp: 0.05 } },
  { id: "dragaozinho", kind: "pet", name: "Dragãozinho", description: "Pequeno, mas feroz.", price: 400, currency: "diamonds", bonus: { xp: 0.1 } },
  { id: "fantasma", kind: "pet", name: "Fantasminha", description: "Assombra os monstros e o tesouro deles.", price: 600, currency: "diamonds", bonus: { xp: 0.1, gold: 0.1 } },

  // Montarias: mais velocidade (e bônus nas premium).
  { id: "cavalo", kind: "mount", name: "Cavalo", description: "Fiel e veloz.", price: 1500, currency: "gold", bonus: { stepFactor: 0.8 } },
  { id: "cavaloBranco", kind: "mount", name: "Cavalo Branco", description: "Elegante e mais rápido.", price: 250, currency: "diamonds", bonus: { stepFactor: 0.75 } },
  { id: "loboNeves", kind: "mount", name: "Lobo das Neves", description: "Corre pelas trilhas geladas.", price: 300, currency: "diamonds", bonus: { stepFactor: 0.7 } },
  { id: "cervo", kind: "mount", name: "Cervo Real", description: "Veloz e bom de faro para ouro.", price: 450, currency: "diamonds", bonus: { stepFactor: 0.7, gold: 0.05 } },
  { id: "dragao", kind: "mount", name: "Dragão Rubro", description: "A montaria mais rápida do reino.", price: 900, currency: "diamonds", bonus: { stepFactor: 0.6, xp: 0.05 } },
];

let live: CatalogItem[] = CATALOG.map((item) => ({ ...item }));
let liveById = new Map(live.map((item) => [item.id, item]));

/**
 * Aplica por cima do catálogo de fábrica o que o painel mudou (preço, moeda, nome, à venda ou não).
 * Servidor e cliente chamam isto no arranque, com a mesma lista.
 */
export function applyCatalogOverrides(overrides: readonly CatalogOverride[]) {
  const byId = new Map(overrides.map((entry) => [entry.id, entry]));
  live = CATALOG.map((item) => {
    const change = byId.get(item.id);
    if (!change) return { ...item };
    return {
      ...item,
      name: change.name || item.name,
      description: change.description || item.description,
      price: change.price ?? item.price,
      currency: change.currency ?? item.currency,
      enabled: change.enabled ?? true,
    };
  });
  liveById = new Map(live.map((item) => [item.id, item]));
}

/** Catálogo em vigor, incluindo o que está fora da loja. */
export function catalogList(): readonly CatalogItem[] {
  return live;
}

/** Só o que está à venda agora. */
export function shopItems(kind?: ItemKind): CatalogItem[] {
  return live.filter((item) => item.enabled !== false && (kind === undefined || item.kind === kind));
}

export function catalogItem(id: string): CatalogItem | undefined {
  return liveById.get(id);
}

export function ownsItem(item: CatalogItem, unlocks: ReadonlySet<string>): boolean {
  return item.price === 0 || unlocks.has(item.id);
}

export function describeBonus(bonus: ItemBonus | undefined): string[] {
  if (!bonus) return [];
  const lines: string[] = [];
  if (bonus.stepFactor) lines.push(`+${Math.round((1 / bonus.stepFactor - 1) * 100)}% velocidade`);
  if (bonus.xp) lines.push(`+${Math.round(bonus.xp * 100)}% XP`);
  if (bonus.gold) lines.push(`+${Math.round(bonus.gold * 100)}% ouro`);
  return lines;
}

// ---------------------------------------------------------------- aparência

export const SKIN_TONES: readonly number[] = [0xf6d7b8, 0xf1c7a0, 0xdca47a, 0xc68a5e, 0x9c6644, 0x6f4630, 0x4a2f22];

export const HAIR_COLORS: readonly number[] = [0x1f1a14, 0x4a2e1a, 0x7a3b1c, 0xc28a3a, 0xe8d08a, 0xb03a2e, 0x9aa0a6, 0xf4f1ea];

/** Paleta das roupas: como no Tibia, cada parte da roupa pode ter uma cor. */
export const OUTFIT_COLORS: readonly number[] = [
  0xf4f1ea, 0xb8b2a6, 0x6b6f76, 0x2b2d33, 0xdc2626, 0x9b1c1c, 0xf97316, 0xb45309,
  0xfacc15, 0xd9b44a, 0x84cc16, 0x16a34a, 0x065f46, 0x14b8a6, 0x0ea5e9, 0x2563eb,
  0x1e3a8a, 0x7c3aed, 0x9333ea, 0xdb2777, 0xf9a8d4, 0x8b5a2b, 0x5c3a1e, 0xe8d5b0,
];

export interface Appearance {
  /** Índice em SKIN_TONES. */
  skin: number;
  /** Índice em HAIR_COLORS. */
  hairColor: number;
  /** Id de uma roupa do catálogo. */
  outfit: string;
  /** Índices em OUTFIT_COLORS. */
  primary: number;
  secondary: number;
  detail: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 1,
  hairColor: 1,
  outfit: "aventureiro",
  primary: 15,
  secondary: 22,
  detail: 9,
};

/**
 * Cores de cada grupo tingível, na ordem de TINT_GROUPS (base, pele, cabelo, principal, secundária, detalhe).
 * A base nunca é tingida.
 */
export function appearanceColors(appearance: Appearance): number[] {
  return [
    0xffffff,
    SKIN_TONES[appearance.skin] ?? SKIN_TONES[0],
    HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[0],
    OUTFIT_COLORS[appearance.primary] ?? OUTFIT_COLORS[0],
    OUTFIT_COLORS[appearance.secondary] ?? OUTFIT_COLORS[0],
    OUTFIT_COLORS[appearance.detail] ?? OUTFIT_COLORS[0],
  ];
}

function isIndex(value: unknown, length: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}

/** Valida uma aparência vinda de fora (cliente ou banco). Retorna null se algo estiver fora do lugar. */
export function parseAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const outfit = typeof v.outfit === "string" ? catalogItem(v.outfit) : undefined;
  if (
    !outfit ||
    outfit.kind !== "outfit" ||
    !isIndex(v.skin, SKIN_TONES.length) ||
    !isIndex(v.hairColor, HAIR_COLORS.length) ||
    !isIndex(v.primary, OUTFIT_COLORS.length) ||
    !isIndex(v.secondary, OUTFIT_COLORS.length) ||
    !isIndex(v.detail, OUTFIT_COLORS.length)
  ) {
    return null;
  }
  return {
    skin: v.skin,
    hairColor: v.hairColor,
    outfit: outfit.id,
    primary: v.primary,
    secondary: v.secondary,
    detail: v.detail,
  };
}

// VIP: passe por prazo, comprado com diamantes. Não encosta na Asaas — o jogador já compra
// diamante por Pix e cartão, e gasta o diamante aqui. Renovação automática pode entrar depois
// sem refazer nada, porque o estado por baixo é só `tier` + `until`.

export interface VipTier {
  /** "ouro", "diamante". */
  id: string;
  name: string;
  description: string;
  /** Para comparar degraus: subir, descer e trancar montaria exclusiva. */
  rank: number;
  /** O único número que a conversão de degrau usa (seção 4 do spec). */
  diamondsPerDay: number;
  /** +0,5 = +50% de XP de monstro. */
  bonusXp: number;
  bonusGold: number;
  /** Multiplica a perda de XP na morte. 0,5 = metade; 0 = nenhuma. */
  deathXpFactor: number;
  /** Espaços a mais na mochila (levantam o teto junto com o piso). */
  bagSlots: number;
  /** Cor do nome no chat e na tela. */
  color: string;
  /** Título acima do nome (vazio = sem título). */
  title: string;
  chestGold: number;
  chestDiamonds: number;
  chestXp: number;
  chestItem: string;
  chestItemCount: number;
  enabled: boolean;
}

/** O que está à venda. Separado do degrau para "Ouro 90 dias" não duplicar os benefícios. */
export interface VipPass {
  id: string;
  /** `VipTier.id`. */
  tier: string;
  days: number;
  priceDiamonds: number;
  tag: string;
  enabled: boolean;
  sort: number;
}

export const VIP_MAX_DAYS = 3650;
export const VIP_MAX_PRICE = 1_000_000;
export const VIP_MAX_BAG_SLOTS = 200;
export const VIP_MAX_BONUS = 10;
export const VIP_TIER_LIMIT = 10;
export const VIP_PASS_LIMIT = 30;
const DIA = 86_400_000;

/** Degraus de fábrica: entram no banco no primeiro arranque; depois quem manda é o painel. */
export const FACTORY_VIP_TIERS: readonly VipTier[] = [
  {
    id: "ouro",
    name: "VIP Ouro",
    description: "Sobe mais rápido, carrega mais e perde menos ao morrer.",
    rank: 1,
    diamondsPerDay: 9,
    bonusXp: 0.5,
    bonusGold: 0.2,
    deathXpFactor: 0.5,
    bagSlots: 20,
    color: "#e8b13a",
    title: "",
    chestGold: 5000,
    chestDiamonds: 5,
    chestXp: 0,
    chestItem: "pocao-vida",
    chestItemCount: 5,
    enabled: true,
  },
  {
    id: "diamante",
    name: "VIP Diamante",
    description: "O dobro de experiência, nenhuma perda ao morrer e título na tela.",
    rank: 2,
    diamondsPerDay: 22,
    bonusXp: 1,
    bonusGold: 0.4,
    deathXpFactor: 0,
    bagSlots: 40,
    color: "#7dd8ff",
    title: "Diamante",
    chestGold: 15000,
    chestDiamonds: 15,
    chestXp: 0,
    chestItem: "pocao-vida-forte",
    chestItemCount: 10,
    enabled: true,
  },
];

export const FACTORY_VIP_PASSES: readonly VipPass[] = [
  { id: "ouro-30", tier: "ouro", days: 30, priceDiamonds: 275, tag: "", enabled: true, sort: 0 },
  { id: "diamante-30", tier: "diamante", days: 30, priceDiamonds: 660, tag: "Mais vendido", enabled: true, sort: 1 },
];

/** Degrau ativo agora (0 = não é VIP). Pura e sem data do sistema por dentro: é o que a torna testável. */
export function vipRank(tier: VipTier | undefined, untilMs: number, agora: number): number {
  if (!tier || untilMs <= agora) return 0;
  return tier.rank;
}

export function tierById(tiers: readonly VipTier[], id: string): VipTier | undefined {
  return tiers.find((tier) => tier.id === id);
}

/**
 * Dias totais ao subir de degrau: o que sobra do atual é convertido pelo **valor em
 * diamantes**, nunca pelos dias.
 *
 * Exemplo: sobram 10 dias de Ouro (10 × 9 = 90 💎). Diamante custa 22 💎/dia, então 90 💎 valem
 * 4 dias, e com os 30 comprados dá 34. Arredonda para baixo, a favor do jogo: a diferença é de
 * centavos e fecha a porta para alguém achar um ciclo de compra e venda que renda dias de graça.
 */
export function upgradeDays(restanteMs: number, de: VipTier, para: VipTier, passe: VipPass): number {
  const saldo = (Math.max(0, restanteMs) / DIA) * de.diamondsPerDay;
  const creditados = para.diamondsPerDay > 0 ? Math.floor(saldo / para.diamondsPerDay) : 0;
  return passe.days + creditados;
}

export interface VipState {
  /** "" = não é VIP. */
  tier: string;
  /** 0 = não é VIP. */
  untilMs: number;
}

/**
 * O que a compra faz com o estado atual, ou a recusa em português. As quatro situações da
 * seção 3 do spec moram aqui, num lugar só, porque errar aqui tira diamante de quem pagou.
 */
export function vipPurchase(
  atual: VipState,
  tiers: readonly VipTier[],
  passe: VipPass,
  agora: number,
): VipState | string {
  const novo = tierById(tiers, passe.tier);
  if (!novo || !novo.enabled || !passe.enabled) return "Esse passe não está à venda.";
  const atualTier = atual.tier ? tierById(tiers, atual.tier) : undefined;
  const ativo = vipRank(atualTier, atual.untilMs, agora) > 0;

  if (!ativo || !atualTier) return { tier: novo.id, untilMs: agora + passe.days * DIA };
  if (novo.rank === atualTier.rank) {
    // Mesmo degrau: soma os dias ao que já tem.
    return { tier: novo.id, untilMs: Math.max(agora, atual.untilMs) + passe.days * DIA };
  }
  if (novo.rank < atualTier.rank) {
    const data = new Date(atual.untilMs).toLocaleDateString("pt-BR");
    // Sem isto, quem tem o degrau caro compraria o barato para esticar prazo pela metade do preço.
    return `Você já é ${atualTier.name} até ${data}. Um degrau menor não substitui o que você tem.`;
  }
  const dias = upgradeDays(atual.untilMs - agora, atualTier, novo, passe);
  return { tier: novo.id, untilMs: agora + dias * DIA };
}

/** Dias inteiros que faltam, para mostrar na tela. */
export function vipDaysLeft(untilMs: number, agora: number): number {
  return Math.max(0, Math.ceil((untilMs - agora) / DIA));
}

export function clampVipTier(tier: VipTier): VipTier {
  const faixa = (value: number, min: number, max: number, padrao: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : padrao;
  return {
    ...tier,
    rank: Math.round(faixa(tier.rank, 1, 99, 1)),
    diamondsPerDay: Math.round(faixa(tier.diamondsPerDay, 1, VIP_MAX_PRICE, 1)),
    bonusXp: faixa(tier.bonusXp, 0, VIP_MAX_BONUS, 0),
    bonusGold: faixa(tier.bonusGold, 0, VIP_MAX_BONUS, 0),
    deathXpFactor: faixa(tier.deathXpFactor, 0, 1, 1),
    bagSlots: Math.round(faixa(tier.bagSlots, 0, VIP_MAX_BAG_SLOTS, 0)),
    chestGold: Math.round(faixa(tier.chestGold, 0, 1_000_000_000, 0)),
    chestDiamonds: Math.round(faixa(tier.chestDiamonds, 0, 1_000_000, 0)),
    chestXp: Math.max(0, Number(tier.chestXp) || 0),
    chestItemCount: Math.round(faixa(tier.chestItemCount, 1, 1000, 1)),
  };
}

export function clampVipPass(pass: VipPass): VipPass {
  const n = (value: number, min: number, max: number, padrao: number) =>
    Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : padrao;
  return {
    ...pass,
    days: n(pass.days, 1, VIP_MAX_DAYS, 30),
    priceDiamonds: n(pass.priceDiamonds, 1, VIP_MAX_PRICE, 1),
    sort: n(pass.sort, 0, 999, 0),
  };
}

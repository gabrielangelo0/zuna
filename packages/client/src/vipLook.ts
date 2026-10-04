import { tierById, type PlayerData, type VipTier } from "@zuna/shared";

// A cara do VIP na tela. O cliente recebe os degraus junto com os mundos e resolve a cor e o
// título pelo rank que vem no estado do jogador — o rank viaja em um byte, e a tabela de
// degraus vem uma vez só.

let tiers: readonly VipTier[] = [];

export function setVipTiers(list: readonly VipTier[]) {
  tiers = list;
}

export function vipTiersAll(): readonly VipTier[] {
  return tiers;
}

export function tierOfRank(rank: number): VipTier | undefined {
  if (rank <= 0) return undefined;
  return tiers.find((tier) => tier.rank === rank);
}

export function vipColorOf(data: PlayerData): string {
  return tierOfRank(data.vip ?? 0)?.color ?? "";
}

export function vipTitleOf(data: PlayerData): string {
  return data.title ?? "";
}

export { tierById };

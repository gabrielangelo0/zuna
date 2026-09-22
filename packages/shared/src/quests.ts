import type { MonsterKind } from "./monsters.ts";

// Missões: caçadas (mate X monstros) e desafios de chefe, que só começam com um número
// mínimo de jogadores juntos no altar. Tudo vem do banco e é editado no painel.

export type QuestKind = "kill" | "boss";

export interface QuestDef {
  id: number;
  name: string;
  description: string;
  kind: QuestKind;
  /** Caçada: monstro a caçar. Chefe: quem é invocado no altar. */
  monster: MonsterKind;
  /** Caçada: quantos matar. */
  amount: number;
  /** 0 = em qualquer mundo. */
  worldId: number;
  minLevel: number;
  /** Chefe: jogadores necessários perto do altar. */
  players: number;
  /** Chefe: onde ele aparece (tile do mundo da missão). */
  x: number;
  y: number;
  /** Chefe: a vida do chefe é multiplicada por isto vezes o número de jogadores. */
  bossScale: number;
  /** Pode repetir depois de tantos minutos (0 = só uma vez). */
  repeatMinutes: number;
  rewardXp: number;
  rewardGold: number;
  /** Id do equipamento dado ao entregar (vazio = nenhum). */
  rewardItem: string;
  rewardItemCount: number;
  enabled: boolean;
  sort: number;
}

/** O que cada personagem já fez de cada missão. */
export interface QuestProgress {
  questId: number;
  progress: number;
  /** Já pode entregar. */
  done: boolean;
  /** Missão repetível esperando o tempo passar (ISO), ou vazio. */
  readyAt: string;
  /** Quantas vezes já entregou. */
  times: number;
}

/** Lista das missões e o andamento de quem está jogando (só ele recebe). */
export interface QuestsEvent {
  quests: QuestDef[];
  progress: QuestProgress[];
  /** Nome de cada mundo, pelo id, para mostrar onde é a missão. */
  worldNames: Record<string, string>;
  /** Mundo onde o jogador está agora (para saber se dá para invocar o chefe). */
  worldId: number;
}

export interface QuestClaimMessage {
  id: number;
}

/** Pedido para invocar o chefe de um desafio (precisa do grupo no altar). */
export interface QuestBossMessage {
  id: number;
}

export const QUEST_MAX_AMOUNT = 100_000;
export const QUEST_MAX_PLAYERS = 20;
/** Distância máxima do altar para contar como "no altar". */
export const QUEST_ALTAR_RANGE = 6;
/** Espera entre duas invocações do mesmo chefe. */
export const QUEST_BOSS_COOLDOWN_MS = 10 * 60_000;

export function questProgressOf(list: readonly QuestProgress[], questId: number): QuestProgress {
  return list.find((entry) => entry.questId === questId) ?? { questId, progress: 0, done: false, readyAt: "", times: 0 };
}

/** Missão repetível ainda esperando o tempo passar. */
export function questWaiting(progress: QuestProgress, now = Date.now()): boolean {
  return progress.readyAt !== "" && new Date(progress.readyAt).getTime() > now;
}

// ---------------------------------------------------------------- painel

export interface AdminQuestRow {
  quest: QuestDef;
  /** Quantos personagens já entregaram. */
  finished: number;
  /** Quantos estão com ela em andamento. */
  doing: number;
}

export interface AdminQuestsResponse {
  quests: AdminQuestRow[];
}

export interface AdminQuestRequest extends Partial<Omit<QuestDef, "id">> {
  id: number;
  remove?: boolean;
}

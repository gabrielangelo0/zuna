// Progressão: a taxa de XP do servidor e os baús de marco, que chegam ao alcançar certos níveis.
// Tudo vem do banco e é editado no painel.

export interface LevelReward {
  id: number;
  /** Nível que entrega o baú. */
  level: number;
  /** Nome mostrado ao jogador ("Herói de Zuna"). */
  name: string;
  rewardGold: number;
  rewardDiamonds: number;
  /** Id do equipamento dado junto (vazio = nenhum). */
  rewardItem: string;
  rewardItemCount: number;
  enabled: boolean;
}

export interface ProgressSettings {
  /** Multiplica toda a XP ganha no jogo (1 = normal). */
  xpRate: number;
}

export const DEFAULT_PROGRESS_SETTINGS: ProgressSettings = { xpRate: 1 };

export const LEVEL_REWARD_MAX_LEVEL = 9999;
export const XP_RATE_MAX = 20;

/** Lista de marcos e os que este personagem já recebeu (só ele recebe). */
export interface MilestonesEvent {
  rewards: LevelReward[];
  /** Níveis já entregues a este personagem. */
  taken: number[];
  level: number;
}

/** Marcos ligados, do menor nível para o maior. */
export function milestoneList(rewards: readonly LevelReward[]): LevelReward[] {
  return rewards.filter((reward) => reward.enabled).sort((a, b) => a.level - b.level || a.id - b.id);
}

/** O próximo baú acima do nível atual (para mostrar o que vem pela frente). */
export function nextMilestone(rewards: readonly LevelReward[], level: number): LevelReward | undefined {
  return milestoneList(rewards).find((reward) => reward.level > level);
}

// ---------------------------------------------------------------- painel

export interface AdminProgressResponse {
  rewards: LevelReward[];
  settings: ProgressSettings;
  /** Quantos baús já foram entregues no total. */
  given: number;
}

export interface AdminProgressRequest extends Partial<Omit<LevelReward, "id">> {
  id: number;
  remove?: boolean;
}

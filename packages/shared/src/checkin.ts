// Check-in diário: a cada dia o jogador abre o presente do dia e leva o prêmio.
// Os dias são um ciclo montado no painel; ao terminar, volta para o primeiro.
// A contagem é por conta (os diamantes são da conta), não por personagem.

export interface CheckinDay {
  id: number;
  /** Posição no ciclo: 1 é o primeiro dia. */
  day: number;
  rewardGold: number;
  rewardDiamonds: number;
  rewardXp: number;
  /** Id do equipamento dado junto (vazio = nenhum). */
  rewardItem: string;
  rewardItemCount: number;
  /** Dia de destaque: aparece maior, para o prêmio bom do fim do ciclo. */
  highlight: boolean;
  enabled: boolean;
}

export interface CheckinSettings {
  /** Desligado: o botão some do jogo. */
  enabled: boolean;
  /** Faltou um dia: volta para o primeiro dia do ciclo. */
  resetOnMiss: boolean;
  /** Fuso do "dia" em horas (-3 = o dia vira à meia-noite de Brasília). */
  offsetHours: number;
}

export const DEFAULT_CHECKIN_SETTINGS: CheckinSettings = { enabled: true, resetOnMiss: true, offsetHours: -3 };

/** Onde a conta está no ciclo agora. */
export interface CheckinState {
  /** Dia que ele pega agora (ou que acabou de pegar). */
  day: number;
  /** Já pegou o presente de hoje. */
  claimedToday: boolean;
  /** Dias seguidos até agora. */
  streak: number;
  /** Total de presentes já abertos. */
  total: number;
  /** Quando o próximo presente libera (ISO). */
  nextAt: string;
}

/** Lista do ciclo e a situação de quem está jogando (só ele recebe). */
export interface CheckinEvent {
  days: CheckinDay[];
  state: CheckinState;
  enabled: boolean;
}

export interface CheckinClaimMessage {
  /** Sem campos: o servidor é quem sabe qual é o dia. */
  ok?: boolean;
}

export const CHECKIN_MAX_DAYS = 31;
export const CHECKIN_MAX_OFFSET = 14;

/** Chave do dia ("2026-09-22") no fuso escolhido: é o que marca se já pegou hoje. */
export function checkinDayKey(at: number, offsetHours: number): string {
  return new Date(at + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** Meia-noite seguinte no fuso escolhido, em milissegundos. */
export function checkinNextTurn(at: number, offsetHours: number): number {
  const shifted = at + offsetHours * 3_600_000;
  const startOfDay = Math.floor(shifted / 86_400_000) * 86_400_000;
  return startOfDay + 86_400_000 - offsetHours * 3_600_000;
}

/** Dia anterior ao da chave (para saber se a sequência continua). */
export function checkinPreviousKey(key: string): string {
  return new Date(new Date(`${key}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** Dias ligados, na ordem do ciclo. */
export function checkinCycle(days: readonly CheckinDay[]): CheckinDay[] {
  return days.filter((day) => day.enabled).sort((a, b) => a.day - b.day || a.id - b.id);
}

/** O prêmio da vez: o ciclo dá a volta quando passa do último dia. */
export function checkinDayAt(days: readonly CheckinDay[], position: number): CheckinDay | undefined {
  const cycle = checkinCycle(days);
  if (cycle.length === 0) return undefined;
  const index = (Math.max(1, position) - 1) % cycle.length;
  return cycle[index];
}

/** Resumo curto do prêmio, para o cartão do dia e para o painel. */
export function describeCheckin(day: CheckinDay, itemName?: string): string[] {
  const parts: string[] = [];
  if (day.rewardGold > 0) parts.push(`🪙 ${day.rewardGold.toLocaleString("pt-BR")}`);
  if (day.rewardDiamonds > 0) parts.push(`💎 ${day.rewardDiamonds.toLocaleString("pt-BR")}`);
  if (day.rewardXp > 0) parts.push(`${Math.round(day.rewardXp).toLocaleString("pt-BR")} XP`);
  if (day.rewardItem) parts.push(day.rewardItemCount > 1 ? `${day.rewardItemCount}× ${itemName ?? day.rewardItem}` : (itemName ?? day.rewardItem));
  return parts;
}

// ---------------------------------------------------------------- painel

export interface AdminCheckinResponse {
  days: CheckinDay[];
  settings: CheckinSettings;
  /** Quantas contas pegaram o presente hoje. */
  today: number;
  /** Quantas contas estão com alguma sequência em andamento. */
  active: number;
}

export interface AdminCheckinRequest extends Partial<Omit<CheckinDay, "id">> {
  id: number;
  remove?: boolean;
}

// Ponte entre o painel de administração (API) e as salas do jogo rodando no mesmo processo:
// o que o administrador muda no banco vale na hora para quem está online.

export interface LiveRoom {
  /** Personagens deste servidor que estão online agora. */
  onlineCharacters(): number[];
  /** Aplica no personagem online o que acabou de mudar no banco. */
  applyCharacter(characterId: number, patch: LiveCharacterPatch): void;
  /** Atualiza os diamantes e os itens da conta de quem está online. */
  applyAccount(accountId: number, patch: LiveAccountPatch): void;
  /** Tira do jogo todo mundo de uma conta (bloqueio). */
  kickAccount(accountId: number, reason: string): void;
}

export interface LiveCharacterPatch {
  level?: number;
  xp?: number;
  gold?: number;
  kills?: number;
  outfit?: string;
}

export interface LiveAccountPatch {
  diamonds?: number;
  unlock?: string;
}

const rooms = new Set<LiveRoom>();

export function registerLiveRoom(room: LiveRoom) {
  rooms.add(room);
}

export function unregisterLiveRoom(room: LiveRoom) {
  rooms.delete(room);
}

export function onlineCharacterIds(): Set<number> {
  const ids = new Set<number>();
  for (const room of rooms) for (const id of room.onlineCharacters()) ids.add(id);
  return ids;
}

export function applyLiveCharacter(characterId: number, patch: LiveCharacterPatch) {
  for (const room of rooms) room.applyCharacter(characterId, patch);
}

export function applyLiveAccount(accountId: number, patch: LiveAccountPatch) {
  for (const room of rooms) room.applyAccount(accountId, patch);
}

export function kickAccount(accountId: number, reason: string) {
  for (const room of rooms) room.kickAccount(accountId, reason);
}

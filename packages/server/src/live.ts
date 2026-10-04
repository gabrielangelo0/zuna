import type { AdminWorld, AdminWorldLive, AdminWorldPlayer, CatalogOverride, MonsterKind } from "@zuna/shared";

// Ponte entre o painel de administração (API) e as salas do jogo rodando no mesmo processo:
// o que o administrador muda no banco vale na hora para quem está online, e os comandos de
// mestre (anúncio, recado, teleporte, expulsão, evento) chegam ao mundo sem passar pelo banco.

export interface LiveRoom {
  /** Personagens deste servidor que estão online agora. */
  onlineCharacters(): number[];
  /** Aplica no personagem online o que acabou de mudar no banco. */
  applyCharacter(characterId: number, patch: LiveCharacterPatch): void;
  /** Atualiza os diamantes e os itens da conta de quem está online. */
  applyAccount(accountId: number, patch: LiveAccountPatch): void;
  /** Tira do jogo todo mundo de uma conta (bloqueio). */
  kickAccount(accountId: number, reason: string): void;
  /** Retrato do mundo desta sala para o painel. */
  liveWorld(): LiveWorldPart;
  /** Mensagem em destaque para todo mundo. */
  announceText(text: string): void;
  /** Comando de mestre num personagem online. Falso quando ele não está nesta sala. */
  commandCharacter(characterId: number, command: LiveCommand): boolean;
  /** Liga ou desliga um evento do mundo. */
  runEvent(event: LiveEvent): LiveEventResult;
  /** O painel salvou um mapa: monta o terreno de novo e avisa quem está jogando. */
  reloadWorld(worldId: number, full?: boolean): Promise<void>;
  /** O painel mexeu nos eventos: relê a lista. */
  reloadEvents(): Promise<void>;
  /** O painel mudou os preços: manda a tabela nova para quem está jogando. */
  sendCatalog(overrides: CatalogOverride[]): void;
  /** Presente do painel para um personagem online. Falso quando ele não está nesta sala. */
  giveItem(characterId: number, itemId: string): boolean;
  /** O painel mexeu nos equipamentos. */
  sendGear(): void;
  /** O painel mexeu nas missões. */
  sendQuestList(): void;
  /** O painel mexeu no presente diário. */
  sendCheckinList(): void;
  /** O painel mexeu nos baús de marco. */
  sendMilestoneList(): void;
  /** O painel mexeu nas classes. */
  sendVocations(): void;
  /** O painel mexeu nas regras do PvP: quem está jogando precisa saber na hora. */
  sendPvpRules(): void;
  /** O painel mexeu nos degraus ou passes do VIP. */
  sendVipList(): void;
}

export interface LiveCharacterPatch {
  level?: number;
  xp?: number;
  gold?: number;
  kills?: number;
  outfit?: string;
  name?: string;
  pet?: string;
  mount?: string;
  x?: number;
  y?: number;
}

export interface LiveAccountPatch {
  diamonds?: number;
  unlock?: string;
  revoke?: string;
  /** Aviso para o jogador no lugar do "Um administrador atualizou sua conta". */
  notice?: string;
}

export type LiveCommand =
  | { kind: "whisper"; text: string }
  | { kind: "kick"; text: string }
  | { kind: "teleport"; x: number; y: number; worldId?: number }
  | { kind: "heal" }
  | { kind: "summon"; monster: MonsterKind; count: number }
  | { kind: "mute"; minutes: number };

/** Chave de um evento do painel, ou "stop" para encerrar o que estiver rodando. */
export type LiveEvent = string;

export type LiveEventResult = "ok" | "busy" | "none";

/** O que uma sala sabe do mundo; o painel junta as salas todas. */
export type LiveWorldPart = Omit<AdminWorld, "rooms" | "uptimeMs">;

const rooms = new Set<LiveRoom>();
const startedAt = Date.now();

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

/** Junta o retrato de todas as salas num só. */
export function liveWorld(): AdminWorld {
  const players: AdminWorldPlayer[] = [];
  const worlds = new Map<number, AdminWorldLive>();
  let monsters = 0;
  let event = "";
  let eventEndsAt = 0;
  let xpMultiplier = 1;
  for (const room of rooms) {
    const part = room.liveWorld();
    players.push(...part.players);
    monsters += part.monsters;
    for (const world of part.worlds) {
      const found = worlds.get(world.worldId);
      if (!found) worlds.set(world.worldId, { ...world });
      else {
        found.players += world.players;
        found.monsters += world.monsters;
        found.loot += world.loot;
      }
    }
    if (part.event) {
      event = part.event;
      eventEndsAt = part.eventEndsAt;
    }
    xpMultiplier = Math.max(xpMultiplier, part.xpMultiplier);
  }
  players.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "pt-BR"));
  return {
    players,
    monsters,
    worlds: [...worlds.values()],
    event,
    eventEndsAt,
    xpMultiplier,
    rooms: rooms.size,
    uptimeMs: Date.now() - startedAt,
  };
}

/**
 * Avisa todas as salas que um mundo mudou no painel. Só pintar o terreno não precisa
 * repor monstros e tesouros: `full` faz isso quando os ninhos e os dados do mundo mudam.
 */
export async function reloadLiveWorld(worldId: number, full = true) {
  await Promise.all([...rooms].map((room) => room.reloadWorld(worldId, full)));
}

export async function reloadLiveEvents() {
  await Promise.all([...rooms].map((room) => room.reloadEvents()));
}

/** Preço novo chega na hora à loja de quem está jogando. */
export function pushCatalog(overrides: CatalogOverride[]) {
  for (const room of rooms) room.sendCatalog(overrides);
}

export function announceToWorld(text: string): number {
  for (const room of rooms) room.announceText(text);
  return rooms.size;
}

/** Manda o comando para a sala onde o personagem está. */
export function commandCharacter(characterId: number, command: LiveCommand): boolean {
  for (const room of rooms) if (room.commandCharacter(characterId, command)) return true;
  return false;
}

export function runWorldEvent(event: LiveEvent): LiveEventResult {
  let result: LiveEventResult = "none";
  for (const room of rooms) {
    const answer = room.runEvent(event);
    if (answer === "ok") result = "ok";
    else if (answer === "busy" && result !== "ok") result = "busy";
  }
  return result;
}

/** Entrega o item a quem está online. Falso = offline (o painel grava direto no banco). */
export function giveLiveItem(characterId: number, itemId: string): boolean {
  for (const room of rooms) if (room.giveItem(characterId, itemId)) return true;
  return false;
}

export function pushGear() {
  for (const room of rooms) room.sendGear();
}

export function pushQuests() {
  for (const room of rooms) room.sendQuestList();
}

export function pushCheckin() {
  for (const room of rooms) room.sendCheckinList();
}

export function pushMilestones() {
  for (const room of rooms) room.sendMilestoneList();
}

export function pushVocations() {
  for (const room of rooms) room.sendVocations();
}

export function pushPvp() {
  for (const room of rooms) room.sendPvpRules();
}

export function pushVip() {
  for (const room of rooms) room.sendVipList();
}

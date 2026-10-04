import type { OwnedItem } from "./items.ts";

// Regras de quem pode bater em quem, e do que se perde ao morrer para outro jogador.
//
// Tudo aqui é função pura: é o que permite testar a regra sem subir servidor, e o combate
// pergunta de três lugares diferentes (mira, auto-ataque e magia de área) sem cada um inventar
// a sua versão.

/** Item do personagem com a marca de vínculo que o banco guarda. */
export type BoundItem = OwnedItem & { bound?: boolean };

/** Amuleto que se consome na morte em PvP e salva a mochila inteira. */
export const PROTECTION_ITEM = "amuleto-protecao";

export interface PvpSettings {
  /** Desliga o PvP no servidor inteiro, sem precisar editar mundo por mundo. */
  enabled: boolean;
  /** Abaixo disto ninguém ataca e ninguém é atacado. */
  minLevel: number;
  /** Nenhum dos dois pode estar tantas vezes acima do outro. */
  levelRatio: number;
  /** Quanto tempo a marca de agressor dura. */
  markMinutes: number;
  /** Janela para revidar sem ganhar marca. */
  retaliationMinutes: number;
  /** Casas da mochila que caem ao morrer (o marcado perde uma a mais). */
  dropSlots: number;
}

export const DEFAULT_PVP_SETTINGS: PvpSettings = {
  enabled: true,
  minLevel: 30,
  levelRatio: 1.5,
  markMinutes: 15,
  retaliationMinutes: 10,
  dropSlots: 1,
};

/** Limites que o painel respeita. */
export const PVP_MAX_LEVEL = 10_000;
export const PVP_MAX_RATIO = 10;
export const PVP_MAX_MINUTES = 240;
export const PVP_MAX_DROP_SLOTS = 10;

/** O que `canAttack` precisa saber de cada lado. Nem `Combatant` nem `PlayerSim`: só isto. */
export interface Fighter {
  level: number;
  /** Instante em que a marca de agressor vence (0 = sem marca). */
  markedUntil: number;
  /** Está na zona protegida da praça agora. */
  inSafe: boolean;
  /** Quando o outro lado atacou este jogador por último (0 = nunca). */
  attackedAt: number;
}

export function isMarked(fighter: Fighter, agora: number): boolean {
  return fighter.markedUntil > agora;
}

/**
 * Pode `a` atacar `b`? Devolve null quando sim, ou o motivo em português quando não.
 *
 * Quem chama confere antes que o mundo é de PvP: esta função não conhece mundo.
 */
export function canAttack(a: Fighter, b: Fighter, settings: PvpSettings, agora: number): string | null {
  if (a === b) return "Você não pode atacar a si mesmo.";
  if (!settings.enabled) return "O combate entre jogadores está desligado.";
  if (a.inSafe || b.inSafe) return "Ninguém ataca nem apanha dentro da zona segura.";
  if (a.level < settings.minLevel) return `Você precisa do nível ${settings.minLevel} para atacar outro jogador.`;
  if (b.level < settings.minLevel) return `Jogadores abaixo do nível ${settings.minLevel} não podem ser atacados.`;
  // A marca tira a proteção de faixa de quem a tem: é a punição que importa, porque abre o
  // agressor para todo mundo em vez de só avisar que ele agrediu.
  if (isMarked(b, agora)) return null;
  const maior = Math.max(a.level, b.level);
  const menor = Math.min(a.level, b.level);
  if (menor <= 0 || maior / menor > settings.levelRatio) {
    return "Esse jogador está fora da sua faixa de nível.";
  }
  return null;
}

/**
 * Atacar deixa marca, menos quando é revide ou quando o outro já está marcado. Sem a janela de
 * revide, quem apanha teria que escolher entre não reagir e virar agressor ele mesmo.
 *
 * Precisa dos dois lados: `alvo` diz se ele já está marcado, e `atacante.attackedAt` diz se o
 * alvo bateu nele há pouco — que é o que torna o golpe um revide.
 */
export function marksAttacker(atacante: Fighter, alvo: Fighter, settings: PvpSettings, agora: number): boolean {
  if (isMarked(alvo, agora)) return false;
  const revide = atacante.attackedAt;
  return revide <= 0 || agora - revide > settings.retaliationMinutes * 60_000;
}

/** O amuleto só vale equipado: na mochila ele é mercadoria, não proteção. */
export function hasProtection(items: readonly BoundItem[]): boolean {
  return items.some((item) => item.itemId === PROTECTION_ITEM && item.equipped === "amulet");
}

/**
 * O que cai da mochila ao morrer para outro jogador.
 *
 * O sorteio é sobre as casas **ocupadas e elegíveis**, não sobre a grade inteira: sortear casa
 * vazia faria `dropSlots: 1` quase nunca derrubar nada numa mochila folgada, e o sistema
 * pareceria quebrado. Equipamento vestido não cai, e item comprado com diamante nunca cai —
 * é o que impede a queda de item de virar pedido de estorno.
 */
export function droppableItems(items: readonly BoundItem[], slots: number, marcado: boolean): BoundItem[] {
  if (hasProtection(items)) return [];
  const elegiveis = items.filter((item) => item.equipped === "" && item.bound !== true);
  const quantos = Math.max(0, Math.round(slots)) + (marcado ? 1 : 0);
  if (quantos <= 0 || elegiveis.length === 0) return [];
  if (elegiveis.length <= quantos) return [...elegiveis];
  // Sorteio sem repetição, embaralhando uma cópia.
  const baralho = [...elegiveis];
  for (let i = baralho.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
  }
  return baralho.slice(0, quantos);
}

export function clampPvpSettings(change: Partial<PvpSettings>, atual: PvpSettings): PvpSettings {
  const num = (value: unknown, padrao: number, min: number, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  return {
    enabled: typeof change.enabled === "boolean" ? change.enabled : atual.enabled,
    minLevel: Math.round(num(change.minLevel ?? atual.minLevel, atual.minLevel, 1, PVP_MAX_LEVEL)),
    levelRatio: num(change.levelRatio ?? atual.levelRatio, atual.levelRatio, 1, PVP_MAX_RATIO),
    markMinutes: Math.round(num(change.markMinutes ?? atual.markMinutes, atual.markMinutes, 0, PVP_MAX_MINUTES)),
    retaliationMinutes: Math.round(
      num(change.retaliationMinutes ?? atual.retaliationMinutes, atual.retaliationMinutes, 0, PVP_MAX_MINUTES),
    ),
    dropSlots: Math.round(num(change.dropSlots ?? atual.dropSlots, atual.dropSlots, 0, PVP_MAX_DROP_SLOTS)),
  };
}

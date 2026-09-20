import type { MonsterKind } from "./monsters.ts";

// Eventos do mundo montados no painel: texto, duração, bônus e ondas de monstros.
// O servidor guarda cada um no banco e sabe rodá-los sem nenhum código novo.

export const EVENT_MAX_WAVES = 6;
export const EVENT_MAX_MINUTES = 180;
export const EVENT_MAX_MULTIPLIER = 10;
export const EVENT_MAX_COUNT = 40;
export const EVENT_NAME_MAX = 32;
export const EVENT_TEXT_MAX = 160;

/** Uma leva de monstros que nasce em volta do centro do mundo. */
export interface EventWave {
  /** Segundos depois do começo do evento. */
  delay: number;
  monster: MonsterKind;
  count: number;
  /** Distância do centro onde a leva aparece. */
  radius: number;
  /** Anúncio quando a leva chega (vazio = em silêncio). */
  text: string;
}

export interface EventDef {
  id: number;
  slug: string;
  name: string;
  /** Anúncio ao começar. */
  startText: string;
  /** Anúncio ao terminar. */
  endText: string;
  /** Anúncio quando os jogadores derrotam todas as levas. */
  winText: string;
  minutes: number;
  xpMultiplier: number;
  goldMultiplier: number;
  /** 0 = em todos os mundos. */
  worldId: number;
  /** Dispara sozinho a cada tantos minutos (0 = só no comando do painel). */
  autoMinutes: number;
  enabled: boolean;
  /** Termina assim que o último monstro das levas cai. */
  endsWithWaves: boolean;
  waves: EventWave[];
}

/** Um evento novo já nasce assim no painel. */
export function blankEvent(): Omit<EventDef, "id"> {
  return {
    slug: "",
    name: "Evento novo",
    startText: "Algo está para acontecer em Zuna...",
    endText: "O evento terminou.",
    winText: "",
    minutes: 10,
    xpMultiplier: 1,
    goldMultiplier: 1,
    worldId: 0,
    autoMinutes: 0,
    enabled: true,
    endsWithWaves: false,
    waves: [],
  };
}

/** Os dois eventos clássicos, criados no primeiro arranque do servidor. */
export const SEED_EVENTS: readonly Omit<EventDef, "id">[] = [
  {
    slug: "xp-em-dobro",
    name: "XP em Dobro",
    startText: "Evento: XP em Dobro por 10 minutos! Todo monstro dá o dobro de experiência.",
    endText: "O evento XP em Dobro terminou.",
    winText: "",
    minutes: 10,
    xpMultiplier: 2,
    goldMultiplier: 1,
    worldId: 0,
    autoMinutes: 20,
    enabled: true,
    endsWithWaves: false,
    waves: [],
  },
  {
    slug: "invasao-orc",
    name: "Invasão Orc",
    startText: "Tambores de guerra ecoam... Uma horda de orcs se aproxima da cidade!",
    endText: "Os orcs recuaram para as montanhas.",
    winText: "A invasão foi derrotada! A cidade está a salvo.",
    minutes: 8,
    xpMultiplier: 1,
    goldMultiplier: 1,
    worldId: 0,
    autoMinutes: 20,
    enabled: true,
    endsWithWaves: true,
    waves: [
      { delay: 8, monster: "orc", count: 10, radius: 9, text: "Os orcs cercam a cidade! Saia e lute!" },
      { delay: 45, monster: "orcLeader", count: 1, radius: 9, text: "O Senhor Esqueleto chegou! Derrote-o para salvar a cidade." },
      { delay: 45, monster: "orc", count: 6, radius: 11, text: "" },
    ],
  },
];

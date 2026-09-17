/** Duração de um tick da simulação (e do envio de estado). 25 ms permite velocidades de montaria bem distintas. */
export const TICK_MS = 25;

export const SERVER_PORT = 2567;
export const ROOM_NAME = "world";

export const MAP_SEED = 20260915;
export const MAP_W = 96;
export const MAP_H = 96;

/** Tamanho do losango isométrico, em pixels. */
export const TILE_W = 64;
export const TILE_H = 32;

/** Templo: onde o jogador nasce e renasce. */
export const TEMPLE_X = 48;
export const TEMPLE_Y = 48;
/** Raio (Chebyshev) da zona protegida da cidade: monstros não entram. */
export const TOWN_RADIUS = 6;

/** Tempo de um passo reto do jogador; diagonais custam DIAGONAL_COST vezes mais. */
export const PLAYER_STEP_MS = 250;
export const DIAGONAL_COST = 1.41;
export const PLAYER_ATTACK_MS = 1400;
/** Distância em que um monstro desiste de perseguir. */
export const CHASE_LOSE_RANGE = 12;

/** Fração do XP total perdida ao morrer. Nunca desce de nível. */
export const DEATH_XP_LOSS = 0.1;
export const CORPSE_MS = 10_000;

/** Personagens por conta. A VIP poderá liberar mais. */
export const MAX_CHARACTERS = 2;
export const NAME_MIN_LEN = 3;
export const NAME_MAX_LEN = 16;
export const CHAT_MAX_LEN = 180;

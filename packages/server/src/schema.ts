import { schema, t, type SchemaType } from "@colyseus/schema";

// Precisa bater com PlayerData / MonsterData em @zuna/shared.

export const PlayerState = schema(
  {
    name: t.string(),
    world: t.string(),
    x: t.int16(),
    y: t.int16(),
    dir: t.uint8(),
    stepMs: t.uint16(),
    hp: t.int32(),
    maxHp: t.int32(),
    mana: t.int32(),
    maxMana: t.int32(),
    level: t.uint32(),
    xp: t.float64(),
    gold: t.float64(),
    target: t.string(),
    skin: t.uint8(),
    hairColor: t.uint8(),
    outfit: t.string(),
    primary: t.uint8(),
    secondary: t.uint8(),
    detail: t.uint8(),
    pet: t.string(),
    mount: t.string(),
    mounted: t.boolean(),
    /** Aparência do que está vestido (ícones em VISIBLE_SLOTS, separados por vírgula). */
    looks: t.string(),
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const MonsterState = schema(
  {
    kind: t.string(),
    world: t.string(),
    x: t.int16(),
    y: t.int16(),
    dir: t.uint8(),
    stepMs: t.uint16(),
    hp: t.int32(),
    maxHp: t.int32(),
  },
  "Monster",
);
export type MonsterState = SchemaType<typeof MonsterState>;

export const LootState = schema(
  {
    kind: t.string(),
    world: t.string(),
    x: t.int16(),
    y: t.int16(),
    gold: t.uint32(),
    diamonds: t.uint16(),
    item: t.string(),
    count: t.uint16(),
    owner: t.string(),
    freeAt: t.float64(),
    expiresAt: t.float64(),
  },
  "Loot",
);
export type LootState = SchemaType<typeof LootState>;

// Jogadores, monstros e drops vão só para quem está perto: cada cliente tem a sua StateView
// e o servidor decide, a cada VIEW_SYNC_MS, o que cabe na janela dele. `online` fica de fora do
// filtro porque a HUD mostra o total do mundo, não o que dá para ver da tela.
export const WorldState = schema(
  {
    players: t.map(PlayerState).view(),
    monsters: t.map(MonsterState).view(),
    loot: t.map(LootState).view(),
    eventName: t.string(),
    eventEndsAt: t.float64(),
    xpMultiplier: t.float32(),
    online: t.uint16(),
  },
  "World",
);
export type WorldState = SchemaType<typeof WorldState>;

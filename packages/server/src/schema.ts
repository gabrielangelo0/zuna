import { schema, t, type SchemaType } from "@colyseus/schema";

// Precisa bater com PlayerData / MonsterData em @game/shared.

export const PlayerState = schema(
  {
    name: t.string(),
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
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const MonsterState = schema(
  {
    kind: t.string(),
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

export const WorldState = schema(
  {
    players: t.map(PlayerState),
    monsters: t.map(MonsterState),
    eventName: t.string(),
    eventEndsAt: t.float64(),
    xpMultiplier: t.float32(),
  },
  "World",
);
export type WorldState = SchemaType<typeof WorldState>;

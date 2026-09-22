import { and, count, eq, or, sql } from "drizzle-orm";
import {
  MAP_H,
  MAP_SEED,
  MAP_W,
  SEED_EVENTS,
  TEMPLE_X,
  TEMPLE_Y,
  TOWN_RADIUS,
  slugify,
  type CatalogOverride,
  type Currency,
  type EventDef,
  type EventWave,
  type GroundItemDef,
  type LootKind,
  type MapStyle,
  type MonsterKind,
  type PortalDef,
  type SpawnDef,
  type WorldBlueprint,
  type WorldDef,
  type WorldsResponse,
  gearList,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import {
  characters,
  gameEvents,
  itemOverrides,
  portals,
  purchases,
  unlocks,
  worldItems,
  worldSpawns,
  worldTiles,
  worlds,
} from "./db/schema.ts";

// Tudo o que o painel cria fica aqui: mundos, o que foi pintado no mapa, portais,
// ninhos, tesouros, eventos e os preços da loja.

type WorldRow = typeof worlds.$inferSelect;

const DEFAULT_SLUG = "zuna";

function worldFromRow(row: WorldRow): WorldDef {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    style: row.style as MapStyle,
    seed: row.seed,
    width: row.width,
    height: row.height,
    spawnX: row.spawnX,
    spawnY: row.spawnY,
    townRadius: row.townRadius,
    published: row.published,
    autoSpawns: row.autoSpawns,
    isDefault: row.isDefault,
  };
}

/** Primeiro arranque: cria o mundo original e os eventos clássicos. */
export async function ensureWorldSeed() {
  const [existing] = await db().select({ id: worlds.id }).from(worlds).limit(1);
  if (!existing) {
    await db().insert(worlds).values({
      slug: DEFAULT_SLUG,
      name: "Zuna",
      style: "campina",
      seed: MAP_SEED,
      width: MAP_W,
      height: MAP_H,
      spawnX: TEMPLE_X,
      spawnY: TEMPLE_Y,
      townRadius: TOWN_RADIUS,
      published: true,
      autoSpawns: true,
      isDefault: true,
    });
  }

  const [anyEvent] = await db().select({ id: gameEvents.id }).from(gameEvents).limit(1);
  if (!anyEvent) {
    await db()
      .insert(gameEvents)
      .values(SEED_EVENTS.map((event) => ({ ...event, waves: JSON.stringify(event.waves) })))
      .onConflictDoNothing();
  }
}

// ---------------------------------------------------------------- leitura

export async function listWorlds(): Promise<WorldDef[]> {
  const rows = await db().select().from(worlds).orderBy(worlds.id);
  return rows.map(worldFromRow);
}

export async function getWorld(worldId: number): Promise<WorldDef | undefined> {
  const [row] = await db().select().from(worlds).where(eq(worlds.id, worldId)).limit(1);
  return row ? worldFromRow(row) : undefined;
}

/** Tiles pintados de um mundo, em trincas [índice, chão, objeto]. */
export async function loadTiles(world: WorldDef): Promise<number[]> {
  const rows = await db().select().from(worldTiles).where(eq(worldTiles.worldId, world.id));
  const flat: number[] = [];
  for (const row of rows) {
    if (row.x >= world.width || row.y >= world.height) continue;
    flat.push(row.y * world.width + row.x, row.ground, row.object);
  }
  return flat;
}

export async function loadPortals(worldId: number): Promise<PortalDef[]> {
  const rows = await db().select().from(portals).where(eq(portals.worldId, worldId)).orderBy(portals.id);
  return rows.map((row) => ({
    id: row.id,
    worldId: row.worldId,
    x: row.x,
    y: row.y,
    toWorldId: row.toWorldId,
    toX: row.toX,
    toY: row.toY,
    name: row.name,
    minLevel: row.minLevel,
  }));
}

export async function loadSpawns(worldId: number): Promise<SpawnDef[]> {
  const rows = await db().select().from(worldSpawns).where(eq(worldSpawns.worldId, worldId)).orderBy(worldSpawns.id);
  return rows.map((row) => ({
    id: row.id,
    worldId: row.worldId,
    x: row.x,
    y: row.y,
    monster: row.monster as MonsterKind,
    amount: row.amount,
    radius: row.radius,
    respawnMs: row.respawnMs,
  }));
}

export async function loadItems(worldId: number): Promise<GroundItemDef[]> {
  const rows = await db().select().from(worldItems).where(eq(worldItems.worldId, worldId)).orderBy(worldItems.id);
  return rows.map((row) => ({
    id: row.id,
    worldId: row.worldId,
    x: row.x,
    y: row.y,
    loot: row.loot as LootKind,
    gold: row.gold,
    diamonds: row.diamonds,
    respawnMs: row.respawnMs,
  }));
}

export interface WorldContent {
  world: WorldDef;
  tiles: number[];
  portals: PortalDef[];
  spawns: SpawnDef[];
  items: GroundItemDef[];
}

export async function loadWorldContent(world: WorldDef): Promise<WorldContent> {
  const [tiles, portalList, spawns, items] = await Promise.all([
    loadTiles(world),
    loadPortals(world.id),
    loadSpawns(world.id),
    loadItems(world.id),
  ]);
  return { world, tiles, portals: portalList, spawns, items };
}

/** Tudo o que o servidor precisa para levantar os mundos. */
export async function loadAllWorlds(): Promise<WorldContent[]> {
  const list = await listWorlds();
  return Promise.all(list.map((world) => loadWorldContent(world)));
}

export function blueprintOf(content: WorldContent): WorldBlueprint {
  return { world: content.world, tiles: content.tiles, portals: content.portals };
}

// ---------------------------------------------------------------- escrita

export interface WorldWrite {
  name: string;
  style: MapStyle;
  seed: number;
  width: number;
  height: number;
  spawnX: number;
  spawnY: number;
  townRadius: number;
  published: boolean;
  autoSpawns: boolean;
}

/** Chave livre a partir do nome ("Ilha", "ilha-2", "ilha-3"...). */
async function freeSlug(name: string): Promise<string> {
  const base = slugify(name) || "mundo";
  const rows = await db().select({ slug: worlds.slug }).from(worlds);
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function createWorld(write: WorldWrite): Promise<WorldDef> {
  const slug = await freeSlug(write.name);
  const [row] = await db()
    .insert(worlds)
    .values({ ...write, slug, isDefault: false })
    .returning();
  return worldFromRow(row);
}

export async function updateWorld(worldId: number, patch: Partial<WorldWrite>): Promise<WorldDef | undefined> {
  const [row] = await db()
    .update(worlds)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(worlds.id, worldId))
    .returning();
  return row ? worldFromRow(row) : undefined;
}

/** Só um mundo é o padrão: marcar um desmarca os outros. */
export async function setDefaultWorld(worldId: number) {
  await db().update(worlds).set({ isDefault: false }).where(sql`${worlds.id} <> ${worldId}`);
  await db().update(worlds).set({ isDefault: true, published: true }).where(eq(worlds.id, worldId));
}

/** Apaga o mundo e tudo o que estava nele. Quem morava lá volta para o mundo padrão. */
export async function deleteWorld(worldId: number) {
  await db().delete(worldTiles).where(eq(worldTiles.worldId, worldId));
  await db().delete(portals).where(eq(portals.worldId, worldId));
  await db().delete(worldSpawns).where(eq(worldSpawns.worldId, worldId));
  await db().delete(worldItems).where(eq(worldItems.worldId, worldId));
  await db().delete(portals).where(eq(portals.toWorldId, worldId));
  await db().update(characters).set({ worldId: 0 }).where(eq(characters.worldId, worldId));
  await db().delete(worlds).where(eq(worlds.id, worldId));
}

/** Copia terreno, portais internos, ninhos e tesouros para um mundo novo. */
export async function duplicateWorld(source: WorldDef, name: string): Promise<WorldDef> {
  const copy = await createWorld({
    name,
    style: source.style,
    seed: source.seed,
    width: source.width,
    height: source.height,
    spawnX: source.spawnX,
    spawnY: source.spawnY,
    townRadius: source.townRadius,
    published: false,
    autoSpawns: source.autoSpawns,
  });

  const content = await loadWorldContent(source);
  const tileRows = await db().select().from(worldTiles).where(eq(worldTiles.worldId, source.id));
  for (let i = 0; i < tileRows.length; i += 500) {
    await db()
      .insert(worldTiles)
      .values(tileRows.slice(i, i + 500).map((row) => ({ ...row, worldId: copy.id })));
  }
  // Portais que apontavam para o próprio mundo passam a apontar para a cópia.
  for (const portal of content.portals) {
    await db().insert(portals).values({
      worldId: copy.id,
      x: portal.x,
      y: portal.y,
      toWorldId: portal.toWorldId === source.id ? copy.id : portal.toWorldId,
      toX: portal.toX,
      toY: portal.toY,
      name: portal.name,
      minLevel: portal.minLevel,
    });
  }
  for (const spawn of content.spawns) {
    await db().insert(worldSpawns).values({
      worldId: copy.id,
      x: spawn.x,
      y: spawn.y,
      monster: spawn.monster,
      amount: spawn.amount,
      radius: spawn.radius,
      respawnMs: spawn.respawnMs,
    });
  }
  for (const item of content.items) {
    await db().insert(worldItems).values({
      worldId: copy.id,
      x: item.x,
      y: item.y,
      loot: item.loot,
      gold: item.gold,
      diamonds: item.diamonds,
      respawnMs: item.respawnMs,
    });
  }
  return copy;
}

export interface TileWrite {
  x: number;
  y: number;
  ground: number;
  object: number;
  reset?: boolean;
}

/** Grava o que o pincel pintou. `reset` devolve o tile ao terreno gerado. */
export async function saveTiles(worldId: number, edits: TileWrite[]) {
  const remove = edits.filter((edit) => edit.reset);
  const write = edits.filter((edit) => !edit.reset);

  for (let i = 0; i < remove.length; i += 200) {
    const batch = remove.slice(i, i + 200);
    await db()
      .delete(worldTiles)
      .where(
        and(
          eq(worldTiles.worldId, worldId),
          or(...batch.map((edit) => and(eq(worldTiles.x, edit.x), eq(worldTiles.y, edit.y)))),
        ),
      );
  }

  for (let i = 0; i < write.length; i += 200) {
    const batch = write.slice(i, i + 200);
    await db()
      .insert(worldTiles)
      .values(batch.map((edit) => ({ worldId, x: edit.x, y: edit.y, ground: edit.ground, object: edit.object })))
      .onConflictDoUpdate({
        target: [worldTiles.worldId, worldTiles.x, worldTiles.y],
        set: { ground: sql`excluded.ground`, object: sql`excluded.object` },
      });
  }
}

/** Devolve o mundo inteiro ao terreno gerado. */
export async function clearTiles(worldId: number): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(worldTiles)
    .where(eq(worldTiles.worldId, worldId));
  await db().delete(worldTiles).where(eq(worldTiles.worldId, worldId));
  return row?.total ?? 0;
}

export async function savePortal(portal: Omit<PortalDef, "id"> & { id?: number }): Promise<PortalDef> {
  const values = {
    worldId: portal.worldId,
    x: portal.x,
    y: portal.y,
    toWorldId: portal.toWorldId,
    toX: portal.toX,
    toY: portal.toY,
    name: portal.name,
    minLevel: portal.minLevel,
  };
  if (portal.id) {
    const [row] = await db().update(portals).set(values).where(eq(portals.id, portal.id)).returning();
    if (row) return { ...values, id: row.id };
  }
  const [row] = await db().insert(portals).values(values).returning();
  return { ...values, id: row.id };
}

export async function deletePortal(id: number) {
  await db().delete(portals).where(eq(portals.id, id));
}

export async function saveSpawn(spawn: Omit<SpawnDef, "id"> & { id?: number }): Promise<SpawnDef> {
  const values = {
    worldId: spawn.worldId,
    x: spawn.x,
    y: spawn.y,
    monster: spawn.monster,
    amount: spawn.amount,
    radius: spawn.radius,
    respawnMs: spawn.respawnMs,
  };
  if (spawn.id) {
    const [row] = await db().update(worldSpawns).set(values).where(eq(worldSpawns.id, spawn.id)).returning();
    if (row) return { ...spawn, id: row.id };
  }
  const [row] = await db().insert(worldSpawns).values(values).returning();
  return { ...spawn, id: row.id };
}

export async function deleteSpawn(id: number) {
  await db().delete(worldSpawns).where(eq(worldSpawns.id, id));
}

export async function saveGroundItem(item: Omit<GroundItemDef, "id"> & { id?: number }): Promise<GroundItemDef> {
  const values = {
    worldId: item.worldId,
    x: item.x,
    y: item.y,
    loot: item.loot,
    gold: item.gold,
    diamonds: item.diamonds,
    respawnMs: item.respawnMs,
  };
  if (item.id) {
    const [row] = await db().update(worldItems).set(values).where(eq(worldItems.id, item.id)).returning();
    if (row) return { ...item, id: row.id };
  }
  const [row] = await db().insert(worldItems).values(values).returning();
  return { ...item, id: row.id };
}

export async function deleteGroundItem(id: number) {
  await db().delete(worldItems).where(eq(worldItems.id, id));
}

/** Quantos tiles pintados, portais, ninhos e tesouros cada mundo tem. */
export async function worldCounts(): Promise<Map<number, { painted: number; portals: number; spawns: number; items: number; characters: number }>> {
  const blank = () => ({ painted: 0, portals: 0, spawns: 0, items: 0, characters: 0 });
  const totals = new Map<number, ReturnType<typeof blank>>();
  const bump = (id: number, field: keyof ReturnType<typeof blank>, value: number) => {
    const entry = totals.get(id) ?? blank();
    entry[field] = value;
    totals.set(id, entry);
  };

  const [painted, portalRows, spawnRows, itemRows, characterRows] = await Promise.all([
    db().select({ worldId: worldTiles.worldId, total: count() }).from(worldTiles).groupBy(worldTiles.worldId),
    db().select({ worldId: portals.worldId, total: count() }).from(portals).groupBy(portals.worldId),
    db().select({ worldId: worldSpawns.worldId, total: count() }).from(worldSpawns).groupBy(worldSpawns.worldId),
    db().select({ worldId: worldItems.worldId, total: count() }).from(worldItems).groupBy(worldItems.worldId),
    db().select({ worldId: characters.worldId, total: count() }).from(characters).groupBy(characters.worldId),
  ]);
  for (const row of painted) bump(row.worldId, "painted", row.total);
  for (const row of portalRows) bump(row.worldId, "portals", row.total);
  for (const row of spawnRows) bump(row.worldId, "spawns", row.total);
  for (const row of itemRows) bump(row.worldId, "items", row.total);
  for (const row of characterRows) bump(row.worldId, "characters", row.total);
  return totals;
}

// ---------------------------------------------------------------- eventos

function eventFromRow(row: typeof gameEvents.$inferSelect): EventDef {
  let waves: EventWave[] = [];
  try {
    const parsed: unknown = JSON.parse(row.waves);
    if (Array.isArray(parsed)) waves = parsed as EventWave[];
  } catch {
    waves = [];
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    startText: row.startText,
    endText: row.endText,
    winText: row.winText,
    minutes: row.minutes,
    xpMultiplier: row.xpMultiplier,
    goldMultiplier: row.goldMultiplier,
    worldId: row.worldId,
    autoMinutes: row.autoMinutes,
    enabled: row.enabled,
    endsWithWaves: row.endsWithWaves,
    waves,
  };
}

export async function listEvents(): Promise<EventDef[]> {
  const rows = await db().select().from(gameEvents).orderBy(gameEvents.id);
  return rows.map(eventFromRow);
}

export async function saveEvent(event: Omit<EventDef, "id" | "slug"> & { id?: number; slug?: string }): Promise<EventDef> {
  const values = {
    name: event.name,
    startText: event.startText,
    endText: event.endText,
    winText: event.winText,
    minutes: event.minutes,
    xpMultiplier: event.xpMultiplier,
    goldMultiplier: event.goldMultiplier,
    worldId: event.worldId,
    autoMinutes: event.autoMinutes,
    enabled: event.enabled,
    endsWithWaves: event.endsWithWaves,
    waves: JSON.stringify(event.waves),
    updatedAt: new Date(),
  };

  if (event.id) {
    const [row] = await db().update(gameEvents).set(values).where(eq(gameEvents.id, event.id)).returning();
    if (row) return eventFromRow(row);
  }

  const rows = await db().select({ slug: gameEvents.slug }).from(gameEvents);
  const taken = new Set(rows.map((row) => row.slug));
  let slug = slugify(event.name) || "evento";
  for (let n = 2; taken.has(slug); n++) slug = `${slugify(event.name) || "evento"}-${n}`;
  const [row] = await db()
    .insert(gameEvents)
    .values({ ...values, slug })
    .returning();
  return eventFromRow(row);
}

export async function deleteEvent(id: number) {
  await db().delete(gameEvents).where(eq(gameEvents.id, id));
}

// ---------------------------------------------------------------- loja

export async function listItemOverrides(): Promise<CatalogOverride[]> {
  const rows = await db().select().from(itemOverrides);
  return rows.map((row) => ({
    id: row.itemId,
    name: row.name || undefined,
    description: row.description || undefined,
    price: row.price ?? undefined,
    currency: (row.currency as Currency | null) ?? undefined,
    enabled: row.enabled,
  }));
}

export async function saveItemOverride(change: CatalogOverride) {
  const values = {
    itemId: change.id,
    name: change.name ?? "",
    description: change.description ?? "",
    price: change.price ?? null,
    currency: change.currency ?? null,
    enabled: change.enabled ?? true,
    updatedAt: new Date(),
  };
  await db()
    .insert(itemOverrides)
    .values(values)
    .onConflictDoUpdate({ target: itemOverrides.itemId, set: values });
}

export async function resetItemOverride(itemId: string) {
  await db().delete(itemOverrides).where(eq(itemOverrides.itemId, itemId));
}

export interface ItemStats {
  sold: number;
  revenue: number;
  owners: number;
}

/** Quanto cada item já vendeu e quantas contas o têm: a aba Loja mostra isso. */
export async function itemStats(): Promise<Map<string, ItemStats>> {
  const totals = new Map<string, ItemStats>();
  const entry = (id: string) => {
    const found = totals.get(id) ?? { sold: 0, revenue: 0, owners: 0 };
    totals.set(id, found);
    return found;
  };

  const [buys, owned] = await Promise.all([
    db()
      .select({
        itemId: purchases.itemId,
        total: count(),
        revenue: sql<number>`coalesce(sum(${purchases.price}), 0)::int`,
      })
      .from(purchases)
      .groupBy(purchases.itemId),
    db().select({ itemId: unlocks.itemId, total: count() }).from(unlocks).groupBy(unlocks.itemId),
  ]);

  for (const row of buys) {
    const item = entry(row.itemId);
    item.sold = row.total;
    item.revenue = Number(row.revenue);
  }
  for (const row of owned) entry(row.itemId).owners = row.total;
  return totals;
}

/**
 * Mundos abertos e preços em vigor, do jeito que o cliente pede antes de entrar.
 * O painel derruba este cache sempre que salva alguma coisa.
 */
let worldsCache: WorldsResponse | null = null;

export function clearWorldsCache() {
  worldsCache = null;
}

export async function publicWorlds(): Promise<WorldsResponse> {
  if (!worldsCache) {
    const contents = await loadAllWorlds();
    worldsCache = {
      worlds: contents.filter((content) => content.world.published).map(blueprintOf),
      catalog: await listItemOverrides(),
      gear: gearList(),
    };
  }
  return worldsCache;
}

import { createEndpoint } from "colyseus";
import {
  ADMIN_MAX_LEVEL,
  ADMIN_MAX_PRICE,
  EVENT_MAX_MINUTES,
  EVENT_MAX_MULTIPLIER,
  EVENT_MAX_COUNT,
  EVENT_MAX_WAVES,
  EVENT_NAME_MAX,
  EVENT_TEXT_MAX,
  LOOT,
  MAP_STYLES,
  MAX_GROUND,
  MAX_OBJECT,
  MONSTERS,
  PORTAL_KINDS,
  PORTAL_NAME_MAX,
  SPAWN_MAX_AMOUNT,
  SPAWN_MAX_RADIUS,
  WORLD_MAX_ITEMS,
  WORLD_MAX_PORTALS,
  WORLD_MAX_SIZE,
  WORLD_MAX_SPAWNS,
  WORLD_MIN_SIZE,
  WORLD_NAME_MAX,
  applyCatalogOverrides,
  CATALOG,
  catalogItem,
  catalogList,
  buildWorldMap,
  clampDepth,
  isWalkable,
  returnKind,
  validateWorldName,
  type PortalKind,
  type AdminEventsResponse,
  type AdminItemRow,
  type AdminItemsResponse,
  type AdminMapResponse,
  type AdminWorldRow,
  type AdminWorldsResponse,
  type Currency,
  type EventWave,
  type GroundItemDef,
  type LootKind,
  type MapStyle,
  type MonsterKind,
  type PortalDef,
  type SpawnDef,
  type WorldDef,
} from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, clamp, readBody, text } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import { liveWorld, pushCatalog, reloadLiveEvents, reloadLiveWorld } from "./live.ts";
import {
  clearTiles,
  clearWorldsCache,
  createWorld,
  deleteEvent,
  deleteGroundItem,
  deletePortal,
  deleteSpawn,
  deleteWorld,
  duplicateWorld,
  getWorld,
  itemStats,
  listEvents,
  listItemOverrides,
  listWorlds,
  loadPortals,
  loadTiles,
  loadWorldContent,
  resetItemOverride,
  saveEvent,
  saveGroundItem,
  saveItemOverride,
  savePortal,
  saveSpawn,
  saveTiles,
  setDefaultWorld,
  updateWorld,
  worldCounts,
  type TileWrite,
  type WorldWrite,
} from "./worldRepository.ts";

// Criação e edição de mundos, mapas, portais, ninhos, tesouros, eventos e preços da loja.
// Toda rota exige uma conta de administrador, como o resto do painel.

/**
 * Depois de salvar: o cliente precisa do desenho novo e a sala precisa recarregar o mundo.
 * `full` só quando algo além do terreno mudou (ninhos, tesouros, dados do mundo).
 */
async function publishWorld(worldId: number, full = true) {
  clearWorldsCache();
  await reloadLiveWorld(worldId, full);
}

function requireWorld(world: WorldDef | undefined): WorldDef {
  if (!world) throw new Error("Mundo não encontrado.");
  return world;
}

/** Ponto dentro do mundo, ou undefined. */
function pointIn(world: WorldDef, x: unknown, y: unknown): { x: number; y: number } | undefined {
  const px = clamp(x, 0, world.width - 1);
  const py = clamp(y, 0, world.height - 1);
  return px === undefined || py === undefined ? undefined : { x: px, y: py };
}

// ---------------------------------------------------------------- lista de mundos

const adminWorlds = createEndpoint("/api/admin/worlds", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });

  const [list, counts] = await Promise.all([listWorlds(), worldCounts()]);
  const live = liveWorld();
  const worlds: AdminWorldRow[] = list.map((world) => {
    const totals = counts.get(world.id);
    return {
      world,
      painted: totals?.painted ?? 0,
      portals: totals?.portals ?? 0,
      spawns: totals?.spawns ?? 0,
      items: totals?.items ?? 0,
      characters: (totals?.characters ?? 0) + (world.isDefault ? (counts.get(0)?.characters ?? 0) : 0),
      online: live.worlds.find((entry) => entry.worldId === world.id)?.players ?? 0,
    };
  });
  return ctx.json({ worlds } satisfies AdminWorldsResponse);
});

const adminMap = createEndpoint("/api/admin/map", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const worldId = clamp(ctx.query?.worldId, 1, 2_000_000_000);
  const world = worldId === undefined ? undefined : await getWorld(worldId);
  if (!world) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });

  const content = await loadWorldContent(world);
  const response: AdminMapResponse = {
    world: content.world,
    tiles: content.tiles,
    portals: content.portals,
    spawns: content.spawns,
    items: content.items,
  };
  return ctx.json(response);
});

// ---------------------------------------------------------------- criar e mudar mundos

const adminWorldSave = createEndpoint("/api/admin/world/save", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const worldId = clamp(body.worldId ?? 0, 0, 2_000_000_000) ?? 0;
  const existing = worldId ? await getWorld(worldId) : undefined;
  if (worldId && !existing) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });

  const patch: Partial<WorldWrite> = {};
  if (body.name !== undefined) {
    const name = text(body.name, WORLD_NAME_MAX);
    const problem = validateWorldName(name);
    if (problem) throw ctx.error("BAD_REQUEST", { message: problem });
    patch.name = name;
  }
  if (body.style !== undefined) {
    const style = String(body.style) as MapStyle;
    if (!MAP_STYLES.some((entry) => entry.id === style)) throw ctx.error("BAD_REQUEST", { message: "Terreno desconhecido." });
    patch.style = style;
  }
  if (body.seed !== undefined) patch.seed = clamp(body.seed, 0, 2_000_000_000);
  if (body.width !== undefined) patch.width = clamp(body.width, WORLD_MIN_SIZE, WORLD_MAX_SIZE);
  if (body.height !== undefined) patch.height = clamp(body.height, WORLD_MIN_SIZE, WORLD_MAX_SIZE);
  if (body.townRadius !== undefined) patch.townRadius = clamp(body.townRadius, 1, 24);
  if (body.published !== undefined) patch.published = body.published === true;
  if (body.autoSpawns !== undefined) patch.autoSpawns = body.autoSpawns === true;
  if (body.depth !== undefined) patch.depth = clampDepth(body.depth);

  // O centro precisa caber no tamanho novo.
  const width = patch.width ?? existing?.width ?? WORLD_MIN_SIZE;
  const height = patch.height ?? existing?.height ?? WORLD_MIN_SIZE;
  if (body.spawnX !== undefined) patch.spawnX = clamp(body.spawnX, 0, width - 1);
  if (body.spawnY !== undefined) patch.spawnY = clamp(body.spawnY, 0, height - 1);

  let world: WorldDef;
  if (existing) {
    // Mudou de tamanho: o centro não pode ficar para fora.
    patch.spawnX = Math.min(patch.spawnX ?? existing.spawnX, width - 1);
    patch.spawnY = Math.min(patch.spawnY ?? existing.spawnY, height - 1);
    if (existing.isDefault && patch.published === false) {
      throw ctx.error("BAD_REQUEST", { message: "O mundo principal não pode ser fechado." });
    }
    world = requireWorld(await updateWorld(existing.id, patch));
  } else {
    if (!patch.name) throw ctx.error("BAD_REQUEST", { message: "Dê um nome ao mundo." });
    world = await createWorld({
      name: patch.name,
      style: patch.style ?? "campina",
      seed: patch.seed ?? Math.floor(Math.random() * 1_000_000_000),
      width,
      height,
      spawnX: patch.spawnX ?? Math.floor(width / 2),
      spawnY: patch.spawnY ?? Math.floor(height / 2),
      townRadius: patch.townRadius ?? 6,
      published: patch.published ?? true,
      autoSpawns: patch.autoSpawns ?? false,
      depth: patch.depth ?? 0,
    });
  }

  if (body.isDefault === true && !world.isDefault) {
    await setDefaultWorld(world.id);
    world = requireWorld(await getWorld(world.id));
  }

  await logAdminAction({ accountId: admin.id, action: existing ? "mundo" : "criou mundo", detail: { ...patch, worldId: world.id } });
  await publishWorld(world.id);
  return ctx.json({ ok: true, world });
});

const adminWorldDelete = createEndpoint("/api/admin/world/delete", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const worldId = clamp(readBody(ctx.body).worldId, 1, 2_000_000_000);
  const world = worldId === undefined ? undefined : await getWorld(worldId);
  if (!world) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });
  if (world.isDefault) throw ctx.error("BAD_REQUEST", { message: "O mundo principal não pode ser apagado." });

  await deleteWorld(world.id);
  await logAdminAction({ accountId: admin.id, action: "apagou mundo", detail: { worldId: world.id, name: world.name } });
  await publishWorld(world.id);
  return ctx.json({ ok: true, name: world.name });
});

const adminWorldDuplicate = createEndpoint("/api/admin/world/duplicate", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const worldId = clamp(body.worldId, 1, 2_000_000_000);
  const source = worldId === undefined ? undefined : await getWorld(worldId);
  if (!source) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });

  const name = text(body.name, WORLD_NAME_MAX) || `${source.name} (cópia)`.slice(0, WORLD_NAME_MAX);
  const copy = await duplicateWorld(source, name);
  await logAdminAction({ accountId: admin.id, action: "copiou mundo", detail: { from: source.name, worldId: copy.id } });
  await publishWorld(copy.id);
  return ctx.json({ ok: true, world: copy });
});

// ---------------------------------------------------------------- pincel do mapa

const adminTiles = createEndpoint("/api/admin/world/tiles", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const worldId = clamp(body.worldId, 1, 2_000_000_000);
  const world = worldId === undefined ? undefined : await getWorld(worldId);
  if (!world) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });

  if (body.clear === true) {
    const removed = await clearTiles(world.id);
    await logAdminAction({ accountId: admin.id, action: "limpou o mapa", detail: { worldId: world.id, tiles: removed } });
    await publishWorld(world.id, false);
    return ctx.json({ ok: true, saved: 0, cleared: removed });
  }

  const raw = Array.isArray(body.tiles) ? (body.tiles as Record<string, unknown>[]) : [];
  if (raw.length === 0) throw ctx.error("BAD_REQUEST", { message: "Nada para salvar." });
  if (raw.length > 6000) throw ctx.error("BAD_REQUEST", { message: "Muitos tiles de uma vez." });

  const edits: TileWrite[] = [];
  for (const entry of raw) {
    const at = pointIn(world, entry.x, entry.y);
    if (!at) continue;
    if (entry.reset === true) {
      edits.push({ ...at, ground: 0, object: 0, reset: true });
      continue;
    }
    const ground = clamp(entry.ground, 0, MAX_GROUND);
    const object = clamp(entry.object, 0, MAX_OBJECT);
    if (ground === undefined || object === undefined) continue;
    edits.push({ ...at, ground, object });
  }
  if (edits.length === 0) throw ctx.error("BAD_REQUEST", { message: "Nenhum tile válido." });

  await saveTiles(world.id, edits);
  await logAdminAction({ accountId: admin.id, action: "pintou o mapa", detail: { worldId: world.id, tiles: edits.length } });
  await publishWorld(world.id, false);
  return ctx.json({ ok: true, saved: edits.length });
});

// ---------------------------------------------------------------- portais, ninhos e tesouros

const adminPortal = createEndpoint("/api/admin/world/portal", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const worldId = clamp(body.worldId, 1, 2_000_000_000);
  const world = worldId === undefined ? undefined : await getWorld(worldId);
  if (!world) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });
  const id = clamp(body.id ?? 0, 0, 2_000_000_000) ?? 0;

  if (body.remove === true) {
    if (!id) throw ctx.error("BAD_REQUEST", { message: "Portal inválido." });
    await deletePortal(id);
    await logAdminAction({ accountId: admin.id, action: "apagou portal", detail: { worldId: world.id, id } });
    await publishWorld(world.id, false);
    return ctx.json({ ok: true });
  }

  const content = await loadWorldContent(world);
  if (!id && content.portals.length >= WORLD_MAX_PORTALS) {
    throw ctx.error("BAD_REQUEST", { message: `Este mundo já tem ${WORLD_MAX_PORTALS} portais.` });
  }

  const at = pointIn(world, body.x, body.y);
  if (!at) throw ctx.error("BAD_REQUEST", { message: "Lugar inválido." });
  const targetId = clamp(body.toWorldId, 1, 2_000_000_000);
  const target = targetId === undefined ? undefined : await getWorld(targetId);
  if (!target) throw ctx.error("BAD_REQUEST", { message: "Escolha o mundo de destino." });
  const to = pointIn(target, body.toX, body.toY);
  if (!to) throw ctx.error("BAD_REQUEST", { message: "Destino fora do mapa." });

  const portal: Omit<PortalDef, "id"> & { id?: number } = {
    id: id || undefined,
    worldId: world.id,
    x: at.x,
    y: at.y,
    toWorldId: target.id,
    toX: to.x,
    toY: to.y,
    name: text(body.name, PORTAL_NAME_MAX),
    minLevel: clamp(body.minLevel ?? 0, 0, ADMIN_MAX_LEVEL) ?? 0,
    kind: PORTAL_KINDS.includes(body.kind as PortalKind) ? (body.kind as PortalKind) : "portal",
  };
  const saved = await savePortal(portal);

  // Escada de volta. Só ao criar: num portal que já existe, mexer no par seria adivinhar qual
  // dos dois lados o administrador quis mudar.
  let returned: PortalDef | undefined;
  let warning = "";
  if (!id && body.withReturn === true) {
    const lá = await loadPortals(target.id);
    const destino = buildWorldMap({ world: target, tiles: await loadTiles(target), portals: [] });
    if (!isWalkable(destino, saved.toX, saved.toY)) {
      // O travel usa findFreeTile e o jogador não ficaria preso, mas a escada de volta nasceria
      // longe de onde ele caiu, e isso se lê como defeito. Melhor recusar os dois.
      await deletePortal(saved.id);
      throw ctx.error("BAD_REQUEST", {
        message: "O destino não é caminhável, então a escada de volta nasceria fora do lugar. Escolha outro ponto de chegada.",
      });
    }
    if (lá.some((entry: PortalDef) => entry.x === saved.toX && entry.y === saved.toY)) {
      warning = "Já existe uma ligação nesse ponto do destino, então a volta não foi criada.";
    } else if (lá.length >= WORLD_MAX_PORTALS) {
      warning = `${target.name} já tem ${WORLD_MAX_PORTALS} ligações, então a volta não foi criada.`;
    } else {
      returned = await savePortal({
        worldId: target.id,
        x: saved.toX,
        y: saved.toY,
        toWorldId: world.id,
        toX: saved.x,
        toY: saved.y,
        name: `Volta para ${world.name}`,
        // Nunca cobra nível. Ida com nível 50 e volta com nível 50 tranca quem entrou de 50 e
        // morreu para 49 lá dentro.
        minLevel: 0,
        kind: returnKind(saved.kind),
      });
      await publishWorld(target.id, false);
    }
  }

  // Aviso, não recusa: o administrador monta o andar em duas sessões — cria a descida hoje, a
  // subida amanhã. Recusar travaria o trabalho dele; calar deixaria um andar sem volta no ar.
  if (!returned && !warning && saved.toWorldId !== world.id) {
    const saídas = await loadPortals(target.id);
    if (saídas.length === 0) warning = `${target.name} não tem nenhuma saída: quem entrar fica preso lá.`;
  }

  await logAdminAction({ accountId: admin.id, action: id ? "portal" : "criou portal", detail: { ...saved, returned: returned?.id } });
  await publishWorld(world.id, false);
  return ctx.json({ ok: true, portal: saved, returned, warning });
});

const adminSpawn = createEndpoint("/api/admin/world/spawn", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const worldId = clamp(body.worldId, 1, 2_000_000_000);
  const world = worldId === undefined ? undefined : await getWorld(worldId);
  if (!world) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });
  const id = clamp(body.id ?? 0, 0, 2_000_000_000) ?? 0;

  if (body.remove === true) {
    if (!id) throw ctx.error("BAD_REQUEST", { message: "Ninho inválido." });
    await deleteSpawn(id);
    await logAdminAction({ accountId: admin.id, action: "apagou ninho", detail: { worldId: world.id, id } });
    await publishWorld(world.id);
    return ctx.json({ ok: true });
  }

  const content = await loadWorldContent(world);
  if (!id && content.spawns.length >= WORLD_MAX_SPAWNS) {
    throw ctx.error("BAD_REQUEST", { message: `Este mundo já tem ${WORLD_MAX_SPAWNS} ninhos.` });
  }

  const at = pointIn(world, body.x, body.y);
  if (!at) throw ctx.error("BAD_REQUEST", { message: "Lugar inválido." });
  const monster = String(body.monster ?? "") as MonsterKind;
  if (!(monster in MONSTERS)) throw ctx.error("BAD_REQUEST", { message: "Monstro desconhecido." });

  const spawn: Omit<SpawnDef, "id"> & { id?: number } = {
    id: id || undefined,
    worldId: world.id,
    x: at.x,
    y: at.y,
    monster,
    amount: clamp(body.amount ?? 1, 1, SPAWN_MAX_AMOUNT) ?? 1,
    radius: clamp(body.radius ?? 3, 0, SPAWN_MAX_RADIUS) ?? 3,
    respawnMs: clamp(body.respawnMs ?? 0, 0, 3_600_000) ?? 0,
  };
  const saved = await saveSpawn(spawn);
  await logAdminAction({ accountId: admin.id, action: id ? "ninho" : "criou ninho", detail: saved });
  await publishWorld(world.id);
  return ctx.json({ ok: true, spawn: saved });
});

const adminGroundItem = createEndpoint("/api/admin/world/item", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const worldId = clamp(body.worldId, 1, 2_000_000_000);
  const world = worldId === undefined ? undefined : await getWorld(worldId);
  if (!world) throw ctx.error("BAD_REQUEST", { message: "Mundo não encontrado." });
  const id = clamp(body.id ?? 0, 0, 2_000_000_000) ?? 0;

  if (body.remove === true) {
    if (!id) throw ctx.error("BAD_REQUEST", { message: "Tesouro inválido." });
    await deleteGroundItem(id);
    await logAdminAction({ accountId: admin.id, action: "apagou tesouro", detail: { worldId: world.id, id } });
    await publishWorld(world.id);
    return ctx.json({ ok: true });
  }

  const content = await loadWorldContent(world);
  if (!id && content.items.length >= WORLD_MAX_ITEMS) {
    throw ctx.error("BAD_REQUEST", { message: `Este mundo já tem ${WORLD_MAX_ITEMS} tesouros.` });
  }

  const at = pointIn(world, body.x, body.y);
  if (!at) throw ctx.error("BAD_REQUEST", { message: "Lugar inválido." });
  const loot = String(body.loot ?? "") as LootKind;
  if (!(loot in LOOT)) throw ctx.error("BAD_REQUEST", { message: "Tipo de tesouro desconhecido." });

  const item: Omit<GroundItemDef, "id"> & { id?: number } = {
    id: id || undefined,
    worldId: world.id,
    x: at.x,
    y: at.y,
    loot,
    gold: clamp(body.gold ?? 0, 0, 10_000_000) ?? 0,
    diamonds: clamp(body.diamonds ?? 0, 0, 10_000) ?? 0,
    respawnMs: clamp(body.respawnMs ?? 300_000, 10_000, 86_400_000) ?? 300_000,
  };
  const saved = await saveGroundItem(item);
  await logAdminAction({ accountId: admin.id, action: id ? "tesouro" : "criou tesouro", detail: saved });
  await publishWorld(world.id);
  return ctx.json({ ok: true, item: saved });
});

// ---------------------------------------------------------------- eventos

const adminEvents = createEndpoint("/api/admin/events", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const world = liveWorld();
  const response: AdminEventsResponse = {
    events: await listEvents(),
    running: world.event,
    runningEndsAt: world.eventEndsAt,
  };
  return ctx.json(response);
});

const adminEventSave = createEndpoint("/api/admin/event", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = clamp(body.id ?? 0, 0, 2_000_000_000) ?? 0;

  if (body.remove === true) {
    if (!id) throw ctx.error("BAD_REQUEST", { message: "Evento inválido." });
    await deleteEvent(id);
    await logAdminAction({ accountId: admin.id, action: "apagou evento", detail: { id } });
    await reloadLiveEvents();
    return ctx.json({ ok: true });
  }

  const name = text(body.name, EVENT_NAME_MAX);
  if (name.length < 3) throw ctx.error("BAD_REQUEST", { message: "Dê um nome ao evento." });

  const worldId = clamp(body.worldId ?? 0, 0, 2_000_000_000) ?? 0;
  if (worldId && !(await getWorld(worldId))) throw ctx.error("BAD_REQUEST", { message: "Mundo do evento não existe." });

  const rawWaves = Array.isArray(body.waves) ? (body.waves as Record<string, unknown>[]) : [];
  const waves: EventWave[] = [];
  for (const wave of rawWaves.slice(0, EVENT_MAX_WAVES)) {
    const monster = String(wave.monster ?? "") as MonsterKind;
    if (!(monster in MONSTERS)) continue;
    waves.push({
      delay: clamp(wave.delay ?? 0, 0, 3600) ?? 0,
      monster,
      count: clamp(wave.count ?? 1, 1, EVENT_MAX_COUNT) ?? 1,
      radius: clamp(wave.radius ?? 8, 1, 60) ?? 8,
      text: text(wave.text, EVENT_TEXT_MAX),
    });
  }

  const multiplier = (value: unknown, fallback: number) => {
    const number = Number(value ?? fallback);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(EVENT_MAX_MULTIPLIER, Math.max(0.1, Math.round(number * 100) / 100));
  };

  const saved = await saveEvent({
    id: id || undefined,
    name,
    startText: text(body.startText, EVENT_TEXT_MAX),
    endText: text(body.endText, EVENT_TEXT_MAX),
    winText: text(body.winText, EVENT_TEXT_MAX),
    minutes: clamp(body.minutes ?? 10, 1, EVENT_MAX_MINUTES) ?? 10,
    xpMultiplier: multiplier(body.xpMultiplier, 1),
    goldMultiplier: multiplier(body.goldMultiplier, 1),
    worldId,
    autoMinutes: clamp(body.autoMinutes ?? 0, 0, 1440) ?? 0,
    enabled: body.enabled !== false,
    endsWithWaves: body.endsWithWaves === true,
    waves,
  });

  await logAdminAction({ accountId: admin.id, action: id ? "evento salvo" : "criou evento", detail: { id: saved.id, name } });
  await reloadLiveEvents();
  return ctx.json({ ok: true, event: saved });
});

// ---------------------------------------------------------------- loja

const adminItems = createEndpoint("/api/admin/items", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const stats = await itemStats();
  const base = new Map(CATALOG.map((item) => [item.id, item]));
  const items: AdminItemRow[] = catalogList().map((item) => {
    const totals = stats.get(item.id);
    return {
      item,
      base: base.get(item.id) ?? item,
      sold: totals?.sold ?? 0,
      revenue: totals?.revenue ?? 0,
      owners: totals?.owners ?? 0,
    };
  });
  return ctx.json({ items } satisfies AdminItemsResponse);
});

const adminItemSave = createEndpoint("/api/admin/item", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = String(body.id ?? "");
  if (!catalogItem(id)) throw ctx.error("BAD_REQUEST", { message: "Item desconhecido." });

  if (body.reset === true) {
    await resetItemOverride(id);
  } else {
    const currency = String(body.currency ?? "gold") as Currency;
    if (currency !== "gold" && currency !== "diamonds") throw ctx.error("BAD_REQUEST", { message: "Moeda desconhecida." });
    await saveItemOverride({
      id,
      name: text(body.name, 40),
      description: text(body.description, 120),
      price: clamp(body.price ?? 0, 0, ADMIN_MAX_PRICE) ?? 0,
      currency,
      enabled: body.enabled !== false,
    });
  }

  // Preço novo vale na hora: para quem está jogando e para quem abrir a loja depois.
  const overrides = await listItemOverrides();
  applyCatalogOverrides(overrides);
  pushCatalog(overrides);
  clearWorldsCache();
  await logAdminAction({ accountId: admin.id, action: body.reset === true ? "item de fábrica" : "item da loja", detail: { id } });
  return ctx.json({ ok: true, item: catalogItem(id) });
});

export const adminWorldRoutes = {
  adminWorlds,
  adminMap,
  adminWorldSave,
  adminWorldDelete,
  adminWorldDuplicate,
  adminTiles,
  adminPortal,
  adminSpawn,
  adminGroundItem,
  adminEvents,
  adminEventSave,
  adminItems,
  adminItemSave,
};

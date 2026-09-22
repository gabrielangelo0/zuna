import { eq } from "drizzle-orm";
import {
  generateMap,
  inSafeZone,
  isWalkable,
  mulberry32,
  shapeOf,
  type MapStyle,
  type WorldDef,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { serverMeta, worlds } from "./db/schema.ts";
import { createWorld, listWorlds, saveEvent, saveGroundItem, savePortal } from "./worldRepository.ts";

// Conteúdo que vem pronto com o jogo: seis mundos temáticos ligados à praça de Zuna
// e eventos que usam esses mundos. Cada pacote roda uma vez só (marcado em server_meta).
// Depois disso tudo é dado comum, e o painel muda, apaga ou cria o que quiser sem o
// servidor desfazer.

const WORLDS_KEY = "conteudo";
const WORLDS_VERSION = "mundos-v1";
const EVENTS_KEY = "eventos";
const EVENTS_VERSION = "eventos-v1";

interface Realm {
  slug: string;
  name: string;
  style: MapStyle;
  size: number;
  seed: number;
  /** Nível para atravessar o portal da praça. */
  minLevel: number;
  /** Onde fica o portal na praça de Zuna (em volta do templo). */
  hub: { x: number; y: number };
}

const REALMS: readonly Realm[] = [
  { slug: "floresta-sombria", name: "Floresta Sombria", style: "floresta", size: 128, seed: 41021, minLevel: 8, hub: { x: -4, y: -2 } },
  { slug: "pantano-nebuloso", name: "Pântano Nebuloso", style: "pantano", size: 120, seed: 53377, minLevel: 12, hub: { x: -4, y: 2 } },
  { slug: "deserto-escaldante", name: "Deserto Escaldante", style: "deserto", size: 144, seed: 68819, minLevel: 25, hub: { x: 4, y: -2 } },
  { slug: "montanhas-geladas", name: "Montanhas Geladas", style: "neve", size: 136, seed: 72253, minLevel: 35, hub: { x: 4, y: 2 } },
  { slug: "cripta-esquecida", name: "Cripta Esquecida", style: "cripta", size: 120, seed: 81131, minLevel: 45, hub: { x: -2, y: 4 } },
  { slug: "vulcao-rubro", name: "Vulcão Rubro", style: "vulcao", size: 144, seed: 90407, minLevel: 60, hub: { x: 2, y: 4 } },
];

/** Tesouros por mundo: baús escondidos longe da praça, que voltam a cada 10 minutos. */
const CHESTS_PER_REALM = 4;

async function metaValue(key: string): Promise<string> {
  const [row] = await db().select().from(serverMeta).where(eq(serverMeta.key, key)).limit(1);
  return row?.value ?? "";
}

async function markDone(key: string, value: string) {
  await db()
    .insert(serverMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: serverMeta.key, set: { value, updatedAt: new Date() } });
}

/** Tile andável mais perto do ponto pedido (espiral simples). */
function walkableNear(map: ReturnType<typeof generateMap>, x: number, y: number): { x: number; y: number } {
  for (let radius = 0; radius < 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (isWalkable(map, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return { x, y };
}

export async function ensureContent() {
  await ensureRealms();
  await ensureEvents();
}

/** Cria os mundos que ainda não existem, os portais de ida e volta e os baús escondidos. */
async function ensureRealms() {
  if ((await metaValue(WORLDS_KEY)) === WORLDS_VERSION) return;

  const existing = await listWorlds();
  const hub = existing.find((world) => world.isDefault);
  if (!hub) return;
  const hubMap = generateMap(shapeOf(hub));

  for (const realm of REALMS) {
    if (existing.some((world) => world.slug === realm.slug)) continue;
    const center = Math.floor(realm.size / 2);
    const created = await createWorld({
      name: realm.name,
      style: realm.style,
      seed: realm.seed,
      width: realm.size,
      height: realm.size,
      spawnX: center,
      spawnY: center,
      townRadius: 5,
      published: true,
      autoSpawns: true,
    });
    // O nome vira a chave; aqui a chave é fixa, para o conteúdo ser reconhecido depois.
    await db().update(worlds).set({ slug: realm.slug }).where(eq(worlds.id, created.id));
    const world: WorldDef = { ...created, slug: realm.slug };
    const map = generateMap(shapeOf(world));

    // Ida: na praça de Zuna, em volta do templo. Volta: logo abaixo do centro do mundo novo.
    const gate = walkableNear(hubMap, hub.spawnX + realm.hub.x, hub.spawnY + realm.hub.y);
    const arrival = walkableNear(map, center, center - 2);
    const back = walkableNear(map, center, center + 3);
    await savePortal({
      worldId: hub.id,
      x: gate.x,
      y: gate.y,
      toWorldId: world.id,
      toX: arrival.x,
      toY: arrival.y,
      name: realm.name,
      minLevel: realm.minLevel,
    });
    await savePortal({
      worldId: world.id,
      x: back.x,
      y: back.y,
      toWorldId: hub.id,
      toX: hub.spawnX,
      toY: hub.spawnY + 2,
      name: "Volta para Zuna",
      minLevel: 0,
    });

    // Baús nos cantos mais longe da praça, em chão andável.
    const rng = mulberry32(realm.seed + 7);
    let placed = 0;
    for (let attempt = 0; placed < CHESTS_PER_REALM && attempt < 400; attempt++) {
      const x = 4 + Math.floor(rng() * (realm.size - 8));
      const y = 4 + Math.floor(rng() * (realm.size - 8));
      if (!isWalkable(map, x, y) || inSafeZone(world, x, y)) continue;
      if (Math.hypot(x - center, y - center) < realm.size * 0.3) continue;
      await saveGroundItem({
        worldId: world.id,
        x,
        y,
        loot: "chest",
        gold: 200 + realm.minLevel * 40,
        diamonds: realm.minLevel >= 35 ? 2 : 1,
        respawnMs: 600_000,
      });
      placed++;
    }
  }

  await markDone(WORLDS_KEY, WORLDS_VERSION);
  console.log("Conteúdo: mundos temáticos criados.");
}

/** Eventos que aproveitam os mundos novos. */
async function ensureEvents() {
  if ((await metaValue(EVENTS_KEY)) === EVENTS_VERSION) return;
  const crypt = (await listWorlds()).find((world) => world.slug === "cripta-esquecida");

  await saveEvent({
    name: "Caçada Dourada",
    startText: "Caçada Dourada! Por 15 minutos, todo monstro dá 50% mais XP e o dobro de ouro, em todos os mundos.",
    endText: "A Caçada Dourada terminou.",
    winText: "",
    minutes: 15,
    xpMultiplier: 1.5,
    goldMultiplier: 2,
    worldId: 0,
    autoMinutes: 45,
    enabled: true,
    endsWithWaves: false,
    waves: [],
  });

  if (crypt) {
    await saveEvent({
      name: "Noite dos Mortos",
      startText: "Os mortos se levantam na Cripta Esquecida! Quem aguentar as três levas ganha XP em dobro.",
      endText: "Os mortos voltaram para as tumbas.",
      winText: "A Noite dos Mortos acabou: os heróis limparam a Cripta!",
      minutes: 12,
      xpMultiplier: 2,
      goldMultiplier: 1.5,
      worldId: crypt.id,
      autoMinutes: 60,
      enabled: true,
      endsWithWaves: true,
      waves: [
        { delay: 10, monster: "skeleton", count: 14, radius: 10, text: "Esqueletos saem das tumbas em volta da praça!" },
        { delay: 60, monster: "ghostSkull", count: 10, radius: 12, text: "Caveiras assombradas cortam o ar!" },
        { delay: 120, monster: "skeletonMage", count: 8, radius: 12, text: "Os magos esqueletos chegaram. Cuidado!" },
      ],
    });
  }

  await markDone(EVENTS_KEY, EVENTS_VERSION);
  console.log("Conteúdo: eventos novos criados.");
}

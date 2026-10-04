import { eq } from "drizzle-orm";
import {
  chebyshev,
  generateMap,
  inSafeZone,
  isWalkable,
  mulberry32,
  shapeOf,
  type MapStyle,
  type MonsterKind,
  type WorldDef,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { serverMeta, worlds } from "./db/schema.ts";
import { saveQuest } from "./quests.ts";
import { createWorld, listWorlds, loadPortals, saveEvent, saveGroundItem, savePortal } from "./worldRepository.ts";

// Conteúdo que vem pronto com o jogo: seis mundos temáticos ligados à praça de Zuna
// e eventos que usam esses mundos. Cada pacote roda uma vez só (marcado em server_meta).
// Depois disso tudo é dado comum, e o painel muda, apaga ou cria o que quiser sem o
// servidor desfazer.

const WORLDS_KEY = "conteudo";
const WORLDS_VERSION = "mundos-v2";
const EVENTS_KEY = "eventos";
const EVENTS_VERSION = "eventos-v1";
const QUESTS_KEY = "missoes";
const QUESTS_VERSION = "missoes-v1";
const TEMPLE_KEY = "templo";
const TEMPLE_VERSION = "templo-v1";

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
  { slug: "covil-dos-dragoes", name: "Covil dos Dragões", style: "covil", size: 136, seed: 101233, minLevel: 70, hub: { x: -2, y: -4 } },
  { slug: "abismo-demoniaco", name: "Abismo Demoníaco", style: "abismo", size: 136, seed: 113579, minLevel: 85, hub: { x: 2, y: -4 } },
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
  await ensureQuests();
  await movePortalsOffTemple();
}

/** Uma caçada e um desafio de chefe em cada mundo. O painel muda tudo depois. */
interface QuestSeed {
  world: string;
  name: string;
  description: string;
  kind: "kill" | "boss";
  monster: MonsterKind;
  amount?: number;
  minLevel: number;
  players?: number;
  repeatMinutes: number;
  rewardXp: number;
  rewardGold: number;
  rewardItem?: string;
  rewardItemCount?: number;
}

const QUEST_SEEDS: readonly QuestSeed[] = [
  // Caçadas
  { world: "", name: "Pragas de Zuna", description: "Os slimes tomaram conta dos arredores da praça. Limpe 20 deles.", kind: "kill", monster: "rat", amount: 20, minLevel: 1, repeatMinutes: 30, rewardXp: 300, rewardGold: 200, rewardItem: "pocao-vida", rewardItemCount: 5 },
  { world: "", name: "A Alcateia", description: "Os lobos andam atacando quem sai da cidade. Cace 25.", kind: "kill", monster: "wolf", amount: 25, minLevel: 5, repeatMinutes: 45, rewardXp: 1500, rewardGold: 700, rewardItem: "pocao-vida", rewardItemCount: 10 },
  { world: "floresta-sombria", name: "Raposas Sombrias", description: "As raposas da Floresta Sombria estão demais. Cace 30.", kind: "kill", monster: "fox", amount: 30, minLevel: 8, repeatMinutes: 60, rewardXp: 6000, rewardGold: 2000, rewardItem: "pocao-vida", rewardItemCount: 15 },
  { world: "pantano-nebuloso", name: "Sapos do Brejo", description: "Os sapos gigantes tomaram o brejo. Cace 30.", kind: "kill", monster: "frog", amount: 30, minLevel: 12, repeatMinutes: 60, rewardXp: 14000, rewardGold: 3500, rewardItem: "flechas", rewardItemCount: 50 },
  { world: "deserto-escaldante", name: "Ninho de Raptores", description: "Os raptores atacam as caravanas. Cace 30.", kind: "kill", monster: "raptor", amount: 30, minLevel: 25, repeatMinutes: 60, rewardXp: 45000, rewardGold: 9000, rewardItem: "pocao-vida-forte", rewardItemCount: 15 },
  { world: "montanhas-geladas", name: "Espíritos do Gelo", description: "Espíritos rondam as montanhas. Disperse 30 deles.", kind: "kill", monster: "iceSpirit", amount: 30, minLevel: 35, repeatMinutes: 60, rewardXp: 120000, rewardGold: 18000, rewardItem: "pocao-mana-forte", rewardItemCount: 15 },
  { world: "cripta-esquecida", name: "Limpeza da Cripta", description: "Os esqueletos não descansam. Derrube 40.", kind: "kill", monster: "skeleton", amount: 40, minLevel: 45, repeatMinutes: 60, rewardXp: 300000, rewardGold: 35000, rewardItem: "pocao-vida-suprema", rewardItemCount: 10 },
  { world: "vulcao-rubro", name: "Praga de Diabretes", description: "Os diabretes saem das fendas de lava. Cace 30.", kind: "kill", monster: "imp", amount: 30, minLevel: 60, repeatMinutes: 60, rewardXp: 700000, rewardGold: 70000, rewardItem: "pocao-vida-suprema", rewardItemCount: 15 },
  { world: "covil-dos-dragoes", name: "Caçada aos Dragões", description: "Os dragões vermelhos guardam o covil. Derrube 25.", kind: "kill", monster: "dragonRed", amount: 25, minLevel: 70, repeatMinutes: 90, rewardXp: 1600000, rewardGold: 140000, rewardItem: "flechas-igneas", rewardItemCount: 50 },
  { world: "abismo-demoniaco", name: "Expurgo do Abismo", description: "Os demônios infernais avançam. Derrube 25.", kind: "kill", monster: "hellfire", amount: 25, minLevel: 85, repeatMinutes: 90, rewardXp: 4000000, rewardGold: 260000, rewardItem: "pocao-vida-suprema", rewardItemCount: 25 },
  // Desafios de chefe (precisam de gente no altar)
  { world: "", name: "Desafio: Senhor Esqueleto", description: "Dois heróis no altar invocam o Senhor Esqueleto.", kind: "boss", monster: "orcLeader", minLevel: 10, players: 2, repeatMinutes: 60, rewardXp: 4000, rewardGold: 2500, rewardItem: "escudo-carmesim" },
  { world: "floresta-sombria", name: "Desafio: Rei Cogumelo", description: "Dois heróis acordam o Rei Cogumelo.", kind: "boss", monster: "mushroomKing", minLevel: 15, players: 2, repeatMinutes: 60, rewardXp: 20000, rewardGold: 6000, rewardItem: "varinha-ignea" },
  { world: "pantano-nebuloso", name: "Desafio: Sapo Rei", description: "Dois heróis chamam o Sapo Rei do fundo do brejo.", kind: "boss", monster: "frogKing", minLevel: 20, players: 2, repeatMinutes: 60, rewardXp: 45000, rewardGold: 12000, rewardItem: "escudo-carmesim" },
  { world: "deserto-escaldante", name: "Desafio: Raptor Alfa", description: "Três heróis atraem o Raptor Alfa para o altar.", kind: "boss", monster: "raptorAlpha", minLevel: 30, players: 3, repeatMinutes: 60, rewardXp: 150000, rewardGold: 30000, rewardItem: "adaga-sombria" },
  { world: "montanhas-geladas", name: "Desafio: Yeti Ancião", description: "Três heróis despertam o Yeti Ancião.", kind: "boss", monster: "yetiElder", minLevel: 40, players: 3, repeatMinutes: 60, rewardXp: 400000, rewardGold: 60000, rewardItem: "espada-glacial" },
  { world: "cripta-esquecida", name: "Desafio: Lorde Necromante", description: "Três heróis quebram o selo do Lorde Necromante.", kind: "boss", monster: "necroLord", minLevel: 50, players: 3, repeatMinutes: 60, rewardXp: 900000, rewardGold: 120000, rewardItem: "cajado-necromante" },
  { world: "vulcao-rubro", name: "Desafio: Dragão Ancião", description: "Quatro heróis acordam o Dragão Ancião.", kind: "boss", monster: "dragon", minLevel: 65, players: 4, repeatMinutes: 90, rewardXp: 2500000, rewardGold: 300000, rewardItem: "machado-abismo" },
  { world: "covil-dos-dragoes", name: "Desafio: Senhor dos Dragões", description: "Quatro heróis chamam o dono do covil.", kind: "boss", monster: "dragonLord", minLevel: 75, players: 4, repeatMinutes: 90, rewardXp: 6000000, rewardGold: 500000, rewardItem: "lamina-rei" },
  { world: "abismo-demoniaco", name: "Desafio: Arquidemônio", description: "Cinco heróis abrem o portal do Arquidemônio.", kind: "boss", monster: "archdemon", minLevel: 90, players: 5, repeatMinutes: 120, rewardXp: 15000000, rewardGold: 1200000, rewardItem: "armadura-abismo" },
];

async function ensureQuests() {
  if ((await metaValue(QUESTS_KEY)) === QUESTS_VERSION) return;
  const worlds = await listWorlds();
  const hub = worlds.find((world) => world.isDefault);
  if (!hub) return;

  for (const seed of QUEST_SEEDS) {
    const world = seed.world ? worlds.find((entry) => entry.slug === seed.world) : hub;
    if (!world) continue;
    // O altar do desafio fica alguns passos ao norte da praça, em chão andável.
    const map = generateMap(shapeOf(world));
    const altar = seed.kind === "boss" ? walkableNear(map, world.spawnX, world.spawnY - (world.townRadius + 4)) : { x: 0, y: 0 };
    await saveQuest({
      id: 0,
      name: seed.name,
      description: seed.description,
      kind: seed.kind,
      monster: seed.monster,
      amount: seed.amount ?? 1,
      worldId: world.id,
      minLevel: seed.minLevel,
      players: seed.players ?? 1,
      x: altar.x,
      y: altar.y,
      bossScale: 1,
      repeatMinutes: seed.repeatMinutes,
      rewardXp: seed.rewardXp,
      rewardGold: seed.rewardGold,
      rewardItem: seed.rewardItem ?? "",
      rewardItemCount: seed.rewardItemCount ?? 1,
      enabled: true,
      sort: seed.kind === "boss" ? 50 + seed.minLevel : seed.minLevel,
    });
  }

  await markDone(QUESTS_KEY, QUESTS_VERSION);
  console.log("Conteúdo: missões criadas.");
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
    const back = walkableNear(map, center, center + 5);
    await savePortal({
      worldId: hub.id,
      x: gate.x,
      y: gate.y,
      toWorldId: world.id,
      toX: arrival.x,
      toY: arrival.y,
      name: realm.name,
      minLevel: realm.minLevel,
      kind: "portal",
    });
    await savePortal({
      worldId: world.id,
      x: back.x,
      y: back.y,
      toWorldId: hub.id,
      toX: hub.spawnX,
      toY: hub.spawnY + 2,
      name: "Volta para Zuna",
      kind: "portal",
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

/**
 * O templo ocupa três casas em volta do centro. Os portais de volta dos mundos antigos
 * foram plantados a três casas do centro e ficavam em cima dele: aqui saem para fora.
 */
async function movePortalsOffTemple() {
  if ((await metaValue(TEMPLE_KEY)) === TEMPLE_VERSION) return;
  for (const world of await listWorlds()) {
    const map = generateMap(shapeOf(world));
    for (const portal of await loadPortals(world.id)) {
      if (chebyshev(portal.x, portal.y, world.spawnX, world.spawnY) > 3) continue;
      const spot = walkableNear(map, world.spawnX, world.spawnY + 5);
      await savePortal({ ...portal, x: spot.x, y: spot.y });
    }
  }
  await markDone(TEMPLE_KEY, TEMPLE_VERSION);
  console.log("Conteúdo: portais afastados do templo.");
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

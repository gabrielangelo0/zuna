import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createEndpoint } from "colyseus";
import { eq } from "drizzle-orm";
import {
  EQUIP_SLOTS,
  GEAR_MAX_LEVEL,
  GEAR_MAX_PRICE,
  GEAR_MAX_STAT,
  ITEM_RARITIES,
  gearItem,
  slugify,
  type AdminGearResponse,
  type EquipSlot,
  type GearDef,
  type ItemRarity,
} from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, clamp, readBody, text } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import { db } from "./db/index.ts";
import { characters } from "./db/schema.ts";
import { addCharacterItem, allGear, gearOwners, gearSettings, removeGear, saveGear, saveGearSettings } from "./gear.ts";
import { giveLiveItem, pushGear } from "./live.ts";
import { clearWorldsCache } from "./worldRepository.ts";

// Painel: equipamentos (armas, escudos, elmos, armaduras e botas), a taxa de drop e presentes.
// Tudo o que muda aqui vale na hora para quem está jogando.

/** Ícones que o baker gerou (sprites/items.json). Lido uma vez: só muda com um deploy novo. */
let iconCache: string[] | null = null;

function iconIds(): string[] {
  if (iconCache) return iconCache;
  for (const path of ["../../client/public/sprites/items.json", "../../client/dist/sprites/items.json"]) {
    try {
      const atlas = JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as { icons: Record<string, unknown> };
      iconCache = Object.keys(atlas.icons);
      return iconCache;
    } catch {
      // Tenta o próximo lugar.
    }
  }
  iconCache = [...new Set(allGear().map((item) => item.icon))];
  return iconCache;
}

async function gearResponse(): Promise<AdminGearResponse> {
  const owners = await gearOwners();
  return {
    items: allGear().map((item) => ({ item, owners: owners.get(item.id) ?? 0 })),
    dropRate: gearSettings().dropRate,
    icons: iconIds(),
  };
}

/** Mudou o catálogo: jogadores online, a página inicial e quem abrir o jogo depois recebem a versão nova. */
function broadcastGear() {
  pushGear();
  clearWorldsCache();
}

const adminGear = createEndpoint("/api/admin/gear", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await gearResponse());
});

const adminGearSave = createEndpoint("/api/admin/gear/item", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = String(body.id ?? "");
  const current = id ? gearItem(id) : undefined;
  if (id && !current) throw ctx.error("NOT_FOUND", { message: "Item não encontrado." });

  if (current && body.remove === true) {
    await removeGear(current.id);
    broadcastGear();
    await logAdminAction({ accountId: admin.id, action: "equipamento apagado", detail: current });
    return ctx.json(await gearResponse());
  }

  const name = text(body.name ?? current?.name, 40);
  if (name.length < 2) throw ctx.error("BAD_REQUEST", { message: "Dê um nome ao item." });
  const slot = String(body.slot ?? current?.slot ?? "") as EquipSlot;
  if (!EQUIP_SLOTS.includes(slot)) throw ctx.error("BAD_REQUEST", { message: "Escolha onde o item é usado." });
  const rarity = String(body.rarity ?? current?.rarity ?? "comum") as ItemRarity;
  if (!ITEM_RARITIES.includes(rarity)) throw ctx.error("BAD_REQUEST", { message: "Raridade desconhecida." });
  const icon = String(body.icon ?? current?.icon ?? "");
  if (!iconIds().includes(icon)) throw ctx.error("BAD_REQUEST", { message: "Escolha um ícone da lista." });

  const stat = (key: keyof GearDef, max: number) => clamp(body[key] ?? current?.[key] ?? 0, 0, max) ?? 0;
  let newId = current?.id ?? slugify(name);
  if (!current) {
    // Id legível e único: "espada-de-fogo", "espada-de-fogo-2"...
    let suffix = 2;
    const base = newId || "item";
    newId = base;
    while (gearItem(newId)) newId = `${base}-${suffix++}`;
  }
  const item: GearDef = {
    id: newId,
    name,
    slot,
    icon,
    rarity,
    level: Math.max(1, stat("level", GEAR_MAX_LEVEL)),
    attack: stat("attack", GEAR_MAX_STAT),
    defense: stat("defense", GEAR_MAX_STAT),
    hp: stat("hp", GEAR_MAX_STAT),
    mana: stat("mana", GEAR_MAX_STAT),
    priceGold: stat("priceGold", GEAR_MAX_PRICE),
    priceDiamonds: stat("priceDiamonds", GEAR_MAX_PRICE),
    sellGold: stat("sellGold", GEAR_MAX_PRICE),
    drops: typeof body.drops === "boolean" ? body.drops : (current?.drops ?? true),
    enabled: typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true),
  };
  await saveGear(item, !current);
  broadcastGear();
  await logAdminAction({ accountId: admin.id, action: current ? "equipamento alterado" : "equipamento criado", detail: item });
  return ctx.json(await gearResponse());
});

const adminGearSettings = createEndpoint("/api/admin/gear/settings", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const rate = Number(readBody(ctx.body).dropRate);
  if (!Number.isFinite(rate)) throw ctx.error("BAD_REQUEST", { message: "Taxa inválida." });
  await saveGearSettings({ dropRate: rate });
  await logAdminAction({ accountId: admin.id, action: "taxa de drop de itens", detail: gearSettings() });
  return ctx.json(await gearResponse());
});

/** Dá um item a um personagem, online ou não. */
const adminGearGive = createEndpoint("/api/admin/gear/give", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const item = gearItem(String(body.itemId ?? ""));
  if (!item) throw ctx.error("NOT_FOUND", { message: "Item não encontrado." });
  const characterName = String(body.character ?? "").trim().toLowerCase();
  const [character] = await db()
    .select({ id: characters.id, name: characters.name, accountId: characters.accountId })
    .from(characters)
    .where(eq(characters.nameKey, characterName))
    .limit(1);
  if (!character) throw ctx.error("NOT_FOUND", { message: "Personagem não encontrado." });
  const online = giveLiveItem(character.id, item.id);
  if (!online) await addCharacterItem(character.id, item.id);
  await logAdminAction({
    accountId: admin.id,
    action: "deu equipamento",
    detail: { item: item.id, personagem: character.name },
    targetAccountId: character.accountId,
    targetCharacterId: character.id,
  });
  return ctx.json({ ok: true, online, name: character.name });
});

export const adminGearRoutes = { adminGear, adminGearSave, adminGearSettings, adminGearGive };

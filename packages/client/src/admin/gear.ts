import {
  EQUIP_SLOTS,
  GEAR_MAX_LEVEL,
  ITEM_RARITIES,
  RARITY,
  SLOT_LABEL,
  baseGearStats,
  describeStats,
  gearValue,
  rarityCss,
  setGearCatalog,
  type AdminGearRequest,
  type AdminGearResponse,
  type AdminGearRow,
  type EquipSlot,
  type ItemRarity,
} from "@zuna/shared";
import { iconElement } from "../itemIcons.ts";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, askText, badge, button, cell, frame, h, iconButton, num, retitle, select, sheet } from "./ui.ts";

// Aba de equipamentos: armas, escudos, elmos, armaduras e botas. Criar, editar, tirar do jogo,
// apagar, dar a um jogador e ajustar a taxa de drop. Tudo vale na hora para quem está jogando.

const SLOT_OPTIONS = [...EQUIP_SLOTS.map((slot) => ({ id: slot, label: SLOT_LABEL[slot] })), { id: "", label: "Consumível (poção)" }];

function slotName(slot: EquipSlot | ""): string {
  return slot ? SLOT_LABEL[slot] : "Consumível";
}
const RARITY_OPTIONS = ITEM_RARITIES.map((rarity) => ({ id: rarity, label: RARITY[rarity].label }));

let slotFilter = "*";

export async function renderGear(root: HTMLElement) {
  const box = frame("Equipamentos", undefined, "sword");
  const list = h("div");
  const filter = select([{ id: "*", label: "Todos os espaços" }, ...SLOT_OPTIONS], slotFilter);
  filter.addEventListener("change", () => {
    slotFilter = filter.value;
    void reload();
  });
  const rateButton = button("Taxa de drop", () => void editRate());
  box.body.append(
    h(
      "div",
      { class: "row" },
      filter,
      h("p", { class: "note", text: "Os monstros derrubam itens de até 20 níveis abaixo do nível deles. Chefes sempre derrubam um raro." }),
      h("span", { class: "spacer" }),
      rateButton,
      button("Novo item", () => void editItem(null, data, reload), "good"),
    ),
    list,
  );
  root.replaceChildren(box.root);

  let data: AdminGearResponse;

  async function reload() {
    data = await ask<AdminGearResponse>("/api/admin/gear");
    setGearCatalog(data.items.map((row) => row.item));
    const shown = data.items.filter((row) => slotFilter === "*" || row.item.slot === slotFilter);
    retitle(
      box.root,
      "Equipamentos",
      `${num(data.items.length)} itens · drop ×${data.dropRate.toLocaleString("pt-BR")}`,
      "sword",
    );
    list.replaceChildren(
      sheet(
        ["", "Item", "Espaço", "Nível", "Atributos", "Loja", "Venda", "Cai", "Donos", "Ações"],
        shown.map((row) => gearRow(row, data, reload)),
        "Nenhum item.",
      ),
    );
  }

  async function editRate() {
    const answer = await askForm("Taxa de drop de itens", [
      {
        id: "rate",
        label: "Multiplicador",
        kind: "number",
        value: data.dropRate,
        min: 0,
        max: 20,
        step: "0.1",
        hint: "1 = normal. 2 = o dobro de itens caindo. 0 = nenhum item cai (só a loja).",
      },
    ]);
    if (!answer) return;
    const ok = await run(rateButton, async () => {
      await ask("/api/admin/gear/settings", { method: "POST", body: { dropRate: Number(answer.rate.replace(",", ".")) } });
    });
    if (!ok) return;
    notify("Taxa de drop salva.");
    await reload();
  }

  await reload();
}

function gearRow(row: AdminGearRow, data: AdminGearResponse, reload: () => Promise<void>): HTMLTableRowElement {
  const { item } = row;
  const name = h("strong", { text: item.name });
  name.style.color = rarityCss(item.rarity);
  const line = h("div", { class: "who-line" }, name);
  if (!item.enabled) line.append(badge("banned", "fora do jogo"));
  const who = h("div", { class: "who-cell" }, line, h("small", { text: `${RARITY[item.rarity].label} · ${item.id}` }));

  const shop: string[] = [];
  if (item.priceGold > 0) shop.push(`🪙 ${num(item.priceGold)}`);
  if (item.priceDiamonds > 0) shop.push(`💎 ${num(item.priceDiamonds)}`);

  const send = async (control: HTMLElement, body: Omit<AdminGearRequest, "id">, message: string) => {
    const ok = await run(control, async () => {
      await ask("/api/admin/gear/item", { method: "POST", body: { id: item.id, ...body } });
    });
    if (!ok) return;
    notify(message);
    await reload();
  };

  const onOff = iconButton(
    item.enabled ? "lock" : "check",
    item.enabled ? "Tirar do jogo (não cai nem vende; quem tem continua com ele)" : "Voltar ao jogo",
    () => void send(onOff, { enabled: !item.enabled }, item.enabled ? "Item fora do jogo." : "Item de volta ao jogo."),
    item.enabled ? "" : "good",
  );
  const give = iconButton("plus", "Dar a um personagem", () => {
    void (async () => {
      const character = await askText(`Dar ${item.name} para`, "Nome do personagem");
      if (!character) return;
      await run(give, async () => {
        const result = await ask<{ online: boolean; name: string }>("/api/admin/gear/give", {
          method: "POST",
          body: { itemId: item.id, character },
        });
        notify(`${item.name} entregue a ${result.name}${result.online ? " (online agora)" : " (recebe ao entrar)"}.`);
      });
      await reload();
    })();
  });
  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        const message =
          row.owners > 0
            ? `${num(row.owners)} personagem(ns) têm este item e vão perdê-lo. Para só esconder, use "Tirar do jogo".`
            : "O item some do catálogo.";
        if (await askConfirm(`Apagar ${item.name}?`, message, "Apagar")) await send(remove, { remove: true }, "Item apagado.");
      })();
    },
    "bad",
  );

  return h(
    "tr",
    {},
    cell(h("span", { class: "gear-thumb" }, iconElement(item.icon, 40))),
    cell(who),
    cell(item.stack > 1 ? `${slotName(item.slot)} · pilha ${num(item.stack)}` : slotName(item.slot)),
    cell(num(item.level), "num"),
    cell(describeStats(item).join(" · ") || "—"),
    cell(shop.join(" · ") || "—"),
    cell(`🪙 ${num(item.sellGold)}`, "num"),
    cell(item.drops ? "sim" : "não"),
    cell(num(row.owners), "num"),
    cell(h("div", { class: "actions" }, iconButton("brush", "Editar", () => void editItem(row, data, reload)), onOff, give, remove)),
  );
}

async function editItem(row: AdminGearRow | null, data: AdminGearResponse, reload: () => Promise<void>) {
  const item = row?.item;
  const answer = await askForm(item ? `Editar ${item.name}` : "Novo equipamento", [
    { id: "name", label: "Nome", value: item?.name ?? "" },
    { id: "slot", label: "Espaço", kind: "select", options: SLOT_OPTIONS, value: item?.slot ?? "weapon" },
    { id: "rarity", label: "Raridade", kind: "select", options: RARITY_OPTIONS, value: item?.rarity ?? "comum" },
    {
      id: "icon",
      label: "Ícone",
      kind: "select",
      options: data.icons.map((icon) => ({ id: icon, label: icon.replaceAll("_", " ") })),
      value: item?.icon ?? data.icons[0] ?? "",
    },
    { id: "level", label: "Nível mínimo", kind: "number", value: item?.level ?? 1, min: 1, max: GEAR_MAX_LEVEL },
    {
      id: "auto",
      label: "Calcular atributos e preços pelo nível e raridade",
      kind: "check",
      value: !item,
      hint: "Desmarque para usar os números abaixo.",
    },
    { id: "attack", label: "Ataque", kind: "number", value: item?.attack ?? 0, min: 0 },
    { id: "defense", label: "Defesa", kind: "number", value: item?.defense ?? 0, min: 0 },
    { id: "hp", label: "Vida", kind: "number", value: item?.hp ?? 0, min: 0 },
    { id: "mana", label: "Mana", kind: "number", value: item?.mana ?? 0, min: 0 },
    { id: "heal", label: "Poção: vida recuperada", kind: "number", value: item?.heal ?? 0, min: 0 },
    { id: "restore", label: "Poção: mana recuperada", kind: "number", value: item?.restore ?? 0, min: 0 },
    { id: "stack", label: "Empilha até (1 = não empilha)", kind: "number", value: item?.stack ?? 1, min: 1, max: 1000 },
    { id: "bagSlots", label: "Mochila: espaços a mais", kind: "number", value: item?.bagSlots ?? 0, min: 0, max: 40 },
    { id: "range", label: "Arma: alcance (mais que 1 gasta munição)", kind: "number", value: item?.range ?? 1, min: 1, max: 8 },
    { id: "priceGold", label: "Preço em ouro (0 = não vende)", kind: "number", value: item?.priceGold ?? 0, min: 0 },
    { id: "priceDiamonds", label: "Preço em diamantes (0 = não vende)", kind: "number", value: item?.priceDiamonds ?? 0, min: 0 },
    { id: "sellGold", label: "Ouro ao vender", kind: "number", value: item?.sellGold ?? 0, min: 0 },
    { id: "drops", label: "Cai de monstros", kind: "check", value: item?.drops ?? true },
    { id: "enabled", label: "No jogo", kind: "check", value: item?.enabled ?? true },
  ]);
  if (!answer) return;

  const slot = answer.slot as EquipSlot;
  const rarity = answer.rarity as ItemRarity;
  const level = Math.max(1, Number(answer.level) || 1);
  const body: AdminGearRequest = {
    id: item?.id ?? "",
    name: answer.name.trim(),
    slot,
    rarity,
    icon: answer.icon,
    level,
    attack: Number(answer.attack) || 0,
    defense: Number(answer.defense) || 0,
    hp: Number(answer.hp) || 0,
    mana: Number(answer.mana) || 0,
    heal: Number(answer.heal) || 0,
    restore: Number(answer.restore) || 0,
    stack: Math.max(1, Number(answer.stack) || 1),
    bagSlots: Number(answer.bagSlots) || 0,
    range: Math.max(1, Number(answer.range) || 1),
    priceGold: Number(answer.priceGold) || 0,
    priceDiamonds: Number(answer.priceDiamonds) || 0,
    sellGold: Number(answer.sellGold) || 0,
    drops: answer.drops === "true",
    enabled: answer.enabled === "true",
  };
  if (answer.auto === "true" && slot) {
    // Mesma conta dos itens de fábrica: comuns e incomuns vendem por ouro, épicos por diamantes.
    Object.assign(body, baseGearStats(slot, level, rarity));
    const value = gearValue(level, rarity);
    body.sellGold = Math.max(1, Math.round(value / 5));
    body.priceGold = rarity === "comum" || rarity === "incomum" ? value : 0;
    body.priceDiamonds = rarity === "epico" ? Math.round((120 + level * 6) / 10) * 10 : 0;
  }
  const ok = await run(null, async () => {
    await ask("/api/admin/gear/item", { method: "POST", body });
  });
  if (!ok) return;
  notify(item ? "Item salvo." : "Item criado.");
  await reload();
}

import {
  SPELL_FAMILIES,
  VOCATION_NAME_MAX,
  VOCATION_TEXT_MAX,
  shopItems,
  type AdminVocationRow,
  type AdminVocationsResponse,
  type VocationDef,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, button, cell, frame, h, iconButton, num, retitle, sheet } from "./ui.ts";

// Aba de classes: vida e mana por nível, força do golpe e dos poderes, e quais famílias
// cada classe aprende. Tudo vale na hora para quem está jogando.

const FAMILY_OPTIONS = SPELL_FAMILIES.map((family) => ({ id: family.family, label: family.name }));

function familyNames(families: readonly string[]): string {
  const names = families.map((id) => SPELL_FAMILIES.find((family) => family.family === id)?.name ?? id);
  return names.join(", ") || "todos";
}

export async function renderVocations(root: HTMLElement) {
  const box = frame("Classes", undefined, "shield");
  const list = h("div");
  const priceButton = button("Preço da troca", () => void editPrice());
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", {
        class: "note",
        text: "A classe é escolhida ao criar o personagem. A primeira escolha de quem está sem classe é de graça.",
      }),
      h("span", { class: "spacer" }),
      priceButton,
      button("Nova classe", () => void editVocation(null, reload), "good"),
    ),
    list,
  );
  root.replaceChildren(box.root);

  let data: AdminVocationsResponse;

  async function reload() {
    data = await ask<AdminVocationsResponse>("/api/admin/vocations");
    const without = data.without === 1 ? "1 sem classe" : `${num(data.without)} sem classe`;
    retitle(box.root, "Classes", `${num(data.vocations.length)} classes · troca por 💎 ${num(data.settings.changePrice)} · ${without}`, "shield");
    list.replaceChildren(
      sheet(
        ["Classe", "Vida", "Mana", "Golpe", "Poder", "Armadura", "Famílias", "Jogadores", "Ações"],
        data.vocations.map((row) => vocationRow(row, reload)),
        "Nenhuma classe.",
      ),
    );
  }

  async function editPrice() {
    const answer = await askForm("Preço da troca de classe", [
      {
        id: "changePrice",
        label: "Diamantes",
        kind: "number",
        value: data.settings.changePrice,
        min: 0,
        hint: "0 = trocar de graça. A primeira escolha de quem está sem classe nunca cobra.",
      },
    ]);
    if (!answer) return;
    const ok = await run(priceButton, async () => {
      await ask("/api/admin/vocation/settings", { method: "POST", body: { changePrice: Number(answer.changePrice) || 0 } });
    });
    if (!ok) return;
    notify("Preço salvo.");
    await reload();
  }

  await reload();
}

function vocationRow(row: AdminVocationRow, reload: () => Promise<void>): HTMLTableRowElement {
  const { vocation } = row;
  const line = h("div", { class: "who-line" }, h("strong", { text: vocation.name }));
  if (!vocation.enabled) line.append(badge("banned", "fechada"));
  const who = h("div", { class: "who-cell" }, line, h("small", { text: vocation.description || vocation.id }));

  const send = async (control: HTMLElement, body: Record<string, unknown>, message: string) => {
    const ok = await run(control, async () => {
      await ask("/api/admin/vocation", { method: "POST", body: { id: vocation.id, ...body } });
    });
    if (!ok) return;
    notify(message);
    await reload();
  };

  const onOff = iconButton(
    vocation.enabled ? "lock" : "check",
    vocation.enabled ? "Fechar (some da criação de personagem)" : "Abrir",
    () => void send(onOff, { enabled: !vocation.enabled }, vocation.enabled ? "Classe fechada." : "Classe aberta."),
    vocation.enabled ? "" : "good",
  );
  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        const message =
          row.players > 0
            ? `${num(row.players)} personagem(ns) são desta classe e vão ficar sem classe, escolhendo de novo de graça.`
            : "A classe some do jogo.";
        if (await askConfirm(`Apagar ${vocation.name}?`, message, "Apagar")) await send(remove, { remove: true }, "Classe apagada.");
      })();
    },
    "bad",
  );

  return h(
    "tr",
    {},
    cell(who),
    cell(`${num(vocation.hpBase)} +${vocation.hpPerLevel.toLocaleString("pt-BR")}`, "num"),
    cell(`${num(vocation.manaBase)} +${vocation.manaPerLevel.toLocaleString("pt-BR")}`, "num"),
    cell(`×${vocation.attackFactor.toLocaleString("pt-BR")}`, "num"),
    cell(`×${vocation.magicFactor.toLocaleString("pt-BR")}`, "num"),
    cell(`×${vocation.armorFactor.toLocaleString("pt-BR")}`, "num"),
    cell(familyNames(vocation.families)),
    cell(num(row.players), "num"),
    cell(h("div", { class: "actions" }, iconButton("brush", "Editar", () => void editVocation(row, reload)), onOff, remove)),
  );
}

async function editVocation(row: AdminVocationRow | null, reload: () => Promise<void>) {
  const vocation = row?.vocation;
  const outfits = [{ id: "", label: "Nenhuma" }, ...shopItems("outfit").map((item) => ({ id: item.id, label: item.name }))];
  const answer = await askForm(vocation ? `Editar ${vocation.name}` : "Nova classe", [
    {
      id: "id",
      label: "Chave",
      value: vocation?.id ?? "",
      hint: "Letras minúsculas, sem espaço. É o que fica gravado no personagem e não muda depois.",
    },
    { id: "name", label: "Nome", value: vocation?.name ?? "", max: VOCATION_NAME_MAX },
    { id: "description", label: "Descrição", value: vocation?.description ?? "", max: VOCATION_TEXT_MAX },
    { id: "hpBase", label: "Vida no nível 1", kind: "number", value: vocation?.hpBase ?? 150, min: 1 },
    { id: "hpPerLevel", label: "Vida por nível", kind: "number", value: vocation?.hpPerLevel ?? 15, min: 0.1, step: "0.5" },
    { id: "manaBase", label: "Mana no nível 1", kind: "number", value: vocation?.manaBase ?? 50, min: 0 },
    { id: "manaPerLevel", label: "Mana por nível", kind: "number", value: vocation?.manaPerLevel ?? 10, min: 0.1, step: "0.5" },
    { id: "attackFactor", label: "Golpe (×)", kind: "number", value: vocation?.attackFactor ?? 1, min: 0.1, max: 5, step: "0.05" },
    { id: "magicFactor", label: "Poderes e cura (×)", kind: "number", value: vocation?.magicFactor ?? 1, min: 0.1, max: 5, step: "0.05" },
    { id: "armorFactor", label: "Armadura (×)", kind: "number", value: vocation?.armorFactor ?? 1, min: 0.1, max: 5, step: "0.05" },
    {
      id: "families",
      label: "Famílias de poder",
      kind: "checks",
      options: FAMILY_OPTIONS,
      value: (vocation?.families ?? []).join(","),
      hint: "Nenhuma marcada = a classe aprende todas.",
    },
    { id: "outfit", label: "Roupa sugerida", kind: "select", options: outfits, value: vocation?.outfit ?? "" },
    { id: "sort", label: "Ordem", kind: "number", value: vocation?.sort ?? 0, min: 0 },
    { id: "enabled", label: "Aberta na criação", kind: "check", value: vocation?.enabled ?? true },
  ]);
  if (!answer) return;

  const decimal = (value: string) => Number(value.replace(",", ".")) || 0;
  const body = {
    id: (vocation?.id ?? answer.id).trim().toLowerCase(),
    name: answer.name.trim(),
    description: answer.description.trim(),
    hpBase: Number(answer.hpBase) || 1,
    hpPerLevel: decimal(answer.hpPerLevel),
    manaBase: Number(answer.manaBase) || 0,
    manaPerLevel: decimal(answer.manaPerLevel),
    attackFactor: decimal(answer.attackFactor),
    magicFactor: decimal(answer.magicFactor),
    armorFactor: decimal(answer.armorFactor),
    families: answer.families ? answer.families.split(",").filter(Boolean) : [],
    outfit: answer.outfit,
    sort: Number(answer.sort) || 0,
    enabled: answer.enabled === "true",
  };
  const ok = await run(null, async () => {
    await ask("/api/admin/vocation", { method: "POST", body });
  });
  if (!ok) return;
  notify(vocation ? "Classe salva." : "Classe criada.");
  await reload();
}

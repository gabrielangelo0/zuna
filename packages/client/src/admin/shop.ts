import { ADMIN_MAX_PRICE, describeBonus, type AdminItemRow, type AdminItemsResponse, type Currency } from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { badge, button, cell, frame, h, iconButton, input, num, retitle, select, sheet, short } from "./ui.ts";

// Aba da loja: preço, moeda e o que está à venda. O preço novo vale na hora,
// inclusive para quem já está com a loja aberta dentro do jogo.

const KINDS: Record<string, string> = { outfit: "Roupa", pet: "Mascote", mount: "Montaria" };
const CURRENCIES = [
  { id: "gold", label: "Ouro" },
  { id: "diamonds", label: "Diamantes" },
];

export async function renderShop(root: HTMLElement) {
  const box = frame("Loja", undefined, "store");
  const list = h("div");
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", { class: "note", text: "Quem já comprou continua com o item, mesmo se ele sair da loja." }),
      h("span", { class: "spacer" }),
      button("Atualizar", () => void reload()),
    ),
    list,
  );
  root.replaceChildren(box.root);

  async function reload() {
    const data = await ask<AdminItemsResponse>("/api/admin/items");
    const revenue = data.items.reduce((sum, row) => sum + row.revenue, 0);
    retitle(box.root, "Loja", `${num(data.items.length)} itens · ${short(revenue)} arrecadados`, "store");
    list.replaceChildren(
      sheet(
        ["Item", "Tipo", "Preço", "Moeda", "Vendidos", "Arrecadado", "Donos", "Ações"],
        data.items.map((row) => itemRow(row, reload)),
        "Nenhum item.",
      ),
    );
  }

  await reload();
}

function itemRow(row: AdminItemRow, reload: () => Promise<void>): HTMLTableRowElement {
  const { item, base } = row;
  const changed = item.price !== base.price || item.currency !== base.currency || item.enabled === false;

  const line = h("div", { class: "who-line" }, h("strong", { text: item.name }));
  if (item.enabled === false) line.append(badge("banned", "fora da loja"));
  else if (item.price === 0) line.append(badge("online", "grátis"));
  if (changed) line.append(badge("admin", "mudado"));

  const bonus = describeBonus(item.bonus).join(" · ");
  const who = h("div", { class: "who-cell" }, line, h("small", { text: bonus || item.description }));

  const price = input(item.price, { type: "number" });
  price.className = "wide";
  price.min = "0";
  price.max = String(ADMIN_MAX_PRICE);
  const currency = select(CURRENCIES, item.currency);

  const save = iconButton("check", "Salvar o preço", () => void store(), "good");
  const actions = h(
    "div",
    { class: "actions" },
    save,
    iconButton(
      item.enabled === false ? "check" : "lock",
      item.enabled === false ? "Voltar a vender" : "Tirar da loja",
      () => void store({ enabled: item.enabled === false }),
      item.enabled === false ? "bad" : "",
    ),
    iconButton("undo", "Voltar ao preço de fábrica", () => void store({ reset: true })),
  );

  async function store(extra: Record<string, unknown> = {}) {
    const body = {
      id: item.id,
      price: Number(price.value),
      currency: currency.value as Currency,
      enabled: item.enabled !== false,
      ...extra,
    };
    const ok = await run(save, async () => {
      await ask("/api/admin/item", { method: "POST", body });
    });
    if (!ok) return;
    notify(`${item.name}: salvo.`);
    await reload();
  }

  return h(
    "tr",
    {},
    cell(who),
    cell(KINDS[item.kind] ?? item.kind),
    cell(price),
    cell(currency),
    cell(num(row.sold), "num"),
    cell(short(row.revenue), "num"),
    cell(num(row.owners), "num"),
    cell(actions),
  );
}

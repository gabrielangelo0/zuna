import {
  PACK_MAX_DIAMONDS,
  PACK_MAX_MULTIPLIER,
  PACK_MAX_PRICE_CENTS,
  PACK_MIN_PRICE_CENTS,
  formatBRL,
  type AdminPackRequest,
  type AdminPackRow,
  type AdminPacksResponse,
  type AdminPaymentRow,
  type AdminPaymentsResponse,
  type PaymentSettings,
  type PaymentStatus,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, button, cell, frame, h, iconButton, num, select, sheet, stamp, stat } from "./ui.ts";

// Aba de vendas: quanto entrou em dinheiro, os pacotes à venda, a oferta de primeira recarga
// e o estado de cada pagamento na Asaas. Tudo o que muda aqui vale na hora para quem abrir a loja.

const STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  paid: { label: "pago", tone: "online" },
  pending: { label: "aguardando", tone: "muted" },
  refunded: { label: "estornado", tone: "banned" },
  canceled: { label: "cancelado", tone: "" },
};

const FILTERS = [
  { id: "", label: "Todos os pedidos" },
  { id: "paid", label: "Pagos" },
  { id: "pending", label: "Aguardando" },
  { id: "refunded", label: "Estornados" },
  { id: "canceled", label: "Cancelados" },
];

let filter = "";

export async function renderSales(root: HTMLElement) {
  const [data, catalog] = await Promise.all([
    ask<AdminPaymentsResponse>(`/api/admin/payments?status=${filter}`),
    ask<AdminPacksResponse>("/api/admin/payments/packs"),
  ]);
  const reload = () => renderSales(root);

  const numbers = frame("Vendas de diamantes", undefined, "coin");
  numbers.body.className = "stats";
  numbers.body.append(
    stat("hoje", formatBRL(data.revenueToday), "coin", "#46d98a"),
    stat("últimos 30 dias", formatBRL(data.revenue30d), "calendar", "#e2b34c"),
    stat("desde o início", formatBRL(data.revenueTotal), "crown", "#e2b34c"),
    stat("pagamentos", num(data.paidCount), "check", "#4aa8ff"),
    stat("pagantes", num(data.payers), "person", "#a874e8"),
    stat("ticket médio", formatBRL(data.paidCount ? Math.round(data.revenueTotal / data.paidCount) : 0), "diamond", "#67c7ff"),
    stat("aguardando", num(data.pendingCount), "clock", "#9aa6c8"),
    stat("estornado", formatBRL(data.refundedCents), "undo", "#e05a5a"),
  );

  const setup = frame("Asaas", undefined, "shield");
  const warnings: string[] = [];
  if (!data.enabled) warnings.push("Sem ASAAS_API_KEY: a loja aparece no jogo como \"abre em breve\".");
  else if (data.sandbox) warnings.push("Chave de sandbox: os pagamentos são de teste e nada é cobrado.");
  if (data.enabled && !data.webhook) warnings.push("Falta ASAAS_WEBHOOK_TOKEN: sem ele os avisos da Asaas são recusados (a conferência a cada 90 s ainda credita).");
  setup.body.append(
    h(
      "div",
      { class: "badges" },
      data.enabled ? (data.sandbox ? badge("muted", "sandbox") : badge("online", "produção")) : badge("banned", "desligado"),
      data.webhook ? badge("online", "webhook ok") : badge("banned", "sem webhook"),
    ),
    ...warnings.map((text) => h("p", { class: "note", text })),
  );

  const orders = frame("Pedidos", `${num(data.orders.length)} mais recentes`, "scroll");
  const picker = select(FILTERS, filter);
  picker.addEventListener("change", () => {
    filter = picker.value;
    void renderSales(root);
  });
  orders.root.querySelector("h2")!.append(picker);
  orders.body.append(
    sheet(
      ["#", "Conta", "Pacote", "Valor", "Forma", "Situação", "Criado", "Pago", "Asaas", ""],
      data.orders.map((row) => orderRow(row, reload)),
      "Nenhum pedido ainda.",
    ),
  );

  root.replaceChildren(numbers.root, setup.root, storeFrame(catalog, reload), orders.root);
}

// ---------------------------------------------------------------- loja e pacotes

/** "24,90" ou "24.90" → 2490. */
function cents(text: string): number {
  return Math.round(Number(text.replace(/\s/g, "").replace(",", ".")) * 100);
}

function storeFrame(catalog: AdminPacksResponse, reload: () => Promise<void>): HTMLElement {
  const { settings } = catalog;
  const box = frame("Loja de diamantes", `${num(catalog.packs.filter((row) => row.pack.enabled).length)} pacotes à venda`, "store");

  const offer = settings.firstMultiplier > 1 ? `Primeira recarga ×${settings.firstMultiplier.toLocaleString("pt-BR")}` : "Sem oferta de primeira recarga";
  const toggle = button(settings.open ? "Fechar a loja" : "Abrir a loja", () => {
    void (async () => {
      if (settings.open && !(await askConfirm("Fechar a loja?", "Os jogadores vão ver \"abre em breve\" até você abrir de novo. Pagamentos já feitos continuam caindo."))) return;
      await saveSettings({ open: !settings.open }, toggle);
    })();
  }, settings.open ? "bad" : "good");
  const offerButton = button("Mudar oferta", () => void editOffer(settings, offerButton));
  box.body.append(
    h(
      "div",
      { class: "row" },
      settings.open ? badge("online", "loja aberta") : badge("banned", "loja fechada"),
      h("strong", { text: offer }),
      h("span", { class: "spacer" }),
      offerButton,
      toggle,
      button("Novo pacote", () => void editPack(null, reload), "good"),
    ),
    sheet(
      ["", "Diamantes", "Preço", "💎 por real", "Bônus", "Destaque", "Situação", "Vendidos", "Arrecadado", "Ações"],
      catalog.packs.map((row, index) => packRow(row, index, catalog.packs.length, reload)),
      "Nenhum pacote. Crie um com \"Novo pacote\".",
    ),
    h("p", {
      class: "note",
      text: "Mudar ou apagar um pacote não mexe em pedidos já feitos: cada pedido guarda o preço e os diamantes da hora da compra.",
    }),
  );

  async function saveSettings(change: Partial<PaymentSettings>, control: HTMLElement) {
    const ok = await run(control, async () => {
      await ask("/api/admin/payments/settings", { method: "POST", body: change });
    });
    if (!ok) return;
    notify("Loja atualizada.");
    await reload();
  }

  async function editOffer(current: PaymentSettings, control: HTMLElement) {
    const answer = await askForm("Oferta de primeira recarga", [
      {
        id: "multiplier",
        label: "Multiplicador",
        kind: "number",
        value: current.firstMultiplier,
        min: 1,
        max: PACK_MAX_MULTIPLIER,
        step: "0.1",
        hint: "2 = diamantes em dobro na primeira compra da conta. 1 desliga a oferta.",
      },
    ]);
    if (!answer) return;
    await saveSettings({ firstMultiplier: Number(answer.multiplier.replace(",", ".")) }, control);
  }

  return box.root;
}

function packRow(row: AdminPackRow, index: number, total: number, reload: () => Promise<void>): HTMLTableRowElement {
  const { pack } = row;
  const send = async (control: HTMLElement, body: Omit<AdminPackRequest, "id">, message: string) => {
    const ok = await run(control, async () => {
      await ask("/api/admin/payments/pack", { method: "POST", body: { id: pack.id, ...body } });
    });
    if (!ok) return;
    if (message) notify(message);
    await reload();
  };
  const up = iconButton("up", "Subir na vitrine", () => void send(up, { move: -1 }, ""));
  const down = iconButton("down", "Descer na vitrine", () => void send(down, { move: 1 }, ""));
  up.disabled = index === 0;
  down.disabled = index === total - 1;
  const onOff = iconButton(
    pack.enabled ? "lock" : "check",
    pack.enabled ? "Tirar da loja" : "Voltar a vender",
    () => void send(onOff, { enabled: !pack.enabled }, pack.enabled ? "Pacote fora da loja." : "Pacote à venda."),
    pack.enabled ? "" : "good",
  );
  const remove = iconButton(
    "trash",
    "Apagar o pacote",
    () => {
      void (async () => {
        const sure = await askConfirm(
          "Apagar o pacote?",
          `💎 ${num(pack.diamonds)} por ${formatBRL(pack.priceCents)}. Pedidos antigos continuam registrados. Para só esconder, use "Tirar da loja".`,
          "Apagar",
        );
        if (sure) await send(remove, { remove: true }, "Pacote apagado.");
      })();
    },
    "bad",
  );
  const actions = h(
    "div",
    { class: "actions" },
    iconButton("edit", "Editar", () => void editPack(row, reload)),
    up,
    down,
    onOff,
    remove,
  );
  return h(
    "tr",
    {},
    cell(num(index + 1), "num"),
    cell(h("strong", { text: `💎 ${num(pack.diamonds)}` })),
    cell(formatBRL(pack.priceCents), "num"),
    cell((pack.diamonds / (pack.priceCents / 100)).toLocaleString("pt-BR", { maximumFractionDigits: 1 }), "num"),
    cell(pack.bonusPercent > 0 ? `+${num(pack.bonusPercent)}%` : "—", "num"),
    cell(pack.tag || "—"),
    cell(pack.enabled ? badge("online", "à venda") : badge("banned", "fora da loja")),
    cell(num(row.sold), "num"),
    cell(formatBRL(row.revenueCents), "num"),
    cell(actions),
  );
}

async function editPack(row: AdminPackRow | null, reload: () => Promise<void>) {
  const pack = row?.pack;
  const answer = await askForm(pack ? "Editar pacote" : "Novo pacote", [
    {
      id: "price",
      label: "Preço (R$)",
      kind: "number",
      value: pack ? (pack.priceCents / 100).toFixed(2) : "",
      min: PACK_MIN_PRICE_CENTS / 100,
      max: PACK_MAX_PRICE_CENTS / 100,
      step: "0.01",
    },
    { id: "diamonds", label: "Diamantes", kind: "number", value: pack?.diamonds ?? "", min: 1, max: PACK_MAX_DIAMONDS },
    {
      id: "bonus",
      label: "Bônus mostrado (%)",
      kind: "number",
      value: pack?.bonusPercent ?? 0,
      min: 0,
      max: 1000,
      hint: "Só o selo \"+10% bônus\" da vitrine: os diamantes são os do campo acima.",
    },
    { id: "tag", label: "Destaque", value: pack?.tag ?? "", hint: "Ex.: Mais vendido, Melhor valor. Vazio = sem selo." },
    { id: "enabled", label: "À venda", kind: "check", value: pack?.enabled ?? true },
  ]);
  if (!answer) return;
  const priceCents = cents(answer.price);
  const diamonds = Number(answer.diamonds);
  if (!Number.isFinite(priceCents) || priceCents < PACK_MIN_PRICE_CENTS || !Number.isFinite(diamonds) || diamonds < 1) {
    notify("Preencha um preço (a partir de R$ 1,00) e a quantidade de diamantes.", false);
    return;
  }
  const body: AdminPackRequest = {
    id: pack?.id ?? "",
    priceCents,
    diamonds,
    bonusPercent: Number(answer.bonus) || 0,
    tag: answer.tag.trim(),
    enabled: answer.enabled === "true",
  };
  const ok = await run(null, async () => {
    await ask("/api/admin/payments/pack", { method: "POST", body });
  });
  if (!ok) return;
  notify(pack ? "Pacote salvo." : "Pacote criado.");
  await reload();
}

function orderRow(row: AdminPaymentRow, reload: () => Promise<void>): HTMLTableRowElement {
  const status = STATUS[row.status] ?? { label: row.status, tone: "" };
  const diamonds = `💎 ${num(row.credited > 0 ? row.credited : row.diamonds)}`;
  const recheck = iconButton("undo", "Conferir agora na Asaas", () => {
    void run(recheck, async () => {
      const result = await ask<{ status: string }>("/api/admin/payments/check", { method: "POST", body: { id: row.id } });
      notify(`Pedido ${row.id}: ${STATUS[result.status as PaymentStatus]?.label ?? result.status}.`);
      await reload();
    });
  });
  return h(
    "tr",
    {},
    cell(num(row.id), "num"),
    cell(row.username),
    cell(diamonds),
    cell(formatBRL(row.priceCents), "num"),
    cell(row.method === "pix" ? "Pix" : "Cartão"),
    cell(badge(status.tone, status.label)),
    cell(stamp(row.createdAt)),
    cell(row.paidAt ? stamp(row.paidAt) : "—"),
    cell(h("small", { text: row.providerId || "—" })),
    cell(h("div", { class: "actions" }, row.status === "pending" || row.status === "paid" ? recheck : "", row.status === "paid" ? refundButton(row, reload) : "")),
  );
}

function refundButton(row: AdminPaymentRow, reload: () => Promise<void>): HTMLButtonElement {
  const control = iconButton(
    "trash",
    "Estornar: devolve o dinheiro e tira os diamantes",
    () => {
      void (async () => {
        const sure = await askConfirm(
          `Estornar o pedido ${row.id}?`,
          `A Asaas devolve ${formatBRL(row.priceCents)} para ${row.username} e ${num(row.credited)} diamantes saem da conta (o saldo não fica negativo). Não dá para desfazer.`,
          "Estornar",
        );
        if (!sure) return;
        const ok = await run(control, async () => {
          await ask("/api/admin/payments/refund", { method: "POST", body: { id: row.id } });
        });
        if (!ok) return;
        notify(`Pedido ${row.id} estornado.`);
        await reload();
      })();
    },
    "bad",
  );
  return control;
}

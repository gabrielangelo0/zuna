import { diamondPack, formatBRL, type AdminPaymentRow, type AdminPaymentsResponse, type PaymentStatus } from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { badge, cell, frame, h, iconButton, num, select, sheet, stamp, stat } from "./ui.ts";

// Aba de vendas: quanto entrou em dinheiro, quem comprou e o estado de cada pagamento na Asaas.

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
  const data = await ask<AdminPaymentsResponse>(`/api/admin/payments?status=${filter}`);

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
      data.orders.map((row) => orderRow(row, () => renderSales(root))),
      "Nenhum pedido ainda.",
    ),
  );

  root.replaceChildren(numbers.root, setup.root, orders.root);
}

function orderRow(row: AdminPaymentRow, reload: () => Promise<void>): HTMLTableRowElement {
  const status = STATUS[row.status] ?? { label: row.status, tone: "" };
  const pack = diamondPack(row.pack);
  const diamonds = row.credited > 0 ? `💎 ${num(row.credited)}` : `💎 ${num(pack?.diamonds ?? 0)}`;
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
    cell(row.status === "pending" || row.status === "paid" ? recheck : ""),
  );
}

import { timingSafeEqual } from "node:crypto";
import { createEndpoint } from "colyseus";
import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import {
  PACK_LIMIT,
  PACK_MAX_DIAMONDS,
  PACK_MAX_MULTIPLIER,
  PACK_MAX_PRICE_CENTS,
  PACK_MIN_PRICE_CENTS,
  PAYMENT_METHODS,
  formatBRL,
  onlyDigits,
  validCpf,
  validatePayerName,
  type AdminPackRow,
  type AdminPacksResponse,
  type AdminPaymentsResponse,
  type DiamondPack,
  type PaymentMethod,
  type PaymentOrderResponse,
  type PaymentOrderView,
  type PaymentPix,
  type PaymentShopResponse,
  type PaymentStatus,
} from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import {
  AsaasError,
  createCustomer,
  createPayment,
  getPayment,
  getPixQrCode,
  paymentProvider,
  paymentSandbox,
  refundPayment,
  settlementOf,
  webhookToken,
  type AsaasPayment,
} from "./asaas.ts";
import { accountFromToken, bearerToken } from "./auth.ts";
import { db } from "./db/index.ts";
import { accounts, paymentOrders } from "./db/schema.ts";
import { applyLiveAccount } from "./live.ts";
import {
  allPacks,
  movePack,
  packById,
  packsOnSale,
  paymentSettings,
  removePack,
  savePack,
  saveSettings,
} from "./paymentCatalog.ts";

// Compra de diamantes. O diamante só entra na conta quando a Asaas confirma o pagamento,
// e a confirmação chega por três caminhos (o que vier primeiro vale, e só uma vez):
// o webhook da Asaas, a tela de pagamento perguntando o status e a conferência periódica.

type OrderRow = typeof paymentOrders.$inferSelect;

const SESSION_EXPIRED = "Sua sessão expirou. Entre novamente.";
/** Pedidos abertos ao mesmo tempo por conta, para ninguém encher a Asaas de cobranças. */
const MAX_PENDING = 5;
const PENDING_WINDOW_MS = 30 * 60_000;
/** Pedido sem pagamento depois disso é dado como abandonado. */
const ORDER_LIFETIME_MS = 48 * 3_600_000;
/** A tela de pagamento pergunta o status a cada poucos segundos; a Asaas é consultada no máximo nesse ritmo. */
const REMOTE_CHECK_MS = 5_000;
const RECONCILE_MS = 90_000;

function readBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

async function accountBalance(accountId: number): Promise<number> {
  const [row] = await db().select({ diamonds: accounts.diamonds }).from(accounts).where(eq(accounts.id, accountId));
  return row?.diamonds ?? 0;
}

/** QR Codes já pedidos à Asaas, para não pedir de novo a cada consulta. */
const pixImages = new Map<number, PaymentPix>();

function devQrImage(orderId: number): string {
  // Desenho de mentira com cara de QR Code: só existe em desenvolvimento.
  const cells: string[] = [];
  let seed = orderId * 7919 + 17;
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const on = finder ? x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) : seed % 3 === 0;
      if (on) cells.push(`<rect x="${x + 2}" y="${y + 2}" width="1" height="1"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25"><rect width="25" height="25" fill="#fff"/><g fill="#111">${cells.join("")}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function pixFor(order: OrderRow): Promise<PaymentPix | null> {
  if (order.method !== "pix" || order.status !== "pending") return null;
  const cached = pixImages.get(order.id);
  if (cached) return cached;
  if (order.provider === "dev") {
    const pix = { image: devQrImage(order.id), payload: order.pixPayload, expiresAt: order.pixExpiresAt };
    pixImages.set(order.id, pix);
    return pix;
  }
  try {
    const qr = await getPixQrCode(order.providerId);
    const pix = { image: `data:image/png;base64,${qr.encodedImage}`, payload: qr.payload, expiresAt: qr.expirationDate };
    pixImages.set(order.id, pix);
    return pix;
  } catch (error) {
    console.error(`Pagamento ${order.id}: não foi possível buscar o QR Code do Pix`, error);
    return null;
  }
}

async function viewOf(order: OrderRow): Promise<PaymentOrderView> {
  return {
    id: order.id,
    pack: order.pack,
    diamonds: order.diamonds,
    method: order.method as PaymentMethod,
    priceCents: order.priceCents,
    status: order.status as PaymentStatus,
    credited: order.credited,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    checkoutUrl: order.checkoutUrl,
    pix: await pixFor(order),
  };
}

// ---------------------------------------------------------------- confirmação

/**
 * Aplica o que a Asaas disse sobre a cobrança. Cada passo só acontece uma vez:
 * o UPDATE ... WHERE status = 'pending' garante que dois avisos juntos não creditam em dobro.
 */
export async function settleOrder(orderId: number, outcome: "paid" | "refunded" | "canceled" | "pending", paidCents?: number) {
  if (outcome === "pending") return;
  if (outcome === "paid") {
    const [row] = await db().select().from(paymentOrders).where(eq(paymentOrders.id, orderId));
    if (!row) return;
    if (paidCents !== undefined && paidCents < row.priceCents) {
      console.error(`Pagamento ${orderId}: valor pago (${paidCents}) menor que o pedido (${row.priceCents}). Não creditado.`);
      return;
    }
    const result = await db().transaction(async (tx) => {
      const [order] = await tx
        .update(paymentOrders)
        .set({ status: "paid", paidAt: new Date() })
        .where(and(eq(paymentOrders.id, orderId), eq(paymentOrders.status, "pending")))
        .returning();
      if (!order) return null;
      // A primeira recarga da conta ganha o multiplicador do painel. O total gasto nunca desce
      // (nem com reembolso), então a oferta não se repete.
      const firstAmount = Math.round(order.diamonds * paymentSettings().firstMultiplier);
      const [account] = await tx
        .update(accounts)
        .set({
          diamonds: sql`${accounts.diamonds} + (case when ${accounts.spentCents} = 0 then cast(${firstAmount} as integer) else cast(${order.diamonds} as integer) end)`,
          spentCents: sql`${accounts.spentCents} + ${order.priceCents}`,
        })
        .where(eq(accounts.id, order.accountId))
        .returning({ diamonds: accounts.diamonds, spentCents: accounts.spentCents });
      if (!account) return null;
      const first = account.spentCents === order.priceCents && firstAmount !== order.diamonds;
      const credited = first ? firstAmount : order.diamonds;
      await tx.update(paymentOrders).set({ credited }).where(eq(paymentOrders.id, orderId));
      return { accountId: order.accountId, diamonds: account.diamonds, credited, first };
    });
    if (!result) return;
    pixImages.delete(orderId);
    console.log(`Pagamento ${orderId} confirmado: +${result.credited} diamantes para a conta ${result.accountId}`);
    const multiplier = paymentSettings().firstMultiplier;
    const extra = result.first ? (multiplier === 2 ? " (primeira recarga em dobro!)" : ` (primeira recarga ×${multiplier}!)`) : "";
    applyLiveAccount(result.accountId, {
      diamonds: result.diamonds,
      notice: `Pagamento confirmado! +${result.credited} diamantes${extra}. Obrigado!`,
    });
    return;
  }

  if (outcome === "refunded") {
    const result = await db().transaction(async (tx) => {
      const [order] = await tx
        .update(paymentOrders)
        .set({ status: "refunded", refundedAt: new Date() })
        .where(and(eq(paymentOrders.id, orderId), eq(paymentOrders.status, "paid")))
        .returning();
      if (!order) return null;
      // Estorno tira de volta o que entrou; se já gastou, o saldo para em zero.
      const [account] = await tx
        .update(accounts)
        .set({ diamonds: sql`greatest(0, ${accounts.diamonds} - ${order.credited})` })
        .where(eq(accounts.id, order.accountId))
        .returning({ diamonds: accounts.diamonds });
      return { accountId: order.accountId, diamonds: account?.diamonds ?? 0, credited: order.credited };
    });
    if (result) {
      console.log(`Pagamento ${orderId} estornado: -${result.credited} diamantes da conta ${result.accountId}`);
      applyLiveAccount(result.accountId, {
        diamonds: result.diamonds,
        notice: `Um pagamento foi estornado e ${result.credited} diamantes saíram da sua conta.`,
      });
      return;
    }
  }

  // Estorno de pedido que nunca foi pago, ou cobrança apagada: só fecha o pedido.
  await db()
    .update(paymentOrders)
    .set({ status: "canceled" })
    .where(and(eq(paymentOrders.id, orderId), eq(paymentOrders.status, "pending")));
  pixImages.delete(orderId);
}

function settleFromRemote(order: OrderRow, payment: AsaasPayment) {
  return settleOrder(order.id, settlementOf(payment), Math.round(payment.value * 100));
}

const lastRemoteCheck = new Map<number, number>();

/** Pergunta à Asaas como está a cobrança, sem repetir a pergunta em menos de alguns segundos. */
async function refreshFromRemote(order: OrderRow): Promise<OrderRow> {
  if (order.provider !== "asaas" || !order.providerId || order.status === "canceled" || order.status === "refunded") return order;
  const now = Date.now();
  if (now - (lastRemoteCheck.get(order.id) ?? 0) < REMOTE_CHECK_MS) return order;
  lastRemoteCheck.set(order.id, now);
  try {
    await settleFromRemote(order, await getPayment(order.providerId));
  } catch (error) {
    console.error(`Pagamento ${order.id}: falha ao consultar a Asaas`, error);
    return order;
  }
  const [fresh] = await db().select().from(paymentOrders).where(eq(paymentOrders.id, order.id));
  return fresh ?? order;
}

/** Confere de tempos em tempos os pedidos abertos, caso algum aviso da Asaas tenha se perdido. */
export function startPaymentReconciler() {
  if (paymentProvider() !== "asaas") return;
  const run = async () => {
    const since = new Date(Date.now() - ORDER_LIFETIME_MS);
    const open = await db()
      .select()
      .from(paymentOrders)
      .where(and(eq(paymentOrders.provider, "asaas"), eq(paymentOrders.status, "pending"), gte(paymentOrders.createdAt, since)))
      .orderBy(desc(paymentOrders.createdAt))
      .limit(50);
    for (const order of open) {
      if (!order.providerId) continue;
      try {
        await settleFromRemote(order, await getPayment(order.providerId));
      } catch (error) {
        console.error(`Conferência do pagamento ${order.id} falhou`, error);
      }
    }
    // Pedido antigo e nunca pago: fecha.
    await db()
      .update(paymentOrders)
      .set({ status: "canceled" })
      .where(and(eq(paymentOrders.status, "pending"), lt(paymentOrders.createdAt, since)));
  };
  setInterval(() => run().catch((error: unknown) => console.error("Conferência de pagamentos falhou", error)), RECONCILE_MS).unref();
}

// ---------------------------------------------------------------- rotas do jogador

const shop = createEndpoint("/api/payments/shop", { method: "GET" }, async (ctx) => {
  const account = await accountFromToken(bearerToken(ctx.getHeader("authorization")));
  if (!account) throw ctx.error("UNAUTHORIZED", { message: SESSION_EXPIRED });
  const [row] = await db()
    .select({ diamonds: accounts.diamonds, spentCents: accounts.spentCents, payerId: accounts.payerId })
    .from(accounts)
    .where(eq(accounts.id, account.id));
  const provider = paymentProvider();
  const settings = paymentSettings();
  const response: PaymentShopResponse = {
    enabled: provider !== null && settings.open,
    sandbox: paymentSandbox(),
    packs: packsOnSale(),
    firstPurchase: (row?.spentCents ?? 0) === 0 && settings.firstMultiplier > 1,
    firstMultiplier: settings.firstMultiplier,
    // No modo dev não existe cliente na Asaas: nome e CPF nunca são pedidos.
    hasPayer: provider === "dev" || (row?.payerId ?? "") !== "",
    diamonds: row?.diamonds ?? 0,
  };
  return ctx.json(response);
});

const create = createEndpoint("/api/payments", { method: "POST" }, async (ctx) => {
  const account = await accountFromToken(bearerToken(ctx.getHeader("authorization")));
  if (!account) throw ctx.error("UNAUTHORIZED", { message: SESSION_EXPIRED });
  const provider = paymentProvider();
  if (!provider || !paymentSettings().open) throw ctx.error("SERVICE_UNAVAILABLE", { message: "A loja de diamantes abre em breve." });

  const data = readBody(ctx.body);
  const found = packById(String(data.pack ?? ""));
  const pack = found?.enabled ? found : undefined;
  const method = String(data.method ?? "") as PaymentMethod;
  if (!pack || !PAYMENT_METHODS.includes(method)) throw ctx.error("BAD_REQUEST", { message: "Pacote inválido." });

  const [owner] = await db()
    .select({ payerId: accounts.payerId, banned: accounts.banned })
    .from(accounts)
    .where(eq(accounts.id, account.id));
  if (!owner || owner.banned) throw ctx.error("FORBIDDEN", { message: "Esta conta está bloqueada." });

  // Mesmo pacote pedido de novo em pouco tempo: devolve o pedido aberto em vez de gerar outra cobrança.
  const recent = new Date(Date.now() - PENDING_WINDOW_MS);
  const open = await db()
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.accountId, account.id), eq(paymentOrders.status, "pending"), gte(paymentOrders.createdAt, recent)))
    .orderBy(desc(paymentOrders.createdAt));
  const same = open.find((order) => order.pack === pack.id && order.method === method && order.provider === provider);
  if (same) {
    const response: PaymentOrderResponse = { order: await viewOf(same), diamonds: await accountBalance(account.id) };
    return ctx.json(response);
  }
  if (open.length >= MAX_PENDING) {
    throw ctx.error("TOO_MANY_REQUESTS", { message: "Você tem muitos pagamentos em aberto. Conclua um deles ou espere alguns minutos." });
  }

  // Primeira compra na Asaas: o CPF vai só para ela (exigência do Pix), aqui fica apenas o id do cliente.
  let payerId = owner.payerId;
  if (provider === "asaas" && !payerId) {
    const name = String(data.name ?? "").trim().replace(/\s+/g, " ");
    const cpf = onlyDigits(String(data.cpf ?? ""));
    const problem = validatePayerName(name) ?? (validCpf(cpf) ? null : "CPF inválido.");
    if (problem) throw ctx.error("BAD_REQUEST", { message: problem });
    try {
      payerId = await createCustomer({ name, cpf, accountId: account.id });
    } catch (error) {
      console.error(`Conta ${account.id}: não foi possível cadastrar o pagador`, error);
      const message = error instanceof AsaasError && error.status === 400 ? error.message : "Não foi possível falar com o pagamento agora.";
      throw ctx.error("BAD_REQUEST", { message });
    }
    await db().update(accounts).set({ payerId }).where(eq(accounts.id, account.id));
  }

  const [order] = await db()
    .insert(paymentOrders)
    .values({ accountId: account.id, pack: pack.id, method, priceCents: pack.priceCents, diamonds: pack.diamonds, provider })
    .returning();
  if (!order) throw ctx.error("INTERNAL_SERVER_ERROR", { message: "Não foi possível criar o pedido." });

  let saved: OrderRow;
  if (provider === "dev") {
    const [row] = await db()
      .update(paymentOrders)
      .set({
        providerId: `dev_${order.id}`,
        pixPayload: `00020126580014BR.GOV.BCB.PIX-ZUNA-TESTE-${order.id}-${pack.priceCents}`,
        pixExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .where(eq(paymentOrders.id, order.id))
      .returning();
    saved = row ?? order;
  } else {
    try {
      const payment = await createPayment({
        customer: payerId,
        method,
        priceCents: pack.priceCents,
        description: `Zuna: ${pack.diamonds} diamantes (${formatBRL(pack.priceCents)})`,
        orderId: order.id,
      });
      const pix = method === "pix" ? await getPixQrCode(payment.id) : null;
      if (pix) {
        pixImages.set(order.id, {
          image: `data:image/png;base64,${pix.encodedImage}`,
          payload: pix.payload,
          expiresAt: pix.expirationDate,
        });
      }
      const [row] = await db()
        .update(paymentOrders)
        .set({
          providerId: payment.id,
          checkoutUrl: payment.invoiceUrl ?? "",
          pixPayload: pix?.payload ?? "",
          pixExpiresAt: pix?.expirationDate ?? "",
        })
        .where(eq(paymentOrders.id, order.id))
        .returning();
      saved = row ?? order;
    } catch (error) {
      console.error(`Pedido ${order.id}: a Asaas recusou a cobrança`, error);
      await db().update(paymentOrders).set({ status: "canceled" }).where(eq(paymentOrders.id, order.id));
      const message = error instanceof AsaasError && error.status === 400 ? error.message : "Não foi possível gerar o pagamento agora. Tente de novo.";
      throw ctx.error("BAD_REQUEST", { message });
    }
  }

  const response: PaymentOrderResponse = { order: await viewOf(saved), diamonds: await accountBalance(account.id) };
  return ctx.json(response);
});

/** A tela de pagamento pergunta de tempos em tempos se já caiu. */
const status = createEndpoint("/api/payments/order", { method: "GET" }, async (ctx) => {
  const account = await accountFromToken(bearerToken(ctx.getHeader("authorization")));
  if (!account) throw ctx.error("UNAUTHORIZED", { message: SESSION_EXPIRED });
  const id = Number(ctx.query?.id);
  if (!Number.isInteger(id) || id <= 0) throw ctx.error("BAD_REQUEST", { message: "Pedido inválido." });
  const [row] = await db()
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.id, id), eq(paymentOrders.accountId, account.id)));
  if (!row) throw ctx.error("NOT_FOUND", { message: "Pedido não encontrado." });
  const order = row.status === "pending" ? await refreshFromRemote(row) : row;
  const response: PaymentOrderResponse = { order: await viewOf(order), diamonds: await accountBalance(account.id) };
  return ctx.json(response);
});

/** Só em desenvolvimento, sem chave da Asaas: finge que o pagamento caiu. */
const devPay = createEndpoint("/api/payments/dev-pay", { method: "POST" }, async (ctx) => {
  if (paymentProvider() !== "dev") throw ctx.error("NOT_FOUND", { message: "Não encontrado." });
  const account = await accountFromToken(bearerToken(ctx.getHeader("authorization")));
  if (!account) throw ctx.error("UNAUTHORIZED", { message: SESSION_EXPIRED });
  const id = Number(readBody(ctx.body).id);
  const [row] = await db()
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.id, id), eq(paymentOrders.accountId, account.id), eq(paymentOrders.provider, "dev")));
  if (!row) throw ctx.error("NOT_FOUND", { message: "Pedido não encontrado." });
  await settleOrder(row.id, "paid");
  return ctx.json({ ok: true });
});

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Aviso da Asaas. O corpo só diz qual cobrança mudou: o status de verdade é sempre
 * consultado na própria Asaas antes de creditar qualquer coisa.
 */
const webhook = createEndpoint("/api/payments/webhook", { method: "POST" }, async (ctx) => {
  const expected = webhookToken();
  const given = ctx.getHeader("asaas-access-token") ?? "";
  if (!expected || !sameSecret(given, expected)) {
    if (!expected) console.error("Webhook da Asaas recusado: ASAAS_WEBHOOK_TOKEN não está configurado.");
    throw ctx.error("UNAUTHORIZED", { message: "Token inválido." });
  }
  const data = readBody(ctx.body);
  const event = String(data.event ?? "");
  const payment = readBody(data.payment);
  const paymentId = String(payment.id ?? "");
  if (!event.startsWith("PAYMENT_") || !paymentId) return ctx.json({ ok: true });

  const reference = /^pedido-(\d+)$/.exec(String(payment.externalReference ?? ""));
  const [order] = await db()
    .select()
    .from(paymentOrders)
    .where(
      reference
        ? or(eq(paymentOrders.providerId, paymentId), eq(paymentOrders.id, Number(reference[1])))
        : eq(paymentOrders.providerId, paymentId),
    )
    .limit(1);
  // Cobrança que não é do jogo (feita direto no site da Asaas, por exemplo): só confirma o recebimento.
  if (!order || order.provider !== "asaas") return ctx.json({ ok: true });

  try {
    await settleFromRemote(order, await getPayment(order.providerId || paymentId));
  } catch (error) {
    // Responde erro para a Asaas tentar de novo mais tarde.
    console.error(`Webhook ${event} do pedido ${order.id} falhou`, error);
    throw ctx.error("INTERNAL_SERVER_ERROR", { message: "Tente de novo." });
  }
  return ctx.json({ ok: true });
});

// ---------------------------------------------------------------- painel

const adminPayments = createEndpoint("/api/admin/payments", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });

  const filter = String(ctx.query?.status ?? "");
  const statuses = ["pending", "paid", "refunded", "canceled"];
  const rows = await db()
    .select({ order: paymentOrders, username: accounts.username })
    .from(paymentOrders)
    .innerJoin(accounts, eq(accounts.id, paymentOrders.accountId))
    .where(statuses.includes(filter) ? eq(paymentOrders.status, filter) : undefined)
    .orderBy(desc(paymentOrders.createdAt))
    .limit(200);

  const dayStart = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()) + "T00:00:00-03:00");
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const paid = eq(paymentOrders.status, "paid");
  const [totals] = await db()
    .select({
      today: sql<number>`cast(coalesce(sum(${paymentOrders.priceCents}) filter (where ${paid} and ${paymentOrders.paidAt} >= ${dayStart}), 0) as integer)`,
      month: sql<number>`cast(coalesce(sum(${paymentOrders.priceCents}) filter (where ${paid} and ${paymentOrders.paidAt} >= ${monthAgo}), 0) as integer)`,
      total: sql<number>`cast(coalesce(sum(${paymentOrders.priceCents}) filter (where ${paid}), 0) as integer)`,
      paidCount: sql<number>`cast(count(*) filter (where ${paid}) as integer)`,
      payers: sql<number>`cast(count(distinct ${paymentOrders.accountId}) filter (where ${paid}) as integer)`,
      pending: sql<number>`cast(count(*) filter (where ${paymentOrders.status} = 'pending') as integer)`,
      refunded: sql<number>`cast(coalesce(sum(${paymentOrders.priceCents}) filter (where ${paymentOrders.status} = 'refunded'), 0) as integer)`,
    })
    .from(paymentOrders);

  const response: AdminPaymentsResponse = {
    orders: rows.map(({ order, username }) => ({
      id: order.id,
      accountId: order.accountId,
      username,
      pack: order.pack,
      diamonds: order.diamonds,
      method: order.method as PaymentMethod,
      priceCents: order.priceCents,
      status: order.status as PaymentStatus,
      credited: order.credited,
      providerId: order.providerId,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
    })),
    revenueToday: totals?.today ?? 0,
    revenue30d: totals?.month ?? 0,
    revenueTotal: totals?.total ?? 0,
    paidCount: totals?.paidCount ?? 0,
    payers: totals?.payers ?? 0,
    pendingCount: totals?.pending ?? 0,
    refundedCents: totals?.refunded ?? 0,
    enabled: paymentProvider() !== null,
    sandbox: paymentSandbox(),
    webhook: webhookToken() !== "",
  };
  return ctx.json(response);
});

/** Conferir agora um pedido na Asaas (botão do painel). */
const adminRecheck = createEndpoint("/api/admin/payments/check", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const id = Number(readBody(ctx.body).id);
  const [row] = await db().select().from(paymentOrders).where(eq(paymentOrders.id, id));
  if (!row) throw ctx.error("NOT_FOUND", { message: "Pedido não encontrado." });
  if (row.provider === "asaas" && row.providerId) {
    lastRemoteCheck.delete(row.id);
    try {
      await settleFromRemote(row, await getPayment(row.providerId));
    } catch (error) {
      throw ctx.error("BAD_GATEWAY", { message: error instanceof Error ? error.message : "A Asaas não respondeu." });
    }
  }
  const [fresh] = await db().select({ status: paymentOrders.status }).from(paymentOrders).where(eq(paymentOrders.id, id));
  return ctx.json({ status: fresh?.status ?? row.status });
});

/** Estorna um pedido pago: a Asaas devolve o dinheiro e os diamantes saem da conta. */
const adminRefund = createEndpoint("/api/admin/payments/refund", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const id = Number(readBody(ctx.body).id);
  const [row] = await db().select().from(paymentOrders).where(eq(paymentOrders.id, id));
  if (!row) throw ctx.error("NOT_FOUND", { message: "Pedido não encontrado." });
  if (row.status !== "paid") throw ctx.error("BAD_REQUEST", { message: "Só dá para estornar pedido pago." });
  if (row.provider === "asaas") {
    try {
      await refundPayment(row.providerId, `Estorno pelo painel (pedido ${row.id})`);
    } catch (error) {
      throw ctx.error("BAD_GATEWAY", { message: error instanceof Error ? error.message : "A Asaas não respondeu." });
    }
  }
  // Não espera o webhook: tira os diamantes já.
  await settleOrder(row.id, "refunded");
  await logAdminAction({ accountId: admin.id, action: "estorno de diamantes", detail: { pedido: row.id }, targetAccountId: row.accountId });
  return ctx.json({ ok: true });
});

// ---------------------------------------------------------------- pacotes e oferta

async function packsResponse(): Promise<AdminPacksResponse> {
  const sales = await db()
    .select({
      pack: paymentOrders.pack,
      sold: sql<number>`cast(count(*) as integer)`,
      revenue: sql<number>`cast(coalesce(sum(${paymentOrders.priceCents}), 0) as integer)`,
    })
    .from(paymentOrders)
    .where(eq(paymentOrders.status, "paid"))
    .groupBy(paymentOrders.pack);
  const byPack = new Map(sales.map((row) => [row.pack, row]));
  const packs: AdminPackRow[] = allPacks().map((pack) => ({
    pack,
    sold: byPack.get(pack.id)?.sold ?? 0,
    revenueCents: byPack.get(pack.id)?.revenue ?? 0,
  }));
  return { packs, settings: paymentSettings() };
}

const adminPacks = createEndpoint("/api/admin/payments/packs", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await packsResponse());
});

function whole(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, Math.round(number)));
}

const adminPackSave = createEndpoint("/api/admin/payments/pack", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = String(body.id ?? "");
  const current = id ? packById(id) : undefined;
  if (id && !current) throw ctx.error("NOT_FOUND", { message: "Pacote não encontrado." });

  if (current && body.remove === true) {
    await removePack(current.id);
    await logAdminAction({ accountId: admin.id, action: "pacote apagado", detail: current });
    return ctx.json(await packsResponse());
  }
  if (current && body.move !== undefined) {
    await movePack(current.id, Number(body.move));
    return ctx.json(await packsResponse());
  }

  if (!current && allPacks().length >= PACK_LIMIT) throw ctx.error("BAD_REQUEST", { message: `No máximo ${PACK_LIMIT} pacotes.` });
  const priceCents = whole(body.priceCents ?? current?.priceCents, PACK_MIN_PRICE_CENTS, PACK_MAX_PRICE_CENTS);
  const diamonds = whole(body.diamonds ?? current?.diamonds, 1, PACK_MAX_DIAMONDS);
  if (priceCents === null || diamonds === null) throw ctx.error("BAD_REQUEST", { message: "Preço e diamantes precisam ser números." });
  const pack: DiamondPack = {
    // Pedidos antigos guardam o id: pacote novo ganha um id que nunca se repete.
    id: current?.id ?? `p${Date.now().toString(36)}`,
    priceCents,
    diamonds,
    bonusPercent: whole(body.bonusPercent ?? current?.bonusPercent ?? 0, 0, 1000) ?? 0,
    tag: String(body.tag ?? current?.tag ?? "").trim().slice(0, 24),
    enabled: typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true),
  };
  await savePack(pack, !current);
  await logAdminAction({ accountId: admin.id, action: current ? "pacote alterado" : "pacote criado", detail: pack });
  return ctx.json(await packsResponse());
});

const adminPaymentSettings = createEndpoint("/api/admin/payments/settings", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const multiplier = Number(body.firstMultiplier);
  await saveSettings({
    open: typeof body.open === "boolean" ? body.open : undefined,
    firstMultiplier: Number.isFinite(multiplier) ? Math.min(PACK_MAX_MULTIPLIER, Math.max(1, multiplier)) : undefined,
  });
  await logAdminAction({ accountId: admin.id, action: "loja de diamantes", detail: paymentSettings() });
  return ctx.json(await packsResponse());
});

export const paymentRoutes = {
  shop,
  create,
  status,
  devPay,
  webhook,
  adminPayments,
  adminRecheck,
  adminRefund,
  adminPacks,
  adminPackSave,
  adminPaymentSettings,
};

// Conversa com a API da Asaas (v3). A chave vem de ASAAS_API_KEY e define o ambiente:
// "$aact_prod_..." cobra de verdade; qualquer outra vai para o sandbox, onde nada é cobrado.
// Sem chave, em desenvolvimento, os pedidos são de mentira e dá para "pagar" pelo próprio jogo.

const PRODUCTION_URL = "https://api.asaas.com/v3";
const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const USER_AGENT = "Zuna/1.0 (Node.js; jogo)";
const TIMEOUT_MS = 15_000;

const apiKey = (process.env.ASAAS_API_KEY ?? "").trim();
const production = process.env.NODE_ENV === "production";

export type PaymentProvider = "asaas" | "dev";

/** Qual provedor atende os pedidos agora, ou null se pagamento está desligado. */
export function paymentProvider(): PaymentProvider | null {
  if (apiKey) return "asaas";
  return production ? null : "dev";
}

/** Chave de sandbox (ou modo dev): nada é cobrado. */
export function paymentSandbox(): boolean {
  return !apiKey.startsWith("$aact_prod_");
}

export function webhookToken(): string {
  return (process.env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
}

export class AsaasError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${paymentSandbox() ? SANDBOX_URL : PRODUCTION_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", "user-agent": USER_AGENT, access_token: apiKey },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // A Asaas responde { errors: [{ code, description }] }: a descrição já vem em português.
    const errors = (data as { errors?: { description?: string }[] } | null)?.errors;
    const description = errors?.map((error) => error.description).filter(Boolean).join(" ") || `HTTP ${response.status}`;
    throw new AsaasError(description, response.status);
  }
  return data as T;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  billingType: string;
  invoiceUrl: string;
  externalReference: string | null;
  deleted?: boolean;
}

export interface AsaasPix {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export async function createCustomer(params: { name: string; cpf: string; accountId: number }): Promise<string> {
  const customer = await request<{ id: string }>("POST", "/customers", {
    name: params.name,
    cpfCnpj: params.cpf,
    externalReference: `conta-${params.accountId}`,
    // Quem avisa o jogador é o jogo: sem e-mail nem SMS da Asaas.
    notificationDisabled: true,
  });
  return customer.id;
}

/** Data de hoje no horário de Brasília, "AAAA-MM-DD". */
function todayInBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export async function createPayment(params: {
  customer: string;
  method: "pix" | "card";
  priceCents: number;
  description: string;
  orderId: number;
}): Promise<AsaasPayment> {
  return request<AsaasPayment>("POST", "/payments", {
    customer: params.customer,
    billingType: params.method === "pix" ? "PIX" : "CREDIT_CARD",
    value: params.priceCents / 100,
    dueDate: todayInBrazil(),
    description: params.description,
    externalReference: `pedido-${params.orderId}`,
  });
}

export function getPayment(id: string): Promise<AsaasPayment> {
  return request<AsaasPayment>("GET", `/payments/${encodeURIComponent(id)}`);
}

export function getPixQrCode(id: string): Promise<AsaasPix> {
  return request<AsaasPix>("GET", `/payments/${encodeURIComponent(id)}/pixQrCode`);
}

/** O que o status da Asaas significa para o jogo. */
export function settlementOf(payment: AsaasPayment): "paid" | "refunded" | "canceled" | "pending" {
  if (payment.deleted) return "canceled";
  switch (payment.status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "refunded";
    default:
      return "pending";
  }
}

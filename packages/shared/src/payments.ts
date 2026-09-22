// Compra de diamantes com dinheiro de verdade (Pix ou cartão, pela Asaas).
// O preço fica sempre em centavos, e só o servidor decide quantos diamantes cada pagamento vale.

export interface DiamondPack {
  id: string;
  /** Preço em centavos de real. */
  priceCents: number;
  diamonds: number;
  /** Bônus em % sobre o pacote básico, só para mostrar na vitrine. */
  bonusPercent: number;
  /** Destaque na vitrine ("Mais vendido"). Vazio = sem destaque. */
  tag: string;
  /** Fora da loja: some da vitrine, mas os pedidos antigos continuam valendo. */
  enabled: boolean;
}

/** Pacotes de fábrica: entram no banco no primeiro arranque; depois quem manda é o painel. */
export const DIAMOND_PACKS: readonly DiamondPack[] = [
  { id: "d50", priceCents: 490, diamonds: 50, bonusPercent: 0, tag: "", enabled: true },
  { id: "d105", priceCents: 990, diamonds: 105, bonusPercent: 5, tag: "", enabled: true },
  { id: "d275", priceCents: 2490, diamonds: 275, bonusPercent: 10, tag: "Mais vendido", enabled: true },
  { id: "d575", priceCents: 4990, diamonds: 575, bonusPercent: 15, tag: "", enabled: true },
  { id: "d1200", priceCents: 9990, diamonds: 1200, bonusPercent: 20, tag: "", enabled: true },
  { id: "d3100", priceCents: 24990, diamonds: 3100, bonusPercent: 24, tag: "", enabled: true },
  { id: "d6500", priceCents: 49990, diamonds: 6500, bonusPercent: 30, tag: "Melhor valor", enabled: true },
];

/** Configuração da loja de diamantes, mudada pelo painel. */
export interface PaymentSettings {
  /** Loja aberta para os jogadores (com a chave da Asaas configurada). */
  open: boolean;
  /** A primeira recarga da conta vale tantas vezes os diamantes (1 = sem oferta). */
  firstMultiplier: number;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { open: true, firstMultiplier: 2 };

/** Limites do painel. */
export const PACK_MAX_PRICE_CENTS = 500_000;
export const PACK_MIN_PRICE_CENTS = 100;
export const PACK_MAX_DIAMONDS = 1_000_000;
export const PACK_MAX_MULTIPLIER = 5;
export const PACK_LIMIT = 20;

export type PaymentMethod = "pix" | "card";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["pix", "card"];

export type PaymentStatus = "pending" | "paid" | "refunded" | "canceled";

/** "R$ 24,90". */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Só os dígitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** CPF com os dígitos verificadores certos (não aceita 111.111.111-11 e parecidos). */
export function validCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(cpf[size])) return false;
  }
  return true;
}

/** "12345678909" → "123.456.789-09", aceitando digitação pela metade. */
export function formatCpf(value: string): string {
  const cpf = onlyDigits(value).slice(0, 11);
  return cpf
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function validatePayerName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 5 || !clean.includes(" ")) return "Digite seu nome completo.";
  if (clean.length > 80) return "Nome muito longo.";
  return null;
}

// ---------------------------------------------------------------- API do jogador

export interface PaymentShopResponse {
  /** Falso quando o servidor ainda não tem a chave da Asaas ou o painel fechou a loja. */
  enabled: boolean;
  /** Pagamentos de teste (sandbox): nada é cobrado de verdade. */
  sandbox: boolean;
  packs: DiamondPack[];
  /** A próxima compra ainda ganha a oferta de primeira recarga. */
  firstPurchase: boolean;
  /** Quantas vezes a primeira recarga multiplica os diamantes (1 = sem oferta). */
  firstMultiplier: number;
  /** A conta já tem nome e CPF cadastrados no pagamento: não precisa pedir de novo. */
  hasPayer: boolean;
  diamonds: number;
}

export interface CreatePaymentRequest {
  pack: string;
  method: PaymentMethod;
  /** Só na primeira compra da conta. */
  name?: string;
  cpf?: string;
}

export interface PaymentPix {
  /** PNG do QR Code em base64, pronto para <img src>. */
  image: string;
  /** Pix copia e cola. */
  payload: string;
  expiresAt: string;
}

export interface PaymentOrderView {
  id: number;
  pack: string;
  /** Diamantes do pacote na hora do pedido (sem a oferta de primeira recarga). */
  diamonds: number;
  method: PaymentMethod;
  priceCents: number;
  status: PaymentStatus;
  /** Diamantes que entraram na conta (com o dobro da primeira recarga), quando pago. */
  credited: number;
  createdAt: string;
  paidAt: string | null;
  /** Página de pagamento da Asaas (cartão). */
  checkoutUrl: string;
  pix: PaymentPix | null;
}

export interface PaymentOrderResponse {
  order: PaymentOrderView;
  /** Saldo atual da conta. */
  diamonds: number;
}

// ---------------------------------------------------------------- painel

export interface AdminPaymentRow {
  id: number;
  accountId: number;
  username: string;
  pack: string;
  diamonds: number;
  method: PaymentMethod;
  priceCents: number;
  status: PaymentStatus;
  credited: number;
  providerId: string;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminPaymentsResponse {
  orders: AdminPaymentRow[];
  /** Receita (em centavos) de pedidos pagos. */
  revenueToday: number;
  revenue30d: number;
  revenueTotal: number;
  paidCount: number;
  payers: number;
  pendingCount: number;
  refundedCents: number;
  enabled: boolean;
  sandbox: boolean;
  /** O webhook tem token configurado. */
  webhook: boolean;
}

export interface AdminPackRow {
  pack: DiamondPack;
  /** Pedidos pagos deste pacote e quanto renderam. */
  sold: number;
  revenueCents: number;
}

export interface AdminPacksResponse {
  packs: AdminPackRow[];
  settings: PaymentSettings;
}

/** Criar (id vazio), mudar, mover ou apagar um pacote. */
export interface AdminPackRequest {
  id: string;
  priceCents?: number;
  diamonds?: number;
  bonusPercent?: number;
  tag?: string;
  enabled?: boolean;
  /** -1 sobe, 1 desce. */
  move?: number;
  remove?: boolean;
}

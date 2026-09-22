// Compra de diamantes com dinheiro de verdade (Pix ou cartão, pela Asaas).
// O preço fica sempre em centavos, e só o servidor decide quantos diamantes cada pagamento vale.

export interface DiamondPack {
  id: string;
  /** Preço em centavos de real. */
  priceCents: number;
  diamonds: number;
  /** Bônus em % sobre o pacote básico, só para mostrar na vitrine. */
  bonusPercent: number;
  /** Destaque na vitrine. */
  tag?: string;
}

export const DIAMOND_PACKS: readonly DiamondPack[] = [
  { id: "d50", priceCents: 490, diamonds: 50, bonusPercent: 0 },
  { id: "d105", priceCents: 990, diamonds: 105, bonusPercent: 5 },
  { id: "d275", priceCents: 2490, diamonds: 275, bonusPercent: 10, tag: "Mais vendido" },
  { id: "d575", priceCents: 4990, diamonds: 575, bonusPercent: 15 },
  { id: "d1200", priceCents: 9990, diamonds: 1200, bonusPercent: 20 },
  { id: "d3100", priceCents: 24990, diamonds: 3100, bonusPercent: 24 },
  { id: "d6500", priceCents: 49990, diamonds: 6500, bonusPercent: 30, tag: "Melhor valor" },
];

/** A primeira recarga da conta, de qualquer valor, vale diamantes em dobro. */
export const FIRST_PURCHASE_MULTIPLIER = 2;

export function diamondPack(id: string): DiamondPack | undefined {
  return DIAMOND_PACKS.find((pack) => pack.id === id);
}

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
  /** Falso quando o servidor ainda não tem a chave da Asaas configurada. */
  enabled: boolean;
  /** Pagamentos de teste (sandbox): nada é cobrado de verdade. */
  sandbox: boolean;
  packs: DiamondPack[];
  /** A próxima compra ainda vale em dobro. */
  firstPurchase: boolean;
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

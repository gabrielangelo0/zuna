import {
  formatBRL,
  formatCpf,
  onlyDigits,
  validCpf,
  validatePayerName,
  type CreatePaymentRequest,
  type DiamondPack,
  type PaymentMethod,
  type PaymentOrderResponse,
  type PaymentOrderView,
  type PaymentShopResponse,
} from "@zuna/shared";
import { apiRequest } from "./api.ts";
import { element, formatNumber, messageOf } from "./dom.ts";

// Loja de diamantes: escolhe o pacote, paga com Pix (QR Code aqui mesmo) ou cartão (página da Asaas)
// e espera a confirmação. Quem credita é sempre o servidor; esta tela só pergunta se já caiu.

const POLL_MS = 3_000;

type Step =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "packs" }
  | { kind: "checkout"; pack: DiamondPack; method: PaymentMethod }
  | { kind: "waiting"; order: PaymentOrderView }
  | { kind: "done"; order: PaymentOrderView };

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** "×2", "×1,5". */
function times(multiplier: number): string {
  return `×${multiplier.toLocaleString("pt-BR")}`;
}

/** Diamantes que o pacote rende agora, com a oferta de primeira recarga quando ela vale. */
function packTotal(diamonds: number, shop: PaymentShopResponse | null): number {
  return shop?.firstPurchase ? Math.round(diamonds * shop.firstMultiplier) : diamonds;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = make("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

export class DiamondShop {
  private readonly root = element("#shop");
  private readonly body = element("#shop-body");
  private readonly balance = element("#shop-diamonds");
  private token: string | null = null;
  private shop: PaymentShopResponse | null = null;
  private step: Step = { kind: "loading" };
  private pollTimer = 0;
  /** Muda a cada troca de tela: resposta de uma tela antiga é descartada. */
  private version = 0;

  constructor() {
    element("#shop-close").addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setToken(token: string) {
    this.token = token;
  }

  setDiamonds(value: number) {
    this.balance.textContent = formatNumber(value);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.root.hidden = false;
    // Pagamento em andamento continua de onde parou.
    if (this.step.kind === "waiting") {
      this.render();
      this.poll();
      return;
    }
    void this.load();
  }

  close() {
    this.root.hidden = true;
    window.clearTimeout(this.pollTimer);
    if (this.step.kind === "done" || this.step.kind === "error") this.step = { kind: "packs" };
  }

  private go(step: Step) {
    this.step = step;
    this.version++;
    window.clearTimeout(this.pollTimer);
    this.render();
  }

  private async load() {
    this.go({ kind: "loading" });
    const version = this.version;
    try {
      const shop = await apiRequest<PaymentShopResponse>("/api/payments/shop", { token: this.token });
      if (version !== this.version) return;
      this.shop = shop;
      this.setDiamonds(shop.diamonds);
      this.go({ kind: "packs" });
    } catch (error) {
      if (version === this.version) this.go({ kind: "error", message: messageOf(error) });
    }
  }

  private render() {
    const step = this.step;
    const view =
      step.kind === "loading"
        ? make("p", "shop-note", "Abrindo a loja…")
        : step.kind === "error"
          ? this.renderError(step.message)
          : step.kind === "packs"
            ? this.renderPacks()
            : step.kind === "checkout"
              ? this.renderCheckout(step.pack, step.method)
              : step.kind === "waiting"
                ? this.renderWaiting(step.order)
                : this.renderDone(step.order);
    this.body.replaceChildren(view);
  }

  private renderError(message: string): HTMLElement {
    const box = make("div", "shop-center");
    box.append(make("p", "status", message), button("Tentar de novo", "secondary", () => void this.load()));
    return box;
  }

  // ---------------------------------------------------------------- vitrine

  private renderPacks(): HTMLElement {
    const shop = this.shop;
    const box = make("div", "shop-packs-view");
    if (!shop) return box;
    if (!shop.enabled) {
      box.append(make("p", "shop-note", "A loja de diamantes abre em breve. Fique de olho!"));
      return box;
    }
    if (shop.sandbox) box.append(make("p", "shop-sandbox", "Modo de teste: nenhum valor é cobrado de verdade."));
    if (shop.firstPurchase) {
      const banner = make("div", "shop-first");
      const double = shop.firstMultiplier === 2;
      banner.append(
        make("strong", "", double ? "Primeira recarga em dobro!" : `Primeira recarga ${times(shop.firstMultiplier)}!`),
        make(
          "span",
          "",
          double
            ? "Qualquer pacote vale o dobro de diamantes na sua primeira compra."
            : `Qualquer pacote vale ${times(shop.firstMultiplier)} diamantes na sua primeira compra.`,
        ),
      );
      box.append(banner);
    }
    const grid = make("div", "shop-packs");
    shop.packs.forEach((pack, index) => grid.append(this.packCard(pack, index, shop.firstPurchase)));
    box.append(grid, make("p", "shop-foot", "Pagamento seguro pela Asaas. Pix cai na hora; cartão em até alguns minutos."));
    return box;
  }

  private packCard(pack: DiamondPack, index: number, first: boolean): HTMLElement {
    const card = make("article", "shop-pack");
    card.style.setProperty("--gem-size", `${30 + Math.min(index, 6) * 5}px`);
    if (pack.tag) card.append(make("span", "shop-tag", pack.tag));
    const gems = make("div", "shop-gems", "💎".repeat(Math.min(3, 1 + Math.floor(index / 2))));
    const amount = make("div", "shop-amount");
    const total = packTotal(pack.diamonds, this.shop);
    amount.append(make("strong", "", formatNumber(total)));
    if (first) amount.append(make("s", "", formatNumber(pack.diamonds)));
    const extras = make("div", "shop-extras");
    if (pack.bonusPercent > 0) extras.append(make("span", "shop-bonus", `+${pack.bonusPercent}% bônus`));
    if (first) extras.append(make("span", "shop-bonus double", times(this.shop?.firstMultiplier ?? 1)));
    const buy = button(formatBRL(pack.priceCents), "primary small", () => this.go({ kind: "checkout", pack, method: "pix" }));
    card.append(gems, amount, extras, buy);
    return card;
  }

  // ---------------------------------------------------------------- pagamento

  private renderCheckout(pack: DiamondPack, method: PaymentMethod): HTMLElement {
    const shop = this.shop;
    const form = make("form", "shop-checkout");
    form.noValidate = true;
    const submit = make("button", "primary");

    const summary = make("div", "shop-summary");
    const total = packTotal(pack.diamonds, shop);
    summary.append(
      make("span", "shop-summary-gems", `💎 ${formatNumber(total)} diamantes`),
      make("strong", "shop-summary-price", formatBRL(pack.priceCents)),
    );
    form.append(summary);

    const methods = make("div", "shop-methods");
    methods.setAttribute("role", "radiogroup");
    const options: [PaymentMethod, string, string][] = [
      ["pix", "Pix", "Cai na hora"],
      ["card", "Cartão de crédito", "Página segura da Asaas"],
    ];
    // Trocar a forma de pagamento não redesenha o formulário, para não perder o que já foi digitado.
    const choices: HTMLButtonElement[] = [];
    const pick = (value: PaymentMethod) => {
      method = value;
      this.step = { kind: "checkout", pack, method };
      choices.forEach((choice, index) => {
        const active = options[index]?.[0] === value;
        choice.classList.toggle("active", active);
        choice.setAttribute("aria-checked", String(active));
      });
      submit.textContent = value === "pix" ? "Gerar Pix" : "Pagar com cartão";
    };
    for (const [value, label, hint] of options) {
      const choice = button("", "shop-method", () => pick(value));
      choice.setAttribute("role", "radio");
      choice.append(make("strong", "", label), make("small", "", hint));
      choices.push(choice);
      methods.append(choice);
    }
    form.append(methods);

    // Nome e CPF só na primeira compra: a Asaas exige para gerar o Pix e guarda por nós.
    let nameInput: HTMLInputElement | null = null;
    let cpfInput: HTMLInputElement | null = null;
    if (shop && !shop.hasPayer) {
      const fields = make("div", "shop-fields");
      nameInput = make("input");
      nameInput.placeholder = "Nome completo";
      nameInput.autocomplete = "name";
      nameInput.maxLength = 80;
      cpfInput = make("input");
      cpfInput.placeholder = "CPF";
      cpfInput.inputMode = "numeric";
      cpfInput.maxLength = 14;
      const cpf = cpfInput;
      cpf.addEventListener("input", () => (cpf.value = formatCpf(cpf.value)));
      fields.append(
        nameInput,
        cpfInput,
        make("small", "shop-note", "Pedido só na primeira compra, para emitir o pagamento. O CPF fica com a Asaas, não com o jogo."),
      );
      form.append(fields);
    }

    const consent = make("label", "shop-consent");
    const check = make("input");
    check.type = "checkbox";
    consent.append(check, make("span", "", "Tenho 18 anos ou mais, ou a autorização do meu responsável para esta compra."));
    form.append(consent);

    const status = make("p", "status");
    status.hidden = true;
    submit.type = "submit";
    pick(method);
    const actions = make("div", "shop-actions");
    actions.append(button("Voltar", "secondary", () => this.go({ kind: "packs" })), submit);
    form.append(status, actions);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      status.hidden = true;
      const fail = (message: string) => {
        status.textContent = message;
        status.hidden = false;
      };
      const request: CreatePaymentRequest = { pack: pack.id, method };
      if (nameInput && cpfInput) {
        const problem = validatePayerName(nameInput.value) ?? (validCpf(cpfInput.value) ? null : "CPF inválido.");
        if (problem) return fail(problem);
        request.name = nameInput.value.trim();
        request.cpf = onlyDigits(cpfInput.value);
      }
      if (!check.checked) return fail("Confirme a idade (ou a autorização do responsável) para continuar.");
      void this.submit(request, submit, fail);
    });
    return form;
  }

  private async submit(request: CreatePaymentRequest, submit: HTMLButtonElement, fail: (message: string) => void) {
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = "Gerando…";
    // A página do cartão precisa abrir no clique; senão o navegador bloqueia a janela nova.
    const popup = request.method === "card" ? window.open("", "_blank") : null;
    const version = this.version;
    try {
      const response = await apiRequest<PaymentOrderResponse>("/api/payments", { method: "POST", body: request, token: this.token });
      if (this.shop && request.name) this.shop.hasPayer = true;
      if (popup && response.order.checkoutUrl) popup.location.href = response.order.checkoutUrl;
      else popup?.close();
      if (version !== this.version) return;
      this.go({ kind: "waiting", order: response.order });
      this.poll();
    } catch (error) {
      popup?.close();
      submit.disabled = false;
      submit.textContent = label;
      fail(messageOf(error));
    }
  }

  // ---------------------------------------------------------------- esperando

  private renderWaiting(order: PaymentOrderView): HTMLElement {
    const box = make("div", "shop-waiting");
    box.append(make("p", "shop-waiting-title", `${formatBRL(order.priceCents)} · 💎 ${formatNumber(packTotal(order.diamonds, this.shop))}`));

    if (order.method === "pix" && order.pix) {
      const qr = make("img", "shop-qr");
      qr.src = order.pix.image;
      qr.alt = "QR Code do Pix";
      const code = make("input", "shop-pix-code");
      code.readOnly = true;
      code.value = order.pix.payload;
      code.addEventListener("focus", () => code.select());
      const copy = button("Copiar código Pix", "primary small", () => {
        void navigator.clipboard?.writeText(order.pix?.payload ?? "").then(
          () => (copy.textContent = "Copiado!"),
          () => code.select(),
        );
      });
      box.append(
        make("p", "shop-note", "Abra o app do seu banco, escolha Pix e leia o QR Code — ou use o copia e cola."),
        qr,
        code,
        copy,
      );
    } else if (order.method === "pix") {
      box.append(make("p", "status", "Não foi possível carregar o QR Code. Feche e abra a loja de novo."));
    } else {
      box.append(make("p", "shop-note", "Termine o pagamento na página da Asaas que abriu. Se ela não abriu, use o botão abaixo."));
      if (order.checkoutUrl) {
        const link = make("a", "primary", "Abrir página de pagamento");
        link.href = order.checkoutUrl;
        link.target = "_blank";
        link.rel = "noopener";
        box.append(link);
      }
    }

    const waiting = make("p", "shop-spinner", "Aguardando a confirmação do pagamento…");
    box.append(waiting);
    // Sem chave da Asaas (desenvolvimento): um botão finge que o pagamento caiu.
    if (this.shop?.sandbox && order.checkoutUrl === "") {
      box.append(
        button("Simular pagamento (teste)", "secondary small", () => {
          void apiRequest("/api/payments/dev-pay", { method: "POST", body: { id: order.id }, token: this.token }).then(() => this.poll(0));
        }),
      );
    }
    box.append(button("Escolher outro pacote", "link", () => this.go({ kind: "packs" })));
    return box;
  }

  private poll(delay = POLL_MS) {
    window.clearTimeout(this.pollTimer);
    if (this.step.kind !== "waiting" || !this.isOpen) return;
    const orderId = this.step.order.id;
    const version = this.version;
    this.pollTimer = window.setTimeout(async () => {
      try {
        const response = await apiRequest<PaymentOrderResponse>(`/api/payments/order?id=${orderId}`, { token: this.token });
        if (version !== this.version) return;
        this.setDiamonds(response.diamonds);
        if (response.order.status === "paid") {
          if (this.shop) {
            this.shop.firstPurchase = false;
            this.shop.diamonds = response.diamonds;
          }
          this.go({ kind: "done", order: response.order });
          return;
        }
        if (response.order.status !== "pending") {
          this.go({ kind: "error", message: "Este pagamento foi cancelado. Escolha o pacote de novo." });
          return;
        }
      } catch {
        // Falha de rede passageira: tenta de novo no próximo ciclo.
      }
      this.poll();
    }, delay);
  }

  private renderDone(order: PaymentOrderView): HTMLElement {
    const box = make("div", "shop-done");
    box.append(
      make("div", "shop-done-gem", "💎"),
      make("strong", "shop-done-amount", `+${formatNumber(order.credited)}`),
      make("p", "", "Pagamento confirmado! Os diamantes já estão na sua conta."),
      button("Ir para o guarda-roupa", "primary", () => {
        this.close();
        document.querySelector<HTMLButtonElement>("#hud-wardrobe")?.click();
      }),
      button("Continuar jogando", "link", () => this.close()),
    );
    return box;
  }
}

import {
  EMPTY_STATS,
  EQUIP_SLOTS,
  RARITY,
  SLOT_LABEL,
  appearanceOf,
  describeStats,
  gearItem,
  gearList,
  looksOf,
  playerStats,
  rarityCss,
  type EquipSlot,
  type GearDef,
  type GearStats,
  type InventoryEvent,
  type OwnedItem,
  type PlayerData,
} from "@zuna/shared";
import { element, formatNumber } from "./dom.ts";
import { iconElement } from "./itemIcons.ts";
import { LookPreview } from "./lookPreview.ts";

// Personagem e mochila (tecla I), no estilo Tibia/Minecraft: os 10 espaços do corpo em volta
// do boneco, a grade da mochila embaixo, arrastar e soltar entre eles e a loja numa aba.
// Tudo é decidido no servidor; aqui só mostra e manda o pedido.

export interface InventoryHandlers {
  move(uid: number, to: EquipSlot | "bag", index?: number, count?: number): void;
  equip(uid: number): void;
  use(uid: number): void;
  sell(uid: number, count: number): void;
  buy(id: string, currency: "gold" | "diamonds", count: number): void;
  buyDiamonds(): void;
}

type Tab = "bag" | "shop";

/** Onde soltar: um espaço do corpo ou uma casa da grade. */
type Drop = { slot: EquipSlot } | { index: number };

const STAT_ROWS: [keyof GearStats, string][] = [
  ["attack", "Ataque"],
  ["defense", "Defesa"],
  ["hp", "Vida"],
  ["mana", "Mana"],
];

/** Silhuetas dos espaços vazios (como os contornos cinza do Tibia), 24×24. */
const SILHOUETTE: Record<EquipSlot, string> = {
  helmet: "M5 14c0-5 3-9 7-9s7 4 7 9v4h-3v-4h-2v5h-4v-5H8v4H5z",
  amulet: "M5 4c0 5 3 8 7 9 4-1 7-4 7-9M12 13v2m-3 1.5a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  backpack: "M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m-10 2.5A2.5 2.5 0 0 1 8.5 6h7A2.5 2.5 0 0 1 18 8.5V20H6zM9 12h6v4H9z",
  weapon: "M19 3l-9 9m9-9h-4m4 0v4M10 12l-3 3m1.5-4.5 4 4M6 16l-2 4 4-2",
  armor: "M8 4 5 6v5l2 1v8h10v-8l2-1V6l-3-2-2 2h-4z",
  shield: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z",
  ring: "M9 7h6l-1.5-3h-3zm3 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10",
  legs: "M7 3h10v6l-1 11h-3l-1-8-1 8H8L7 9z",
  ammo: "M5 19 17 7m0 0h-4m4 0v4M4 20l2-2m-2 0 2 2",
  boots: "M7 4h4v9l7 3v4H6V14z",
};

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = make("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function silhouette(slot: EquipSlot): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "slot-ghost");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", SILHOUETTE[slot]);
  svg.append(path);
  return svg;
}

/** Ícone do item no espaço, com moldura da raridade e a quantidade no canto (pilhas). */
function itemContent(owned: OwnedItem, size: number): HTMLElement {
  const item = gearItem(owned.itemId);
  const box = make("span", `slot-item rarity-${item?.rarity ?? "comum"}`);
  if (item) box.style.setProperty("--rarity", rarityCss(item.rarity));
  box.append(iconElement(item?.icon ?? "", size));
  if (owned.count > 1) box.append(make("b", "stack-count", formatNumber(owned.count)));
  return box;
}

function slotName(item: GearDef): string {
  return item.slot ? SLOT_LABEL[item.slot] : "Consumível";
}

export class Inventory {
  private readonly root = element("#inventory");
  private readonly doll = element("#inventory-doll");
  private readonly statsBox = element("#inventory-stats");
  private readonly content = element("#inventory-content");
  private readonly detail = element("#inventory-detail");
  private readonly gold = element("#inventory-gold");
  private readonly diamonds = element("#inventory-diamonds");
  private readonly status = element("#inventory-status");
  private readonly tooltip = element("#inventory-tooltip");
  private readonly tabs = [...document.querySelectorAll<HTMLButtonElement>("#inventory [data-tab]")];
  private readonly preview = new LookPreview(element<HTMLCanvasElement>("#inventory-canvas"), {
    dir: "SE",
    scale: 2.1,
    footY: 206,
    animate: true,
  });
  private readonly handlers: InventoryHandlers;
  private items: OwnedItem[] = [];
  private stats: GearStats = { ...EMPTY_STATS };
  private capacity = 20;
  private player: PlayerData | null = null;
  private diamondBalance = 0;
  private tab: Tab = "bag";
  private shopSlot: EquipSlot | "potion" | "" = "";
  /** Item escolhido (uid) ou da loja (id). */
  private selectedUid = 0;
  private selectedShop = "";
  private statusTimer = 0;
  private renderedKey = "";
  private drag: { owned: OwnedItem; ghost: HTMLElement; startX: number; startY: number; moved: boolean } | null = null;

  constructor(handlers: InventoryHandlers) {
    this.handlers = handlers;
    for (const tab of this.tabs) tab.addEventListener("click", () => this.selectTab(tab.dataset.tab as Tab));
    element("#inventory-close").addEventListener("click", () => this.close());
    element("#inventory-buy").addEventListener("click", () => handlers.buyDiamonds());
    window.addEventListener("pointermove", (event) => this.onDragMove(event));
    window.addEventListener("pointerup", (event) => this.onDragEnd(event));
    // O botão direito usa/veste o item (como no Tibia), sem abrir o menu do navegador.
    this.root.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.root.hidden = false;
    this.render(true);
    this.preview.start();
  }

  close() {
    this.root.hidden = true;
    this.selectedUid = 0;
    this.selectedShop = "";
    this.hideTooltip();
    this.preview.stop();
  }

  setInventory(event: InventoryEvent) {
    this.items = event.items;
    this.stats = event.stats;
    this.capacity = event.capacity;
    if (this.selectedUid && !this.items.some((item) => item.uid === this.selectedUid)) this.selectedUid = 0;
    this.render(true);
  }

  setPlayer(player: PlayerData) {
    this.player = player;
    this.gold.textContent = formatNumber(player.gold);
    this.render();
  }

  setDiamonds(value: number) {
    this.diamondBalance = value;
    this.diamonds.textContent = formatNumber(value);
    this.render();
  }

  /** O painel mudou o catálogo: nomes, atributos e preços novos. */
  refresh() {
    this.render(true);
  }

  showStatus(message: string, ok: boolean) {
    this.status.textContent = message;
    this.status.classList.toggle("ok", ok);
    this.status.hidden = false;
    window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => (this.status.hidden = true), 4000);
  }

  private selectTab(tab: Tab) {
    this.tab = tab;
    this.selectedShop = "";
    for (const button of this.tabs) button.classList.toggle("active", button.dataset.tab === tab);
    this.render(true);
  }

  private render(force = false) {
    const player = this.player;
    if (!player || !this.isOpen) return;
    // Não redesenha a cada passo nem a cada moeda recolhida (o item sumiria no meio do clique):
    // o ouro só importa para saber se dá para comprar o item escolhido na loja.
    const chosen = this.selectedShop ? gearItem(this.selectedShop) : undefined;
    const affordable = chosen ? player.gold >= chosen.priceGold : null;
    const key = [player.level, this.diamondBalance, affordable, player.outfit, player.skin, player.primary].join("|");
    if (!force && key === this.renderedKey) return;
    if (this.drag) return;
    this.renderedKey = key;
    this.renderDoll();
    this.renderStats(player);
    if (this.tab === "bag") this.renderBag();
    else this.renderShop(player);
    this.renderDetail(player);
    this.preview.set({ appearance: appearanceOf(player), looks: looksOf(this.items) });
  }

  // ---------------------------------------------------------------- espaços do corpo

  private renderDoll() {
    const cells = EQUIP_SLOTS.map((slot) => {
      const owned = this.items.find((item) => item.equipped === slot);
      const cell = make("div", `inv-slot doll-slot slot-${slot}`);
      cell.dataset.drop = `slot:${slot}`;
      cell.title = SLOT_LABEL[slot];
      if (owned) {
        cell.append(itemContent(owned, 44));
        this.bindItem(cell, owned);
      } else {
        cell.classList.add("empty");
        cell.append(silhouette(slot));
        // Espaço vazio leva à loja filtrada por ele.
        cell.addEventListener("click", () => {
          this.shopSlot = slot;
          this.selectTab("shop");
        });
      }
      return cell;
    });
    this.doll.replaceChildren(...cells);
  }

  private renderStats(player: PlayerData) {
    const base = playerStats(player.level);
    const totals: GearStats = {
      attack: base.maxDamage + this.stats.attack,
      defense: base.armor + this.stats.defense,
      hp: base.maxHp + this.stats.hp,
      mana: base.maxMana + this.stats.mana,
    };
    const rows = STAT_ROWS.map(([key, label]) => {
      const row = make("div", "stat-line");
      const bonus = this.stats[key];
      row.append(make("span", "", label), make("strong", "", formatNumber(totals[key])));
      row.append(make("em", "", bonus > 0 ? `+${formatNumber(bonus)}` : ""));
      return row;
    });
    this.statsBox.replaceChildren(...rows);
  }

  // ---------------------------------------------------------------- mochila

  private renderBag() {
    const grid = make("div", "bag-grid");
    for (let i = 0; i < this.capacity; i++) {
      const owned = this.items.find((item) => item.equipped === "" && item.position === i);
      const cell = make("div", "inv-slot bag-cell");
      cell.dataset.drop = `bag:${i}`;
      if (owned) {
        cell.append(itemContent(owned, 40));
        const item = gearItem(owned.itemId);
        if (item && this.player && item.level > this.player.level) cell.classList.add("locked");
        this.bindItem(cell, owned);
      }
      grid.append(cell);
    }
    const used = this.items.filter((item) => item.equipped === "").length;
    const footer = make(
      "p",
      "bag-footer",
      `${used} de ${this.capacity} espaços · arraste para vestir · clique duplo ou botão direito usa · Shift ao soltar divide a pilha`,
    );
    this.content.replaceChildren(grid, footer);
    this.content.dataset.tab = "bag";
  }

  /** Clique escolhe, clique duplo/botão direito veste ou usa, arrastar move. */
  private bindItem(cell: HTMLElement, owned: OwnedItem) {
    cell.classList.add("has-item");
    cell.classList.toggle("selected", this.selectedUid === owned.uid);
    cell.addEventListener("pointerdown", (event) => {
      if (event.button === 2) {
        event.preventDefault();
        this.handlers.equip(owned.uid);
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      this.startDrag(event, owned, cell);
    });
    cell.addEventListener("dblclick", () => this.handlers.equip(owned.uid));
    cell.addEventListener("pointerenter", () => this.showTooltip(cell, gearItem(owned.itemId), owned));
    cell.addEventListener("pointerleave", () => this.hideTooltip());
  }

  // ---------------------------------------------------------------- arrastar e soltar

  private startDrag(event: PointerEvent, owned: OwnedItem, cell: HTMLElement) {
    const ghost = itemContent(owned, 44);
    ghost.classList.add("drag-ghost");
    ghost.hidden = true;
    document.body.append(ghost);
    this.drag = { owned, ghost, startX: event.clientX, startY: event.clientY, moved: false };
    cell.classList.add("dragging");
    this.hideTooltip();
  }

  private onDragMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
    drag.moved = true;
    drag.ghost.hidden = false;
    drag.ghost.style.transform = `translate(${event.clientX - 24}px, ${event.clientY - 24}px)`;
    const over = this.dropAt(event.clientX, event.clientY);
    for (const cell of this.root.querySelectorAll(".drop-over")) cell.classList.remove("drop-over");
    over?.element.classList.add("drop-over");
  }

  private onDragEnd(event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.ghost.remove();
    for (const cell of this.root.querySelectorAll(".drop-over, .dragging")) cell.classList.remove("drop-over", "dragging");
    if (!drag.moved) {
      // Foi só um clique: escolhe o item.
      this.selectedUid = this.selectedUid === drag.owned.uid ? 0 : drag.owned.uid;
      this.selectedShop = "";
      this.render(true);
      return;
    }
    const target = this.dropAt(event.clientX, event.clientY);
    if (!target) {
      this.render(true);
      return;
    }
    const { owned } = drag;
    if ("slot" in target.drop) {
      this.handlers.move(owned.uid, target.drop.slot);
    } else {
      // Shift divide a pilha ao meio.
      const split = event.shiftKey && owned.count > 1 ? Math.floor(owned.count / 2) : undefined;
      this.handlers.move(owned.uid, "bag", target.drop.index, split);
    }
  }

  private dropAt(x: number, y: number): { element: HTMLElement; drop: Drop } | null {
    const found = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
    if (!found || !this.root.contains(found)) return null;
    const [kind, value] = (found.dataset.drop ?? "").split(":");
    if (kind === "slot") return { element: found, drop: { slot: value as EquipSlot } };
    if (kind === "bag") return { element: found, drop: { index: Number(value) } };
    return null;
  }

  // ---------------------------------------------------------------- dica

  private showTooltip(anchor: HTMLElement, item: GearDef | undefined, owned?: OwnedItem) {
    if (!item || this.drag) return;
    const name = make("strong", "", owned && owned.count > 1 ? `${item.name} ×${formatNumber(owned.count)}` : item.name);
    name.style.color = rarityCss(item.rarity);
    const lines = [make("small", "", `${RARITY[item.rarity].label} · ${slotName(item)} · nível ${item.level}`)];
    for (const line of describeStats(item)) lines.push(make("span", "", line));
    lines.push(make("small", "tip-sell", `Vende por 🪙 ${formatNumber(item.sellGold)}${item.stack > 1 ? " cada" : ""}`));
    this.tooltip.replaceChildren(name, ...lines);
    this.tooltip.hidden = false;
    const box = anchor.getBoundingClientRect();
    const tip = this.tooltip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tip.width - 8, box.right + 8);
    const top = Math.min(window.innerHeight - tip.height - 8, box.top);
    this.tooltip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  private hideTooltip() {
    this.tooltip.hidden = true;
  }

  // ---------------------------------------------------------------- loja

  private renderShop(player: PlayerData) {
    const filters = make("div", "shop-filters");
    const options: [EquipSlot | "potion" | "", string][] = [
      ["", "Tudo"],
      ["potion", "Poções"],
      ...EQUIP_SLOTS.map((slot) => [slot, SLOT_LABEL[slot]] as [EquipSlot, string]),
    ];
    for (const [slot, label] of options) {
      filters.append(
        button(label, `chip${this.shopSlot === slot ? " active" : ""}`, () => {
          this.shopSlot = slot;
          this.render(true);
        }),
      );
    }
    const list = make("div", "gear-list");
    const items = gearList()
      .filter((item) => item.enabled && (item.priceGold > 0 || item.priceDiamonds > 0))
      .filter((item) => !this.shopSlot || (this.shopSlot === "potion" ? item.slot === "" : item.slot === this.shopSlot))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "pt-BR"));
    for (const item of items) list.append(this.shopRow(item, player));
    if (items.length === 0) list.append(make("p", "bag-footer", "Nada à venda aqui por enquanto."));
    const scroll = this.content.dataset.tab === "shop" ? this.content.scrollTop : 0;
    this.content.replaceChildren(filters, list);
    this.content.dataset.tab = "shop";
    this.content.scrollTop = scroll;
  }

  private shopRow(item: GearDef, player: PlayerData): HTMLElement {
    const row = make("article", "gear-row");
    row.classList.toggle("selected", this.selectedShop === item.id);
    row.classList.toggle("locked", item.level > player.level);
    row.addEventListener("click", () => {
      this.selectedShop = item.id;
      this.selectedUid = 0;
      this.render(true);
    });
    const info = make("div", "gear-info");
    const name = make("strong", "", item.name);
    name.style.color = rarityCss(item.rarity);
    info.append(
      name,
      make("small", "", `${slotName(item)} · nível ${item.level} · ${RARITY[item.rarity].label}`),
      make("span", "gear-stats", describeStats(item).join(" · ")),
    );
    const prices = make("div", "gear-prices");
    if (item.priceGold > 0) prices.append(make("span", "price gold", `🪙 ${formatNumber(item.priceGold)}`));
    if (item.priceDiamonds > 0) prices.append(make("span", "price diamonds", `💎 ${formatNumber(item.priceDiamonds)}`));
    const thumb = make("span", `slot-item rarity-${item.rarity}`);
    thumb.style.setProperty("--rarity", rarityCss(item.rarity));
    thumb.append(iconElement(item.icon, 40));
    row.append(thumb, info, prices);
    return row;
  }

  // ---------------------------------------------------------------- ações do item escolhido

  private renderDetail(player: PlayerData) {
    const owned = this.selectedUid ? this.items.find((item) => item.uid === this.selectedUid) : undefined;
    const item = this.selectedShop ? gearItem(this.selectedShop) : owned ? gearItem(owned.itemId) : undefined;
    if (!item) {
      this.detail.replaceChildren(
        make(
          "p",
          "detail-hint",
          this.tab === "bag" ? "Passe o mouse para ver · clique para escolher · arraste para mover." : "Escolha um item da loja.",
        ),
      );
      return;
    }
    const name = make("strong", "", owned && owned.count > 1 ? `${item.name} ×${formatNumber(owned.count)}` : item.name);
    name.style.color = rarityCss(item.rarity);
    const levelLine = make(
      "small",
      item.level > player.level ? "too-high" : "",
      `${slotName(item)} · ${RARITY[item.rarity].label} · nível ${item.level}`,
    );
    const title = make("div", "detail-title");
    title.append(name, levelLine);

    // Comparação com o que está vestido no mesmo espaço.
    const worn = item.slot ? this.items.find((entry) => entry.equipped === item.slot) : undefined;
    const wornItem = worn && worn !== owned ? gearItem(worn.itemId) : undefined;
    const lines = make("div", "detail-stats");
    for (const [key, label] of STAT_ROWS) {
      const value = item[key];
      const diff = wornItem ? value - wornItem[key] : 0;
      if (value === 0 && diff === 0) continue;
      const line = make("span", "", `+${formatNumber(value)} ${label.toLowerCase()}`);
      if (wornItem && diff !== 0) line.append(make("em", diff > 0 ? "up" : "down", ` (${diff > 0 ? "+" : ""}${formatNumber(diff)})`));
      lines.append(line);
    }
    const extras = describeStats({ ...EMPTY_STATS, heal: item.heal, restore: item.restore, bagSlots: item.bagSlots, range: item.range });
    for (const extra of extras) lines.append(make("span", "", extra));
    const head = make("div", "detail-head");
    head.append(title, lines);

    const actions = make("div", "detail-actions");
    if (owned) {
      if (!item.slot) {
        actions.append(button("Usar", "primary small", () => this.handlers.use(owned.uid)));
      } else if (owned.equipped) {
        actions.append(button("Tirar", "secondary small", () => this.handlers.move(owned.uid, "bag")));
      } else {
        const equip = button("Vestir", "primary small", () => this.handlers.equip(owned.uid));
        equip.disabled = item.level > player.level;
        actions.append(equip);
      }
      if (owned.count > 1) {
        actions.append(button(`Vender 1 · 🪙 ${formatNumber(item.sellGold)}`, "secondary small", () => this.handlers.sell(owned.uid, 1)));
      }
      actions.append(
        button(`Vender${owned.count > 1 ? " tudo" : ""} · 🪙 ${formatNumber(item.sellGold * owned.count)}`, "secondary small", () => {
          if ((item.rarity !== "comum" || owned.equipped) && !window.confirm(`Vender ${item.name}?`)) return;
          this.handlers.sell(owned.uid, owned.count);
        }),
      );
    } else {
      const counts = item.stack > 1 ? [1, 10, 50].filter((count) => count <= item.stack) : [1];
      if (item.priceGold > 0) {
        for (const count of counts) {
          const total = item.priceGold * count;
          const buy = button(`${count > 1 ? `${count}× · ` : "Comprar · "}🪙 ${formatNumber(total)}`, "primary small", () =>
            this.handlers.buy(item.id, "gold", count),
          );
          buy.disabled = player.gold < total;
          actions.append(buy);
        }
      }
      if (item.priceDiamonds > 0) {
        actions.append(
          button(`Comprar · 💎 ${formatNumber(item.priceDiamonds)}`, "primary small diamond-buy", () => {
            if (this.diamondBalance < item.priceDiamonds) this.handlers.buyDiamonds();
            else this.handlers.buy(item.id, "diamonds", 1);
          }),
        );
      }
    }
    this.detail.replaceChildren(head, actions);
  }
}

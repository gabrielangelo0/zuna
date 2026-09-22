import {
  BAG_SIZE,
  EMPTY_STATS,
  EQUIP_SLOTS,
  RARITY,
  SLOT_LABEL,
  describeStats,
  gearItem,
  gearList,
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
import { itemSlotElement } from "./itemIcons.ts";

// Equipamentos do jogador (tecla I): o boneco com os cinco espaços, a mochila e a loja.
// Tudo é decidido no servidor; aqui só mostra e manda o pedido.

export interface InventoryHandlers {
  equip(uid: number): void;
  unequip(slot: EquipSlot): void;
  sell(uid: number): void;
  buy(id: string, currency: "gold" | "diamonds"): void;
  buyDiamonds(): void;
}

type Tab = "bag" | "shop";

type Selection = { from: "owned"; uid: number } | { from: "shop"; id: string } | null;

const STAT_ROWS: [keyof GearStats, string][] = [
  ["attack", "Ataque"],
  ["defense", "Defesa"],
  ["hp", "Vida"],
  ["mana", "Mana"],
];

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

export class Inventory {
  private readonly root = element("#inventory");
  private readonly doll = element("#inventory-doll");
  private readonly statsBox = element("#inventory-stats");
  private readonly content = element("#inventory-content");
  private readonly detail = element("#inventory-detail");
  private readonly gold = element("#inventory-gold");
  private readonly diamonds = element("#inventory-diamonds");
  private readonly status = element("#inventory-status");
  private readonly tabs = [...document.querySelectorAll<HTMLButtonElement>("#inventory [data-tab]")];
  private readonly handlers: InventoryHandlers;
  private items: OwnedItem[] = [];
  private stats: GearStats = { ...EMPTY_STATS };
  private player: PlayerData | null = null;
  private diamondBalance = 0;
  private tab: Tab = "bag";
  private shopSlot: EquipSlot | "" = "";
  private selection: Selection = null;
  private statusTimer = 0;
  private renderedKey = "";

  constructor(handlers: InventoryHandlers) {
    this.handlers = handlers;
    for (const tab of this.tabs) tab.addEventListener("click", () => this.selectTab(tab.dataset.tab as Tab));
    element("#inventory-close").addEventListener("click", () => this.close());
    element("#inventory-buy").addEventListener("click", () => handlers.buyDiamonds());
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
  }

  close() {
    this.root.hidden = true;
    this.selection = null;
  }

  setInventory(event: InventoryEvent) {
    this.items = event.items;
    this.stats = event.stats;
    // O item escolhido foi vendido ou trocado: some da seleção.
    if (this.selection?.from === "owned" && !this.items.some((item) => item.uid === (this.selection as { uid: number }).uid)) {
      this.selection = null;
    }
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
    this.selection = null;
    for (const button of this.tabs) button.classList.toggle("active", button.dataset.tab === tab);
    this.render(true);
  }

  private select(selection: Selection) {
    this.selection = selection;
    this.render(true);
  }

  private render(force = false) {
    const player = this.player;
    if (!player || !this.isOpen) return;
    // Não redesenha a cada passo nem a cada moeda recolhida (o botão sumiria no meio do clique):
    // o ouro só importa para saber se dá para comprar o item escolhido na loja.
    const chosen = this.selection?.from === "shop" ? gearItem(this.selection.id) : undefined;
    const affordable = chosen ? player.gold >= chosen.priceGold : null;
    const key = [player.level, this.diamondBalance, affordable].join("|");
    if (!force && key === this.renderedKey) return;
    this.renderedKey = key;
    this.renderDoll();
    this.renderStats(player);
    if (this.tab === "bag") this.renderBag();
    else this.renderShop(player);
    this.renderDetail(player);
  }

  // ---------------------------------------------------------------- boneco

  private renderDoll() {
    const slots = EQUIP_SLOTS.map((slot) => {
      const owned = this.items.find((item) => item.equipped === slot);
      const cell = make("button", `doll-slot slot-${slot}`);
      cell.type = "button";
      cell.title = SLOT_LABEL[slot];
      if (owned) {
        cell.append(itemSlotElement(owned.itemId, 52));
        cell.classList.toggle("selected", this.selection?.from === "owned" && this.selection.uid === owned.uid);
        cell.addEventListener("click", () => this.select({ from: "owned", uid: owned.uid }));
      } else {
        cell.classList.add("empty");
        cell.append(make("small", "", SLOT_LABEL[slot]));
        cell.addEventListener("click", () => {
          // Espaço vazio leva à loja já filtrada por ele.
          this.shopSlot = slot;
          this.selectTab("shop");
        });
      }
      return cell;
    });
    this.doll.replaceChildren(...slots);
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
      if (bonus > 0) row.append(make("em", "", `+${formatNumber(bonus)}`));
      return row;
    });
    this.statsBox.replaceChildren(...rows);
  }

  // ---------------------------------------------------------------- mochila

  private renderBag() {
    const bag = this.items.filter((item) => item.equipped === "");
    const grid = make("div", "bag-grid");
    for (let i = 0; i < BAG_SIZE; i++) {
      const owned = bag[i];
      const cell = make("button", "bag-cell");
      cell.type = "button";
      if (owned) {
        const item = gearItem(owned.itemId);
        cell.append(itemSlotElement(owned.itemId, 46));
        cell.title = item ? `${item.name} · ${RARITY[item.rarity].label}` : owned.itemId;
        cell.classList.toggle("selected", this.selection?.from === "owned" && this.selection.uid === owned.uid);
        if (item && this.player && item.level > this.player.level) cell.classList.add("locked");
        cell.addEventListener("click", () => this.select({ from: "owned", uid: owned.uid }));
      } else {
        cell.classList.add("empty");
        cell.disabled = true;
      }
      grid.append(cell);
    }
    const footer = make("p", "bag-footer", `${bag.length} de ${BAG_SIZE} espaços · os monstros derrubam equipamentos do nível deles`);
    this.content.replaceChildren(grid, footer);
  }

  // ---------------------------------------------------------------- loja

  private renderShop(player: PlayerData) {
    const filters = make("div", "shop-filters");
    const options: [EquipSlot | "", string][] = [["", "Tudo"], ...EQUIP_SLOTS.map((slot) => [slot, SLOT_LABEL[slot]] as [EquipSlot, string])];
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
      .filter((item) => !this.shopSlot || item.slot === this.shopSlot)
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
    row.classList.toggle("selected", this.selection?.from === "shop" && this.selection.id === item.id);
    row.classList.toggle("locked", item.level > player.level);
    row.addEventListener("click", () => this.select({ from: "shop", id: item.id }));
    const info = make("div", "gear-info");
    const name = make("strong", "", item.name);
    name.style.color = rarityCss(item.rarity);
    info.append(
      name,
      make("small", "", `${SLOT_LABEL[item.slot]} · nível ${item.level} · ${RARITY[item.rarity].label}`),
      make("span", "gear-stats", describeStats(item).join(" · ")),
    );
    const prices = make("div", "gear-prices");
    if (item.priceGold > 0) prices.append(make("span", "price gold", `🪙 ${formatNumber(item.priceGold)}`));
    if (item.priceDiamonds > 0) prices.append(make("span", "price diamonds", `💎 ${formatNumber(item.priceDiamonds)}`));
    row.append(itemSlotElement(item.id, 44), info, prices);
    return row;
  }

  // ---------------------------------------------------------------- detalhe

  private renderDetail(player: PlayerData) {
    const selection = this.selection;
    const owned = selection?.from === "owned" ? this.items.find((item) => item.uid === selection.uid) : undefined;
    const item = selection?.from === "shop" ? gearItem(selection.id) : owned ? gearItem(owned.itemId) : undefined;
    if (!item) {
      this.detail.replaceChildren(
        make("p", "detail-hint", this.tab === "bag" ? "Clique num item para ver, equipar ou vender." : "Escolha um item para ver os detalhes."),
      );
      return;
    }

    const head = make("div", "detail-head");
    const title = make("div", "detail-title");
    const name = make("strong", "", item.name);
    name.style.color = rarityCss(item.rarity);
    const levelLine = make("small", item.level > player.level ? "too-high" : "", `${SLOT_LABEL[item.slot]} · ${RARITY[item.rarity].label} · nível ${item.level}`);
    title.append(name, levelLine);
    head.append(itemSlotElement(item.id, 64), title);

    // Comparação com o que está vestido no mesmo espaço.
    const worn = this.items.find((entry) => entry.equipped === item.slot);
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
    if (lines.childElementCount === 0) lines.append(make("span", "", "Sem atributos."));

    const actions = make("div", "detail-actions");
    if (owned) {
      if (owned.equipped) {
        actions.append(button("Tirar", "secondary small", () => this.handlers.unequip(owned.equipped as EquipSlot)));
      } else {
        const equip = button("Equipar", "primary small", () => this.handlers.equip(owned.uid));
        equip.disabled = item.level > player.level;
        actions.append(equip);
      }
      actions.append(
        button(`Vender · 🪙 ${formatNumber(item.sellGold)}`, "secondary small", () => {
          if (item.rarity !== "comum" && !window.confirm(`Vender ${item.name} por ${item.sellGold} moedas de ouro?`)) return;
          this.handlers.sell(owned.uid);
        }),
      );
    } else {
      if (item.priceGold > 0) {
        const buy = button(`Comprar · 🪙 ${formatNumber(item.priceGold)}`, "primary small", () => this.handlers.buy(item.id, "gold"));
        buy.disabled = player.gold < item.priceGold;
        actions.append(buy);
      }
      if (item.priceDiamonds > 0) {
        actions.append(
          button(`Comprar · 💎 ${formatNumber(item.priceDiamonds)}`, "primary small diamond-buy", () => {
            if (this.diamondBalance < item.priceDiamonds) this.handlers.buyDiamonds();
            else this.handlers.buy(item.id, "diamonds");
          }),
        );
      }
    }
    this.detail.replaceChildren(head, lines, actions);
  }
}

import {
  SHORTCUT_KEYS,
  SHORTCUT_SLOTS,
  SPELL_FAMILIES,
  familiesFor,
  vocationFamilies,
  nextTierOf,
  spellById,
  spellsUpTo,
  tierFor,
  type SpellDef,
} from "@zuna/shared";
import { element, formatNumber } from "./dom.ts";

// Grimório: todos os poderes já liberados e a escolha dos atalhos da barra.

export class Grimoire {
  private readonly root = element("#grimoire");
  private readonly slotsBox = element("#grimoire-slots");
  private readonly list = element("#grimoire-list");
  private readonly hint = element("#grimoire-hint");
  private readonly onChange: (slots: string[]) => void;
  private level = 1;
  private vocation = "";
  private shortcuts: string[] = Array.from({ length: SHORTCUT_SLOTS }, () => "");
  private picked: string | null = null;

  constructor(onChange: (slots: string[]) => void) {
    this.onChange = onChange;
    element("#grimoire-close").addEventListener("click", () => this.close());
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
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.picked = null;
  }

  /** A classe decide quais famílias aparecem aqui. */
  setVocation(vocation: string) {
    if (vocation === this.vocation) return;
    this.vocation = vocation;
    if (this.isOpen) this.render();
  }

  setLevel(level: number) {
    if (level === this.level) return;
    this.level = level;
    if (this.isOpen) this.render();
  }

  setShortcuts(slots: string[]) {
    if (slots.join(",") === this.shortcuts.join(",")) return;
    this.shortcuts = [...slots];
    if (this.isOpen) this.render();
  }

  private assign(index: number) {
    const slots = [...this.shortcuts];
    if (this.picked) {
      // Um poder só pode estar num atalho: se já estava em outro, ele se muda.
      const old = slots.indexOf(this.picked);
      if (old !== -1) slots[old] = "";
      slots[index] = this.picked;
      this.picked = null;
    } else {
      slots[index] = "";
    }
    this.shortcuts = slots;
    this.onChange(slots);
    this.render();
  }

  private render() {
    this.hint.textContent = this.picked
      ? "Agora escolha o atalho que vai receber esse poder."
      : "Clique num poder e depois num atalho. Clicar num atalho sozinho esvazia a vaga.";

    // --- atalhos
    const slots = document.createElement("div");
    slots.className = "slot-row";
    this.shortcuts.forEach((id, index) => {
      const spell = id ? spellById(id) : undefined;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot";
      button.classList.toggle("empty", !spell);
      button.classList.toggle("ready", this.picked !== null);
      button.title = spell ? `${spell.name} — tecla ${SHORTCUT_KEYS[index]}` : `Atalho ${SHORTCUT_KEYS[index]} livre`;

      const key = document.createElement("kbd");
      key.textContent = SHORTCUT_KEYS[index];
      const name = document.createElement("span");
      name.textContent = spell ? spell.short : "vazio";
      button.append(key, name);
      button.addEventListener("click", () => this.assign(index));
      slots.append(button);
    });
    this.slotsBox.replaceChildren(slots);

    // --- poderes liberados, por família
    const unlocked = spellsUpTo(this.level);
    const groups = document.createElement("div");
    groups.className = "spell-groups";
    for (const family of familiesFor(vocationFamilies(this.vocation))) {
      const tiers = unlocked.filter((spell) => spell.family === family.family);
      const group = document.createElement("section");
      group.className = "spell-group";

      const title = document.createElement("h3");
      title.textContent = family.name;
      const note = document.createElement("small");
      const next = tiers[0] ? nextTierOf(tiers[0]) : undefined;
      note.textContent =
        tierFor(family, this.level) < 1
          ? `Abre no nível ${family.baseLevel}`
          : next
            ? `Próximo grau no nível ${next.minLevel}`
            : "";
      group.append(title, note);

      if (tiers.length === 0) {
        group.classList.add("locked");
        groups.append(group);
        continue;
      }
      for (const spell of tiers) group.append(this.spellRow(spell));
      groups.append(group);
    }
    this.list.replaceChildren(groups);
  }

  private spellRow(spell: SpellDef): HTMLElement {
    const slot = this.shortcuts.indexOf(spell.id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "spell-row";
    row.classList.toggle("picked", this.picked === spell.id);
    row.classList.toggle("in-bar", slot !== -1);

    const head = document.createElement("strong");
    head.textContent = spell.name;
    const stats = document.createElement("small");
    stats.textContent = `Nível ${spell.minLevel} · ${spell.mana} de mana · ${(spell.cooldownMs / 1000).toFixed(1).replace(".", ",")} s · força ${formatNumber(Math.round(spell.power * 100))}%`;
    const description = document.createElement("span");
    description.textContent = spell.description;

    const badge = document.createElement("i");
    badge.textContent = slot === -1 ? "" : `tecla ${SHORTCUT_KEYS[slot]}`;

    row.append(head, stats, description, badge);
    row.addEventListener("click", () => {
      this.picked = this.picked === spell.id ? null : spell.id;
      this.render();
    });
    return row;
  }
}

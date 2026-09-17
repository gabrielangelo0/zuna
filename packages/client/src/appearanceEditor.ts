import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES, catalogItem, type Appearance } from "@game/shared";

type Field = keyof Appearance;

export interface AppearanceEditorOptions {
  /** Roupas que podem ser escolhidas aqui. Sem isso, a roupa não aparece no editor. */
  outfits?: readonly string[];
  onChange(appearance: Appearance): void;
}

const toHex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/** Seletores de pele, cabelo e cores da roupa. Usado na criação de personagem e no guarda-roupa. */
export class AppearanceEditor {
  private appearance: Appearance;
  private readonly options: AppearanceEditorOptions;
  private readonly buttons: { field: Field; value: number | string; element: HTMLButtonElement }[] = [];

  constructor(container: HTMLElement, initial: Appearance, options: AppearanceEditorOptions) {
    this.appearance = { ...initial };
    this.options = options;

    const groups: HTMLElement[] = [];
    if (options.outfits?.length) {
      const choices = options.outfits.map((id) => ({ value: id, label: catalogItem(id)?.name ?? id }));
      groups.push(this.choiceGroup("Roupa", "outfit", choices));
    }
    groups.push(this.swatchGroup("Pele", "skin", SKIN_TONES));
    groups.push(this.swatchGroup("Cabelo", "hairColor", HAIR_COLORS));
    groups.push(this.swatchGroup("Cor principal", "primary", OUTFIT_COLORS));
    groups.push(this.swatchGroup("Cor secundária", "secondary", OUTFIT_COLORS));
    groups.push(this.swatchGroup("Detalhes", "detail", OUTFIT_COLORS));
    container.replaceChildren(...groups);
    this.refresh();
  }

  get value(): Appearance {
    return { ...this.appearance };
  }

  set(appearance: Appearance) {
    this.appearance = { ...appearance };
    this.refresh();
  }

  private select(field: Field, value: number | string) {
    this.appearance = { ...this.appearance, [field]: value };
    this.refresh();
    this.options.onChange(this.value);
  }

  private group(title: string, listClass: string) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "picker";
    const legend = document.createElement("legend");
    legend.textContent = title;
    const list = document.createElement("div");
    list.className = listClass;
    fieldset.append(legend, list);
    return { fieldset, list };
  }

  private swatchGroup(title: string, field: Field, colors: readonly number[]) {
    const { fieldset, list } = this.group(title, "swatches");
    colors.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.style.setProperty("--swatch", toHex(color));
      button.setAttribute("aria-label", `${title}: opção ${index + 1}`);
      button.addEventListener("click", () => this.select(field, index));
      this.buttons.push({ field, value: index, element: button });
      list.append(button);
    });
    return fieldset;
  }

  private choiceGroup(title: string, field: Field, choices: { value: number | string; label: string }[]) {
    const { fieldset, list } = this.group(title, "choices");
    for (const choice of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.textContent = choice.label;
      button.addEventListener("click", () => this.select(field, choice.value));
      this.buttons.push({ field, value: choice.value, element: button });
      list.append(button);
    }
    return fieldset;
  }

  private refresh() {
    for (const { field, value, element } of this.buttons) {
      const active = this.appearance[field] === value;
      element.classList.toggle("active", active);
      element.setAttribute("aria-pressed", String(active));
    }
  }
}

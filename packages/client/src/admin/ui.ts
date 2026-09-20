// Peças de tela do painel: moldura, tabela, selos, botões e campos.
// Tudo montado à mão, sem framework — o painel é uma página só.

import { icon } from "./icons.ts";

type Child = Node | string | number | null | undefined | false;

interface Props {
  class?: string;
  title?: string;
  text?: string;
  html?: string;
  onClick?: () => void;
  [key: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key === "html") node.innerHTML = String(value);
    else if (key === "onClick") node.addEventListener("click", value as () => void);
    else if (key in node) (node as unknown as Record<string, unknown>)[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "object" ? child : String(child));
  }
  return node;
}

export const el = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

// ---------------------------------------------------------------- formatos

const numbers = new Intl.NumberFormat("pt-BR");

export const num = (value: number) => numbers.format(Math.round(value));

/** Números grandes viram 12,4 mil / 3,1 mi para caber nas caixinhas. */
export function short(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1).replace(".", ",")} mil`;
  return num(value);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return date.toLocaleDateString("pt-BR");
}

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function stamp(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** "2 h 14 min" a partir de milissegundos. */
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

// ---------------------------------------------------------------- blocos

/** Caixa de pedra com título; devolve a caixa e o corpo para preencher. */
export function frame(title: string, note?: string, mark = "gem") {
  const body = h("div", { class: "frame-body" });
  const heading = h("h2", {}, icon(mark), title);
  if (note) heading.append(h("small", { text: note }));
  const root = h("section", { class: "frame" }, heading, body);
  return { root, body };
}

/** Troca o título da moldura mantendo o ícone. */
export function retitle(root: HTMLElement, title: string, note: string, mark = "gem") {
  root.querySelector("h2")!.replaceChildren(icon(mark), title, h("small", { text: note }));
}

export function block(title: string, note?: string, mark = "shield") {
  const body = h("div", { class: "block-body" });
  const heading = h("h3", {}, icon(mark), title);
  if (note) heading.append(h("small", { text: note }));
  return { root: h("section", { class: "block" }, heading, body), body };
}

/** Tabela de pergaminho. Sem linhas, mostra o aviso de lista vazia. */
export function sheet(headers: string[], rows: HTMLTableRowElement[], empty = "Nada por aqui.") {
  if (rows.length === 0) return h("div", { class: "sheet" }, h("p", { class: "empty", text: empty }));
  const head = h("tr", {}, ...headers.map((label) => h("th", { text: label })));
  return h("div", { class: "sheet" }, h("table", {}, h("thead", {}, head), h("tbody", {}, ...rows)));
}

export function cell(content: Child, className?: string) {
  return h("td", { class: className }, content);
}

export function badge(kind: string, text: string) {
  return h("span", { class: `badge ${kind}`, text });
}

export function stat(label: string, value: string, mark: string, tone: string) {
  const card = h(
    "div",
    { class: "stat" },
    icon(mark),
    h("div", { class: "stat-text" }, h("b", { text: value }), h("span", { text: label })),
  );
  card.style.setProperty("--tone", tone);
  return card;
}

/** Retrato da classe do personagem (as figuras saem dos próprios sprites do jogo). */
export function face(outfit: string) {
  const node = h("span", { class: "face" });
  if (outfit) node.style.backgroundImage = `url("/brand/class/${outfit}.png")`;
  return node;
}

/** Linha "ícone · nome · valor" dos quadros de estado. */
export function line(mark: string, label: string, value: string) {
  return h("div", { class: "line" }, icon(mark), h("span", { text: label }), h("b", { text: value }));
}

export function button(label: string, onClick: () => void, kind = "", small = true) {
  return h("button", {
    type: "button",
    class: `${kind} ${small ? "small" : ""}`.trim(),
    text: label,
    onClick: () => onClick(),
  });
}

/** Botão compacto, só com o desenho e um balãozinho de ajuda. */
export function iconButton(mark: string, title: string, onClick: () => void, kind = "") {
  return h("button", { type: "button", class: `icon-btn small ${kind}`.trim(), title, onClick }, icon(mark));
}

export function field(label: string, control: HTMLElement) {
  return h("label", { class: "field" }, label, control);
}

export function input(value: string | number, options: { type?: string; width?: string; max?: number } = {}) {
  const node = h("input", { type: options.type ?? "text", value: String(value) });
  if (options.max !== undefined) node.maxLength = options.max;
  if (options.width) node.style.width = options.width;
  return node;
}

export function select(options: { id: string; label: string }[], selected: string) {
  const node = h("select");
  for (const option of options) {
    node.append(h("option", { value: option.id, text: option.label, selected: option.id === selected }));
  }
  node.value = selected;
  return node;
}

/** Barra de vida ou mana no estilo do jogo. */
export function bar(value: number, max: number, kind: "hp" | "mana") {
  const fill = h("i");
  fill.style.width = `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
  return h(
    "div",
    { class: `bar ${kind === "mana" ? "mana" : ""}`.trim() },
    fill,
    h("span", { text: `${num(value)}/${num(max)}` }),
  );
}

/** Gráfico de barras dobradas (contas e personagens por dia), com régua e linhas de apoio. */
export function chart(days: { day: string; accounts: number; characters: number }[]) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = 700;
  const height = 176;
  const left = 34;
  const top = 8;
  const floor = 148;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("preserveAspectRatio", "none");

  const make = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    svg.append(node);
    return node;
  };

  // Régua: quatro linhas, arredondando o topo para um número redondo.
  const peak = Math.max(1, ...days.map((entry) => Math.max(entry.accounts, entry.characters)));
  const step = Math.max(1, Math.ceil(peak / 4));
  const max = step * 4;
  for (let i = 0; i <= 4; i++) {
    const y = floor - (i / 4) * (floor - top);
    make("line", { class: "grid-line", x1: left, y1: y, x2: width, y2: y });
    const label = make("text", { x: left - 8, y: y + 3, "text-anchor": "end" });
    label.textContent = String(step * i);
  }

  const slot = (width - left) / Math.max(1, days.length);
  const barWidth = Math.max(4, slot / 2 - 5);
  days.forEach((entry, index) => {
    const pairs: [number, string][] = [
      [entry.accounts, "bar-a"],
      [entry.characters, "bar-b"],
    ];
    pairs.forEach(([value, className], side) => {
      const barHeight = (value / max) * (floor - top);
      if (value <= 0) return;
      make("rect", {
        class: className,
        x: left + index * slot + 4 + side * (slot / 2 - 2),
        y: floor - barHeight,
        width: barWidth,
        height: Math.max(2, barHeight),
        rx: 2,
      });
    });

    if (index % 2 === 0) {
      const label = make("text", { x: left + index * slot + slot / 2, y: floor + 16, "text-anchor": "middle" });
      label.textContent = `${entry.day.slice(8)}/${entry.day.slice(5, 7)}`;
    }
  });
  return svg;
}

// ---------------------------------------------------------------- caixinhas de pergunta

/** Caixa com um campo de texto. Resolve com o texto ou com null quando cancelam. */
export function askText(title: string, placeholder: string, initial = ""): Promise<string | null> {
  const box = input(initial, { width: "100%" });
  box.placeholder = placeholder;
  return dialog(title, box, () => box.value.trim() || null, box);
}

/** Caixa de confirmação: resolve com true só quando confirmam. */
export function askConfirm(title: string, message: string, okLabel = "Confirmar"): Promise<boolean> {
  return dialog(title, h("p", { class: "note", text: message }), () => true, undefined, okLabel).then(
    (answer) => answer === true,
  );
}

/** Um campo da caixinha de formulário. */
export interface FormField {
  id: string;
  label: string;
  kind?: "text" | "number" | "select" | "check";
  value?: string | number | boolean;
  options?: { id: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
  width?: string;
}

/**
 * Caixinha com vários campos. Devolve os valores em texto (o chamador converte),
 * ou null quando cancelam.
 */
export function askForm(
  title: string,
  fields: FormField[],
  okLabel = "Salvar",
): Promise<Record<string, string> | null> {
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const box = h("div", { class: "form-grid" });

  for (const spec of fields) {
    let control: HTMLInputElement | HTMLSelectElement;
    if (spec.kind === "select") {
      control = select(spec.options ?? [], String(spec.value ?? ""));
    } else if (spec.kind === "check") {
      control = h("input", { type: "checkbox" });
      (control as HTMLInputElement).checked = spec.value === true;
    } else {
      control = input(String(spec.value ?? ""), { type: spec.kind === "number" ? "number" : "text" });
      if (spec.min !== undefined) control.min = String(spec.min);
      if (spec.max !== undefined) control.max = String(spec.max);
      if (spec.step) control.step = spec.step;
    }
    if (spec.width) control.style.width = spec.width;
    controls.set(spec.id, control);
    const label = field(spec.label, control);
    if (spec.hint) label.append(h("small", { text: spec.hint }));
    box.append(label);
  }

  const first = [...controls.values()][0];
  return dialog(
    title,
    box,
    () => {
      const answer: Record<string, string> = {};
      for (const [id, control] of controls) {
        answer[id] = control instanceof HTMLInputElement && control.type === "checkbox" ? String(control.checked) : control.value;
      }
      return answer;
    },
    first,
    okLabel,
  );
}

function dialog<T>(
  title: string,
  content: HTMLElement,
  read: () => T | null,
  focus?: HTMLElement,
  okLabel = "Confirmar",
): Promise<T | null> {
  const host = el("#dialog");
  return new Promise((resolve) => {
    const finish = (value: T | null) => {
      host.hidden = true;
      host.replaceChildren();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(null);
    };

    // Um formulário de verdade: Enter no campo confirma, como em qualquer caixa do sistema.
    const form = h(
      "form",
      { class: "modal-body" },
      content,
      h(
        "div",
        { class: "actions" },
        h("button", { type: "submit", class: "good small", text: okLabel }),
        button("Cancelar", () => finish(null)),
      ),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(read());
    });

    host.replaceChildren(
      h("div", { class: "modal-card dialog-card" }, h("div", { class: "modal-head" }, h("h2", { text: title })), form),
    );
    host.hidden = false;
    host.onclick = (event) => {
      if (event.target === host) finish(null);
    };
    document.addEventListener("keydown", onKey);
    focus?.focus();
  });
}

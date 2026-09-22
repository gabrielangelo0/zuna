import {
  GROUND_PAINTS,
  LOOT,
  LOOT_KINDS,
  MAP_STYLES,
  MONSTERS,
  OBJECT_PAINTS,
  SPAWN_MAX_AMOUNT,
  SPAWN_MAX_RADIUS,
  WORLD_MAX_SIZE,
  WORLD_MIN_SIZE,
  generateMap,
  groundColor,
  objectColor,
  shapeOf,
  type AdminMapResponse,
  type AdminWorldRow,
  type AdminWorldsResponse,
  type GameMap,
  type GroundItemDef,
  type LootKind,
  type MonsterKind,
  type PortalDef,
  type SpawnDef,
  type WorldDef,
} from "@zuna/shared";
import { icon } from "./icons.ts";
import { ask, notify, run } from "./session.ts";
import {
  askConfirm,
  askForm,
  badge,
  block,
  button,
  cell,
  frame,
  h,
  iconButton,
  num,
  retitle,
  sheet,
  type FormField,
} from "./ui.ts";

// Aba dos mundos: a lista de mapas e o editor, com pincel de terreno, portais,
// ninhos de monstro e tesouros no chão.

type Tool = "ground" | "object" | "eraser" | "bucket" | "portal" | "spawn" | "item" | "center";

const TOOLS: { id: Tool; label: string; mark: string }[] = [
  { id: "ground", label: "Pintar chão", mark: "brush" },
  { id: "object", label: "Pôr cenário", mark: "map" },
  { id: "eraser", label: "Apagar pintura", mark: "eraser" },
  { id: "bucket", label: "Preencher área", mark: "bucket" },
  { id: "portal", label: "Portal", mark: "portal" },
  { id: "spawn", label: "Ninho de monstro", mark: "nest" },
  { id: "item", label: "Tesouro no chão", mark: "coin" },
  { id: "center", label: "Centro do mundo", mark: "target" },
];

const MONSTER_OPTIONS = Object.values(MONSTERS).map((def) => ({ id: def.kind, label: def.name }));
const LOOT_OPTIONS = LOOT_KINDS.filter((kind) => kind !== "item").map((kind) => ({ id: kind, label: LOOT[kind].name }));
const STYLE_OPTIONS = MAP_STYLES.map((style) => ({ id: style.id, label: style.name }));

/** Mundo aberto no editor (null = a lista). */
let editing: number | null = null;

export function closeWorldEditor() {
  editing = null;
}

export async function renderWorlds(root: HTMLElement) {
  if (editing !== null) await renderEditor(root, editing);
  else await renderList(root);
}

// ---------------------------------------------------------------- lista de mundos

async function renderList(root: HTMLElement) {
  const box = frame("Mundos", undefined, "globe");
  const list = h("div");
  box.body.append(
    h(
      "div",
      { class: "row" },
      button("Novo mundo", () => void createWorld(), "good"),
      button("Atualizar", () => void reload()),
    ),
    list,
  );
  root.replaceChildren(box.root);

  async function reload() {
    const data = await ask<AdminWorldsResponse>("/api/admin/worlds");
    retitle(box.root, "Mundos", `${num(data.worlds.length)} mundo(s)`, "globe");
    list.replaceChildren(
      sheet(
        ["Mundo", "Terreno", "Tamanho", "Centro", "Portais", "Ninhos", "Tesouros", "Online", "Ações"],
        data.worlds.map((row) => worldRow(row, reload)),
        "Nenhum mundo cadastrado.",
      ),
    );
  }

  await reload();
}

function worldRow(row: AdminWorldRow, reload: () => Promise<void>): HTMLTableRowElement {
  const { world } = row;
  const line = h("div", { class: "who-line" }, h("strong", { text: world.name }));
  if (world.isDefault) line.append(badge("admin", "principal"));
  if (!world.published) line.append(badge("banned", "fechado"));

  const who = h("div", { class: "who-cell" }, line, h("small", { text: `chave ${world.slug} · semente ${world.seed}` }));
  const style = MAP_STYLES.find((entry) => entry.id === world.style)?.name ?? world.style;

  const actions = h(
    "div",
    { class: "actions" },
    iconButton("map", "Abrir o editor de mapa", () => {
      editing = world.id;
      void renderWorlds(document.querySelector<HTMLElement>("#panel")!);
    }, "good"),
    iconButton("copy", "Fazer uma cópia deste mundo", () => void duplicate(world, reload)),
    iconButton(
      "crown",
      world.isDefault ? "Este já é o mundo principal" : "Tornar o mundo onde todos nascem",
      () => void patch(world.id, { isDefault: true }, `${world.name} agora é o mundo principal.`, reload),
      world.isDefault ? "good" : "",
    ),
    iconButton(
      world.published ? "lock" : "check",
      world.published ? "Fechar o mundo" : "Abrir o mundo",
      () =>
        void patch(
          world.id,
          { published: !world.published },
          world.published ? `${world.name} foi fechado.` : `${world.name} está aberto.`,
          reload,
        ),
      world.published ? "" : "bad",
    ),
    iconButton("trash", "Apagar o mundo", () => void removeWorld(world, reload), "bad"),
  );

  return h(
    "tr",
    {},
    cell(who),
    cell(style),
    cell(`${world.width} × ${world.height}`, "num"),
    cell(`${world.spawnX}, ${world.spawnY}`, "num"),
    cell(num(row.portals), "num"),
    cell(num(row.spawns), "num"),
    cell(num(row.items), "num"),
    cell(num(row.online), "num"),
    cell(actions),
  );
}

async function patch(worldId: number, body: Record<string, unknown>, done: string, reload: () => Promise<void>) {
  const ok = await run(null, async () => {
    await ask("/api/admin/world/save", { method: "POST", body: { worldId, ...body } });
  });
  if (!ok) return;
  notify(done);
  await reload();
}

async function createWorld() {
  const answer = await askForm(
    "Novo mundo",
    [
      { id: "name", label: "Nome", value: "Ilha do Norte" },
      { id: "style", label: "Terreno", kind: "select", options: STYLE_OPTIONS, value: "ilha" },
      { id: "width", label: "Largura", kind: "number", value: 64, min: WORLD_MIN_SIZE, max: WORLD_MAX_SIZE },
      { id: "height", label: "Altura", kind: "number", value: 64, min: WORLD_MIN_SIZE, max: WORLD_MAX_SIZE },
      { id: "townRadius", label: "Raio da praça", kind: "number", value: 5, min: 1, max: 24 },
      { id: "autoSpawns", label: "Espalhar monstros sozinho", kind: "check", value: false },
      { id: "published", label: "Abrir para os jogadores", kind: "check", value: true },
    ],
    "Criar",
  );
  if (!answer) return;

  const ok = await run(null, async () => {
    await ask("/api/admin/world/save", {
      method: "POST",
      body: {
        name: answer.name,
        style: answer.style,
        width: Number(answer.width),
        height: Number(answer.height),
        townRadius: Number(answer.townRadius),
        spawnX: Math.floor(Number(answer.width) / 2),
        spawnY: Math.floor(Number(answer.height) / 2),
        autoSpawns: answer.autoSpawns === "true",
        published: answer.published === "true",
      },
    });
  });
  if (!ok) return;
  notify(`${answer.name} foi criado.`);
  await renderWorlds(document.querySelector<HTMLElement>("#panel")!);
}

async function duplicate(world: WorldDef, reload: () => Promise<void>) {
  const name = await askForm("Copiar mundo", [{ id: "name", label: "Nome da cópia", value: `${world.name} 2` }], "Copiar");
  if (!name) return;
  const ok = await run(null, async () => {
    await ask("/api/admin/world/duplicate", { method: "POST", body: { worldId: world.id, name: name.name } });
  });
  if (!ok) return;
  notify(`Cópia de ${world.name} criada (fechada, para você terminar antes de abrir).`);
  await reload();
}

async function removeWorld(world: WorldDef, reload: () => Promise<void>) {
  const sure = await askConfirm(
    `Apagar ${world.name}?`,
    "O mapa, os portais, os ninhos e os tesouros somem. Quem estiver lá volta para o mundo principal.",
    "Apagar",
  );
  if (!sure) return;
  const ok = await run(null, async () => {
    await ask("/api/admin/world/delete", { method: "POST", body: { worldId: world.id } });
  });
  if (!ok) return;
  notify(`${world.name} foi apagado.`);
  await reload();
}

// ---------------------------------------------------------------- editor de mapa

interface Painted {
  ground: number;
  object: number;
}

interface Edit {
  x: number;
  y: number;
  ground: number;
  object: number;
  reset?: boolean;
}

async function renderEditor(root: HTMLElement, worldId: number) {
  const data = await ask<AdminMapResponse>(`/api/admin/map?worldId=${worldId}`);
  const editor = new MapEditor(data);
  root.replaceChildren(editor.root);
  editor.draw();
}

class MapEditor {
  readonly root: HTMLElement;
  private world: WorldDef;
  private base: GameMap;
  private readonly painted = new Map<number, Painted>();
  private portals: PortalDef[];
  private spawns: SpawnDef[];
  private items: GroundItemDef[];

  private tool: Tool = "ground";
  private ground = GROUND_PAINTS[0].id;
  private object = OBJECT_PAINTS[1].id;
  private brush = 1;
  private cell = 7;

  private readonly canvas = h("canvas", { class: "map-canvas" });
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tiles = document.createElement("canvas");
  private readonly info = h("span", { class: "map-where", text: "—" });
  private readonly toolbar = h("div", { class: "map-tools" });
  private readonly palette = h("div", { class: "map-palette" });
  private readonly side = h("div", { class: "map-side" });

  /** Pintura em andamento e o que havia antes, para desfazer. */
  private stroke: Edit[] = [];
  private before: Edit[] = [];
  private readonly history: Edit[][] = [];
  private hover: { x: number; y: number } | null = null;
  private painting = false;

  constructor(data: AdminMapResponse) {
    this.world = data.world;
    this.portals = data.portals;
    this.spawns = data.spawns;
    this.items = data.items;
    this.base = generateMap(shapeOf(data.world));
    for (let i = 0; i + 2 < data.tiles.length; i += 3) {
      this.painted.set(data.tiles[i], { ground: data.tiles[i + 1], object: data.tiles[i + 2] });
    }

    this.ctx = (this.canvas as HTMLCanvasElement).getContext("2d")!;
    this.tiles.width = this.world.width;
    this.tiles.height = this.world.height;

    const box = frame(`Mapa de ${this.world.name}`, `${this.world.width} × ${this.world.height}`, "map");
    box.body.append(
      h(
        "div",
        { class: "row" },
        button("‹ Todos os mundos", () => {
          editing = null;
          void renderWorlds(document.querySelector<HTMLElement>("#panel")!);
        }),
        this.info,
        h("span", { class: "spacer" }),
        button("− zoom", () => this.zoom(-1)),
        button("+ zoom", () => this.zoom(1)),
        button("Desfazer", () => void this.undo()),
        button("Limpar pintura", () => void this.clearPaint(), "bad"),
      ),
      this.toolbar,
      this.palette,
      h("div", { class: "map-stage" }, this.canvas),
    );

    this.root = h("div", { class: "map-editor" }, box.root, this.side);
    this.buildTools();
    this.buildSide();
    this.resize();
    this.wire();
  }

  // ---------------------------------------------------------------- ferramentas

  private buildTools() {
    this.toolbar.replaceChildren(
      ...TOOLS.map((entry) => {
        const node = h(
          "button",
          {
            type: "button",
            class: `tool small ${this.tool === entry.id ? "active" : ""}`.trim(),
            title: entry.label,
            onClick: () => {
              this.tool = entry.id;
              this.buildTools();
              this.buildPalette();
              this.draw();
            },
          },
          icon(entry.mark),
          entry.label,
        );
        return node;
      }),
    );
    this.buildPalette();
  }

  private buildPalette() {
    const swatch = (color: string, label: string, active: boolean, onClick: () => void) => {
      const node = h("button", { type: "button", class: `swatch ${active ? "active" : ""}`.trim(), title: label, onClick });
      node.style.setProperty("--swatch", color === "transparent" ? "#2a3a42" : color);
      node.append(h("span", { text: label }));
      return node;
    };

    if (this.tool === "ground" || this.tool === "bucket") {
      this.palette.replaceChildren(
        ...GROUND_PAINTS.map((paint) =>
          swatch(paint.color, paint.name, this.ground === paint.id, () => {
            this.ground = paint.id;
            this.buildPalette();
          }),
        ),
        this.brushPicker(),
      );
      return;
    }
    if (this.tool === "object") {
      this.palette.replaceChildren(
        ...OBJECT_PAINTS.map((paint) =>
          swatch(paint.color, paint.name, this.object === paint.id, () => {
            this.object = paint.id;
            this.buildPalette();
          }),
        ),
        this.brushPicker(),
      );
      return;
    }
    if (this.tool === "eraser") {
      this.palette.replaceChildren(
        h("p", { class: "note", text: "Clique para devolver o tile ao terreno que o gerador fez." }),
        this.brushPicker(),
      );
      return;
    }

    const hints: Record<string, string> = {
      bucket: "Clique para preencher toda a área do mesmo chão.",
      portal: "Clique num lugar vazio para criar um portal, ou num portal para mudá-lo.",
      spawn: "Clique para pôr um ninho de monstro; clique num ninho para mudá-lo.",
      item: "Clique para pôr um tesouro no chão; clique nele para mudá-lo.",
      center: "Clique para mudar onde os jogadores nascem e voltam à vida.",
    };
    this.palette.replaceChildren(h("p", { class: "note", text: hints[this.tool] ?? "" }));
  }

  private brushPicker() {
    const row = h("div", { class: "brush-picker" }, h("span", { text: "Pincel" }));
    for (const size of [1, 3, 5, 7]) {
      row.append(
        button(
          `${size}`,
          () => {
            this.brush = size;
            this.buildPalette();
          },
          this.brush === size ? "good" : "",
        ),
      );
    }
    return row;
  }

  // ---------------------------------------------------------------- painéis laterais

  private buildSide() {
    this.side.replaceChildren(this.worldBlock(), this.listBlock("portal"), this.listBlock("spawn"), this.listBlock("item"));
  }

  private worldBlock(): HTMLElement {
    const box = block("Dados do mundo", this.world.slug, "globe");
    const fields: FormField[] = [
      { id: "name", label: "Nome", value: this.world.name },
      { id: "style", label: "Terreno", kind: "select", options: STYLE_OPTIONS, value: this.world.style },
      { id: "seed", label: "Semente", kind: "number", value: this.world.seed, min: 0 },
      { id: "width", label: "Largura", kind: "number", value: this.world.width, min: WORLD_MIN_SIZE, max: WORLD_MAX_SIZE },
      { id: "height", label: "Altura", kind: "number", value: this.world.height, min: WORLD_MIN_SIZE, max: WORLD_MAX_SIZE },
      { id: "townRadius", label: "Raio da praça", kind: "number", value: this.world.townRadius, min: 1, max: 24 },
    ];

    box.body.append(
      h(
        "div",
        { class: "mini-grid" },
        ...fields.map((spec) => h("div", { class: "mini-line" }, h("span", { text: spec.label }), h("b", { text: String(spec.value) }))),
        h("div", { class: "mini-line" }, h("span", { text: "Centro" }), h("b", { text: `${this.world.spawnX}, ${this.world.spawnY}` })),
        h(
          "div",
          { class: "mini-line" },
          h("span", { text: "Monstros sozinhos" }),
          h("b", { text: this.world.autoSpawns ? "sim" : "não" }),
        ),
        h("div", { class: "mini-line" }, h("span", { text: "Situação" }), h("b", { text: this.world.published ? "aberto" : "fechado" })),
      ),
      h(
        "div",
        { class: "row" },
        button("Mudar", () => void this.editWorld(fields), "good"),
        button(this.world.autoSpawns ? "Parar monstros" : "Espalhar monstros", () =>
          void this.saveWorld({ autoSpawns: !this.world.autoSpawns }),
        ),
      ),
    );
    return box.root;
  }

  private async editWorld(fields: FormField[]) {
    const answer = await askForm(`Mundo ${this.world.name}`, fields, "Salvar");
    if (!answer) return;
    await this.saveWorld({
      name: answer.name,
      style: answer.style,
      seed: Number(answer.seed),
      width: Number(answer.width),
      height: Number(answer.height),
      townRadius: Number(answer.townRadius),
    });
  }

  private async saveWorld(body: Record<string, unknown>) {
    const ok = await run(null, async () => {
      const answer = await ask<{ world: WorldDef }>("/api/admin/world/save", {
        method: "POST",
        body: { worldId: this.world.id, ...body },
      });
      this.world = answer.world;
    });
    if (!ok) return;
    notify("Mundo salvo.");
    await this.refresh();
  }

  /** Relê o mapa do servidor: o terreno pode ter mudado de tamanho ou de semente. */
  private async refresh() {
    const data = await ask<AdminMapResponse>(`/api/admin/map?worldId=${this.world.id}`);
    this.world = data.world;
    this.portals = data.portals;
    this.spawns = data.spawns;
    this.items = data.items;
    this.base = generateMap(shapeOf(data.world));
    this.painted.clear();
    for (let i = 0; i + 2 < data.tiles.length; i += 3) {
      this.painted.set(data.tiles[i], { ground: data.tiles[i + 1], object: data.tiles[i + 2] });
    }
    this.tiles.width = this.world.width;
    this.tiles.height = this.world.height;
    this.buildSide();
    this.resize();
    this.draw();
  }

  private listBlock(kind: "portal" | "spawn" | "item"): HTMLElement {
    const titles = { portal: "Portais", spawn: "Ninhos de monstro", item: "Tesouros no chão" };
    const marks = { portal: "portal", spawn: "nest", item: "coin" };
    const rows =
      kind === "portal"
        ? this.portals.map((portal) => ({
            id: portal.id,
            label: portal.name || "Portal",
            note: `${portal.x}, ${portal.y} → mundo ${portal.toWorldId} (${portal.toX}, ${portal.toY})`,
          }))
        : kind === "spawn"
          ? this.spawns.map((spawn) => ({
              id: spawn.id,
              label: MONSTERS[spawn.monster]?.name ?? spawn.monster,
              note: `${spawn.x}, ${spawn.y} · ${spawn.amount} vivos · raio ${spawn.radius}`,
            }))
          : this.items.map((item) => ({
              id: item.id,
              label: LOOT[item.loot]?.name ?? item.loot,
              note: `${item.x}, ${item.y} · ${num(item.gold)} ouro · ${num(item.diamonds)} diamantes`,
            }));

    const box = block(titles[kind], `${rows.length}`, marks[kind]);
    if (rows.length === 0) {
      box.body.append(h("p", { class: "note", text: "Nada aqui ainda. Use a ferramenta no mapa para criar." }));
      return box.root;
    }

    for (const row of rows) {
      box.body.append(
        h(
          "div",
          { class: "place-line" },
          h("div", {}, h("strong", { text: row.label }), h("small", { text: row.note })),
          h(
            "div",
            { class: "actions" },
            iconButton("target", "Mostrar no mapa", () => this.focus(kind, row.id)),
            iconButton("scroll", "Mudar", () => void this.editPlacement(kind, row.id)),
            iconButton("trash", "Apagar", () => void this.removePlacement(kind, row.id), "bad"),
          ),
        ),
      );
    }
    return box.root;
  }

  private focus(kind: "portal" | "spawn" | "item", id: number) {
    const found =
      kind === "portal"
        ? this.portals.find((entry) => entry.id === id)
        : kind === "spawn"
          ? this.spawns.find((entry) => entry.id === id)
          : this.items.find((entry) => entry.id === id);
    if (!found) return;
    this.hover = { x: found.x, y: found.y };
    this.info.textContent = `${found.x}, ${found.y}`;
    this.draw();
    const stage = this.canvas.parentElement;
    if (stage) {
      stage.scrollLeft = found.x * this.cell - stage.clientWidth / 2;
      stage.scrollTop = found.y * this.cell - stage.clientHeight / 2;
    }
  }

  // ---------------------------------------------------------------- desenho

  private zoom(step: number) {
    this.cell = Math.min(16, Math.max(3, this.cell + step));
    this.resize();
    this.draw();
  }

  private resize() {
    const canvas = this.canvas as HTMLCanvasElement;
    canvas.width = this.world.width * this.cell;
    canvas.height = this.world.height * this.cell;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
  }

  private tileAt(x: number, y: number): Painted {
    const index = y * this.world.width + x;
    const painted = this.painted.get(index);
    if (painted) return painted;
    return { ground: this.base.ground[index], object: this.base.objects[index] };
  }

  draw() {
    const { width, height } = this.world;
    const ctx = this.ctx;
    const tileCtx = this.tiles.getContext("2d")!;
    const image = tileCtx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const painted = this.painted.get(i);
      const color = groundColor(painted ? painted.ground : this.base.ground[i]);
      image.data[i * 4] = parseInt(color.slice(1, 3), 16);
      image.data[i * 4 + 1] = parseInt(color.slice(3, 5), 16);
      image.data[i * 4 + 2] = parseInt(color.slice(5, 7), 16);
      image.data[i * 4 + 3] = 255;
    }
    tileCtx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.tiles, 0, 0, width * this.cell, height * this.cell);

    // Cenário por cima do chão, para dar para ver os dois.
    const dot = Math.max(2, Math.round(this.cell * 0.55));
    const pad = Math.round((this.cell - dot) / 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = this.tileAt(x, y);
        if (!tile.object) continue;
        ctx.fillStyle = objectColor(tile.object);
        ctx.fillRect(x * this.cell + pad, y * this.cell + pad, dot, dot);
      }
    }

    // Pintado à mão: um contorno leve, para separar do que o gerador fez.
    if (this.cell >= 6) {
      ctx.strokeStyle = "rgba(255, 214, 102, 0.35)";
      ctx.lineWidth = 1;
      for (const index of this.painted.keys()) {
        const x = index % width;
        const y = Math.floor(index / width);
        ctx.strokeRect(x * this.cell + 0.5, y * this.cell + 0.5, this.cell - 1, this.cell - 1);
      }
    }

    this.drawTown(ctx);
    this.drawPlacements(ctx);
    this.drawHover(ctx);
  }

  private drawTown(ctx: CanvasRenderingContext2D) {
    const { spawnX, spawnY, townRadius } = this.world;
    const c = this.cell;
    ctx.strokeStyle = "rgba(255, 235, 170, 0.75)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      (spawnX - townRadius) * c,
      (spawnY - townRadius) * c,
      (townRadius * 2 + 1) * c,
      (townRadius * 2 + 1) * c,
    );
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffd666";
    ctx.beginPath();
    ctx.arc(spawnX * c + c / 2, spawnY * c + c / 2, Math.max(3, c * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.stroke();
  }

  private drawPlacements(ctx: CanvasRenderingContext2D) {
    const c = this.cell;
    const mark = (x: number, y: number, color: string, letter: string) => {
      const cx = x * c + c / 2;
      const cy = y * c + c / 2;
      const r = Math.max(3, c * 0.55);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.stroke();
      if (c < 9) return;
      ctx.fillStyle = "#0b1418";
      ctx.font = `bold ${Math.round(c * 0.6)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, cx, cy + 1);
    };

    for (const portal of this.portals) mark(portal.x, portal.y, "#b07dff", "P");
    for (const spawn of this.spawns) mark(spawn.x, spawn.y, "#e0483d", "M");
    for (const item of this.items) mark(item.x, item.y, "#f2c94c", "$");
  }

  private drawHover(ctx: CanvasRenderingContext2D) {
    if (!this.hover) return;
    const size = this.paintTool() ? this.brush : 1;
    const half = Math.floor(size / 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      (this.hover.x - half) * this.cell + 0.5,
      (this.hover.y - half) * this.cell + 0.5,
      size * this.cell - 1,
      size * this.cell - 1,
    );
  }

  private paintTool(): boolean {
    return this.tool === "ground" || this.tool === "object" || this.tool === "eraser";
  }

  // ---------------------------------------------------------------- mouse

  private wire() {
    const canvas = this.canvas as HTMLCanvasElement;
    const tileOf = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.floor((event.clientX - rect.left) / this.cell),
        y: Math.floor((event.clientY - rect.top) / this.cell),
      };
    };

    canvas.addEventListener("pointerdown", (event) => {
      const at = tileOf(event);
      if (!this.inside(at.x, at.y)) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Alguns navegadores recusam a captura; o desenho segue pelos eventos normais.
      }
      if (this.paintTool()) {
        this.painting = true;
        this.stroke = [];
        this.before = [];
        this.paint(at.x, at.y);
        this.draw();
        return;
      }
      void this.useTool(at.x, at.y);
    });

    canvas.addEventListener("pointermove", (event) => {
      const at = tileOf(event);
      if (!this.inside(at.x, at.y)) return;
      this.hover = at;
      const tile = this.tileAt(at.x, at.y);
      const ground = GROUND_PAINTS.find((paint) => paint.id === tile.ground)?.name ?? "?";
      const object = OBJECT_PAINTS.find((paint) => paint.id === tile.object)?.name ?? "";
      this.info.textContent = `${at.x}, ${at.y} · ${ground}${tile.object ? ` + ${object}` : ""}`;
      if (this.painting) this.paint(at.x, at.y);
      this.draw();
    });

    canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      this.draw();
    });

    const finish = () => {
      if (!this.painting) return;
      this.painting = false;
      void this.flush();
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.world.width && y < this.world.height;
  }

  /** Pinta o pincel inteiro em volta do tile. */
  private paint(cx: number, cy: number) {
    const half = Math.floor(this.brush / 2);
    for (let y = cy - half; y <= cy + half; y++) {
      for (let x = cx - half; x <= cx + half; x++) {
        if (!this.inside(x, y)) continue;
        const index = y * this.world.width + x;
        const current = this.tileAt(x, y);
        const wasPainted = this.painted.get(index);

        if (this.tool === "eraser") {
          if (!wasPainted) continue;
          this.remember(x, y, wasPainted);
          this.painted.delete(index);
          this.stroke.push({ x, y, ground: 0, object: 0, reset: true });
          continue;
        }

        const next: Painted =
          this.tool === "ground"
            ? { ground: this.ground, object: current.object }
            : { ground: current.ground, object: this.object };
        if (wasPainted && wasPainted.ground === next.ground && wasPainted.object === next.object) continue;

        this.remember(x, y, wasPainted);
        this.painted.set(index, next);
        this.stroke.push({ x, y, ...next });
      }
    }
  }

  /** Guarda como o tile estava, para o botão Desfazer. Sem pintura antes, o desfazer apaga. */
  private remember(x: number, y: number, previous: Painted | undefined) {
    if (this.before.some((edit) => edit.x === x && edit.y === y)) return;
    if (previous) this.before.push({ x, y, ...previous });
    else this.before.push({ x, y, ground: 0, object: 0, reset: true });
  }

  private async flush() {
    if (this.stroke.length === 0) return;
    const edits = this.stroke;
    const previous = this.before;
    this.stroke = [];
    this.before = [];

    const ok = await run(null, async () => {
      await ask("/api/admin/world/tiles", { method: "POST", body: { worldId: this.world.id, tiles: edits } });
    });
    if (!ok) {
      await this.refresh();
      return;
    }
    this.history.push(previous);
    if (this.history.length > 40) this.history.shift();
  }

  private async undo() {
    const previous = this.history.pop();
    if (!previous) {
      notify("Nada para desfazer.", false);
      return;
    }
    const ok = await run(null, async () => {
      await ask("/api/admin/world/tiles", { method: "POST", body: { worldId: this.world.id, tiles: previous } });
    });
    if (!ok) return;
    for (const edit of previous) {
      const index = edit.y * this.world.width + edit.x;
      if (edit.reset) this.painted.delete(index);
      else this.painted.set(index, { ground: edit.ground, object: edit.object });
    }
    this.draw();
    notify("Desfeito.");
  }

  private async clearPaint() {
    const sure = await askConfirm(
      "Limpar a pintura?",
      "Todo o mapa volta a ser o terreno que o gerador desenhou. Portais, ninhos e tesouros continuam.",
      "Limpar",
    );
    if (!sure) return;
    const ok = await run(null, async () => {
      await ask("/api/admin/world/tiles", { method: "POST", body: { worldId: this.world.id, clear: true } });
    });
    if (!ok) return;
    this.painted.clear();
    this.history.length = 0;
    notify("Mapa de volta ao terreno original.");
    this.draw();
  }

  // ---------------------------------------------------------------- ferramentas de um clique

  private async useTool(x: number, y: number) {
    if (this.tool === "center") {
      await this.saveWorld({ spawnX: x, spawnY: y });
      return;
    }
    if (this.tool === "bucket") {
      this.fill(x, y);
      this.draw();
      await this.flush();
      return;
    }

    if (this.tool !== "portal" && this.tool !== "spawn" && this.tool !== "item") return;
    const kind = this.tool;
    const here =
      kind === "portal"
        ? this.portals.find((entry) => entry.x === x && entry.y === y)
        : kind === "spawn"
          ? this.spawns.find((entry) => entry.x === x && entry.y === y)
          : this.items.find((entry) => entry.x === x && entry.y === y);
    if (here) await this.editPlacement(kind, here.id);
    else await this.createPlacement(kind, x, y);
  }

  /** Balde: troca o chão de toda a mancha do mesmo tipo. */
  private fill(x: number, y: number) {
    const target = this.tileAt(x, y).ground;
    if (target === this.ground) return;
    this.stroke = [];
    this.before = [];
    const queue = [{ x, y }];
    const seen = new Set<number>([y * this.world.width + x]);

    for (let head = 0; head < queue.length && queue.length < 8000; head++) {
      const at = queue[head];
      const index = at.y * this.world.width + at.x;
      const current = this.tileAt(at.x, at.y);
      this.remember(at.x, at.y, this.painted.get(index));
      this.painted.set(index, { ground: this.ground, object: current.object });
      this.stroke.push({ x: at.x, y: at.y, ground: this.ground, object: current.object });

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = at.x + dx;
        const ny = at.y + dy;
        const next = ny * this.world.width + nx;
        if (!this.inside(nx, ny) || seen.has(next)) continue;
        if (this.tileAt(nx, ny).ground !== target) continue;
        seen.add(next);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  private async createPlacement(kind: "portal" | "spawn" | "item", x: number, y: number) {
    const answer = await askForm(this.placementTitle(kind, true), await this.placementFields(kind, { x, y }), "Criar");
    if (!answer) return;
    await this.savePlacement(kind, { ...this.readPlacement(kind, answer), x, y });
  }

  private async editPlacement(kind: "portal" | "spawn" | "item", id: number) {
    const current =
      kind === "portal"
        ? this.portals.find((entry) => entry.id === id)
        : kind === "spawn"
          ? this.spawns.find((entry) => entry.id === id)
          : this.items.find((entry) => entry.id === id);
    if (!current) return;
    const answer = await askForm(this.placementTitle(kind, false), await this.placementFields(kind, current), "Salvar");
    if (!answer) return;
    await this.savePlacement(kind, { ...this.readPlacement(kind, answer), id, x: current.x, y: current.y });
  }

  private placementTitle(kind: "portal" | "spawn" | "item", creating: boolean): string {
    const names = { portal: "portal", spawn: "ninho", item: "tesouro" };
    return `${creating ? "Novo" : "Mudar"} ${names[kind]}`;
  }

  private async placementFields(kind: "portal" | "spawn" | "item", current: Partial<PortalDef & SpawnDef & GroundItemDef>) {
    if (kind === "portal") {
      const worlds = await ask<AdminWorldsResponse>("/api/admin/worlds");
      const options = worlds.worlds.map((row) => ({ id: String(row.world.id), label: row.world.name }));
      const target = worlds.worlds.find((row) => row.world.id === (current.toWorldId ?? this.world.id))?.world ?? this.world;
      return [
        { id: "name", label: "Nome do portal", value: current.name ?? "" },
        { id: "toWorldId", label: "Leva para o mundo", kind: "select" as const, options, value: String(current.toWorldId ?? this.world.id) },
        { id: "toX", label: "Chega em X", kind: "number" as const, value: current.toX ?? target.spawnX, min: 0 },
        { id: "toY", label: "Chega em Y", kind: "number" as const, value: current.toY ?? target.spawnY, min: 0 },
        { id: "minLevel", label: "Nível mínimo", kind: "number" as const, value: current.minLevel ?? 0, min: 0 },
      ];
    }
    if (kind === "spawn") {
      return [
        { id: "monster", label: "Monstro", kind: "select" as const, options: MONSTER_OPTIONS, value: current.monster ?? "rat" },
        { id: "amount", label: "Quantos vivos", kind: "number" as const, value: current.amount ?? 3, min: 1, max: SPAWN_MAX_AMOUNT },
        { id: "radius", label: "Raio", kind: "number" as const, value: current.radius ?? 3, min: 0, max: SPAWN_MAX_RADIUS },
        {
          id: "respawnMs",
          label: "Volta em (segundos)",
          kind: "number" as const,
          value: Math.round((current.respawnMs ?? 0) / 1000),
          min: 0,
          hint: "0 usa o tempo normal do monstro.",
        },
      ];
    }
    return [
      { id: "loot", label: "Tesouro", kind: "select" as const, options: LOOT_OPTIONS, value: current.loot ?? "chest" },
      { id: "gold", label: "Ouro", kind: "number" as const, value: current.gold ?? 100, min: 0 },
      { id: "diamonds", label: "Diamantes", kind: "number" as const, value: current.diamonds ?? 0, min: 0 },
      {
        id: "respawnMs",
        label: "Volta em (segundos)",
        kind: "number" as const,
        value: Math.round((current.respawnMs ?? 300_000) / 1000),
        min: 10,
      },
    ];
  }

  private readPlacement(kind: "portal" | "spawn" | "item", answer: Record<string, string>): Record<string, unknown> {
    if (kind === "portal") {
      return {
        name: answer.name,
        toWorldId: Number(answer.toWorldId),
        toX: Number(answer.toX),
        toY: Number(answer.toY),
        minLevel: Number(answer.minLevel),
      };
    }
    if (kind === "spawn") {
      return {
        monster: answer.monster as MonsterKind,
        amount: Number(answer.amount),
        radius: Number(answer.radius),
        respawnMs: Number(answer.respawnMs) * 1000,
      };
    }
    return {
      loot: answer.loot as LootKind,
      gold: Number(answer.gold),
      diamonds: Number(answer.diamonds),
      respawnMs: Number(answer.respawnMs) * 1000,
    };
  }

  private async savePlacement(kind: "portal" | "spawn" | "item", body: Record<string, unknown>) {
    const route = { portal: "portal", spawn: "spawn", item: "item" }[kind];
    const ok = await run(null, async () => {
      await ask(`/api/admin/world/${route}`, { method: "POST", body: { worldId: this.world.id, ...body } });
    });
    if (!ok) return;
    notify("Salvo no mapa.");
    await this.refresh();
  }

  private async removePlacement(kind: "portal" | "spawn" | "item", id: number) {
    const route = { portal: "portal", spawn: "spawn", item: "item" }[kind];
    const ok = await run(null, async () => {
      await ask(`/api/admin/world/${route}`, { method: "POST", body: { worldId: this.world.id, id, remove: true } });
    });
    if (!ok) return;
    notify("Apagado.");
    await this.refresh();
  }
}

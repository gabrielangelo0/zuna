import {
  BAKED_DIRS,
  TINT_GROUPS,
  frameKey,
  frontKey,
  type AnimName,
  type SpriteFrameMeta,
  type SpriteSheetMeta,
} from "@zuna/shared";
import { CATALOG, ITEM_ICONS, layerSheets, type EntrySpec, type LayerSheet } from "./catalog.ts";
import { ATLAS_MAX_WIDTH, DIR_YAW, OUTLINE_COLOR, OUTLINE_STRENGTH, PPU, SUPERSAMPLE, TINT_REF } from "./config.ts";
import {
  blit,
  composite,
  createRgba,
  crop,
  downsample,
  downsampleIds,
  maskBy,
  opaqueBounds,
  outline,
  pack,
  toImage,
  touchesEdge,
  type Rgba,
} from "./image.ts";
import { BakeModel } from "./model.ts";
import { BakeRenderer, type View } from "./render.ts";

const logBox = document.querySelector<HTMLElement>("#log")!;

function log(message: string) {
  logBox.textContent += `${message}\n`;
  void fetch("/__bake/log", { method: "POST", body: message }).catch(() => undefined);
}

async function post(path: string, body: BodyInit) {
  const response = await fetch(path, { method: "POST", body });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Tamanho de célula par: o Phaser espelha o sprite em torno do centro da célula,
 * que precisa coincidir exatamente com o pé (âncora).
 */
const evenCell = (size: number) => Math.ceil(size / 2) * 2;

interface BakedFrame {
  key: string;
  image: Rgba;
  ids: Rgba | null;
  seat: { x: number; y: number } | null;
}

/** Objetos parados: cada arquivo × rotação vira um quadro, todos com a escala do primeiro. */
async function bakeProp(renderer: BakeRenderer, spec: EntrySpec): Promise<void> {
  const started = performance.now();
  const files = [spec.file, ...(spec.variants ?? [])];
  const rotations = spec.rotations ?? [0];
  const frames: BakedFrame[] = [];
  const clipped = new Set<string>();
  let scale: number | undefined;
  let view: View | undefined;

  for (const file of files) {
    const model = await BakeModel.create({ ...spec, file });
    renderer.scene.add(model.root);
    try {
      const fit = model.fit(null, scale);
      scale ??= fit.scale;
      if (!view) {
        const size = evenCell(Math.max(spec.height, fit.extent * PPU) * 1.9 * (spec.cellScale ?? 1) + 24);
        view = { cellW: size, cellH: size, anchorX: size / 2, anchorY: Math.round(size * 0.8) };
        renderer.setView(view, fit.radius * 1.6);
      }
      const contact = renderer.contactShadow(fit.footprint);
      for (const rotation of rotations) {
        model.setYaw(rotation);
        model.usePass("lit");
        const lit = downsample(renderer.render("lit"), SUPERSAMPLE);
        const body = composite(outline(lit, OUTLINE_COLOR, OUTLINE_STRENGTH), lit);
        model.usePass("shadow");
        const shadow = composite(contact, downsample(renderer.render("shadow"), SUPERSAMPLE));
        model.usePass("lit");
        const image = composite(shadow, body);
        if (touchesEdge(image)) clipped.add(file.split("/").pop()!);
        frames.push({ key: frameKey("idle", "S", frames.length), image, ids: null, seat: null });
      }
    } finally {
      model.dispose();
    }
    await nextTick();
  }
  if (clipped.size > 0) log(`  aviso: ${spec.id} encostou na borda da célula em: ${[...clipped].join(", ")}`);

  const anims: SpriteSheetMeta["anims"] = { idle: { frames: frames.length, fps: 0, loop: false } };
  const sheet = await saveSheet(spec, view!, anims, frames, false);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  log(`✓ ${spec.id}: ${frames.length} variações, atlas ${sheet.width}×${sheet.height}, ${seconds} s`);
}

async function bakeEntry(renderer: BakeRenderer, spec: EntrySpec): Promise<void> {
  if (spec.variants || Object.keys(spec.anims).length === 0) return bakeProp(renderer, spec);
  const started = performance.now();
  const model = await BakeModel.create(spec);
  renderer.scene.add(model.root);
  try {
    const idle = spec.anims.idle ?? Object.values(spec.anims)[0]!;
    const fit = model.fit(model.clip(idle.clip));
    // Folga para golpes e quedas: a arma e o corpo caído saem bem da silhueta parada.
    const size = evenCell(Math.max(spec.height, fit.extent * PPU) * 2.5 * (spec.cellScale ?? 1) + (spec.lift ?? 0) + 24);
    const view: View = { cellW: size, cellH: size, anchorX: size / 2, anchorY: Math.round(size * 0.74) };
    renderer.setView(view, fit.radius);
    const contact = spec.lift ? null : renderer.contactShadow(fit.footprint);
    const dirs = spec.dirs ?? BAKED_DIRS;

    const frames: BakedFrame[] = [];
    const anims: SpriteSheetMeta["anims"] = {};
    const clipped = new Set<string>();
    for (const [anim, animSpec] of Object.entries(spec.anims) as [AnimName, NonNullable<EntrySpec["anims"][AnimName]>][]) {
      const clip = model.clip(animSpec.clip);
      const duration = clip.duration;
      const fps = (animSpec.frames / Math.max(duration, 0.1)) * (animSpec.speed ?? 1);
      anims[anim] = { frames: animSpec.frames, fps: Math.round(fps * 100) / 100, loop: animSpec.loop };

      for (const dir of dirs) {
        model.setYaw(DIR_YAW[dir]);
        for (let i = 0; i < animSpec.frames; i++) {
          const time =
            animSpec.loop ? (duration * i) / animSpec.frames
            : animSpec.frames > 1 ? (duration * i) / (animSpec.frames - 1)
            : 0;
          model.pose(clip, time, animSpec.loop);

          model.usePass("lit");
          const lit = downsample(renderer.render("lit"), SUPERSAMPLE);
          const body = composite(outline(lit, OUTLINE_COLOR, OUTLINE_STRENGTH), lit);
          let image = body;
          if (animSpec.shadow !== false) {
            model.usePass("shadow");
            let shadow = downsample(renderer.render("shadow"), SUPERSAMPLE);
            if (contact) shadow = composite(contact, shadow);
            image = composite(shadow, image);
          }
          let ids: Rgba | null = null;
          if (model.tintable) {
            model.usePass("ids");
            ids = downsampleIds(renderer.render("ids"), SUPERSAMPLE);
          }
          model.usePass("lit");
          if (touchesEdge(image)) clipped.add(anim);

          const seatWorld = model.seatPosition();
          const seat = seatWorld ? renderer.project(seatWorld) : null;
          if (seat) seat.y -= spec.seatLift ?? 0;
          const key = frameKey(anim, dir, i);
          frames.push({ key, image, ids, seat });

          if (spec.frontMargin !== undefined && seatWorld) {
            model.setClip(renderer.frontPlane(seatWorld, spec.frontMargin));
            const front = downsample(renderer.render("lit"), SUPERSAMPLE);
            model.setClip(null);
            if (opaqueBounds(front)) frames.push({ key: frontKey(key), image: maskBy(body, front), ids: null, seat: null });
          }
        }
        await nextTick();
      }
    }
    if (clipped.size > 0) log(`  aviso: ${spec.id} encostou na borda da célula em: ${[...clipped].join(", ")}`);

    const sheet = await saveSheet(spec, view, anims, frames, model.tintable);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    log(`✓ ${spec.id}: ${frames.length} quadros, atlas ${sheet.width}×${sheet.height}, ${seconds} s`);
  } finally {
    model.dispose();
  }
}

/**
 * Uma camada do personagem (parte do corpo ou equipamento): mesmas animações, direções,
 * escala e célula da folha inteira da roupa, para o jogo empilhar as camadas quadro a quadro.
 */
async function bakeLayer(renderer: BakeRenderer, layer: LayerSheet): Promise<{ bytes: number }> {
  const spec: EntrySpec = { ...layer.outfit, id: layer.id, tint: layer.tint ? layer.outfit.tint : undefined };
  const model = await BakeModel.createLayer(spec, layer.plan);
  renderer.scene.add(model.root);
  try {
    const idle = spec.anims.idle ?? Object.values(spec.anims)[0]!;
    const fit = model.fit(model.clip(idle.clip));
    const size = evenCell(Math.max(spec.height, fit.extent * PPU) * 2.5 * (spec.cellScale ?? 1) + (spec.lift ?? 0) + 24);
    const view: View = { cellW: size, cellH: size, anchorX: size / 2, anchorY: Math.round(size * 0.74) };
    renderer.setView(view, fit.radius);
    const contact = layer.plan.shadow ? renderer.contactShadow(fit.footprint) : null;
    const dirs = spec.dirs ?? BAKED_DIRS;
    const frames: BakedFrame[] = [];
    const anims: SpriteSheetMeta["anims"] = {};
    for (const [anim, animSpec] of Object.entries(spec.anims) as [AnimName, NonNullable<EntrySpec["anims"][AnimName]>][]) {
      const clip = model.clip(animSpec.clip);
      const duration = clip.duration;
      const fps = (animSpec.frames / Math.max(duration, 0.1)) * (animSpec.speed ?? 1);
      anims[anim] = { frames: animSpec.frames, fps: Math.round(fps * 100) / 100, loop: animSpec.loop };
      for (const dir of dirs) {
        model.setYaw(DIR_YAW[dir]);
        for (let i = 0; i < animSpec.frames; i++) {
          const time =
            animSpec.loop ? (duration * i) / animSpec.frames
            : animSpec.frames > 1 ? (duration * i) / (animSpec.frames - 1)
            : 0;
          model.pose(clip, time, animSpec.loop);
          model.usePass("lit");
          const lit = downsample(renderer.render("lit"), SUPERSAMPLE);
          let image = composite(outline(lit, OUTLINE_COLOR, OUTLINE_STRENGTH), lit);
          if (layer.plan.shadow && animSpec.shadow !== false) {
            model.usePass("shadow");
            let shadow = downsample(renderer.render("shadow"), SUPERSAMPLE);
            if (contact) shadow = composite(contact, shadow);
            image = composite(shadow, image);
          }
          let ids: Rgba | null = null;
          if (model.tintable) {
            model.usePass("ids");
            ids = downsampleIds(renderer.render("ids"), SUPERSAMPLE);
          }
          model.usePass("lit");
          const seatWorld = model.seatPosition();
          const seat = seatWorld ? renderer.project(seatWorld) : null;
          if (seat) seat.y -= spec.seatLift ?? 0;
          frames.push({ key: frameKey(anim, dir, i), image, ids, seat });
        }
        await nextTick();
      }
    }
    const sheet = await saveSheet(spec, view, anims, frames, model.tintable, false);
    return { bytes: sheet.width * sheet.height };
  } finally {
    model.dispose();
  }
}

async function bakeLayers(renderer: BakeRenderer, only: string[]) {
  const all = layerSheets();
  const chosen = only.length > 0 ? all.filter((layer) => only.some((prefix) => layer.id.startsWith(prefix))) : all;
  const started = performance.now();
  for (const [index, layer] of chosen.entries()) {
    const t0 = performance.now();
    await bakeLayer(renderer, layer);
    log(`✓ ${layer.id} (${index + 1}/${chosen.length}) ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  // Índice para o jogo saber quais camadas existem em cada roupa.
  const index: Record<string, string[]> = {};
  for (const layer of all) {
    const [, outfit, ...rest] = layer.id.split("_");
    (index[outfit!] ??= []).push(rest.join("_"));
  }
  await post("/__bake/save?file=layers.json", JSON.stringify(index));
  log(`✓ camadas: ${chosen.length} folhas em ${((performance.now() - started) / 1000).toFixed(0)} s`);
}

/** Conferência: cada roupa montada com as partes dela e depois com vários equipamentos. */
async function layerOverview(looks: string[]) {
  const cell = 190;
  const outfits = [...new Set(layerSheets().map((layer) => layer.id.split("_")[1]!))];
  const setups: { title: string; pick: (outfit: string) => string[] }[] = [
    { title: "partes (sem equipamento)", pick: (o) => ["legs", "boots", "torso", "head", "hat", "weapon", "shield"].map((p) => `part_${o}_${p}`) },
    ...looks.map((set) => ({
      title: set,
      pick: (o: string) => {
        const gear = new Map(set.split("+").map((look) => [lookPart(look), `gear_${o}_${look}`]));
        return ["legs", "boots", "torso", "head", "hat", "weapon", "shield"].map((p) => gear.get(p) ?? `part_${o}_${p}`);
      },
    })),
  ];
  const dirs = ["SE", "S", "E", "NE"] as const;
  const canvas = new OffscreenCanvas(outfits.length * cell, setups.length * dirs.length * cell);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5a8a41";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "12px system-ui, sans-serif";
  for (const [col, outfit] of outfits.entries()) {
    for (const [row, setup] of setups.entries()) {
      for (const [d, dir] of dirs.entries()) {
        const y = (row * dirs.length + d) * cell;
        for (const id of setup.pick(outfit)) {
          const loaded = await loadSheet(id, id.startsWith("part_") ? SAMPLE_TINTS[0] : undefined).catch(() => null);
          if (loaded) drawAt(ctx, loaded, frameKey("walk", dir, 2), col * cell + cell / 2, y + cell - 36);
        }
        ctx.fillStyle = "#fff";
        ctx.fillText(`${outfit} · ${setup.title} · ${dir}`, col * cell + 4, y + 12);
      }
    }
  }
  await post("/__bake/preview?file=layers.png", await canvas.convertToBlob({ type: "image/png" }));
  log("✓ conferência das camadas → previews/layers.png");
}

function lookPart(look: string): string {
  if (/^(helm|hat|hood)/.test(look)) return "hat";
  if (/^(armor|robe|tunic)/.test(look)) return "torso";
  if (look.startsWith("legs_")) return "legs";
  if (look.startsWith("boots_")) return "boots";
  if (/shield|spellbook/.test(look)) return "shield";
  return "weapon";
}

async function saveSheet(
  spec: EntrySpec,
  view: View,
  anims: SpriteSheetMeta["anims"],
  frames: BakedFrame[],
  tintable: boolean,
  preview = true,
): Promise<SpriteSheetMeta> {
  const bounds = new Map(frames.map((frame) => [frame.key, opaqueBounds(frame.image) ?? { x: 0, y: 0, w: 1, h: 1 }]));
  const packed = pack(
    frames.map((frame) => ({ key: frame.key, w: bounds.get(frame.key)!.w, h: bounds.get(frame.key)!.h })),
    ATLAS_MAX_WIDTH,
  );
  if (packed.height > 4096) throw new Error(`${spec.id}: atlas grande demais (${packed.width}×${packed.height}).`);

  const atlas = createRgba(packed.width, packed.height);
  const idsAtlas = tintable ? createRgba(packed.width, packed.height) : null;
  const metaFrames: Record<string, SpriteFrameMeta> = {};
  for (const frame of frames) {
    const box = bounds.get(frame.key)!;
    const at = packed.positions.get(frame.key)!;
    blit(atlas, crop(frame.image, box), at.x, at.y);
    if (idsAtlas && frame.ids) blit(idsAtlas, crop(frame.ids, box), at.x, at.y);
    const meta: SpriteFrameMeta = { x: at.x, y: at.y, w: box.w, h: box.h, dx: box.x, dy: box.y };
    if (frame.seat) {
      meta.sx = frame.seat.x;
      meta.sy = frame.seat.y;
    }
    metaFrames[frame.key] = meta;
  }

  const sheet: SpriteSheetMeta = {
    id: spec.id,
    image: `${spec.id}.webp`,
    idsImage: idsAtlas ? `${spec.id}.ids.png` : undefined,
    cellW: view.cellW,
    cellH: view.cellH,
    anchorX: view.anchorX,
    anchorY: view.anchorY,
    headHeight: Math.round(spec.height + (spec.headExtra ?? 8) + (spec.lift ?? 0)),
    tintable,
    tintGain: Math.round((1 / TINT_REF) * 1000) / 1000,
    anims,
    frames: metaFrames,
    width: packed.width,
    height: packed.height,
  };

  // Atlas colorido em WebP (bem menor); o mapa de grupos precisa ser exato, então fica em PNG.
  await post(`/__bake/save?file=${sheet.image}`, await toImage(atlas, "image/webp", 0.95));
  if (idsAtlas && sheet.idsImage) await post(`/__bake/save?file=${sheet.idsImage}`, await toImage(idsAtlas, "image/png"));
  await post(`/__bake/save?file=${spec.id}.json`, JSON.stringify(sheet));
  if (preview) await savePreview(spec, sheet, atlas, idsAtlas);
  return sheet;
}

// ---------------------------------------------------------------- folhas de conferência

function toCanvas(image: Rgba): OffscreenCanvas {
  const canvas = new OffscreenCanvas(image.width, image.height);
  canvas.getContext("2d")!.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas;
}

/** Mesmo cálculo que o cliente faz: cor do pixel × cor escolhida × ganho. */
function tintAtlas(atlas: Rgba, ids: Rgba, colors: number[], gain: number): Rgba {
  const out = createRgba(atlas.width, atlas.height);
  out.data.set(atlas.data);
  for (let i = 0; i < ids.data.length; i += 4) {
    if (ids.data[i + 3] === 0) continue;
    const group = Math.round(ids.data[i] / 40);
    if (group === 0) continue;
    const color = colors[group] ?? 0xffffff;
    out.data[i] = Math.min(255, (out.data[i] * ((color >> 16) & 255) * gain) / 255);
    out.data[i + 1] = Math.min(255, (out.data[i + 1] * ((color >> 8) & 255) * gain) / 255);
    out.data[i + 2] = Math.min(255, (out.data[i + 2] * (color & 255) * gain) / 255);
  }
  return out;
}

/** Cores de teste na ordem de TINT_GROUPS (base, pele, cabelo, principal, secundária, detalhe). */
const SAMPLE_TINTS = [
  [0, 0xf1c7a0, 0x4a2e1a, 0x2563eb, 0x5c3a1e, 0xd9b44a],
  [0, 0x9c6644, 0xe8d08a, 0xdc2626, 0x2b2d33, 0xf4f1ea],
];

async function savePreview(spec: EntrySpec, sheet: SpriteSheetMeta, atlas: Rgba, ids: Rgba | null) {
  const isProp = sheet.anims.idle?.fps === 0;
  const dirs = spec.dirs ?? BAKED_DIRS;
  const animNames = Object.keys(sheet.anims) as AnimName[];
  const rows = animNames.length + (ids ? SAMPLE_TINTS.length : 0);
  const columns = isProp ? sheet.anims.idle!.frames : dirs.length;
  const header = 26;
  const canvas = new OffscreenCanvas(columns * sheet.cellW, rows * sheet.cellH + header);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5a8a41";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, header);
  ctx.fillStyle = "#fff";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(`${spec.id} · ${TINT_GROUPS.length} grupos · linhas: ${animNames.join(", ")}${ids ? ", tingidos" : ""}`, 8, 18);

  const draw = (source: OffscreenCanvas, key: string, col: number, row: number) => {
    const frame = sheet.frames[key];
    if (!frame) return;
    const x = col * sheet.cellW;
    const y = header + row * sheet.cellH;
    ctx.drawImage(source, frame.x, frame.y, frame.w, frame.h, x + frame.dx, y + frame.dy, frame.w, frame.h);
    ctx.fillStyle = "rgba(255, 40, 40, 0.9)";
    ctx.fillRect(x + sheet.anchorX - 1, y + sheet.anchorY - 1, 3, 3);
    if (frame.sx !== undefined && frame.sy !== undefined) {
      ctx.fillStyle = "rgba(40, 200, 255, 0.95)";
      ctx.fillRect(x + sheet.anchorX + frame.sx - 1, y + sheet.anchorY + frame.sy - 1, 3, 3);
    }
  };

  const plain = toCanvas(atlas);
  if (isProp) {
    for (let i = 0; i < columns; i++) draw(plain, frameKey("idle", "S", i), i, 0);
    await post(`/__bake/preview?file=${spec.id}.png`, await canvas.convertToBlob({ type: "image/png" }));
    return;
  }
  animNames.forEach((anim, row) => {
    const middle = Math.floor((sheet.anims[anim]!.frames - 1) / 2);
    dirs.forEach((dir, col) => draw(plain, frameKey(anim, dir, middle), col, row));
  });
  if (ids) {
    SAMPLE_TINTS.forEach((colors, index) => {
      const tinted = toCanvas(tintAtlas(atlas, ids, colors, sheet.tintGain));
      dirs.forEach((dir, col) => draw(tinted, frameKey("idle", dir, 0), col, animNames.length + index));
    });
  }
  await post(`/__bake/preview?file=${spec.id}.png`, await canvas.convertToBlob({ type: "image/png" }));
}

// ---------------------------------------------------------------- ícones de itens

/** Lado de cada ícone no atlas. O cliente mostra em 48–64 px: sobra resolução para telas densas. */
const ICON_SIZE = 112;

/** Todos os ícones numa folha só: quadrados do mesmo tamanho, com o objeto centralizado. */
async function bakeIcons(renderer: BakeRenderer, only: string[]) {
  const started = performance.now();
  const specs = only.length > 0 ? ITEM_ICONS.filter((spec) => only.includes(spec.id)) : ITEM_ICONS;
  const view: View = { cellW: ICON_SIZE, cellH: ICON_SIZE, anchorX: ICON_SIZE / 2, anchorY: ICON_SIZE / 2 };
  renderer.setView(view, 2);
  const frames: { id: string; image: Rgba }[] = [];
  const target = (ICON_SIZE * 0.84) / PPU;
  for (const spec of specs) {
    const model = await BakeModel.create(spec);
    renderer.scene.add(model.root);
    try {
      model.setYaw(0);
      // Primeira foto para medir; a segunda ocupa o quadro inteiro, seja qual for o formato da peça.
      let radius = target / 2;
      let image: Rgba | null = null;
      for (let pass = 0; pass < 2; pass++) {
        model.center(radius);
        model.usePass("lit");
        const lit = downsample(renderer.render("lit"), SUPERSAMPLE);
        image = composite(outline(lit, OUTLINE_COLOR, OUTLINE_STRENGTH), lit);
        const bounds = opaqueBounds(image);
        if (!bounds) throw new Error(`${spec.id}: ícone vazio.`);
        radius *= (ICON_SIZE * 0.86) / Math.max(bounds.w, bounds.h);
      }
      frames.push({ id: spec.id, image: image! });
    } finally {
      model.dispose();
    }
    await nextTick();
  }

  const columns = Math.min(frames.length, Math.floor(ATLAS_MAX_WIDTH / ICON_SIZE));
  const rows = Math.ceil(frames.length / columns);
  const atlas = createRgba(columns * ICON_SIZE, rows * ICON_SIZE);
  const icons: Record<string, [number, number]> = {};
  frames.forEach((frame, index) => {
    const x = (index % columns) * ICON_SIZE;
    const y = Math.floor(index / columns) * ICON_SIZE;
    blit(atlas, frame.image, x, y);
    icons[frame.id] = [x, y];
  });
  await post("/__bake/save?file=items.webp", await toImage(atlas, "image/webp", 0.95));
  await post("/__bake/save?file=items.json", JSON.stringify({ image: "items.webp", size: ICON_SIZE, width: atlas.width, height: atlas.height, icons }));

  // Conferência: os ícones sobre o fundo escuro do inventário, com o nome embaixo.
  const label = 16;
  const canvas = new OffscreenCanvas(columns * ICON_SIZE, rows * (ICON_SIZE + label));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#101a2c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px system-ui, sans-serif";
  const plain = toCanvas(atlas);
  frames.forEach((frame, index) => {
    const x = (index % columns) * ICON_SIZE;
    const y = Math.floor(index / columns) * (ICON_SIZE + label);
    ctx.drawImage(plain, x, Math.floor(index / columns) * ICON_SIZE, ICON_SIZE, ICON_SIZE, x, y, ICON_SIZE, ICON_SIZE);
    ctx.fillStyle = "#cfe0ff";
    ctx.fillText(frame.id, x + 4, y + ICON_SIZE + 12);
  });
  await post("/__bake/preview?file=items.png", await canvas.convertToBlob({ type: "image/png" }));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  log(`✓ ícones: ${frames.length} itens, atlas ${atlas.width}×${atlas.height}, ${seconds} s`);
}

// ---------------------------------------------------------------- mostruário

async function survey(renderer: BakeRenderer, folder: string) {
  const files = (await (await fetch(`/__bake/list?dir=${encodeURIComponent(folder)}`)).json()) as string[];
  const cell = 150;
  const perRow = 4;
  const labelHeight = 16;
  const canvas = new OffscreenCanvas(perRow * cell * 2, Math.ceil(files.length / perRow) * (cell + labelHeight));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5a8a41";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "12px system-ui, sans-serif";

  for (const [index, file] of files.entries()) {
    const x = (index % perRow) * cell * 2;
    const y = Math.floor(index / perRow) * (cell + labelHeight);
    const spec: EntrySpec = { id: file, file: `${folder}/${file}`, height: 64, anims: {} };
    try {
      const model = await BakeModel.create(spec);
      renderer.scene.add(model.root);
      const idleName = ["Flying_Idle", "Idle"].find((name) => {
        try {
          model.clip(name);
          return true;
        } catch {
          return false;
        }
      });
      const idle = model.clip(idleName ?? "Idle");
      const fit = model.fit(idle);
      renderer.setView({ cellW: cell, cellH: cell, anchorX: cell / 2, anchorY: cell - 30 }, fit.radius);
      for (const [col, yaw] of [0, 45].entries()) {
        model.setYaw(yaw);
        model.pose(idle, 0, true);
        model.usePass("lit");
        const lit = toCanvas(downsample(renderer.render("lit"), SUPERSAMPLE));
        ctx.drawImage(lit, x + col * cell, y + labelHeight);
      }
      model.dispose();
      ctx.fillStyle = "#fff";
      ctx.fillText(file, x + 4, y + 12);
    } catch (error) {
      ctx.fillStyle = "#ffb4a8";
      ctx.fillText(`${file}: ${(error as Error).message.slice(0, 40)}`, x + 4, y + 12);
    }
    await nextTick();
  }
  const name = `survey-${folder.replace(/\W+/g, "-")}.png`;
  await post(`/__bake/preview?file=${name}`, await canvas.convertToBlob({ type: "image/png" }));
  log(`✓ mostruário ${folder}: ${files.length} modelos → previews/${name}`);
}

// ---------------------------------------------------------------- visão geral dos sprites prontos

interface LoadedSheet {
  sheet: SpriteSheetMeta;
  image: OffscreenCanvas;
}

async function fetchImage(file: string): Promise<ImageBitmap> {
  const response = await fetch(`/__bake/sprite/${file}`);
  if (!response.ok) throw new Error(`${file} não encontrado. Gere os sprites antes da visão geral.`);
  return createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
}

function bitmapToRgba(bitmap: ImageBitmap): Rgba {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return { width: bitmap.width, height: bitmap.height, data };
}

async function loadSheet(id: string, colors?: number[]): Promise<LoadedSheet> {
  const sheet = (await (await fetch(`/__bake/sprite/${id}.json`)).json()) as SpriteSheetMeta;
  let atlas = bitmapToRgba(await fetchImage(sheet.image));
  if (colors && sheet.idsImage) atlas = tintAtlas(atlas, bitmapToRgba(await fetchImage(sheet.idsImage)), colors, sheet.tintGain);
  return { sheet, image: toCanvas(atlas) };
}

/** Desenha um quadro com o pé em (x, y). Devolve o quadro para quem precisa do ponto de encaixe. */
function drawAt(ctx: OffscreenCanvasRenderingContext2D, loaded: LoadedSheet, key: string, x: number, y: number) {
  const frame = loaded.sheet.frames[key];
  if (!frame) throw new Error(`${loaded.sheet.id}: quadro ${key} não existe.`);
  ctx.drawImage(loaded.image, frame.x, frame.y, frame.w, frame.h, x - loaded.sheet.anchorX + frame.dx, y - loaded.sheet.anchorY + frame.dy, frame.w, frame.h);
  return frame;
}

async function overview() {
  const cell = 170;
  const rows: { title: string; items: { label: string; draw: (ctx: OffscreenCanvasRenderingContext2D, x: number, y: number) => void }[] }[] = [];
  const byKind = (prefix: string) => CATALOG.filter((entry) => entry.id.startsWith(prefix));

  const outfitItems = [];
  for (const [index, entry] of byKind("outfit_").entries()) {
    const loaded = await loadSheet(entry.id, SAMPLE_TINTS[index % SAMPLE_TINTS.length]);
    outfitItems.push({ label: entry.id.slice(7), draw: (ctx: OffscreenCanvasRenderingContext2D, x: number, y: number) => void drawAt(ctx, loaded, frameKey("idle", "SE", 0), x, y) });
  }
  rows.push({ title: "Roupas (tingidas com cores de teste)", items: outfitItems });

  for (const [title, prefix] of [["Monstros", "monster_"], ["Mascotes", "pet_"], ["Montarias", "mount_"]] as const) {
    const items = [];
    for (const entry of byKind(prefix)) {
      const loaded = await loadSheet(entry.id);
      items.push({ label: entry.id.slice(prefix.length), draw: (ctx: OffscreenCanvasRenderingContext2D, x: number, y: number) => void drawAt(ctx, loaded, frameKey("idle", "SE", 0), x, y) });
    }
    rows.push({ title, items });
  }

  // Cavaleiro na sela: o quadril do cavaleiro vai para o ponto da sela, como no cliente.
  const riders = [await loadSheet("outfit_cavaleiroReal", SAMPLE_TINTS[0]), await loadSheet("outfit_mago", SAMPLE_TINTS[1])];
  for (const dir of ["SE", "E", "S"] as const) {
    const items = [];
    for (const entry of byKind("mount_")) {
      const mountSheet = await loadSheet(entry.id);
      const rider = riders[dir === "E" ? 1 : 0];
      items.push({
        label: `${entry.id.slice(6)} ${dir}`,
        draw: (ctx: OffscreenCanvasRenderingContext2D, x: number, y: number) => {
          const key = frameKey("walk", dir, 2);
          const mountFrame = drawAt(ctx, mountSheet, key, x, y);
          const riderFrame = rider.sheet.frames[frameKey("ride", dir, 0)];
          if (mountFrame.sx === undefined || riderFrame?.sx === undefined) return;
          drawAt(ctx, rider, frameKey("ride", dir, 0), x + mountFrame.sx - riderFrame.sx, y + mountFrame.sy! - riderFrame.sy!);
          if (mountSheet.sheet.frames[frontKey(key)]) drawAt(ctx, mountSheet, frontKey(key), x, y);
        },
      });
    }
    rows.push({ title: `Montado (${dir})`, items });
  }

  const columns = Math.max(...rows.map((row) => row.items.length));
  const titleHeight = 20;
  const canvas = new OffscreenCanvas(columns * cell, rows.length * (cell + titleHeight));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5a8a41";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "12px system-ui, sans-serif";
  rows.forEach((row, rowIndex) => {
    const top = rowIndex * (cell + titleHeight);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, top, canvas.width, titleHeight);
    ctx.fillStyle = "#fff";
    ctx.fillText(row.title, 6, top + 14);
    row.items.forEach((item, col) => {
      item.draw(ctx, col * cell + cell / 2, top + titleHeight + cell - 34);
      ctx.fillStyle = "#fff";
      ctx.fillText(item.label, col * cell + 6, top + titleHeight + cell - 8);
    });
  });
  await post("/__bake/preview?file=overview.png", await canvas.convertToBlob({ type: "image/png" }));
  log("✓ visão geral → previews/overview.png");
}

// ---------------------------------------------------------------- execução

async function run(params: URLSearchParams) {
  const renderer = new BakeRenderer();
  document.querySelector("#stage")!.append(renderer.renderer.domElement);
  const done = (message: string) => post("/__bake/done", message);
  try {
    if (params.get("mode") === "survey") {
      const folders = (params.get("only") || "quaternius/monsters,quaternius/animals").split(",");
      for (const folder of folders) await survey(renderer, folder);
      await done(`ok: mostruário de ${folders.join(", ")}`);
      return;
    }
    if (params.get("mode") === "layers") {
      await bakeLayers(renderer, (params.get("only") ?? "").split(",").filter(Boolean));
      await done("ok: camadas geradas");
      return;
    }
    if (params.get("mode") === "layer-overview") {
      await layerOverview((params.get("only") ?? "").split(",").filter(Boolean));
      await done("ok: conferência das camadas");
      return;
    }
    if (params.get("mode") === "icons") {
      await bakeIcons(renderer, (params.get("only") ?? "").split(",").filter(Boolean));
      await done("ok: ícones de itens gerados");
      return;
    }
    if (params.get("mode") === "overview") {
      await overview();
      await done("ok: visão geral gerada");
      return;
    }
    const ids = (params.get("only") ?? "").split(",").filter(Boolean);
    const unknown = ids.filter((id) => !CATALOG.some((entry) => entry.id === id));
    if (unknown.length > 0) throw new Error(`ids desconhecidos: ${unknown.join(", ")}`);
    const entries = ids.length > 0 ? CATALOG.filter((entry) => ids.includes(entry.id)) : CATALOG;
    for (const entry of entries) await bakeEntry(renderer, entry);
    await done(`ok: ${entries.length} sprites gerados`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`erro: ${message}`);
    console.error(error);
    await done(`erro: ${message}`);
  }
}

const params = new URLSearchParams(location.search);
if (params.get("auto") === "1") {
  void run(params);
} else {
  log(`Itens do catálogo: ${CATALOG.map((entry) => entry.id).join(", ")}`);
}

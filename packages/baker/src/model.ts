import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { TINT_GROUPS } from "@zuna/shared";
import type { EntrySpec, TintSpec } from "./catalog.ts";
import { PALETTE_COLS, PALETTE_ROWS, PITCH, PPU, TINT_REF } from "./config.ts";
import type { Pass } from "./render.ts";
import { builtinModel } from "./shapes.ts";

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();

export function loadGltf(file: string): Promise<GLTF> {
  let pending = gltfCache.get(file);
  if (!pending) {
    if (file.startsWith("builtin:")) {
      pending = Promise.resolve(builtinModel(file.slice("builtin:".length)));
      gltfCache.set(file, pending);
      return pending;
    }
    const url = `/${file.split("/").map(encodeURIComponent).join("/")}`;
    pending = loader.loadAsync(url);
    gltfCache.set(file, pending);
  }
  return pending;
}

const textureLoader = new THREE.TextureLoader();

async function loadTexture(file: string): Promise<THREE.Texture> {
  const texture = await textureLoader.loadAsync(`/${file.split("/").map(encodeURIComponent).join("/")}`);
  // Mesmas convenções das texturas do glTF.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface PassMaterials {
  mesh: THREE.Mesh;
  lit: THREE.Material;
  ids: THREE.Material;
  shadow: THREE.Material;
}

interface PaletteMaps {
  gray: THREE.Texture;
  ids: THREE.Texture;
}

const paletteCache = new WeakMap<object, Map<string, PaletteMaps>>();

/**
 * A partir da textura de paleta: uma versão com as partes tingíveis em cinza (brilho médio TINT_REF)
 * e um mapa de grupos (canal R = índice do grupo × 40).
 */
function paletteMaps(image: CanvasImageSource & { width: number; height: number }, tint: TintSpec): PaletteMaps {
  const cacheKey = JSON.stringify(tint);
  let byTint = paletteCache.get(image);
  if (!byTint) paletteCache.set(image, (byTint = new Map()));
  const cached = byTint.get(cacheKey);
  if (cached) return cached;

  const { width, height } = image;
  const grayCanvas = new OffscreenCanvas(width, height);
  const grayCtx = grayCanvas.getContext("2d", { willReadFrequently: true })!;
  grayCtx.drawImage(image, 0, 0);
  const pixels = grayCtx.getImageData(0, 0, width, height);
  const idsCanvas = new OffscreenCanvas(width, height);
  const idsCtx = idsCanvas.getContext("2d")!;
  const ids = idsCtx.createImageData(width, height);
  for (let i = 3; i < ids.data.length; i += 4) ids.data[i] = 255;

  const cellW = width / PALETTE_COLS;
  const cellH = height / PALETTE_ROWS;
  for (const [group, cells] of Object.entries(tint)) {
    const groupIndex = TINT_GROUPS.indexOf(group as (typeof TINT_GROUPS)[number]);
    for (const cell of cells ?? []) {
      const [row, col] = cell.split(",").map(Number);
      const x0 = Math.round(col * cellW);
      const y0 = Math.round(row * cellH);
      const x1 = Math.round((col + 1) * cellW);
      const y1 = Math.round((row + 1) * cellH);
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) sum += luminance(pixels.data, (y * width + x) * 4);
      }
      const mean = Math.max(1e-3, sum / ((x1 - x0) * (y1 - y0)));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const value = Math.min(255, (TINT_REF * 255 * luminance(pixels.data, i)) / mean);
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
          ids.data[i] = groupIndex * 40;
        }
      }
    }
  }
  grayCtx.putImageData(pixels, 0, 0);
  idsCtx.putImageData(ids, 0, 0);

  const gray = new THREE.CanvasTexture(grayCanvas);
  gray.flipY = false;
  gray.colorSpace = THREE.SRGBColorSpace;
  const idTexture = new THREE.CanvasTexture(idsCanvas);
  idTexture.flipY = false;
  idTexture.colorSpace = THREE.NoColorSpace;
  idTexture.magFilter = THREE.NearestFilter;
  idTexture.minFilter = THREE.NearestFilter;
  idTexture.generateMipmaps = false;

  const maps = { gray, ids: idTexture };
  byTint.set(cacheKey, maps);
  return maps;
}

/** O GLTFLoader tira caracteres reservados dos nomes ("handslot.r" vira "handslotr"): aceita os dois. */
function findNode(object: THREE.Object3D, name: string): THREE.Object3D | null {
  return object.getObjectByName(name) ?? object.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ?? null;
}

function luminance(data: Uint8ClampedArray, i: number): number {
  return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
}

/**
 * Uma camada do personagem: só algumas peças aparecem; o resto do corpo fica invisível,
 * mas continua escondendo o que está atrás dele (profundidade), para as camadas se encaixarem.
 */
export interface LayerPlan {
  /** Nós do próprio personagem que aparecem ("@attach" = os modelos presos por `attach`). */
  show: string[];
  /** Divide as pernas pelo osso: "boots" fica só com os pés, "legs" com o resto. */
  split?: LegSplit;
  /** Peças de outro personagem (mesmo esqueleto), religadas a este e mostradas. */
  borrow?: { file: string; nodes: string[]; split?: LegSplit };
  /** Modelo solto preso a um osso e mostrado (arma na mão direita, escudo na esquerda). */
  hold?: { bone: string; file: string };
  /** Inclui a sombra do corpo inteiro (vai numa camada só, a da cabeça). */
  shadow: boolean;
  /** Partes do personagem que o equipamento substitui: somem de vez (nem tampam). */
  hide?: string[];
  /** Nas pernas escondidas, só esta metade some; a outra continua tampando. */
  hideSplit?: LegSplit;
}

export type LegSplit = "legs" | "boots";

/** O GLTFLoader tira o ponto dos nomes: "foot.l" vira "footl". */
const FOOT_BONE = /^(foot|toes)\.?[lr]$/;

/** O osso que mais puxa cada vértice. */
function dominantBones(mesh: THREE.SkinnedMesh): string[] {
  const index = mesh.geometry.getAttribute("skinIndex");
  const weight = mesh.geometry.getAttribute("skinWeight");
  const names: string[] = [];
  for (let i = 0; i < index.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
    names.push(mesh.skeleton.bones[index.getComponent(i, best)]?.name ?? "");
  }
  return names;
}

/** Cópia da malha só com os triângulos do pé (ou só com os de fora do pé). */
function splitLeg(mesh: THREE.SkinnedMesh, keep: LegSplit): THREE.SkinnedMesh {
  const bones = dominantBones(mesh);
  const source = mesh.geometry.index;
  const count = source ? source.count : mesh.geometry.getAttribute("position").count;
  const kept: number[] = [];
  for (let i = 0; i < count; i += 3) {
    const tri = [0, 1, 2].map((k) => (source ? source.getX(i + k) : i + k));
    const feet = tri.filter((vertex) => FOOT_BONE.test(bones[vertex] ?? "")).length;
    if ((feet >= 2) === (keep === "boots")) kept.push(...tri);
  }
  const geometry = mesh.geometry.clone();
  geometry.setIndex(kept);
  const part = new THREE.SkinnedMesh(geometry, mesh.material);
  part.name = `${mesh.name}_${keep}`;
  part.position.copy(mesh.position);
  part.quaternion.copy(mesh.quaternion);
  part.scale.copy(mesh.scale);
  part.bind(mesh.skeleton, mesh.bindMatrix);
  return part;
}

export interface Fit {
  /** Escala aplicada ao modelo (para repetir em variações do mesmo objeto). */
  scale: number;
  /** Maior dimensão horizontal, em unidades do mundo (já escalada). */
  extent: number;
  /** Raio aproximado, para enquadrar a sombra. */
  radius: number;
  /** Largura da base, para a sombra de contato. */
  footprint: number;
}

/** Um modelo pronto para fotografar: escala, direção, pose e materiais por passada. */
export class BakeModel {
  /** Gira para a direção desenhada. */
  readonly root = new THREE.Group();
  /** Escala e centraliza o modelo sobre a âncora. */
  private readonly scaler = new THREE.Group();
  /** Inclinação para frente (voadores usados como montaria). */
  private readonly tilt = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly materials: PassMaterials[] = [];
  readonly seat: THREE.Object3D | null;

  private constructor(
    readonly spec: EntrySpec,
    private readonly object: THREE.Object3D,
    private readonly clips: THREE.AnimationClip[],
  ) {
    this.root.add(this.scaler);
    this.scaler.add(this.tilt);
    this.tilt.add(object);
    // Rotação positiva em X leva o topo (+Y) para a frente (+Z): o modelo "deita" para voar.
    this.tilt.rotation.x = THREE.MathUtils.degToRad(spec.pitch ?? 0);
    this.tilt.rotation.z = THREE.MathUtils.degToRad(spec.roll ?? 0);
    this.mixer = new THREE.AnimationMixer(object);
    this.seat = spec.seatBone ? findNode(object, spec.seatBone) : null;
    if (spec.seatBone && !this.seat) throw new Error(`${spec.id}: osso "${spec.seatBone}" não encontrado.`);
  }

  /**
   * Personagem em camadas: tudo o que não é da camada vira só profundidade.
   * A escala é medida no corpo do próprio personagem, igual à da folha inteira.
   */
  static async createLayer(spec: EntrySpec, plan: LayerPlan): Promise<BakeModel> {
    const gltf = await loadGltf(spec.file);
    const object = SkeletonUtils.clone(gltf.scene);
    const hidden = new Set((spec.accessories ?? []).filter((name) => !(spec.show ?? []).includes(name)));
    object.traverse((node) => {
      if (hidden.has(node.name)) node.visible = false;
    });
    const showSet = new Set(plan.show);
    const hideSet = new Set(plan.hide ?? []);

    for (const attachment of spec.attach ?? []) {
      const bone = findNode(object, attachment.bone);
      if (!bone) throw new Error(`${spec.id}: osso "${attachment.bone}" não encontrado para ${attachment.file}.`);
      const held = (await loadGltf(attachment.file)).scene.clone(true);
      held.userData.attached = true;
      bone.add(held);
    }

    // Papel de cada malha do personagem: aparece ou só tampa.
    const meshes: THREE.Mesh[] = [];
    object.traverse((node) => {
      if ((node as THREE.Mesh).isMesh && node.visible) meshes.push(node as THREE.Mesh);
    });
    for (const mesh of meshes) {
      let attached = false;
      for (let current: THREE.Object3D | null = mesh; current; current = current.parent) if (current.userData.attached) attached = true;
      const shown = attached ? showSet.has("@attach") : namedLike(mesh, (name) => showSet.has(name));
      const isLeg = namedLike(mesh, (name) => /_Leg(Left|Right)$/.test(name));
      const replaced = attached ? hideSet.has("@attach") : namedLike(mesh, (name) => hideSet.has(name));
      if (replaced) {
        if (plan.hideSplit && isLeg && (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
          const rest = splitLeg(mesh as THREE.SkinnedMesh, plan.hideSplit === "boots" ? "legs" : "boots");
          rest.userData.occluder = true;
          mesh.parent!.add(rest);
        }
        mesh.removeFromParent();
        continue;
      }
      if (shown && plan.split && isLeg && (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        // Metade que aparece + metade que só tampa.
        const skinned = mesh as THREE.SkinnedMesh;
        const visible = splitLeg(skinned, plan.split);
        const other = splitLeg(skinned, plan.split === "boots" ? "legs" : "boots");
        other.userData.occluder = true;
        mesh.parent!.add(visible, other);
        mesh.removeFromParent();
        continue;
      }
      if (!shown) mesh.userData.occluder = true;
    }

    // Peças emprestadas de outro personagem: mesmo esqueleto, religadas aos ossos deste.
    if (plan.borrow) {
      const donor = SkeletonUtils.clone((await loadGltf(plan.borrow.file)).scene);
      donor.updateMatrixWorld(true);
      const wanted = new Set(plan.borrow.nodes);
      const parts: THREE.SkinnedMesh[] = [];
      const rigid: THREE.Mesh[] = [];
      donor.traverse((node) => {
        const mesh = node as THREE.SkinnedMesh;
        if (!mesh.isMesh || !namedLike(mesh, (name) => wanted.has(name))) return;
        if (mesh.isSkinnedMesh) parts.push(mesh);
        else rigid.push(mesh);
      });
      if (parts.length + rigid.length === 0) {
        throw new Error(`${spec.id}: nenhuma peça ${plan.borrow.nodes.join(", ")} em ${plan.borrow.file}.`);
      }
      // Peça rígida (elmo, chapéu): presa ao osso de mesmo nome, na mesma posição em relação a ele.
      for (const mesh of rigid) {
        let bone: THREE.Object3D | null = mesh.parent;
        while (bone && !(bone as THREE.Bone).isBone) bone = bone.parent;
        if (!bone) throw new Error(`${spec.id}: ${mesh.name} não está presa a nenhum osso.`);
        const target = findNode(object, bone.name);
        if (!target) throw new Error(`${spec.id}: osso "${bone.name}" não existe neste personagem.`);
        const local = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(mesh.matrixWorld);
        const copy = mesh.clone();
        local.decompose(copy.position, copy.quaternion, copy.scale);
        copy.userData.noFit = true;
        target.add(copy);
      }
      const anchor = meshes.find((mesh) => (mesh as THREE.SkinnedMesh).isSkinnedMesh)?.parent ?? object;
      for (const part of parts) {
        const bones = part.skeleton.bones.map((bone) => {
          const target = findNode(object, bone.name);
          if (!target) throw new Error(`${spec.id}: osso "${bone.name}" não existe neste personagem.`);
          return target as THREE.Bone;
        });
        let mesh: THREE.SkinnedMesh = part;
        mesh.bind(new THREE.Skeleton(bones, part.skeleton.boneInverses), part.bindMatrix);
        if (plan.borrow.split) mesh = splitLeg(mesh, plan.borrow.split);
        mesh.userData.noFit = true;
        anchor.add(mesh);
      }
    }

    if (plan.hold) {
      const bone = findNode(object, plan.hold.bone);
      if (!bone) throw new Error(`${spec.id}: osso "${plan.hold.bone}" não encontrado.`);
      const held = (await loadGltf(plan.hold.file)).scene.clone(true);
      held.traverse((node) => (node.userData.noFit = true));
      bone.add(held);
    }

    const model = new BakeModel(spec, object, gltf.animations);
    model.prepareMaterials(new Map());
    return model;
  }

  static async create(spec: EntrySpec): Promise<BakeModel> {
    const gltf = await loadGltf(spec.file);
    const object = SkeletonUtils.clone(gltf.scene);

    const hidden = new Set((spec.accessories ?? []).filter((name) => !(spec.show ?? []).includes(name)));
    object.traverse((node) => {
      if (hidden.has(node.name)) node.visible = false;
    });
    const only = spec.only;
    if (only) {
      object.traverse((node) => {
        if ((node as THREE.Mesh).isMesh && !namedLike(node, (name) => only.includes(name))) node.visible = false;
      });
    }
    // Ícone de calça ou de bota: só a metade da perna que interessa.
    if (spec.split) {
      const legs: THREE.SkinnedMesh[] = [];
      object.traverse((node) => {
        const mesh = node as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh && mesh.visible && namedLike(mesh, (name) => /_Leg(Left|Right)$/.test(name))) legs.push(mesh);
      });
      for (const mesh of legs) {
        mesh.parent!.add(splitLeg(mesh, spec.split));
        mesh.removeFromParent();
      }
    }

    for (const attachment of spec.attach ?? []) {
      const bone = findNode(object, attachment.bone);
      if (!bone) throw new Error(`${spec.id}: osso "${attachment.bone}" não encontrado para ${attachment.file}.`);
      bone.add((await loadGltf(attachment.file)).scene.clone(true));
    }

    const textures = new Map<string, THREE.Texture>();
    for (const [material, file] of Object.entries(spec.retexture ?? {})) textures.set(material, await loadTexture(file));

    const model = new BakeModel(spec, object, gltf.animations);
    model.prepareMaterials(textures);
    return model;
  }

  get tintable(): boolean {
    return this.spec.tint !== undefined;
  }

  private prepareMaterials(textures: Map<string, THREE.Texture>) {
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    // Só escreve profundidade: esconde o que está atrás sem aparecer.
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
    const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      if (mesh.userData.occluder) {
        this.materials.push({ mesh, lit: depthOnly, ids: depthOnly, shadow: shadowOnly });
        return;
      }
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const lit = source.clone() as THREE.MeshStandardMaterial;
      if (lit.isMeshStandardMaterial) {
        // Sem mapa de ambiente, metal fica preto: o visual estilizado pede superfícies foscas.
        lit.metalness = 0;
        lit.roughness = Math.max(0.78, lit.roughness);
      }
      if (this.spec.hue !== undefined) lit.color.multiply(new THREE.Color(this.spec.hue));
      const recolor = this.spec.recolor?.[source.name];
      if (recolor !== undefined) lit.color.setHex(recolor);
      const flat = this.spec.flat?.[source.name];
      if (flat !== undefined) {
        lit.map = null;
        lit.color.setHex(flat);
      }
      const texture = textures.get(source.name);
      if (texture) lit.map = texture;

      let ids: THREE.Material = black;
      if (this.spec.tint && lit.map?.image) {
        const maps = paletteMaps(lit.map.image as CanvasImageSource & { width: number; height: number }, this.spec.tint);
        lit.map = maps.gray;
        ids = new THREE.MeshBasicMaterial({ map: maps.ids, toneMapped: false });
      }
      const shadow = lit.clone();
      shadow.colorWrite = false;
      shadow.depthWrite = false;
      this.materials.push({ mesh, lit, ids, shadow });
    });
  }

  clip(name: string): THREE.AnimationClip {
    const found = this.clips.find((clip) => clip.name === name) ?? this.clips.find((clip) => clip.name.endsWith(`|${name}`));
    if (!found) {
      throw new Error(`${this.spec.id}: animação "${name}" não existe. Há: ${this.clips.map((c) => c.name).join(", ")}`);
    }
    return found;
  }

  pose(clip: THREE.AnimationClip, time: number, loop: boolean) {
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.play();
    this.mixer.setTime(time);
    this.root.updateMatrixWorld(true);
  }

  setYaw(degrees: number) {
    this.root.rotation.y = THREE.MathUtils.degToRad(degrees + (this.spec.yaw ?? 0));
    this.root.updateMatrixWorld(true);
  }

  usePass(pass: Pass) {
    for (const entry of this.materials) entry.mesh.material = entry[pass];
  }

  /** Corta o modelo por um plano (só na passada colorida). `null` desliga o corte. */
  setClip(plane: THREE.Plane | null) {
    for (const { lit } of this.materials) {
      lit.clippingPlanes = plane ? [plane] : null;
      lit.needsUpdate = true;
    }
  }

  /**
   * Escala o modelo para a altura desejada (em pixels na tela) e o apoia no chão.
   * `forcedScale` repete a escala de outra variação; `idleClip` null = objeto sem animação.
   */
  fit(idleClip: THREE.AnimationClip | null, forcedScale?: number): Fit {
    this.setYaw(0);
    if (idleClip) this.pose(idleClip, 0, true);
    const fitMeshes = this.spec.fitMeshes;
    const box = visibleBounds(this.object, fitMeshes ? (name) => fitMeshes.some((part) => name.includes(part)) : undefined);
    if (box.isEmpty()) throw new Error(`${this.spec.id}: nenhuma malha para medir (fitMeshes: ${fitMeshes?.join(", ")}).`);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = forcedScale ?? this.spec.height / (size.y * PPU * Math.cos(PITCH));
    const lift = (this.spec.lift ?? 0) / (PPU * Math.cos(PITCH));
    this.scaler.scale.setScalar(scale);
    this.scaler.position.set(-center.x * scale, -box.min.y * scale + lift, -center.z * scale);
    this.root.updateMatrixWorld(true);
    const extent = Math.max(size.x, size.z) * scale;
    return {
      scale,
      extent,
      radius: Math.max(extent, size.y * scale) / 2 + lift,
      footprint: Math.min(size.x, size.z) * scale * (this.spec.footprint ?? 1),
    };
  }

  /**
   * Ícone: centraliza o modelo na origem e escala para caber numa esfera de `radius` unidades,
   * seja qual for o formato (espada comprida ou elmo redondo).
   */
  center(radius: number) {
    this.scaler.scale.setScalar(1);
    this.scaler.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    const box = visibleBounds(this.object);
    if (box.isEmpty()) throw new Error(`${this.spec.id}: nenhuma malha visível (only: ${this.spec.only?.join(", ")}).`);
    const size = box.getSize(new THREE.Vector3()).length() / 2;
    const center = this.root.worldToLocal(box.getCenter(new THREE.Vector3()));
    const scale = radius / Math.max(size, 1e-4);
    this.scaler.scale.setScalar(scale);
    this.scaler.position.copy(center.multiplyScalar(-scale));
    this.root.updateMatrixWorld(true);
  }

  seatPosition(): THREE.Vector3 | null {
    return this.seat ? this.seat.getWorldPosition(new THREE.Vector3()) : null;
  }

  dispose() {
    this.root.removeFromParent();
    this.mixer.stopAllAction();
  }
}

/** Nome da malha ou de um ancestral (malhas com vários materiais viram filhas de um grupo com o nome do nó). */
function namedLike(node: THREE.Object3D, accept: (name: string) => boolean): boolean {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    if (current.name && accept(current.name)) return true;
  }
  return false;
}

/** Caixa das malhas visíveis na pose atual (considera o esqueleto). */
function visibleBounds(object: THREE.Object3D, accept?: (name: string) => boolean): THREE.Box3 {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  object.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.noFit) return;
    if (accept && !namedLike(mesh, accept)) return;
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, vertex);
      box.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld));
    }
  });
  return box;
}

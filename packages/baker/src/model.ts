import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { TINT_GROUPS } from "@zuna/shared";
import type { EntrySpec, TintSpec } from "./catalog.ts";
import { PALETTE_COLS, PALETTE_ROWS, PITCH, PPU, TINT_REF } from "./config.ts";
import type { Pass } from "./render.ts";

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();

export function loadGltf(file: string): Promise<GLTF> {
  let pending = gltfCache.get(file);
  if (!pending) {
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
    this.mixer = new THREE.AnimationMixer(object);
    this.seat = spec.seatBone ? findNode(object, spec.seatBone) : null;
    if (spec.seatBone && !this.seat) throw new Error(`${spec.id}: osso "${spec.seatBone}" não encontrado.`);
  }

  static async create(spec: EntrySpec): Promise<BakeModel> {
    const gltf = await loadGltf(spec.file);
    const object = SkeletonUtils.clone(gltf.scene);

    const hidden = new Set((spec.accessories ?? []).filter((name) => !(spec.show ?? []).includes(name)));
    object.traverse((node) => {
      if (hidden.has(node.name)) node.visible = false;
    });

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
    this.object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const lit = source.clone() as THREE.MeshStandardMaterial;
      if (lit.isMeshStandardMaterial) {
        // Sem mapa de ambiente, metal fica preto: o visual estilizado pede superfícies foscas.
        lit.metalness = 0;
        lit.roughness = Math.max(0.78, lit.roughness);
      }
      const recolor = this.spec.recolor?.[source.name];
      if (recolor !== undefined) lit.color.setHex(recolor);
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
    if (!mesh.isMesh) return;
    if (accept && !namedLike(mesh, accept)) return;
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, vertex);
      box.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld));
    }
  });
  return box;
}

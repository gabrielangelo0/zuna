import * as THREE from "three";
import { CONTACT_SHADOW_OPACITY, PITCH, PPU, SHADOW_COLOR, SHADOW_OPACITY, SUPERSAMPLE } from "./config.ts";
import { createRgba, readCanvas, type Rgba } from "./image.ts";

export interface View {
  cellW: number;
  cellH: number;
  anchorX: number;
  anchorY: number;
}

export type Pass = "lit" | "ids" | "shadow";

/** Cena fixa do baker: câmera isométrica ortográfica, luzes e o chão que recebe a sombra. */
export class BakeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private readonly key: THREE.DirectionalLight;
  private readonly ground: THREE.Mesh;
  private view: View = { cellW: 1, cellH: 1, anchorX: 0, anchorY: 0 };

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    // Usado na camada "frente da montaria" (só o que fica entre o cavaleiro e a câmera).
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    // Céu frio por cima, chão quente por baixo: volume suave em todas as faces.
    this.scene.add(new THREE.HemisphereLight(0xe6efff, 0x6e5c48, 1.7));

    // Luz principal alta, um pouco à esquerda e da frente: rosto iluminado e sombra curta, quase sob os pés.
    this.key = new THREE.DirectionalLight(0xfff0dc, 2.7);
    this.key.position.set(-3, 16, 4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 6;
    this.key.shadow.blurSamples = 20;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key, this.key.target);

    // Luz de contorno por trás: destaca a silhueta contra o chão.
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.5);
    rim.position.set(5, 6, -7);
    this.scene.add(rim);

    // Preenchimento quente do lado direito: evita sombras chapadas.
    const fill = new THREE.DirectionalLight(0xffdcb8, 0.55);
    fill.position.set(6, 3, 4);
    this.scene.add(fill);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ color: SHADOW_COLOR, opacity: SHADOW_OPACITY }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.visible = false;
    this.scene.add(this.ground);
  }

  /** Enquadra a célula: o ponto (0, 0, 0) do mundo cai exatamente na âncora (pé). */
  setView(view: View, radius: number) {
    this.view = view;
    this.renderer.setSize(view.cellW * SUPERSAMPLE, view.cellH * SUPERSAMPLE, false);
    const camera = this.camera;
    camera.left = -view.anchorX / PPU;
    camera.right = (view.cellW - view.anchorX) / PPU;
    camera.top = view.anchorY / PPU;
    camera.bottom = -(view.cellH - view.anchorY) / PPU;
    const distance = 100;
    camera.position.set(0, Math.sin(PITCH) * distance, Math.cos(PITCH) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const shadowCamera = this.key.shadow.camera;
    const size = Math.max(2, radius * 2.5);
    shadowCamera.left = -size;
    shadowCamera.right = size;
    shadowCamera.top = size;
    shadowCamera.bottom = -size;
    shadowCamera.near = 0.1;
    shadowCamera.far = 60;
    shadowCamera.updateProjectionMatrix();
  }

  render(pass: Pass): Rgba {
    const renderer = this.renderer;
    this.ground.visible = pass === "shadow";
    // O mapa de grupos precisa sair com os valores exatos, sem conversão de cor.
    renderer.outputColorSpace = pass === "ids" ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    renderer.render(this.scene, this.camera);
    const canvas = renderer.domElement;
    return readCanvas(canvas, canvas.width, canvas.height);
  }

  /**
   * Plano que separa o que está mais perto da câmera do que `point` (+ `margin` unidades).
   * A câmera é ortográfica: "mais perto" é ao longo da direção de visão.
   */
  frontPlane(point: THREE.Vector3, margin: number): THREE.Plane {
    const towardCamera = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    return new THREE.Plane(towardCamera, -(towardCamera.dot(point) + margin));
  }

  /** Posição de um ponto do mundo na célula, relativa à âncora (em pixels). */
  project(point: THREE.Vector3): { x: number; y: number } {
    const ndc = point.clone().project(this.camera);
    const { cellW, cellH, anchorX, anchorY } = this.view;
    return {
      x: Math.round(((ndc.x + 1) / 2) * cellW - anchorX),
      y: Math.round(((1 - ndc.y) / 2) * cellH - anchorY),
    };
  }

  /** Elipse escura sob os pés, do tamanho da base do modelo. */
  contactShadow(footprint: number): Rgba {
    const { cellW, cellH, anchorX, anchorY } = this.view;
    const canvas = new OffscreenCanvas(cellW, cellH);
    const ctx = canvas.getContext("2d")!;
    const rx = Math.max(6, footprint * PPU * 0.5);
    const ry = rx * 0.5;
    ctx.translate(anchorX, anchorY);
    ctx.scale(1, ry / rx);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gradient.addColorStop(0, `rgba(20, 14, 28, ${CONTACT_SHADOW_OPACITY})`);
    gradient.addColorStop(0.6, `rgba(20, 14, 28, ${CONTACT_SHADOW_OPACITY * 0.6})`);
    gradient.addColorStop(1, "rgba(20, 14, 28, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    const image = ctx.getImageData(0, 0, cellW, cellH);
    const out = createRgba(cellW, cellH);
    out.data.set(image.data);
    return out;
  }
}

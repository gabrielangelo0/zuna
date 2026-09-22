import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { dragonScene } from "./dragon.ts";

// Peças modeladas aqui, quando nenhum pacote CC0 tem o que o jogo precisa.
// Entram no baker como "builtin:<nome>" no lugar do arquivo.

interface Built {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export function builtinModel(name: string): GLTF {
  const build = BUILTIN[name];
  if (!build) throw new Error(`modelo interno desconhecido: ${name}`);
  const result = build();
  const built: Built = result instanceof THREE.Group ? { scene: result, animations: [] } : result;
  return built as unknown as GLTF;
}

/** O Cristal de Zuna: a gema do logo saindo de umas pedras. */
function crystal(): THREE.Group {
  const group = new THREE.Group();
  const gem = new THREE.MeshStandardMaterial({
    name: "crystal_gem",
    color: 0x2fdc84,
    roughness: 0.35,
    metalness: 0,
    flatShading: true,
    emissive: 0x0d6b3c,
    emissiveIntensity: 0.6,
  });
  const stone = new THREE.MeshStandardMaterial({ name: "crystal_stone", color: 0x33405c, roughness: 1, metalness: 0, flatShading: true });

  const shard = (radius: number, stretch: number) => {
    const geometry = new THREE.OctahedronGeometry(radius, 0);
    geometry.scale(1, stretch, 1);
    return new THREE.Mesh(geometry, gem);
  };

  const main = shard(0.15, 2.3);
  main.position.y = 0.3;
  main.rotation.y = Math.PI / 5;
  group.add(main);

  const left = shard(0.08, 1.9);
  left.position.set(-0.15, 0.13, 0.05);
  left.rotation.set(0, 0.4, 0.28);
  group.add(left);

  const right = shard(0.065, 1.7);
  right.position.set(0.14, 0.1, -0.04);
  right.rotation.set(0.1, -0.5, -0.32);
  group.add(right);

  for (const [x, z, size] of [
    [-0.06, 0.1, 0.14],
    [0.12, 0.06, 0.11],
    [0.01, -0.11, 0.12],
  ]) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), stone);
    rock.position.set(x, size * 0.32, z);
    rock.scale.y = 0.55;
    rock.rotation.y = x * 7;
    group.add(rock);
  }
  return group;
}

/**
 * Portal: arco de pedra lavrada com runas acesas e o vão escuro no meio.
 * O redemoinho colorido é desenhado pelo cliente por cima do vão.
 */
function portalArch(): THREE.Group {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ name: "portal_stone", color: 0x6b6e86, roughness: 1, metalness: 0, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ name: "portal_dark", color: 0x4a4c60, roughness: 1, metalness: 0, flatShading: true });
  const rune = new THREE.MeshStandardMaterial({
    name: "portal_rune",
    color: 0xa9e8ff,
    roughness: 0.4,
    metalness: 0,
    flatShading: true,
    emissive: 0x5fc8ff,
    emissiveIntensity: 1.1,
  });
  const voidness = new THREE.MeshStandardMaterial({ name: "portal_void", color: 0x150e22, roughness: 1, metalness: 0, side: THREE.DoubleSide });

  const RADIUS = 0.68;
  const SPRING = 1.86;
  const block = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // O vão: um disco escuro encostado no fundo do arco, para o portal não ficar vazado.
  const gap = new THREE.Mesh(new THREE.CircleGeometry(RADIUS - 0.04, 20), voidness);
  gap.scale.set(1, 1.55, 1);
  gap.position.set(0, 1.12, -0.14);
  group.add(gap);
  const gapFloor = new THREE.Mesh(block(1.3, 0.52, 0.26), voidness);
  gapFloor.position.set(0, 0.26, -0.14);
  group.add(gapFloor);

  for (const side of [-1, 1]) {
    const x = side * RADIUS;
    // Pedestal em dois degraus.
    const base = new THREE.Mesh(block(0.56, 0.16, 0.56), dark);
    base.position.set(x, 0.08, 0);
    group.add(base);
    const plinth = new THREE.Mesh(block(0.48, 0.14, 0.48), stone);
    plinth.position.set(x, 0.23, 0);
    group.add(plinth);
    // Coluna de blocos, cada um um pouco torto: parece assentado à mão.
    for (let i = 0; i < 5; i++) {
      const y = 0.3 + i * 0.31;
      const piece = new THREE.Mesh(block(0.38 - i * 0.012, 0.29, 0.38 - i * 0.012), i % 2 ? dark : stone);
      piece.position.set(x, y + 0.155, 0);
      piece.rotation.y = (i % 2 ? 1 : -1) * 0.04;
      group.add(piece);
    }
    // Capitel de onde o arco nasce.
    const capital = new THREE.Mesh(block(0.46, 0.14, 0.46), stone);
    capital.position.set(x, SPRING - 0.07, 0);
    group.add(capital);
    // Runas acesas na face da frente.
    for (const y of [0.72, 1.18, 1.64]) {
      const mark = new THREE.Mesh(block(0.14, 0.12, 0.03), rune);
      mark.position.set(x, y, 0.19);
      group.add(mark);
    }
    // Entulho no pé.
    const rubble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), dark);
    rubble.position.set(x + side * 0.34, 0.06, 0.24);
    rubble.scale.y = 0.6;
    rubble.rotation.y = side;
    group.add(rubble);
  }

  // Arco: aduelas seguindo o meio círculo, e a pedra-chave no alto com uma gema.
  const voussoirs = 9;
  for (let i = 0; i < voussoirs; i++) {
    const angle = Math.PI * (0.04 + (0.92 * i) / (voussoirs - 1));
    const top = Math.abs(angle - Math.PI / 2) < 0.2;
    const piece = new THREE.Mesh(block(0.27, 0.32, 0.42), i % 2 ? stone : dark);
    piece.position.set(Math.cos(angle) * RADIUS, SPRING + Math.sin(angle) * RADIUS, 0);
    piece.rotation.z = angle - Math.PI / 2;
    group.add(piece);
    if (top) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), rune);
      gem.scale.set(1, 1.3, 0.55);
      gem.position.set(0, SPRING + RADIUS + 0.06, 0.16);
      group.add(gem);
    }
  }
  // Fio de runas correndo pela borda de dentro do arco.
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * (0.1 + (0.8 * i) / 6);
    const mark = new THREE.Mesh(block(0.09, 0.05, 0.03), rune);
    mark.position.set(Math.cos(angle) * (RADIUS - 0.19), SPRING + Math.sin(angle) * (RADIUS - 0.19), 0.2);
    mark.rotation.z = angle - Math.PI / 2;
    group.add(mark);
  }
  return group;
}

// ---------------------------------------------------------------- templo

/** Mármore claro, granito escuro e ouro: a paleta do templo de Zuna. */
function templeStone() {
  return {
    pale: new THREE.MeshStandardMaterial({ name: "temple_marble", color: 0xd9d3c2, roughness: 0.75, metalness: 0, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ name: "temple_granite", color: 0x6d7189, roughness: 0.95, metalness: 0, flatShading: true }),
    gold: new THREE.MeshStandardMaterial({ name: "temple_gold", color: 0xd3a948, roughness: 0.45, metalness: 0, flatShading: true }),
  };
}

function templeGlow(color: number, strength = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: "temple_glow",
    color,
    roughness: 0.3,
    metalness: 0,
    flatShading: true,
    emissive: new THREE.Color(color),
    emissiveIntensity: strength,
  });
}

/** Coluna de mármore: base em degraus, fuste canelado, anel de ouro e capitel. */
function templeColumn(): THREE.Group {
  const group = new THREE.Group();
  const { pale, dark, gold } = templeStone();

  const step = (size: number, height: number, y: number, material: THREE.Material) => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), material);
    block.position.y = y;
    group.add(block);
    return block;
  };
  step(0.72, 0.14, 0.07, dark);
  step(0.6, 0.12, 0.2, pale);

  const SHAFT = 1.55;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, SHAFT, 12), pale);
  shaft.position.y = 0.26 + SHAFT / 2;
  group.add(shaft);
  // Caneluras: barras finas em volta do fuste, que é o que dá o ar de coluna lavrada.
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const flute = new THREE.Mesh(new THREE.BoxGeometry(0.035, SHAFT * 0.92, 0.035), dark);
    flute.position.set(Math.cos(angle) * 0.2, 0.26 + SHAFT / 2, Math.sin(angle) * 0.2);
    flute.rotation.y = -angle;
    group.add(flute);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 6, 14), gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.26 + SHAFT - 0.12;
  group.add(ring);

  // Capitel: sino e ábaco.
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.2, 12), pale);
  bell.position.y = 0.26 + SHAFT + 0.1;
  group.add(bell);
  step(0.5, 0.14, 0.26 + SHAFT + 0.27, pale);
  step(0.42, 0.08, 0.26 + SHAFT + 0.38, gold);
  return group;
}

/** Altar do templo: bloco lavrado, runas acesas e o Cristal de Zuna flutuando em cima. */
function templeAltar(): THREE.Group {
  const group = new THREE.Group();
  const { pale, dark, gold } = templeStone();
  const rune = templeGlow(0x3ce88f, 0.9);

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.0), dark);
  base.position.y = 0.09;
  group.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.62, 0.78), pale);
  body.position.y = 0.5;
  group.add(body);
  // Frisos de ouro e runas na face da frente.
  for (const y of [0.24, 0.76]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.05, 0.82), gold);
    band.position.y = y;
    group.add(band);
  }
  for (const x of [-0.34, 0, 0.34]) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.03), rune);
    mark.position.set(x, 0.5, 0.4);
    group.add(mark);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.14, 0.9), pale);
  top.position.y = 0.88;
  group.add(top);

  // Pedestal e o cristal por cima, um pouco no ar.
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.2, 8), gold);
  pedestal.position.y = 1.05;
  group.add(pedestal);
  const gem = crystal();
  gem.scale.setScalar(1.35);
  gem.position.y = 1.32;
  group.add(gem);
  // Halo achatado sob o cristal, como se ele derramasse luz no altar.
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14), templeGlow(0x2fdc84, 0.7));
  halo.position.y = 1.18;
  group.add(halo);
  return group;
}

/** Mosaico do piso: losango de mármore com anéis de ouro e a estrela do Cristal no meio. */
function templeMosaic(): THREE.Group {
  const group = new THREE.Group();
  const { pale, dark, gold } = templeStone();
  const gem = templeGlow(0x2fdc84, 1.1);

  // As peças são finas e ficam quase rentes ao chão, uma acima da outra para não brigarem.
  const disc = (radius: number, height: number, y: number, material: THREE.Material, sides = 24) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), material);
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  };
  disc(0.7, 0.03, 0.015, pale, 4).rotation.y = Math.PI / 4;
  disc(0.62, 0.03, 0.035, gold);
  disc(0.56, 0.02, 0.05, dark);
  disc(0.24, 0.02, 0.06, gold);
  disc(0.19, 0.02, 0.07, dark);

  // Estrela de oito pontas no centro.
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.42), gem);
    ray.position.set(Math.cos(angle) * 0.21, 0.075, Math.sin(angle) * 0.21);
    ray.rotation.y = -angle;
    group.add(ray);
  }
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), gem);
  core.scale.set(1, 0.3, 1);
  core.position.y = 0.085;
  core.rotation.y = Math.PI / 4;
  group.add(core);
  return group;
}

/** Braseiro: tripé de ferro, bacia de ouro e brasas acesas (o fogo é do cliente). */
function templeBrazier(): THREE.Group {
  const group = new THREE.Group();
  const { dark, gold } = templeStone();
  const iron = new THREE.MeshStandardMaterial({ name: "temple_iron", color: 0x3a3a46, roughness: 0.9, metalness: 0, flatShading: true });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.12, 10), dark);
  base.position.y = 0.06;
  group.add(base);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.62, 6), iron);
    leg.position.set(Math.cos(angle) * 0.15, 0.4, Math.sin(angle) * 0.15);
    leg.rotation.set(Math.sin(angle) * 0.22, 0, -Math.cos(angle) * 0.22);
    group.add(leg);
  }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.2, 0.26, 12), gold);
  bowl.position.y = 0.82;
  group.add(bowl);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 6, 16), gold);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.95;
  group.add(lip);
  // Brasas: pedrinhas acesas dentro da bacia.
  const ember = templeGlow(0xff8a2a, 1.4);
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const radius = i === 0 ? 0 : 0.13 + (i % 3) * 0.05;
    const coal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), ember);
    coal.position.set(Math.cos(angle) * radius, 0.94 + (i % 2) * 0.03, Math.sin(angle) * radius);
    coal.scale.y = 0.6;
    group.add(coal);
  }
  return group;
}

/** Material de metal estilizado (fosco, como o resto da arte). */
function metal(name: string, color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name, color, roughness: 0.55, metalness: 0, flatShading: true });
}

function gemMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: "gem",
    color,
    roughness: 0.3,
    metalness: 0,
    flatShading: true,
    emissive: color,
    emissiveIntensity: 0.25,
  });
}

/** Amuleto: corrente de elos, moldura e uma gema no meio. */
function amulet(): THREE.Group {
  const group = new THREE.Group();
  const gold = metal("amulet_metal", 0xc98b3c);
  // Corrente em arco: elos pequenos ao longo de um meio círculo.
  for (let i = 0; i <= 14; i++) {
    const angle = Math.PI * (0.08 + (0.84 * i) / 14);
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 5, 8), gold);
    link.position.set(Math.cos(angle) * 0.28, 0.24 + Math.sin(angle) * 0.2, 0);
    link.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, angle);
    group.add(link);
  }
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 16), gold);
  frame.position.set(0, 0.06, 0);
  group.add(frame);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), gold);
  back.rotation.x = Math.PI / 2;
  back.position.set(0, 0.06, -0.012);
  group.add(back);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), gemMaterial(0x39c46e));
  gem.scale.set(1, 1.25, 0.6);
  gem.position.set(0, 0.06, 0.03);
  group.add(gem);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 5, 8), gold);
  bail.position.set(0, 0.2, 0);
  group.add(bail);
  return group;
}

/** Anel: aro grosso com uma gema lapidada em cima. */
function ring(): THREE.Group {
  const group = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 20), metal("ring_metal", 0xb7bcc6));
  band.rotation.x = Math.PI / 2.6;
  group.add(band);
  const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.05, 8), metal("ring_metal", 0xb7bcc6));
  setting.position.set(0, 0.17, 0.06);
  setting.rotation.x = -0.6;
  group.add(setting);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), gemMaterial(0x2f7fe0));
  gem.scale.set(1, 0.8, 1);
  gem.position.set(0, 0.22, 0.09);
  gem.rotation.x = -0.6;
  group.add(gem);
  return group;
}

/** Poção: frasco de vidro com o líquido colorido dentro, gargalo e rolha. */
function potion(liquidColor: number, size: number): () => THREE.Group {
  return () => {
    const group = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({
      name: "potion_glass",
      color: 0xdff4ff,
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.45,
      flatShading: true,
    });
    const liquid = new THREE.MeshStandardMaterial({
      name: "potion_liquid",
      color: liquidColor,
      roughness: 0.35,
      metalness: 0,
      flatShading: true,
      emissive: liquidColor,
      emissiveIntensity: 0.25,
    });
    const radius = 0.16 * size;
    const bottle = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), glass);
    bottle.position.y = radius;
    group.add(bottle);
    const fill = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.86, 10, 8, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.72), liquid);
    fill.position.y = radius;
    group.add(fill);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.32, radius * 0.4, radius * 0.9, 8), glass);
    neck.position.y = radius * 2.25;
    group.add(neck);
    const cork = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.36, radius * 0.3, radius * 0.45, 8),
      new THREE.MeshStandardMaterial({ name: "potion_cork", color: 0x9a6a3c, roughness: 1, metalness: 0, flatShading: true }),
    );
    cork.position.y = radius * 2.85;
    group.add(cork);
    return group;
  };
}

/** Mochila de aventureiro: corpo de couro, aba com fivela, bolso, alças e um saco de dormir enrolado em cima. */
function backpack(): THREE.Group {
  const group = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ name: "pack_leather", color: 0x8a5a34, roughness: 0.9, metalness: 0, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ name: "pack_strap", color: 0x5a3820, roughness: 0.9, metalness: 0, flatShading: true });
  const buckle = metal("pack_buckle", 0xd9b44a);
  const roll = new THREE.MeshStandardMaterial({ name: "pack_roll", color: 0x4f7a5a, roughness: 1, metalness: 0, flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26, 2, 2, 2), leather);
  body.position.y = 0.25;
  group.add(body);
  // Aba arredondada caindo pela frente.
  const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.44, 10, 1, false, 0, Math.PI), leather);
  flap.rotation.z = Math.PI / 2;
  flap.scale.set(1, 1, 0.7);
  flap.position.set(0, 0.5, 0.0);
  group.add(flap);
  const flapFront = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.03), dark);
  flapFront.position.set(0, 0.42, 0.14);
  group.add(flapFront);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), buckle);
  clasp.position.set(0, 0.33, 0.155);
  group.add(clasp);
  // Bolso da frente.
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), leather);
  pocket.position.set(0, 0.14, 0.16);
  group.add(pocket);
  const pocketFlap = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.05, 0.09), dark);
  pocketFlap.position.set(0, 0.22, 0.165);
  group.add(pocketFlap);
  // Alças laterais.
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.28), dark);
    strap.position.set(side * 0.2, 0.26, 0);
    group.add(strap);
  }
  // Saco de dormir enrolado em cima.
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), roll);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 0.66, -0.02);
  group.add(bedroll);
  for (const side of [-1, 1]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.015, 5, 10), dark);
    tie.rotation.y = Math.PI / 2;
    tie.position.set(side * 0.13, 0.66, -0.02);
    group.add(tie);
  }
  return group;
}

const BUILTIN: Record<string, () => THREE.Group | Built> = {
  dragon: dragonScene,
  portalArch,
  templeColumn,
  templeAltar,
  templeBrazier,
  templeMosaic,
  crystal,
  backpack,
  amulet,
  ring,
  potion_red: potion(0xe0314a, 0.85),
  potion_red_big: potion(0xe0314a, 1),
  potion_red_huge: potion(0xff4d8a, 1.15),
  potion_blue: potion(0x2f7fe0, 0.85),
  potion_blue_big: potion(0x2f7fe0, 1),
  potion_blue_huge: potion(0x7a5cff, 1.15),
};

import * as THREE from "three";

// Dragão modelado aqui: os pacotes CC0 só trazem filhotes cabeçudos, e o jogo precisa de um bicho imponente.
// Quadrúpede, pescoço em S, chifres, asas meio abertas e cauda comprida com espinhos. As animações também são
// feitas à mão: cada junta é um grupo com rotação zero em repouso, então as faixas do clipe são o desvio puro.

const deg = THREE.MathUtils.degToRad;

function skin(name: string, color: number, rough = 0.82): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name, color, roughness: rough, metalness: 0, flatShading: true });
}

interface Palette {
  main: THREE.MeshStandardMaterial;
  belly: THREE.MeshStandardMaterial;
  horn: THREE.MeshStandardMaterial;
  membrane: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}

/** Cores de fábrica; o catálogo troca cada material pelo nome com `recolor`. */
function palette(): Palette {
  const eye = skin("Dragon_Eye", 0xffd45a, 0.4);
  eye.emissive = new THREE.Color(0xffb020);
  eye.emissiveIntensity = 0.9;
  const membrane = skin("Dragon_Membrane", 0x5d1d19, 0.95);
  membrane.side = THREE.DoubleSide;
  return {
    main: skin("Dragon_Main", 0x8f3125),
    belly: skin("Dragon_Belly", 0xd9a552),
    horn: skin("Dragon_Horn", 0xe9dcbe, 0.6),
    membrane,
    eye,
  };
}

// ---------------------------------------------------------------- peças

/** Tronco de cone ao longo de +Y, começando na origem (osso: cresce a partir da junta). */
function limb(rBase: number, rTip: number, length: number, radial = 6): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(rTip, rBase, length, radial);
  geometry.translate(0, length / 2, 0);
  return geometry;
}

/** Espinho/chifre ao longo de +Y, a partir da origem. */
function spike(radius: number, length: number, radial = 5): THREE.ConeGeometry {
  const geometry = new THREE.ConeGeometry(radius, length, radial);
  geometry.translate(0, length / 2, 0);
  return geometry;
}

function put(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(deg(rotation[0]), deg(rotation[1]), deg(rotation[2]));
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

/**
 * Junta animada: o grupo de fora leva o nome e fica sem rotação (o clipe escreve nele);
 * o de dentro guarda a pose de repouso. Devolve o de dentro, onde entram as peças.
 */
function joint(
  parent: THREE.Object3D,
  name: string,
  position: [number, number, number],
  rest: [number, number, number] = [0, 0, 0],
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.set(...position);
  const inner = new THREE.Group();
  inner.rotation.set(deg(rest[0]), deg(rest[1]), deg(rest[2]));
  pivot.add(inner);
  parent.add(pivot);
  return inner;
}

/** Membrana: leque de triângulos a partir do primeiro ponto (o punho). */
function web(points: THREE.Vector3[]): THREE.BufferGeometry {
  const vertices: number[] = [];
  for (let i = 1; i + 1 < points.length; i++) {
    vertices.push(points[0].x, points[0].y, points[0].z);
    vertices.push(points[i].x, points[i].y, points[i].z);
    vertices.push(points[i + 1].x, points[i + 1].y, points[i + 1].z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Rotação que leva o +Y do osso para a direção pedida. */
function aim(direction: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
}

/** Junta apontada por vetor, em vez de ângulos (mais fácil de prever nas asas). */
function jointTo(parent: THREE.Object3D, name: string, position: THREE.Vector3, direction: THREE.Vector3): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.copy(position);
  const inner = new THREE.Group();
  inner.quaternion.copy(aim(direction));
  pivot.add(inner);
  parent.add(pivot);
  return inner;
}

// ---------------------------------------------------------------- corpo

function buildHead(parent: THREE.Object3D, colors: Palette) {
  // Cabeça montada com +Z para a frente: crânio, focinho, mandíbula que abre, chifres e olhos acesos.
  const head = joint(parent, "head", [0, 0.34, 0], [-12, 0, 0]);
  put(head, new THREE.SphereGeometry(0.25, 8, 6), colors.main, [0, 0.05, 0.14], [0, 0, 0], [0.98, 0.92, 1.3]);
  // Focinho em cunha (cilindro de 4 lados girado 45°, afinando para a frente).
  put(head, limb(0.21, 0.13, 0.54, 4), colors.main, [0, 0.01, 0.28], [90, 45, 0], [1, 1, 0.82]);
  put(head, new THREE.SphereGeometry(0.048, 5, 4), colors.main, [0.07, 0.11, 0.78]);
  put(head, new THREE.SphereGeometry(0.048, 5, 4), colors.main, [-0.07, 0.11, 0.78]);
  // Sobrancelhas grossas e olhos.
  for (const side of [-1, 1]) {
    put(head, limb(0.07, 0.03, 0.16, 4), colors.main, [side * 0.16, 0.16, 0.24], [70, 0, side * 20]);
    put(head, new THREE.SphereGeometry(0.052, 6, 5), colors.eye, [side * 0.16, 0.1, 0.3], [0, 0, 0], [1, 0.75, 1]);
    // Chifres varridos para trás e duas farpas na bochecha.
    put(head, spike(0.082, 0.74, 5), colors.horn, [side * 0.15, 0.2, 0.0], [-152, 0, side * -18]);
    put(head, spike(0.045, 0.26, 4), colors.horn, [side * 0.17, 0.02, 0.06], [-120, 0, side * -34]);
    put(head, spike(0.032, 0.17, 4), colors.horn, [side * 0.13, 0.17, 0.13], [-40, 0, side * -22]);
  }
  // Dentes de cima.
  for (const side of [-1, 1]) {
    for (const [z, size] of [
      [0.44, 0.085],
      [0.62, 0.065],
    ] as const) {
      put(head, spike(0.022, size, 4), colors.horn, [side * 0.1, -0.06, z], [180, 0, 0]);
    }
  }
  // Mandíbula.
  const jaw = joint(head, "jaw", [0, -0.05, 0.1]);
  put(jaw, limb(0.17, 0.11, 0.5, 4), colors.belly, [0, -0.04, 0.2], [90, 45, 0], [1, 0.7, 0.58]);
  for (const side of [-1, 1]) {
    put(jaw, spike(0.022, 0.08, 4), colors.horn, [side * 0.09, 0.02, 0.32]);
    put(jaw, spike(0.019, 0.06, 4), colors.horn, [side * 0.075, 0.02, 0.5]);
  }
}

function buildNeck(body: THREE.Object3D, colors: Palette) {
  // Pescoço em S: sobe, avança e endireita na nuca.
  const neck1 = joint(body, "neck1", [0, 0.3, 0.92], [36, 0, 0]);
  put(neck1, limb(0.31, 0.26, 0.44), colors.main);
  put(neck1, limb(0.2, 0.17, 0.4), colors.belly, [0, 0.02, 0.14], [0, 0, 0], [1, 1, 0.5]);
  put(neck1, spike(0.05, 0.19, 4), colors.horn, [0, 0.34, -0.2], [-28, 0, 0]);

  const neck2 = joint(neck1, "neck2", [0, 0.44, 0], [4, 0, 0]);
  put(neck2, limb(0.26, 0.22, 0.4), colors.main);
  put(neck2, limb(0.17, 0.14, 0.36), colors.belly, [0, 0.02, 0.12], [0, 0, 0], [1, 1, 0.5]);
  put(neck2, spike(0.045, 0.17, 4), colors.horn, [0, 0.3, -0.17], [-26, 0, 0]);

  const neck3 = joint(neck2, "neck3", [0, 0.4, 0], [-28, 0, 0]);
  put(neck3, limb(0.22, 0.19, 0.36), colors.main);
  put(neck3, spike(0.04, 0.15, 4), colors.horn, [0, 0.24, -0.14], [-24, 0, 0]);
  buildHead(neck3, colors);
}

function buildTail(body: THREE.Object3D, colors: Palette) {
  // Cauda para trás (-Z): cinco elos afinando, espinhos em cima e uma lâmina na ponta.
  let parent: THREE.Object3D = body;
  const shape: [number, number, number][] = [
    [0.36, 0.29, 0.5],
    [0.29, 0.23, 0.47],
    [0.23, 0.17, 0.43],
    [0.17, 0.11, 0.39],
    [0.11, 0.05, 0.35],
  ];
  shape.forEach(([rBase, rTip, length], index) => {
    const rest: [number, number, number] = [index === 0 ? -6 : -7, 0, 0];
    const segment = joint(parent, `tail${index + 1}`, index === 0 ? [0, 0.06, -1.12] : [0, 0, -shape[index - 1][2]], rest);
    // O elo cresce ao longo de +Y, então deita para -Z.
    put(segment, limb(rBase, rTip, length), colors.main, [0, 0, 0], [90, 0, 0]);
    put(segment, spike(rBase * 0.28, rBase * 1.1, 4), colors.horn, [0, rBase * 0.8, -length * 0.45], [-22, 0, 0]);
    parent = segment;
  });
  // Lâmina da ponta.
  put(parent, spike(0.15, 0.34, 4), colors.horn, [0, 0, -0.33], [-90, 0, 0], [1, 1, 0.35]);
}

function buildLeg(body: THREE.Object3D, colors: Palette, side: number, front: boolean) {
  const name = `leg${front ? "F" : "B"}${side > 0 ? "L" : "R"}`;
  const hip = joint(
    body,
    `${name}Hip`,
    front ? [side * 0.42, -0.14, 0.62] : [side * 0.48, -0.04, -0.78],
    [front ? 8 : -18, 0, 0],
  );
  // A coxa desce: o osso cresce em +Y, então gira 180° em X.
  put(hip, limb(front ? 0.18 : 0.26, front ? 0.13 : 0.17, front ? 0.5 : 0.55), colors.main, [0, 0, 0], [180, 0, 0]);
  if (!front) put(hip, new THREE.SphereGeometry(0.26, 7, 6), colors.main, [0, -0.16, -0.04], [0, 0, 0], [0.9, 1.1, 1]);

  const knee = joint(hip, `${name}Knee`, [0, front ? -0.5 : -0.55, 0], [front ? -14 : 36, 0, 0]);
  put(knee, limb(front ? 0.13 : 0.16, front ? 0.11 : 0.12, front ? 0.46 : 0.52), colors.main, [0, 0, 0], [180, 0, 0]);

  // Pé chato com três garras.
  const ankle = new THREE.Group();
  ankle.position.set(0, front ? -0.46 : -0.52, 0);
  ankle.rotation.x = deg(front ? 6 : -18);
  knee.add(ankle);
  put(ankle, new THREE.BoxGeometry(0.26, 0.13, 0.34), colors.main, [0, -0.06, 0.06]);
  for (const claw of [-1, 0, 1]) {
    put(ankle, spike(0.045, 0.2, 4), colors.horn, [claw * 0.09, -0.09, 0.2], [96, claw * -14, 0]);
  }
  put(ankle, spike(0.04, 0.14, 4), colors.horn, [0, -0.08, -0.12], [-100, 0, 0]);
}

function buildWing(body: THREE.Object3D, colors: Palette, side: number) {
  // As asas são montadas por vetores: braço para cima e para fora, antebraço saindo de lado
  // e os dedos abrindo num leque que vai da frente até bem para trás.
  const name = side > 0 ? "wingL" : "wingR";
  const ARM = 0.86;
  const FORE = 0.86;
  const shoulder = new THREE.Vector3(side * 0.3, 0.4, 0.22);
  const armDir = new THREE.Vector3(side * 0.66, 0.74, -0.1).normalize();
  const foreDir = new THREE.Vector3(side * 0.93, 0.05, 0.36).normalize();
  // Primeiro e último dedo do leque: da frente/para cima até para trás/para baixo.
  const first = new THREE.Vector3(side * 0.4, 0.36, 0.84).normalize();
  const last = new THREE.Vector3(side * 0.06, -0.8, -0.6).normalize();

  const armQuaternion = aim(armDir);
  const arm = jointTo(body, name, shoulder, armDir);
  put(arm, limb(0.13, 0.095, ARM), colors.main);

  // Direção do antebraço vista de dentro do braço.
  const foreLocal = foreDir.clone().applyQuaternion(armQuaternion.clone().invert());
  const foreQuaternion = armQuaternion.clone().multiply(aim(foreLocal));
  const fore = jointTo(arm, `${name}Tip`, new THREE.Vector3(0, ARM, 0), foreLocal);
  put(fore, limb(0.095, 0.06, FORE), colors.main);
  put(fore, spike(0.05, 0.2, 4), colors.horn, [0, FORE, 0], [-14, 0, 0]);

  // Pontos no espaço do corpo, para a membrana emendar braço, antebraço e flanco.
  const elbow = shoulder.clone().addScaledVector(armDir, ARM);
  const wrist = elbow.clone().addScaledVector(foreDir, FORE);
  const toFore = foreQuaternion.clone().invert();
  const fanStart = aim(first.clone().applyQuaternion(toFore));
  const fanEnd = aim(last.clone().applyQuaternion(toFore));
  const count = 5;
  const tips: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const local = UP.clone().applyQuaternion(fanStart.clone().slerp(fanEnd, t));
    const length = 1.3 - t * 0.34;
    const finger = new THREE.Group();
    finger.position.set(0, FORE, 0);
    finger.quaternion.copy(aim(local));
    fore.add(finger);
    put(finger, limb(0.05, 0.02, length, 4), colors.main);
    tips.push(new THREE.Vector3(0, FORE, 0).addScaledVector(local, length));
  }
  // Vela: leque do punho às pontas, com a borda de fuga recuada entre um dedo e outro.
  const sail: THREE.Vector3[] = [new THREE.Vector3(0, FORE, 0)];
  tips.forEach((tip, index) => {
    sail.push(tip);
    const next = tips[index + 1];
    if (next) sail.push(tip.clone().lerp(next, 0.5).lerp(sail[0], 0.14));
  });
  sail.push(sail[0].clone().lerp(tips[count - 1], 0.25));
  put(fore, web(sail), colors.membrane);

  // Pano que prende a asa ao corpo: ombro, cotovelo, último dedo e o flanco.
  const toArm = armQuaternion.clone().invert();
  const local = (point: THREE.Vector3) => point.clone().sub(shoulder).applyQuaternion(toArm);
  const lastTip = wrist.clone().addScaledVector(last, 0.88);
  put(
    arm,
    web([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, ARM, 0),
      local(lastTip),
      local(new THREE.Vector3(side * 0.26, 0.0, -0.9)),
      local(new THREE.Vector3(side * 0.2, -0.28, -0.35)),
    ]),
    colors.membrane,
  );
}

/** O dragão inteiro: raiz animada, corpo, pescoço, cauda, quatro patas e as asas. */
function buildDragon(): THREE.Group {
  const colors = palette();
  const root = new THREE.Group();
  root.name = "dragonRoot";
  const body = joint(root, "body", [0, 1.34, -0.1]);

  put(body, new THREE.SphereGeometry(0.6, 10, 8), colors.main, [0, 0, 0], [0, 0, 0], [0.8, 0.82, 1.6]);
  put(body, new THREE.SphereGeometry(0.52, 9, 7), colors.main, [0, 0.04, 0.72], [0, 0, 0], [0.92, 0.92, 0.95]);
  put(body, new THREE.SphereGeometry(0.5, 9, 7), colors.main, [0, -0.02, -0.86], [0, 0, 0], [0.96, 0.9, 0.9]);
  // Peito e barriga em placas claras.
  put(body, new THREE.SphereGeometry(0.4, 8, 6), colors.belly, [0, -0.12, 0.62], [0, 0, 0], [0.8, 0.85, 0.7]);
  for (let i = 0; i < 8; i++) {
    const z = 0.5 - i * 0.22;
    const width = 0.38 - Math.abs(i - 3) * 0.025;
    put(body, new THREE.BoxGeometry(width, 0.07, 0.17), colors.belly, [0, -0.42 - Math.abs(i - 3) * 0.01, z]);
  }
  // Crista de espinhos das costas.
  for (let i = 0; i < 7; i++) {
    const z = 0.62 - i * 0.28;
    const size = 0.3 - Math.abs(i - 2) * 0.03;
    put(body, spike(size * 0.3, size, 4), colors.horn, [0, 0.44 - Math.abs(i - 2) * 0.02, z], [-18, 0, 0]);
  }

  buildNeck(body, colors);
  buildTail(body, colors);
  for (const side of [-1, 1]) {
    buildLeg(body, colors, side, true);
    buildLeg(body, colors, side, false);
    buildWing(body, colors, side);
  }
  return root;
}

// ---------------------------------------------------------------- animações

/** Quadro-chave: tempo (0 a 1) e os três ângulos em graus. */
type Key = [number, number, number, number];

interface NodeTrack {
  rot?: Key[];
  pos?: Key[];
}

function clip(name: string, duration: number, nodes: Record<string, NodeTrack>): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  for (const [node, track] of Object.entries(nodes)) {
    if (track.rot) {
      const values: number[] = [];
      for (const [, x, y, z] of track.rot) {
        euler.set(deg(x), deg(y), deg(z));
        quaternion.setFromEuler(euler);
        values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, track.rot.map((key) => key[0] * duration), values));
    }
    if (track.pos) {
      const values = track.pos.flatMap(([, x, y, z]) => [x, y, z]);
      tracks.push(new THREE.VectorKeyframeTrack(`${node}.position`, track.pos.map((key) => key[0] * duration), values));
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Onda ao longo de uma corrente (cauda, pescoço): mesma oscilação com atraso em cada elo. */
function wave(amount: number, phase: number, axis: "x" | "y" = "y"): Key[] {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = Math.sin((t + phase) * Math.PI * 2) * amount;
    return axis === "y" ? [t, 0, value, 0] : [t, value, 0, 0];
  });
}

function tailWave(amount: number, axis: "x" | "y" = "y"): Record<string, NodeTrack> {
  const nodes: Record<string, NodeTrack> = {};
  for (let i = 0; i < 5; i++) nodes[`tail${i + 1}`] = { rot: wave(amount, -i * 0.12, axis) };
  return nodes;
}

function wings(amount: number, tip: number): Record<string, NodeTrack> {
  const keys = (sign: number): Key[] =>
    [0, 0.25, 0.5, 0.75, 1].map((t) => [t, 0, 0, Math.sin(t * Math.PI * 2) * amount * sign]);
  const tipKeys: Key[] = [0, 0.25, 0.5, 0.75, 1].map((t) => [t, Math.sin(t * Math.PI * 2 + 1) * tip, 0, 0]);
  return { wingL: { rot: keys(1) }, wingR: { rot: keys(-1) }, wingLTip: { rot: tipKeys }, wingRTip: { rot: tipKeys } };
}

function idleClip(): THREE.AnimationClip {
  return clip("Idle", 2.4, {
    dragonRoot: {
      pos: [
        [0, 0, 0, 0],
        [0.25, 0, 0.035, 0],
        [0.5, 0, 0.01, 0],
        [0.75, 0, 0.04, 0],
        [1, 0, 0, 0],
      ],
    },
    body: { rot: wave(1.8, 0.1, "x") },
    neck1: { rot: wave(2.6, 0.2, "x") },
    neck2: { rot: wave(4, 0, "y") },
    neck3: { rot: wave(3, 0.3, "x") },
    head: { rot: wave(5, 0.5, "y") },
    jaw: {
      rot: [
        [0, 0, 0, 0],
        [0.4, 5, 0, 0],
        [0.7, 0, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    ...tailWave(7),
    ...wings(6, 5),
  });
}

function walkClip(): THREE.AnimationClip {
  // Passo diagonal: dianteira esquerda com traseira direita. O ângulo negativo joga a pata para a frente.
  const swing = (shift: number): Key[] => [0, 0.25, 0.5, 0.75, 1].map((t) => [t, Math.sin((t + shift) * Math.PI * 2) * 17, 0, 0]);
  const bend = (shift: number): Key[] =>
    [0, 0.25, 0.5, 0.75, 1].map((t) => [t, -Math.max(0, Math.sin((t + shift) * Math.PI * 2 + 1.6)) * 28, 0, 0]);
  return clip("Walk", 1.1, {
    dragonRoot: {
      pos: [
        [0, 0, 0, 0],
        [0.25, 0, 0.04, 0],
        [0.5, 0, 0, 0],
        [0.75, 0, 0.04, 0],
        [1, 0, 0, 0],
      ],
      rot: [
        [0, 0, 0, 0],
        [0.25, 0, 0, 2.5],
        [0.5, 0, 0, 0],
        [0.75, 0, 0, -2.5],
        [1, 0, 0, 0],
      ],
    },
    body: { rot: wave(3, 0, "y") },
    neck1: { rot: wave(3, 0.25, "x") },
    neck2: { rot: wave(4, 0.1, "y") },
    head: { rot: wave(4, 0.35, "x") },
    legFLHip: { rot: swing(0) },
    legFLKnee: { rot: bend(0) },
    legBRHip: { rot: swing(0.08) },
    legBRKnee: { rot: bend(0.08) },
    legFRHip: { rot: swing(0.5) },
    legFRKnee: { rot: bend(0.5) },
    legBLHip: { rot: swing(0.58) },
    legBLKnee: { rot: bend(0.58) },
    ...tailWave(9),
    ...wings(8, 7),
  });
}

function attackClip(): THREE.AnimationClip {
  // Recua, abre as asas e dá o bote com a boca escancarada.
  return clip("Attack", 1.1, {
    dragonRoot: {
      pos: [
        [0, 0, 0, 0],
        [0.22, 0, 0.06, -0.14],
        [0.45, 0, 0.02, 0.2],
        [0.7, 0, 0, 0.16],
        [1, 0, 0, 0],
      ],
    },
    body: {
      rot: [
        [0, 0, 0, 0],
        [0.22, -11, 0, 0],
        [0.45, 13, 0, 0],
        [0.7, 9, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    neck1: {
      rot: [
        [0, 0, 0, 0],
        [0.22, -28, 0, 0],
        [0.45, 30, 0, 0],
        [0.7, 22, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    neck2: {
      rot: [
        [0, 0, 0, 0],
        [0.22, -16, 0, 0],
        [0.45, 18, 0, 0],
        [0.7, 12, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    neck3: {
      rot: [
        [0, 0, 0, 0],
        [0.22, -14, 0, 0],
        [0.45, 16, 0, 0],
        [0.7, 10, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    head: {
      rot: [
        [0, 0, 0, 0],
        [0.22, -22, 0, 0],
        [0.45, 24, 0, 0],
        [0.7, 16, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    jaw: {
      rot: [
        [0, 0, 0, 0],
        [0.22, 14, 0, 0],
        [0.45, 46, 0, 0],
        [0.7, 40, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    wingL: {
      rot: [
        [0, 0, 0, 0],
        [0.22, 0, 0, -26],
        [0.45, 0, 0, -18],
        [1, 0, 0, 0],
      ],
    },
    wingR: {
      rot: [
        [0, 0, 0, 0],
        [0.22, 0, 0, 26],
        [0.45, 0, 0, 18],
        [1, 0, 0, 0],
      ],
    },
    wingLTip: {
      rot: [
        [0, 0, 0, 0],
        [0.22, -28, 0, 0],
        [0.45, -18, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    wingRTip: {
      rot: [
        [0, 0, 0, 0],
        [0.22, -28, 0, 0],
        [0.45, -18, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    tail1: {
      rot: [
        [0, 0, 0, 0],
        [0.22, 10, 0, 0],
        [0.45, -8, 0, 0],
        [1, 0, 0, 0],
      ],
    },
  });
}

function hitClip(): THREE.AnimationClip {
  return clip("HitReact", 0.5, {
    dragonRoot: {
      pos: [
        [0, 0, 0, 0],
        [0.3, 0, 0.02, -0.16],
        [1, 0, 0, 0],
      ],
    },
    body: {
      rot: [
        [0, 0, 0, 0],
        [0.3, -12, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    neck1: {
      rot: [
        [0, 0, 0, 0],
        [0.3, -22, 0, 0],
        [1, 0, 0, 0],
      ],
    },
    head: {
      rot: [
        [0, 0, 0, 0],
        [0.3, -18, 6, 0],
        [1, 0, 0, 0],
      ],
    },
    jaw: {
      rot: [
        [0, 0, 0, 0],
        [0.3, 26, 0, 0],
        [1, 6, 0, 0],
      ],
    },
    wingL: {
      rot: [
        [0, 0, 0, 0],
        [0.3, 0, 0, -16],
        [1, 0, 0, 0],
      ],
    },
    wingR: {
      rot: [
        [0, 0, 0, 0],
        [0.3, 0, 0, 16],
        [1, 0, 0, 0],
      ],
    },
  });
}

function deathClip(): THREE.AnimationClip {
  // Ergue a cabeça num último rugido, as patas cedem e ele tomba de lado.
  return clip("Death", 1.9, {
    dragonRoot: {
      pos: [
        [0, 0, 0, 0],
        [0.2, 0, 0.1, -0.1],
        [0.5, 0, -0.28, 0],
        [0.75, 0, -0.5, 0.05],
        [1, 0, -0.62, 0.05],
      ],
      rot: [
        [0, 0, 0, 0],
        [0.2, -6, 0, 0],
        [0.5, 0, 0, -18],
        [0.75, 0, 6, -46],
        [1, 0, 8, -64],
      ],
    },
    body: {
      rot: [
        [0, 0, 0, 0],
        [0.2, -14, 0, 0],
        [0.5, 8, 0, 0],
        [1, 12, 0, 0],
      ],
    },
    neck1: {
      rot: [
        [0, 0, 0, 0],
        [0.2, -34, 0, 0],
        [0.5, 10, 0, 0],
        [0.75, 40, 0, 0],
        [1, 54, 0, 0],
      ],
    },
    neck2: {
      rot: [
        [0, 0, 0, 0],
        [0.2, -18, 0, 0],
        [0.5, 12, 0, 0],
        [1, 30, 0, 0],
      ],
    },
    head: {
      rot: [
        [0, 0, 0, 0],
        [0.2, -26, 0, 0],
        [0.5, 14, 0, 0],
        [1, 26, 0, 0],
      ],
    },
    jaw: {
      rot: [
        [0, 0, 0, 0],
        [0.2, 44, 0, 0],
        [0.6, 22, 0, 0],
        [1, 12, 0, 0],
      ],
    },
    legFLHip: {
      rot: [
        [0, 0, 0, 0],
        [0.5, -16, 0, 0],
        [1, -30, 0, 0],
      ],
    },
    legFRHip: {
      rot: [
        [0, 0, 0, 0],
        [0.5, -16, 0, 0],
        [1, -30, 0, 0],
      ],
    },
    legFLKnee: {
      rot: [
        [0, 0, 0, 0],
        [0.5, -40, 0, 0],
        [1, -66, 0, 0],
      ],
    },
    legFRKnee: {
      rot: [
        [0, 0, 0, 0],
        [0.5, -40, 0, 0],
        [1, -66, 0, 0],
      ],
    },
    legBLHip: {
      rot: [
        [0, 0, 0, 0],
        [0.5, 14, 0, 0],
        [1, 26, 0, 0],
      ],
    },
    legBRHip: {
      rot: [
        [0, 0, 0, 0],
        [0.5, 14, 0, 0],
        [1, 26, 0, 0],
      ],
    },
    wingL: {
      rot: [
        [0, 0, 0, 0],
        [0.2, 0, 0, -30],
        [0.6, 0, 0, 14],
        [1, 0, 0, 26],
      ],
    },
    wingR: {
      rot: [
        [0, 0, 0, 0],
        [0.2, 0, 0, 30],
        [0.6, 0, 0, -14],
        [1, 0, 0, -26],
      ],
    },
    wingLTip: {
      rot: [
        [0, 0, 0, 0],
        [0.2, -30, 0, 0],
        [1, 34, 0, 0],
      ],
    },
    wingRTip: {
      rot: [
        [0, 0, 0, 0],
        [0.2, -30, 0, 0],
        [1, 34, 0, 0],
      ],
    },
    tail1: {
      rot: [
        [0, 0, 0, 0],
        [0.2, 12, 0, 0],
        [1, -10, 0, 0],
      ],
    },
    tail2: {
      rot: [
        [0, 0, 0, 0],
        [0.4, 8, 0, 0],
        [1, -8, 6, 0],
      ],
    },
    tail3: {
      rot: [
        [0, 0, 0, 0],
        [0.6, 6, 0, 0],
        [1, -6, 10, 0],
      ],
    },
  });
}

export function dragonScene(): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  return { scene: buildDragon(), animations: [idleClip(), walkClip(), attackClip(), hitClip(), deathClip()] };
}

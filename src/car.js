import * as THREE from 'three';
import { neonTextTexture, glowTexture, treadTexture } from './textures.js';

const PINK = new THREE.Color(1.6, 0.2, 0.9);
const CYAN = new THREE.Color(0.25, 1.4, 1.9);
const VIOLET = new THREE.Color(0.7, 0.5, 2.2);
const RED = new THREE.Color(2.4, 0.08, 0.14);

// Side profile (x = length, front at +x; y = height) extruded across the car's width.
function extrudeProfile(points, width, material, bevel = 0.04) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = width - bevel * 2;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI / 2); // front (+x) now points down -z
  return new THREE.Mesh(geometry, material);
}

const box = (w, h, d, material, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};

// Shared wheel parts so player and traffic cars stay cheap.
let wheelKit = null;
function getWheelKit(envMap) {
  if (wheelKit) return wheelKit;
  const tread = treadTexture();
  wheelKit = {
    tireGeo: new THREE.TorusGeometry(0.31, 0.13, 18, 48),
    sidewallGeo: new THREE.CylinderGeometry(0.33, 0.33, 0.22, 40, 1, true),
    rimGeo: new THREE.CylinderGeometry(0.25, 0.25, 0.2, 36),
    lipGeo: new THREE.TorusGeometry(0.25, 0.018, 8, 40),
    spokeGeo: new THREE.BoxGeometry(0.035, 0.22, 0.04),
    capGeo: new THREE.CylinderGeometry(0.06, 0.06, 0.23, 16),
    discGeo: new THREE.CylinderGeometry(0.19, 0.19, 0.03, 32),
    caliperGeo: new THREE.BoxGeometry(0.09, 0.12, 0.06),
    archGeo: new THREE.TorusGeometry(0.46, 0.05, 8, 24, Math.PI),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.92, metalness: 0, bumpMap: tread, bumpScale: 2.5, map: tread }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 1, roughness: 0.18, envMap, envMapIntensity: 1.2 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.9, roughness: 0.35, envMap }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xb0122a, metalness: 0.4, roughness: 0.4 }),
    arch: new THREE.MeshStandardMaterial({ color: 0x0a0b0e, metalness: 0.4, roughness: 0.6 }),
  };
  return wheelKit;
}

// A real wheel: treaded tyre, chrome lip, 5-spoke rim, brake disc and caliper. `side` is -1 (left) or 1 (right).
function createWheel(kit, side) {
  const wheel = new THREE.Group();
  const spin = new THREE.Group();
  wheel.add(spin);

  const tire = new THREE.Mesh(kit.tireGeo, kit.rubber);
  tire.rotation.y = Math.PI / 2;
  tire.scale.set(1, 1, 1.25);
  spin.add(tire);
  const wall = new THREE.Mesh(kit.sidewallGeo, kit.rubber);
  wall.rotation.z = Math.PI / 2;
  spin.add(wall);

  const rim = new THREE.Mesh(kit.rimGeo, kit.gunmetal);
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  const lip = new THREE.Mesh(kit.lipGeo, kit.chrome);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = side * 0.105;
  spin.add(lip);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(kit.spokeGeo, kit.chrome);
    const a = (i / 5) * Math.PI * 2;
    s.position.set(side * 0.105, Math.cos(a) * 0.12, Math.sin(a) * 0.12);
    s.rotation.x = -a;
    spin.add(s);
  }
  const cap = new THREE.Mesh(kit.capGeo, kit.chrome);
  cap.rotation.z = Math.PI / 2;
  spin.add(cap);

  // brake parts do not spin
  const disc = new THREE.Mesh(kit.discGeo, kit.gunmetal);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = -side * 0.02;
  wheel.add(disc);
  const caliper = new THREE.Mesh(kit.caliperGeo, kit.caliper);
  caliper.position.set(side * 0.02, 0.13, -0.08);
  wheel.add(caliper);

  return { wheel, spin };
}

function addWheels(body, kit, positions) {
  const spins = [];
  for (const [x, y, z] of positions) {
    const side = Math.sign(x);
    const { wheel, spin } = createWheel(kit, side);
    wheel.position.set(x, y, z);
    body.add(wheel);
    spins.push(spin);
    // dark fender arch hugging the top of the tyre
    const arch = new THREE.Mesh(kit.archGeo, kit.arch);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(x - side * 0.04, y, z);
    body.add(arch);
  }
  return spins;
}

// Paint schemes the player can pick on the menu. `accent` tints the underglow, holo ring and wheel rings.
export const LIVERIES = [
  { name: 'CHROME', paint: 0xb3bbc4, metalness: 1, roughness: 0.26, accent: PINK },
  { name: 'MIDNIGHT', paint: 0x14161c, metalness: 0.55, roughness: 0.3, accent: CYAN },
  { name: 'SAKURA', paint: 0xd23a84, metalness: 0.45, roughness: 0.28, accent: CYAN },
  { name: 'RONIN RED', paint: 0xa0101c, metalness: 0.5, roughness: 0.26, accent: VIOLET },
  { name: 'ACID', paint: 0x1db87a, metalness: 0.5, roughness: 0.3, accent: PINK },
];

// Light trails streaming from the taillights. Points live in world space and scroll with the city.
function createTrail(color) {
  const N = 12;
  const pts = Array.from({ length: N }, () => new THREE.Vector3(0, -999, 0));
  const pos = new Float32Array(N * 2 * 3);
  const col = new Float32Array(N * 2 * 3);
  const idx = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  for (let i = 0; i < N; i++) {
    const k = Math.pow(1 - i / (N - 1), 1.6);
    for (const v of [i * 2, i * 2 + 1]) { col[v * 3] = color.r * k; col[v * 3 + 1] = color.g * k; col[v * 3 + 2] = color.b * k; }
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  let acc = 0;
  return {
    mesh,
    update(dt, speed, head, width) {
      for (const p of pts) p.z += speed * dt;
      acc += dt;
      if (acc > 1 / 60) { acc = 0; pts.pop(); pts.unshift(head.clone()); } else pts[0].copy(head);
      for (let i = 0; i < N; i++) {
        const p = pts[i], w = width * (1 - i / N);
        pos.set([p.x, p.y + w, p.z, p.x, p.y - w, p.z], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    },
    reset() { for (const p of pts) p.set(0, -999, 0); },
  };
}

export function createCar({ envMap = null } = {}) {
  const root = new THREE.Group(); // position (game moves this)
  const body = new THREE.Group(); // pitch / roll / bob
  root.add(body);

  // Clear-coated paint: a metal base with a glossy lacquer layer that catches the neon.
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xb3bbc4, metalness: 1, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06, envMap, envMapIntensity: 1.15,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0c0e12, metalness: 0.6, roughness: 0.5, envMap, envMapIntensity: 0.6 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.3, roughness: 0.35, envMap, envMapIntensity: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x05070c, metalness: 0.3, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, envMap, envMapIntensity: 1.5,
  });
  const glow = (color) => new THREE.MeshBasicMaterial({ color });
  const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const kit = getWheelKit(envMap);

  // Wedge body + greenhouse
  body.add(extrudeProfile([[-2.15, 0.3], [-2.18, 0.82], [-1.3, 0.88], [1.05, 0.9], [2.12, 0.62], [2.2, 0.38], [2.05, 0.26], [-2.0, 0.24]], 1.9, paint));
  body.add(extrudeProfile([[-1.55, 0.88], [-0.55, 1.24], [0.3, 1.24], [1.1, 0.9]], 1.52, glass, 0.03));
  body.add(box(1.36, 0.035, 0.86, paint, 0, 1.275, 0.125));
  const fin = box(0.04, 0.09, 0.4, carbon, 0, 1.33, 0.35);
  fin.rotation.x = -0.15;
  body.add(fin);

  // Rear window louvers
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const slat = box(1.46, 0.025, 0.07, trim, 0, 0.88 + t * 0.36 + 0.035, 1.55 - t * 1.0);
    slat.rotation.x = Math.atan2(0.36, 1.0);
    body.add(slat);
  }

  // Sides: rub strips, door seams, sills, mirrors, intake vents
  for (const s of [-1, 1]) {
    body.add(box(0.02, 0.09, 4.0, trim, s * 0.955, 0.52, 0));
    body.add(box(0.012, 0.5, 0.012, trim, s * 0.952, 0.62, -0.95));
    body.add(box(0.012, 0.5, 0.012, trim, s * 0.952, 0.62, 0.55));
    body.add(box(0.05, 0.12, 2.0, carbon, s * 0.93, 0.3, -0.1));
    const mirror = box(0.2, 0.1, 0.16, paint, s * 1.03, 0.98, -0.95);
    mirror.rotation.y = s * 0.2;
    body.add(mirror);
    body.add(box(0.02, 0.03, 0.12, trim, s * 0.94, 0.96, -0.95));
    for (let v = 0; v < 4; v++) body.add(box(0.015, 0.03, 0.42, trim, s * 0.958, 0.68 + v * 0.055, 0.95));
  }

  // Rear spoiler with a third brake light
  for (const s of [-1, 1]) body.add(box(0.05, 0.14, 0.1, carbon, s * 0.7, 0.98, 2.0));
  body.add(box(1.7, 0.04, 0.32, carbon, 0, 1.06, 2.02));
  const thirdBrake = box(0.5, 0.025, 0.02, glow(RED.clone()), 0, 1.09, 2.18);
  body.add(thirdBrake);

  // Rear: black panel, segmented taillights, light bar, plate, diffuser, exhausts
  body.add(box(1.72, 0.32, 0.03, trim, 0, 0.6, 2.225));
  const tailMat = glow(RED.clone());
  for (const s of [-1, 1]) {
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 2; row++) {
        body.add(box(0.13, 0.08, 0.02, tailMat, s * (0.3 + col * 0.155), 0.55 + row * 0.1, 2.245));
      }
    }
  }
  const barMat = glow(RED.clone().multiplyScalar(0.5));
  body.add(box(1.76, 0.02, 0.02, barMat, 0, 0.81, 2.23));
  const plateTex = neonTextTexture('アキラ', { color: '#ff2244', size: 80, background: '#07060a' });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5 / plateTex.aspect),
    new THREE.MeshBasicMaterial({ map: plateTex.texture, color: new THREE.Color(1.1, 1.1, 1.1) }),
  );
  plate.position.set(0, 0.37, 2.235);
  body.add(plate);
  body.add(box(1.6, 0.04, 0.35, carbon, 0, 0.22, 2.05));
  for (let i = -2; i <= 2; i++) body.add(box(0.02, 0.1, 0.3, carbon, i * 0.3, 0.26, 2.06));
  const pipeGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.22, 20);
  const tipGeo = new THREE.CircleGeometry(0.05, 16);
  const tipMat = glow(new THREE.Color(1.6, 0.5, 0.1));
  const flames = [];
  for (const s of [-1, 1]) {
    const pipe = new THREE.Mesh(pipeGeo, kit.chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(s * 0.45, 0.3, 2.22);
    body.add(pipe);
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(s * 0.45, 0.3, 2.335);
    body.add(tip);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.9, 12, 1, true), additive(new THREE.Color(0.4, 1.0, 2.2), 0));
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(s * 0.45, 0.3, 2.75);
    body.add(flame);
    flames.push(flame);
  }

  // Front: headlights, grille slats, splitter, faint beams
  for (const s of [-1, 1]) {
    body.add(box(0.34, 0.07, 0.02, glow(new THREE.Color(2, 2, 2.1)), s * 0.6, 0.5, -2.235));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 9, 20, 1, true), additive(new THREE.Color(0.018, 0.02, 0.026)));
    beam.rotation.x = Math.PI / 2;
    beam.position.set(s * 0.6, 0.35, -6.7);
    body.add(beam);
  }
  for (let i = 0; i < 4; i++) body.add(box(0.5, 0.015, 0.02, trim, 0, 0.36 + i * 0.04, -2.236));
  body.add(box(1.8, 0.05, 0.12, carbon, 0, 0.27, -2.12));

  // Real wheels with a neon accent ring on each tyre wall
  const wheelPos = [[-0.9, 0.36, -1.38], [0.9, 0.36, -1.38], [-0.9, 0.36, 1.38], [0.9, 0.36, 1.38]];
  const spins = addWheels(body, kit, wheelPos);
  const accentRingMat = additive(PINK.clone(), 0.9);
  const accentGeo = new THREE.TorusGeometry(0.3, 0.008, 6, 40);
  for (const [x, y, z] of wheelPos) {
    const r = new THREE.Mesh(accentGeo, accentRingMat);
    r.rotation.y = Math.PI / 2;
    r.position.set(x + Math.sign(x) * 0.135, y, z);
    body.add(r);
  }

  // Hover glow under each wheel
  const haloGeo = new THREE.PlaneGeometry(1.4, 1.4);
  const pads = [];
  for (const [x, , z] of wheelPos) {
    const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: CYAN.clone().multiplyScalar(0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Mesh(haloGeo, mat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(x, -0.05, z);
    body.add(halo);
    pads.push({ mat, phase: Math.random() * Math.PI * 2 });
  }

  // Holographic ring around the underside
  const holo = new THREE.Group();
  holo.position.y = -0.18;
  body.add(holo);
  const outerMat = additive(VIOLET.clone(), 0.7);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.022, 8, 160), outerMat);
  outer.rotation.x = Math.PI / 2;
  holo.add(outer);
  const innerMat = additive(CYAN.clone(), 0.45);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.01, 6, 160), innerMat);
  inner.rotation.x = Math.PI / 2;
  holo.add(inner);
  const dashes = new THREE.Group();
  const dashGeo = new THREE.BoxGeometry(0.28, 0.02, 0.06);
  const dashMat = additive(PINK.clone(), 0.7);
  for (let i = 0; i < 56; i++) {
    if (i % 4 === 3) continue;
    const a = (i / 56) * Math.PI * 2;
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.position.set(Math.cos(a) * 3.05, 0, Math.sin(a) * 3.05);
    d.rotation.y = -(a + Math.PI / 2);
    dashes.add(d);
  }
  holo.add(dashes);
  const discMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: PINK.clone().multiplyScalar(0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.04;
  holo.add(disc);

  // Shield bubble shown while invulnerable after a hit
  const shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.0, 1.6), transparent: true, opacity: 0, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shieldMat);
  shield.scale.set(1.7, 1.1, 3.0);
  shield.position.y = 0.6;
  root.add(shield);

  // Soft lights: underglow paints the wet street, headlights light what is ahead
  const under = new THREE.PointLight(0xff2a8a, 18, 14, 2);
  under.position.set(0, -0.5, 0.3);
  root.add(under);
  const head = new THREE.PointLight(0xdfefff, 8, 14, 2);
  head.position.set(0, 0.5, -3.2);
  root.add(head);
  const tailLight = new THREE.PointLight(0xff1030, 3, 6, 2);
  tailLight.position.set(0, 0.6, 2.9);
  root.add(tailLight);

  // Taillight streaks (added to the scene by main.js, they live in world space)
  const trails = [createTrail(new THREE.Color(1.6, 0.05, 0.12)), createTrail(new THREE.Color(1.6, 0.05, 0.12))];
  const trailHead = new THREE.Vector3();

  let liveryIndex = 0;
  let wreck = 0;            // 0 = flying, rises to 1 after a crash (lights die, paint chars)
  const charColor = new THREE.Color(0x14110f);
  const baseColor = new THREE.Color();

  function setLivery(i) {
    liveryIndex = (i + LIVERIES.length) % LIVERIES.length;
    const L = LIVERIES[liveryIndex];
    paint.color.setHex(L.paint);
    baseColor.setHex(L.paint);
    paint.metalness = L.metalness;
    paint.roughness = L.roughness;
    const a = L.accent;
    accentRingMat.color.copy(a);
    dashMat.color.copy(a);
    discMat.color.copy(a).multiplyScalar(0.25);
    outerMat.color.copy(a === VIOLET ? PINK : VIOLET);
    under.color.setRGB(a.r / 2.2, a.g / 2.2, a.b / 2.2);
    return L;
  }
  setLivery(0);

  let wheelAngle = 0;
  let brake = 0;

  // speed: world units/s, boost 0..1, steer/climb -1..1, invuln seconds left, braking 0..1
  function update(t, dt, { speed = 30, boost = 0, steer = 0, climb = 0, invuln = 0, braking = 0, wrecked = false } = {}) {
    if (wrecked) return updateWreck(t, dt, speed);
    body.position.y = Math.sin(t * 1.6) * 0.08;
    const roll = -steer * 0.38 + Math.sin(t * 0.9) * 0.015;
    const pitch = climb * 0.16 + boost * 0.05;
    body.rotation.z += (roll - body.rotation.z) * (1 - Math.exp(-dt * 6));
    body.rotation.x += (pitch - body.rotation.x) * (1 - Math.exp(-dt * 5));
    body.rotation.y += (-steer * 0.12 - body.rotation.y) * (1 - Math.exp(-dt * 6));

    wheelAngle -= (speed / 0.44) * dt;
    for (const s of spins) s.rotation.x = wheelAngle;

    // brake lights flare when slowing down
    brake += (braking - brake) * (1 - Math.exp(-dt * 10));
    tailMat.color.copy(RED).multiplyScalar(1 + brake * 1.2);
    barMat.color.copy(RED).multiplyScalar(0.5 + brake * 1.2);
    thirdBrake.material.color.copy(RED).multiplyScalar(0.3 + brake * 1.5);
    tailLight.intensity = 3 + brake * 10;

    dashes.rotation.y += dt * (0.5 + boost * 2.5);
    outerMat.opacity = 0.55 + Math.sin(t * 3) * 0.1;
    for (const p of pads) p.mat.color.copy(CYAN).multiplyScalar(0.3 + 0.12 * Math.sin(t * 8 + p.phase) + boost * 0.3);
    for (const f of flames) {
      f.material.opacity = boost * 0.85;
      f.scale.set(1, 0.6 + boost * 1.8 + Math.random() * 0.3, 1);
    }
    tipMat.color.setRGB(1.6 + boost * 1.5, 0.5 + boost * 0.8, 0.1 + boost * 1.6);
    under.intensity = 18 + Math.sin(t * 5) * 3;
    shieldMat.opacity = invuln > 0 ? 0.18 + 0.14 * Math.sin(t * 30) : 0;
    shield.rotation.y = t * 0.8;

    // trails start at each taillight cluster (ignoring body roll, close enough at this size)
    trails.forEach((tr, i) => {
      trailHead.set(root.position.x + (i ? 0.53 : -0.53) * Math.cos(body.rotation.z), root.position.y + 0.6 + body.position.y + (i ? -0.53 : 0.53) * Math.sin(body.rotation.z), 2.3);
      tr.update(dt, speed, trailHead, 0.05 + boost * 0.03);
    });
  }

  function updateWreck(t, dt, speed) {
    wreck = Math.min(1, wreck + dt * 0.35);
    body.position.y += (0 - body.position.y) * (1 - Math.exp(-dt * 4));
    body.rotation.x *= 1 - Math.min(1, dt * 3);
    body.rotation.y *= 1 - Math.min(1, dt * 3);
    body.rotation.z *= 1 - Math.min(1, dt * 3);
    wheelAngle -= (speed / 0.44) * dt;
    for (const s of spins) s.rotation.x = wheelAngle;
    // hover systems short out: flicker, then die
    const alive = Math.max(0, 1 - wreck * 2.5);
    const spark = Math.random() < alive * 0.7 ? 1 : 0;
    holo.visible = spark > 0 && alive > 0;
    outerMat.opacity = 0.6 * alive;
    for (const p of pads) p.mat.color.copy(CYAN).multiplyScalar(0.3 * alive * spark);
    for (const f of flames) f.material.opacity = 0;
    under.intensity = 18 * alive * spark;
    head.intensity = Math.random() < 0.85 - wreck * 0.6 ? 6 * (1 - wreck) : 0;
    const tail = Math.random() < 0.9 - wreck * 0.5 ? 0.6 + 0.4 * (1 - wreck) : 0.05;
    tailMat.color.copy(RED).multiplyScalar(tail);
    barMat.color.copy(RED).multiplyScalar(tail * 0.4);
    thirdBrake.material.color.copy(RED).multiplyScalar(tail * 0.3);
    tailLight.intensity = 3 * tail;
    tipMat.color.setRGB(0.4 * (1 - wreck), 0.1, 0.02);
    shieldMat.opacity = 0;
    // scorched paint
    paint.color.copy(baseColor).lerp(charColor, wreck * 0.75);
    paint.roughness = THREE.MathUtils.lerp(LIVERIES[liveryIndex].roughness, 0.85, wreck);
    paint.clearcoat = 1 - wreck * 0.9;
    // trails stop: keep scrolling the old points away, emit nothing new
    trails.forEach((tr) => tr.update(dt, speed, trailHead.set(0, -999, 0), 0));
  }

  function revive() {
    wreck = 0;
    holo.visible = true;
    paint.clearcoat = 1;
    setLivery(liveryIndex);
    head.intensity = 8;
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
  }

  return {
    object: root, body, update, setLivery, revive,
    materials: { paint, trim, tire: kit.rubber },
    trails: trails.map((t) => t.mesh),
    resetTrails() { trails.forEach((t) => t.reset()); },
  };
}

// AI traffic: same coupe silhouette, cheaper detail, random paint. Facing +z = oncoming (headlights toward player).
const trafficPaints = [0x7a1424, 0x1b3d6b, 0xd0d4da, 0x232528, 0x6b5a1b, 0x14503c];
let trafficShared = null;
export function createTrafficCar(envMap, oncoming) {
  if (!trafficShared) {
    const shape = new THREE.Shape([[-2.1, 0.3], [-2.1, 0.8], [-1.2, 0.86], [-0.5, 1.22], [0.5, 1.22], [1.2, 0.88], [2.1, 0.6], [2.1, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
    geo.translate(0, 0, -0.9);
    geo.rotateY(Math.PI / 2);
    trafficShared = {
      geo,
      glassGeo: new THREE.BoxGeometry(1.6, 0.3, 1.5),
      lightGeo: new THREE.BoxGeometry(0.4, 0.09, 0.04),
      glass: new THREE.MeshStandardMaterial({ color: 0x05070c, metalness: 0.5, roughness: 0.1, envMap }),
      head: new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 1.9) }),
      tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.1, 0.15) }),
      ringGeo: new THREE.TorusGeometry(2.3, 0.02, 6, 80),
    };
  }
  const s = trafficShared;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: trafficPaints[(Math.random() * trafficPaints.length) | 0], metalness: 0.7, roughness: 0.35, envMap, envMapIntensity: 0.9 });
  g.add(new THREE.Mesh(s.geo, paint));
  const glassMesh = new THREE.Mesh(s.glassGeo, s.glass);
  glassMesh.position.set(0, 1.04, 0);
  g.add(glassMesh);
  // rear lights at +z, headlights at -z
  for (const sx of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(s.lightGeo, s.tail); tl.position.set(sx, 0.62, 2.13); g.add(tl);
    const hl = new THREE.Mesh(s.lightGeo, s.head); hl.position.set(sx, 0.55, -2.13); g.add(hl);
  }
  const spins = addWheels(g, getWheelKit(envMap), [[-0.88, 0.36, -1.35], [0.88, 0.36, -1.35], [-0.88, 0.36, 1.35], [0.88, 0.36, 1.35]]);
  const ringColor = [PINK, CYAN, VIOLET][(Math.random() * 3) | 0];
  const ring = new THREE.Mesh(s.ringGeo, new THREE.MeshBasicMaterial({ color: ringColor.clone().multiplyScalar(0.8), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.1;
  g.add(ring);
  if (oncoming) g.rotation.y = Math.PI;
  g.userData.spins = spins;
  return g;
}

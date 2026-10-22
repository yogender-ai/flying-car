import * as THREE from 'three';
import { createTrafficCar } from './car.js';
import { glowTexture } from './textures.js';

// Gameplay randomness comes from a seeded generator, so a run can be replayed exactly for clip export.
let random = Math.random;
export function setObstacleSeed(seed) {
  let a = seed >>> 0;
  random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (a, b) => a + random() * (b - a);
const pick = (arr) => arr[Math.floor(random() * arr.length)];

export const LANE = { xMax: 7, yMin: 2.2, yMax: 12.5 };
const SPAWN_Z = -260;
const DESPAWN_Z = 14;

// Player hitbox relative to the car root: body spans roughly y 0..1.3, z -2.2..2.2
const CAR_HALF = new THREE.Vector3(0.92, 0.6, 2.1);
const CAR_CENTER_Y = 0.65;

function overlap(ax, ay, az, ah, bx, by, bz, bh) {
  return Math.abs(ax - bx) < ah.x + bh.x && Math.abs(ay - by) < ah.y + bh.y && Math.abs(az - bz) < ah.z + bh.z;
}

// Everything the player can hit or collect. All of it moves toward +z with the world.
export function createObstacles(scene, envMap) {
  const live = [];
  const pools = new Map();
  const take = (key, make) => {
    const pool = pools.get(key) || [];
    pools.set(key, pool);
    const obj = pool.pop() || make();
    obj.visible = true;
    if (!obj.parent) scene.add(obj);
    return obj;
  };
  const release = (e) => {
    e.obj.visible = false;
    pools.get(e.key).push(e.obj);
  };

  // ---------------------------------------------------------------- builders
  const glowTex = glowTexture();
  const orbGeo = new THREE.OctahedronGeometry(0.5, 0);
  const orbKinds = {
    orb: { color: new THREE.Color(0.2, 1.3, 1.6), points: 100, boost: 9 },
    boost: { color: new THREE.Color(1.8, 1.2, 0.15), points: 150, boost: 45 },
    shield: { color: new THREE.Color(0.25, 1.7, 0.5), points: 200, boost: 0, shield: 1 },
  };
  function makeOrb(kind) {
    const g = new THREE.Group();
    const k = orbKinds[kind];
    const core = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: k.color }));
    if (kind !== 'orb') core.scale.setScalar(1.3);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: k.color.clone().multiplyScalar(0.8), transparent: true, opacity: 0.8 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k.color.clone().multiplyScalar(0.45), blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(3.2);
    g.add(core, ring, halo);
    g.userData = { core, ring };
    return g;
  }

  const droneBodyGeo = new THREE.SphereGeometry(0.55, 20, 14);
  const rotorGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20);
  const armGeo = new THREE.BoxGeometry(1.9, 0.07, 0.1);
  const droneMat = new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.8, roughness: 0.35, envMap });
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.35 });
  function makeDrone(police) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(droneBodyGeo, droneMat));
    const arms = [];
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const a = new THREE.Mesh(armGeo, droneMat);
      a.rotation.y = r;
      g.add(a);
      arms.push(a);
    }
    const rotors = [];
    for (const [x, z] of [[0.68, 0.68], [-0.68, 0.68], [0.68, -0.68], [-0.68, -0.68]]) {
      const r = new THREE.Mesh(rotorGeo, rotorMat);
      r.position.set(x, 0.12, z);
      g.add(r);
      rotors.push(r);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: police ? new THREE.Color(2, 0.1, 0.1) : new THREE.Color(2.2, 0.15, 0.1) });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), eyeMat);
    eye.position.set(0, -0.05, 0.5);
    g.add(eye);
    const lights = [];
    if (police) {
      for (const [x, c] of [[-0.35, new THREE.Color(2.2, 0.1, 0.1)], [0.35, new THREE.Color(0.15, 0.4, 2.4)]]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), new THREE.MeshBasicMaterial({ color: c }));
        l.position.set(x, 0.42, 0);
        g.add(l);
        lights.push(l);
      }
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.9, 0.05, 0.05), blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(1.6);
    halo.position.copy(eye.position);
    g.add(halo);
    g.userData = { rotors, lights };
    return g;
  }

  // Holographic security gate: a red wall across the street with one hole to fly through.
  const gateFrameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.15, 0.25) });
  const gapFrameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.6, 0.8) });
  const panelTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,40,70,0.10)';
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,70,100,0.55)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64);
    x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const GATE = { x0: -10.5, x1: 10.5, y0: 0, y1: 16 };
  function makeGate() {
    const g = new THREE.Group();
    const panels = [];
    for (let i = 0; i < 4; i++) {
      const tex = panelTex.clone();
      tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: tex, color: new THREE.Color(1.3, 1.3, 1.3), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      g.add(m);
      panels.push(m);
    }
    const bar = (w, h) => new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), gateFrameMat);
    const top = bar(GATE.x1 - GATE.x0, 0.18);
    top.position.set(0, GATE.y1, 0);
    g.add(top);
    for (const x of [GATE.x0, GATE.x1]) {
      const b = bar(0.18, GATE.y1);
      b.position.set(x, GATE.y1 / 2, 0);
      g.add(b);
    }
    const gapFrame = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.14), gapFrameMat);
      g.add(b);
      gapFrame.push(b);
    }
    g.userData = { panels, gapFrame };
    return g;
  }
  function layoutGate(g, gx, gy, gw, gh) {
    const { panels, gapFrame } = g.userData;
    const L = gx - gw / 2, R = gx + gw / 2, B = gy - gh / 2, T = gy + gh / 2;
    const rects = [
      [GATE.x0, L, GATE.y0, GATE.y1], [R, GATE.x1, GATE.y0, GATE.y1],
      [L, R, T, GATE.y1], [L, R, GATE.y0, B],
    ];
    rects.forEach(([x0, x1, y0, y1], i) => {
      const p = panels[i];
      p.scale.set(Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0), 1);
      p.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      p.material.map.repeat.set(p.scale.x / 1.6, p.scale.y / 1.6);
    });
    const th = 0.14;
    gapFrame[0].scale.set(gw, th, 1); gapFrame[0].position.set(gx, T, 0);
    gapFrame[1].scale.set(gw, th, 1); gapFrame[1].position.set(gx, B, 0);
    gapFrame[2].scale.set(th, gh, 1); gapFrame[2].position.set(L, gy, 0);
    gapFrame[3].scale.set(th, gh, 1); gapFrame[3].position.set(R, gy, 0);
  }

  // ---------------------------------------------------------------- spawning
  function spawnTraffic(z, difficulty) {
    const oncoming = random() < 0.25 + difficulty * 0.2;
    const obj = take(oncoming ? 'carOn' : 'carSame', () => createTrafficCar(envMap, oncoming));
    obj.position.set(rand(-LANE.xMax, LANE.xMax), rand(LANE.yMin, LANE.yMax - 1), z);
    live.push({
      key: oncoming ? 'carOn' : 'carSame', obj, type: 'car',
      // own velocity along z: same-direction cars drive away from us (negative), oncoming come at us
      vz: oncoming ? rand(16, 26) : -rand(10, 22),
      drift: random() < 0.35 ? rand(-2.5, 2.5) : 0,
      half: new THREE.Vector3(0.95, 0.62, 2.15), cy: 0.65, passed: false,
    });
  }
  function spawnDrone(z, police = false) {
    const obj = take(police ? 'police' : 'drone', () => makeDrone(police));
    const baseX = rand(-LANE.xMax, LANE.xMax);
    obj.position.set(baseX, rand(LANE.yMin + 0.5, LANE.yMax), z);
    live.push({
      key: police ? 'police' : 'drone', obj, type: 'drone', police,
      vz: police ? -rand(5, 12) : rand(-4, 6), baseX, amp: rand(1.5, 4.5), freq: rand(0.8, 1.8), phase: random() * 6,
      half: new THREE.Vector3(1.0, 0.45, 1.0), cy: 0, passed: false,
    });
  }
  function spawnGate(z, difficulty) {
    const obj = take('gate', makeGate);
    const gw = THREE.MathUtils.lerp(7.5, 4.6, difficulty), gh = THREE.MathUtils.lerp(5.5, 3.6, difficulty);
    const gx = rand(-LANE.xMax + gw / 2 - 1.5, LANE.xMax - gw / 2 + 1.5);
    const gy = rand(LANE.yMin + gh / 2 - 0.5, LANE.yMax - gh / 2 + 0.6);
    layoutGate(obj, gx, gy, gw, gh);
    obj.position.set(0, 0, z);
    live.push({ key: 'gate', obj, type: 'gate', vz: 0, gap: { x: gx, y: gy, w: gw, h: gh }, passed: false });
  }
  function spawnOrb(kind, x, y, z) {
    const obj = take(kind, () => makeOrb(kind));
    obj.position.set(x, y, z);
    live.push({ key: kind, obj, type: 'pickup', kind, vz: 0, spin: random() * 6 });
  }
  function spawnOrbPattern(z) {
    const n = 6;
    const shape = pick(['line', 'arc', 'zig', 'climb']);
    const x0 = rand(-LANE.xMax + 1, LANE.xMax - 1), y0 = rand(LANE.yMin + 1, LANE.yMax - 2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let x = x0, y = y0;
      if (shape === 'arc') y = y0 + Math.sin(t * Math.PI) * 3;
      if (shape === 'zig') x = THREE.MathUtils.clamp(x0 + Math.sin(t * Math.PI * 2) * 3.5, -LANE.xMax, LANE.xMax);
      if (shape === 'climb') y = THREE.MathUtils.clamp(y0 + (t - 0.5) * 5, LANE.yMin, LANE.yMax);
      spawnOrb('orb', x, Math.min(y, LANE.yMax), z - i * 5);
    }
  }

  let nextSpawn = -150;  // z position (in world-scroll space) where the next wave appears
  let scroll = 0;        // total distance the world has moved
  let lastGate = 0;

  function spawnWave(difficulty) {
    const z = SPAWN_Z;
    const r = random();
    if (scroll > 900 && scroll - lastGate > 520 && r < 0.18 + difficulty * 0.12) {
      spawnGate(z, difficulty);
      lastGate = scroll;
      if (random() < 0.7) {
        const g = live[live.length - 1].gap;
        for (let i = 1; i <= 3; i++) spawnOrb('orb', g.x, g.y, z + 8 + i * 4);
      }
      return;
    }
    const cars = 1 + Math.floor(random() * (0.6 + difficulty * 2.6));
    for (let i = 0; i < cars; i++) spawnTraffic(z - i * rand(10, 22), difficulty);
    if (random() < 0.25 + difficulty * 0.35) spawnDrone(z - rand(15, 40));
    if (random() < 0.06 + difficulty * 0.06) spawnDrone(z - 30, true);
    if (random() < 0.65) spawnOrbPattern(z - rand(20, 45));
    if (random() < 0.12) spawnOrb('boost', rand(-LANE.xMax, LANE.xMax), rand(LANE.yMin + 1, LANE.yMax - 1), z - rand(10, 50));
    if (random() < 0.05) spawnOrb('shield', rand(-LANE.xMax, LANE.xMax), rand(LANE.yMin + 1, LANE.yMax - 1), z - rand(10, 50));
  }

  // ---------------------------------------------------------------- per-frame
  // Returns gameplay events: hits, pickups, near misses, gates cleared.
  function update(dt, t, speed, car, difficulty, invulnerable) {
    const events = [];
    scroll += speed * dt;
    nextSpawn += speed * dt;
    const spacing = THREE.MathUtils.lerp(85, 36, difficulty);
    if (nextSpawn >= 0) {
      spawnWave(difficulty);
      nextSpawn = -spacing * rand(0.8, 1.2);
    }

    const cy = car.y + CAR_CENTER_Y;
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      const o = e.obj;
      const prevZ = o.position.z;
      o.position.z += (speed + e.vz) * dt;

      if (e.type === 'car') {
        o.position.x = THREE.MathUtils.clamp(o.position.x + e.drift * dt, -LANE.xMax - 1, LANE.xMax + 1);
        o.rotation.z = (o.rotation.y ? 1 : -1) * e.drift * 0.04;
        const wheelSpeed = Math.abs(speed + e.vz);
        for (const s of o.userData.spins) s.rotation.x -= (wheelSpeed / 0.44) * dt * 0.3;
      } else if (e.type === 'drone') {
        o.position.x = e.baseX + Math.sin(t * e.freq + e.phase) * e.amp;
        o.position.y += Math.sin(t * 2 + e.phase) * dt * 0.6;
        for (const r of o.userData.rotors) r.rotation.y += dt * 40;
        if (e.police) {
          const on = Math.floor(t * 8) % 2 === 0;
          o.userData.lights[0].visible = on;
          o.userData.lights[1].visible = !on;
        }
      } else if (e.type === 'pickup') {
        e.spin += dt * 2.5;
        o.userData.core.rotation.set(e.spin * 0.6, e.spin, 0);
        o.userData.ring.rotation.set(Math.PI / 2 + Math.sin(e.spin) * 0.4, 0, e.spin);
        o.position.y += Math.sin(t * 3 + e.spin) * dt * 0.3;
      }

      // collisions / scoring
      if (e.type === 'pickup') {
        const d2 = (o.position.x - car.x) ** 2 + (o.position.y - cy) ** 2 + (o.position.z) ** 2;
        if (d2 < 2.4 * 2.4) {
          events.push({ type: 'pickup', kind: e.kind, ...orbKinds[e.kind], pos: o.position.clone() });
          release(e); live.splice(i, 1); continue;
        }
      } else if (e.type === 'gate') {
        if (!e.passed && prevZ < 0 && o.position.z >= 0) {
          e.passed = true;
          const g = e.gap;
          const inside = Math.abs(car.x - g.x) < g.w / 2 - CAR_HALF.x * 0.55 && Math.abs(cy - g.y) < g.h / 2 - CAR_HALF.y * 0.55;
          events.push(inside ? { type: 'gate', pos: new THREE.Vector3(g.x, g.y, 0) } : { type: 'hit', what: 'gate', pos: new THREE.Vector3(car.x, cy, 0) });
        }
      } else if (!e.passed) {
        const oy = o.position.y + e.cy;
        if (!invulnerable && overlap(car.x, cy, 0, CAR_HALF, o.position.x, oy, o.position.z, e.half)) {
          e.passed = true;
          events.push({ type: 'hit', what: e.type, pos: new THREE.Vector3((car.x + o.position.x) / 2, (cy + oy) / 2, 0) });
          // knock the obstacle away so it does not hit twice
          e.drift = (o.position.x > car.x ? 1 : -1) * 12;
          e.baseX += (o.position.x > car.x ? 1 : -1) * 6;
        } else if (o.position.z - e.half.z > CAR_HALF.z) {
          e.passed = true;
          const gapX = Math.abs(car.x - o.position.x) - (CAR_HALF.x + e.half.x);
          const gapY = Math.abs(cy - oy) - (CAR_HALF.y + e.half.y);
          const gap = Math.max(gapX, gapY);
          if (!invulnerable && gap < 1.1) events.push({ type: 'near', what: e.type, pos: o.position.clone() });
          else if (gap < 7) events.push({ type: 'pass', what: e.type, close: 1 - gap / 7, pos: o.position.clone() });
        }
      }

      if (o.position.z > DESPAWN_Z) { release(e); live.splice(i, 1); }
    }
    return events;
  }

  function reset() {
    for (const e of live) release(e);
    live.length = 0;
    nextSpawn = -150;
    scroll = 0;
    lastGate = 0;
  }

  // nearest gate ahead, for the HUD warning
  function gateAhead() {
    let best = null;
    for (const e of live) if (e.type === 'gate' && !e.passed && e.obj.position.z < 0 && (!best || e.obj.position.z > best)) best = e.obj.position.z;
    return best;
  }

  const debug = () => live.reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {});
  return { update, reset, gateAhead, debug, entities: () => live };
}

// Particle bursts for pickups, near misses and crashes.
export function createBursts(scene) {
  const MAX = 600;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.35, vertexColors: true, map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;

  function emit(p, color, n = 30, power = 10) {
    for (let k = 0; k < n; k++) {
      const i = cursor; cursor = (cursor + 1) % MAX;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(power * rand(0.3, 1));
      vel[i * 3] = dir.x; vel[i * 3 + 1] = dir.y; vel[i * 3 + 2] = dir.z;
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
      life[i] = rand(0.4, 0.9);
    }
  }
  function update(dt, speed) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const fade = Math.max(0, life[i]);
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += (vel[i * 3 + 2] + speed * 0.5) * dt;
      col[i * 3] *= 0.97; col[i * 3 + 1] *= 0.97; col[i * 3 + 2] *= 0.97;
      if (fade === 0) pos[i * 3 + 1] = -999;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  return { emit, update };
}

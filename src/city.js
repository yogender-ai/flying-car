import * as THREE from 'three';
import { neonTextTexture, windowTexture } from './textures.js';

const NEON = ['#ff2bd6', '#26f7ff', '#3dffb0', '#ffd23d', '#a26bff', '#ff4b5c', '#ff8a1f'];
const WORDS = ['ゲーム', 'ラーメン', 'カラオケ', '東京', '電脳', '未来', 'ネオン', 'ホテル', '酒場', '夜市', '寿司', 'ロボ', '映画', '薬局', '居酒屋', '二十四時'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const neon = (hex, k = 2.4) => new THREE.Color(hex).multiplyScalar(k);

// Street canyon that scrolls toward the camera and wraps, so the car appears to fly forever.
export function createCity(scene, { start = 50, length = 300, streetHalfWidth = 10 } = {}) {
  const movers = [];
  const flicker = [];
  const windowTexes = Array.from({ length: 4 }, windowTexture);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.08, 0.1) });

  const signCache = new Map();
  const signTex = (word, color, vertical) => {
    const key = `${word}|${color}|${vertical}`;
    if (!signCache.has(key)) {
      signCache.set(key, neonTextTexture(word, { color, vertical, size: 90, background: 'rgba(6,4,14,0.94)', border: true }));
    }
    return signCache.get(key);
  };

  function building(side, x, z, w, d, h, front) {
    const g = new THREE.Group();
    g.position.z = z;

    const tex = pick(windowTexes).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, d / 12), Math.max(1, h / 40));
    tex.offset.set(Math.random(), Math.random());
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0e16, roughness: 0.7, metalness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: front ? 0.42 : 0.3,
    });
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, 0);
    g.add(mesh);

    const inner = x - (side * w) / 2; // facade facing the street

    if (Math.random() < 0.7) {
      const sh = h * rand(0.3, 0.85);
      const strip = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: neon(pick(NEON), 1.15) }));
      strip.scale.set(0.18, sh, 0.18);
      strip.position.set(inner, rand(sh / 2 + 1, h - sh / 2), (d / 2) * pick([-1, 1]));
      g.add(strip);
    }
    if (Math.random() < 0.5) {
      const band = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: neon(pick(NEON), 1.0) }));
      band.scale.set(0.12, 0.22, d);
      band.position.set(inner - side * 0.06, rand(6, h * 0.8), 0);
      g.add(band);
    }
    if (Math.random() < 0.4) {
      const beacon = new THREE.Mesh(boxGeo, beaconMat);
      beacon.scale.set(0.3, 1.2, 0.3);
      beacon.position.set(x, h + 0.6, 0);
      g.add(beacon);
    }

    if (front) {
      // Blade signs sticking out over the street, facing the camera
      const n = Math.random() < 0.85 ? 1 + Math.floor(Math.random() * 2.5) : 0;
      for (let i = 0; i < n; i++) {
        const { texture, aspect } = signTex(pick(WORDS), pick(NEON), true);
        const sw = 1.8, sh = sw / aspect;
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(sw, sh),
          new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.05, 1.05, 1.05), side: THREE.DoubleSide }),
        );
        sign.position.set(inner - side * (sw / 2 + 0.3), rand(sh / 2 + 3, Math.max(sh / 2 + 4, h * 0.75)), rand(-d / 2 + 0.5, d / 2 - 0.5));
        g.add(sign);
        if (Math.random() < 0.25) flicker.push(sign.material);
      }
      // Billboard flat on the facade
      if (Math.random() < 0.45) {
        const { texture, aspect } = signTex(pick(WORDS), pick(NEON), false);
        const bw = Math.min(d * 0.8, 10), bh = bw / aspect;
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(bw, bh),
          new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(0.95, 0.95, 0.95) }),
        );
        board.position.set(inner - side * 0.05, rand(bh + 6, Math.max(bh + 7, h * 0.85)), 0);
        board.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(board);
      }
    }

    scene.add(g);
    movers.push(g);
  }

  for (const side of [-1, 1]) {
    for (let z = start; z > start - length;) {
      const d = rand(8, 16), w = rand(10, 18), h = rand(25, 95);
      building(side, side * (streetHalfWidth + rand(0, 2.5) + w / 2), z - d / 2, w, d, h, true);
      z -= d + rand(0.5, 3);
    }
    for (let z = start; z > start - length;) {
      const d = rand(10, 22), w = rand(12, 20), h = rand(60, 160);
      building(side, side * (streetHalfWidth + 20 + rand(0, 8) + w / 2), z - d / 2, w, d, h, false);
      z -= d + rand(1, 5);
    }
  }

  // Skybridges across the street
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x0d1119, roughness: 0.6, metalness: 0.5 });
  for (let z = start - rand(30, 60); z > start - length; z -= rand(70, 110)) {
    const g = new THREE.Group();
    g.position.z = z;
    const y = rand(22, 45);
    const deck = new THREE.Mesh(boxGeo, bridgeMat);
    deck.scale.set(streetHalfWidth * 2 + 2, 1.4, 3);
    deck.position.y = y;
    g.add(deck);
    const strip = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: neon(pick(NEON), 1.2) }));
    strip.scale.set(streetHalfWidth * 2 + 2, 0.1, 0.15);
    strip.position.set(0, y - 0.75, 1.45);
    g.add(strip);
    scene.add(g);
    movers.push(g);
  }

  // Other flying traffic: oncoming (headlights) and same-direction (taillights)
  const traffic = [];
  const trafficBody = new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.8, roughness: 0.4 });
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.9) });
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.12, 0.18) });
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    const oncoming = Math.random() < 0.5;
    const b = new THREE.Mesh(boxGeo, trafficBody);
    b.scale.set(1.6, 0.6, 3.6);
    g.add(b);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(boxGeo, oncoming ? headMat : tailMat);
      l.scale.set(0.35, 0.12, 0.05);
      l.position.set(s * 0.55, 0.05, 1.82);
      g.add(l);
    }
    g.position.set(pick([-1, 1]) * rand(3, 8), rand(20, 45), rand(start - length, start));
    scene.add(g);
    traffic.push({ obj: g, vel: oncoming ? rand(20, 35) : -rand(5, 12) });
  }

  function update(dt, speed, t) {
    for (const g of movers) {
      g.position.z += speed * dt;
      if (g.position.z > start) g.position.z -= length;
    }
    for (const c of traffic) {
      const p = c.obj.position;
      p.z += (speed + c.vel) * dt;
      if (p.z > start) p.z -= length;
      else if (p.z < start - length) p.z += length;
    }
    for (const m of flicker) {
      if (Math.random() < 0.006) m.userData.offUntil = t + rand(0.05, 0.3);
      m.visible = !(m.userData.offUntil > t);
    }
    beaconMat.color.setRGB(t % 1.6 < 0.2 ? 2.0 : 0.12, 0.04, 0.06);
  }

  return { update };
}

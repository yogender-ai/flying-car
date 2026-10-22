import * as THREE from 'three';
import { glowTexture } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Soft round puff for smoke (normal blending, so it can darken the scene).
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Everything that happens around a crash: fireball, shockwave, debris, sparks, fire and smoke.
// All of it lives in world space and drifts toward the camera with the (slowing) city scroll.
export function createCrashFx(scene, { paintMaterial, trimMaterial, tireMaterial } = {}) {
  const glow = glowTexture();
  const group = new THREE.Group();
  scene.add(group);

  // ---- fireball + shockwave
  const fireball = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(3, 1.3, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  group.add(fireball);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 26, 2);
  group.add(fireLight);
  let blastT = 99;

  // ---- debris: panels, trim pieces and one loose wheel
  const debris = [];
  const dPaint = paintMaterial || new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 1, roughness: 0.3 });
  const dTrim = trimMaterial || new THREE.MeshStandardMaterial({ color: 0x111111 });
  const dTire = tireMaterial || new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.9 });
  for (let i = 0; i < 16; i++) {
    const big = i < 5;
    const geo = big ? new THREE.BoxGeometry(rand(0.4, 0.9), 0.04, rand(0.3, 0.7)) : new THREE.BoxGeometry(rand(0.08, 0.25), rand(0.06, 0.2), rand(0.08, 0.3));
    const m = new THREE.Mesh(geo, i % 3 === 0 ? dTrim : dPaint);
    m.visible = false;
    group.add(m);
    debris.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), r: big ? 0.05 : 0.06, rolling: false });
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.13, 12, 28), dTire);
  wheel.visible = false;
  group.add(wheel);
  debris.push({ m: wheel, v: new THREE.Vector3(), w: new THREE.Vector3(), r: 0.44, rolling: true });

  // ---- particle sprites (fire = additive, smoke = normal)
  const smokeTex = smokeTexture();
  const makePool = (n, mat) => Array.from({ length: n }, () => {
    const s = new THREE.Sprite(mat.clone());
    s.visible = false;
    group.add(s);
    return { s, v: new THREE.Vector3(), life: 0, max: 1, size0: 1, size1: 2 };
  });
  const fire = makePool(60, new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  const smoke = makePool(70, new THREE.SpriteMaterial({ map: smokeTex, color: 0x1a1c22, depthWrite: false, transparent: true }));
  let fireCur = 0, smokeCur = 0;
  function emit(pool, cursorName, p, v, life, size0, size1, color) {
    const k = cursorName === 'fire' ? fireCur++ % pool.length : smokeCur++ % pool.length;
    const e = pool[k];
    e.s.position.copy(p);
    e.v.copy(v);
    e.life = e.max = life;
    e.size0 = size0; e.size1 = size1;
    if (color) e.s.material.color.copy(color);
    e.s.visible = true;
  }

  // ---- sparks (Points)
  const SPARKS = 400;
  const sPos = new Float32Array(SPARKS * 3), sVel = new Float32Array(SPARKS * 3), sLife = new Float32Array(SPARKS);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.14, map: glow, color: new THREE.Color(2.6, 1.5, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false;
  group.add(sparks);
  let sCur = 0;
  for (let i = 0; i < SPARKS; i++) sPos[i * 3 + 1] = -999;
  function spark(p, n, spread = 6, back = 0) {
    for (let k = 0; k < n; k++) {
      const i = sCur++ % SPARKS;
      sPos[i * 3] = p.x + rand(-0.6, 0.6); sPos[i * 3 + 1] = p.y; sPos[i * 3 + 2] = p.z + rand(-1.5, 1.5);
      sVel[i * 3] = rand(-spread, spread); sVel[i * 3 + 1] = rand(1, spread * 1.2); sVel[i * 3 + 2] = rand(-spread, spread) + back;
      sLife[i] = rand(0.3, 0.9);
    }
  }

  const wreckPos = new THREE.Vector3();
  let burning = 0; // 0..1 fire strength on the wreck
  let active = false;
  const tmpV = new THREE.Vector3();

  return {
    get active() { return active; },
    // big bang at the impact point
    explode(p, carVel) {
      active = true;
      blastT = 0;
      burning = 1;
      fireball.position.copy(p);
      ring.position.set(p.x, Math.max(0.05, p.y - 0.4), p.z);
      fireLight.position.copy(p);
      spark(p, 160, 9);
      for (let i = 0; i < 26; i++) {
        emit(fire, 'fire', p, tmpV.set(rand(-5, 5), rand(-1, 6), rand(-5, 5)), rand(0.5, 1.1), rand(1.2, 2.2), rand(2.5, 4.5), new THREE.Color(rand(2, 3), rand(0.7, 1.3), 0.2));
      }
      for (let i = 0; i < 18; i++) {
        emit(smoke, 'smoke', p, tmpV.set(rand(-2.5, 2.5), rand(0.5, 3), rand(-2.5, 2.5)), rand(2.5, 4.5), rand(1, 2), rand(5, 8));
      }
      for (const d of debris) {
        d.m.visible = true;
        d.m.position.copy(p).add(tmpV.set(rand(-0.5, 0.5), rand(0, 0.6), rand(-1, 1)));
        d.v.set(rand(-9, 9) + (carVel?.x || 0) * 0.5, rand(5, 13), rand(-8, 6));
        if (d.rolling) d.v.set((Math.random() < 0.5 ? -1 : 1) * rand(5, 8), rand(4, 7), rand(-10, -5));
        d.w.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
        d.m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      }
    },
    // smaller follow-up blast (fuel cells cooking off)
    pop(p) {
      blastT = 0.25;
      fireball.position.copy(p);
      spark(p, 60, 6);
      for (let i = 0; i < 10; i++) emit(fire, 'fire', p, tmpV.set(rand(-3, 3), rand(1, 5), rand(-3, 3)), rand(0.4, 0.8), 1, 2.5, new THREE.Color(2.6, 1.0, 0.2));
    },
    scrape(p, speed) { spark(p, Math.min(14, 2 + speed * 0.3), 3, speed * 0.6); },
    impact(p) { spark(p, 50, 5); for (let i = 0; i < 6; i++) emit(smoke, 'smoke', p, tmpV.set(rand(-2, 2), rand(0.5, 2), rand(-2, 2)), rand(1.5, 2.5), 1, 4); },
    setWreck(p) { wreckPos.copy(p); },
    reset() {
      active = false; burning = 0; blastT = 99;
      fireball.material.opacity = 0; ring.material.opacity = 0; fireLight.intensity = 0;
      for (const d of debris) d.m.visible = false;
      for (const e of fire) e.s.visible = false;
      for (const e of smoke) e.s.visible = false;
      for (let i = 0; i < SPARKS; i++) { sLife[i] = 0; sPos[i * 3 + 1] = -999; }
      sGeo.attributes.position.needsUpdate = true;
    },
    // dt already includes slow-motion; scroll = how far the city moved toward the camera this frame
    update(dt, t, scroll) {
      if (!active) return;
      // fireball + shockwave
      blastT += dt;
      const b = blastT;
      fireball.material.opacity = b < 0.6 ? Math.max(0, 1 - b / 0.6) : 0;
      fireball.scale.setScalar(2 + Math.min(b, 0.6) * 22);
      ring.material.opacity = b < 0.9 ? Math.max(0, 0.9 - b) : 0;
      ring.scale.setScalar(1 + b * 26);
      ring.position.z += scroll;
      fireball.position.z += scroll;

      // wreck fire light flickers
      fireLight.position.copy(wreckPos).add(tmpV.set(0, 1.2, 0));
      fireLight.intensity = (b < 0.5 ? 220 * (1 - b / 0.5) : 0) + burning * (28 + Math.random() * 18);

      // wreck keeps burning: flames + thick smoke column
      if (burning > 0) {
        const pf = Math.random() < 0.9;
        if (pf) emit(fire, 'fire', tmpV.copy(wreckPos).add(new THREE.Vector3(rand(-0.9, 0.9), 0.5, rand(-1.6, 1.6))), new THREE.Vector3(rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4)), rand(0.35, 0.8), rand(0.5, 0.9), rand(0.1, 0.3), new THREE.Color(rand(2, 2.8), rand(0.6, 1.1), 0.12));
        if (Math.random() < 0.5) emit(smoke, 'smoke', tmpV.copy(wreckPos).add(new THREE.Vector3(rand(-0.6, 0.6), 1.2, rand(-1, 1))), new THREE.Vector3(rand(-0.5, 0.5) + 0.4, rand(1.8, 3), rand(-0.4, 0.4)), rand(3, 5), rand(0.8, 1.4), rand(4, 7));
      }

      for (const e of fire) {
        if (!e.s.visible) continue;
        e.life -= dt;
        if (e.life <= 0) { e.s.visible = false; continue; }
        const k = 1 - e.life / e.max;
        e.s.position.addScaledVector(e.v, dt);
        e.s.position.z += scroll;
        e.v.y += dt * 2;
        e.s.scale.setScalar(THREE.MathUtils.lerp(e.size0, e.size1, k));
        e.s.material.opacity = (1 - k) * 0.9;
      }
      for (const e of smoke) {
        if (!e.s.visible) continue;
        e.life -= dt;
        if (e.life <= 0) { e.s.visible = false; continue; }
        const k = 1 - e.life / e.max;
        e.s.position.addScaledVector(e.v, dt);
        e.s.position.z += scroll;
        e.v.multiplyScalar(1 - dt * 0.3);
        e.s.scale.setScalar(THREE.MathUtils.lerp(e.size0, e.size1, k));
        e.s.material.opacity = Math.sin(k * Math.PI) * 0.75;
        e.s.material.rotation += dt * 0.3;
      }

      // debris: gravity, bounce, tumble, roll
      for (const d of debris) {
        if (!d.m.visible) continue;
        const m = d.m;
        d.v.y -= 22 * dt;
        m.position.addScaledVector(d.v, dt);
        m.position.z += scroll;
        if (m.position.y < d.r) {
          m.position.y = d.r;
          if (Math.abs(d.v.y) > 2) spark(m.position, 4, 2);
          d.v.y = -d.v.y * 0.35;
          d.v.x *= 0.7; d.v.z *= 0.7;
          d.w.multiplyScalar(0.6);
        }
        if (d.rolling) {
          m.rotation.y = Math.atan2(d.v.x, d.v.z);
          m.rotation.x += (Math.hypot(d.v.x, d.v.z) / 0.44) * dt;
          if (m.position.y <= d.r + 0.01) { d.v.x *= 1 - dt * 0.4; d.v.z *= 1 - dt * 0.4; }
        } else {
          m.rotation.x += d.w.x * dt; m.rotation.y += d.w.y * dt; m.rotation.z += d.w.z * dt;
        }
        if (m.position.z > 30) m.visible = false;
      }

      // sparks
      for (let i = 0; i < SPARKS; i++) {
        if (sLife[i] <= 0) continue;
        sLife[i] -= dt;
        sVel[i * 3 + 1] -= 18 * dt;
        sPos[i * 3] += sVel[i * 3] * dt;
        sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt;
        sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt + scroll;
        if (sPos[i * 3 + 1] < 0.02) { sPos[i * 3 + 1] = 0.02; sVel[i * 3 + 1] *= -0.3; }
        if (sLife[i] <= 0) sPos[i * 3 + 1] = -999;
      }
      sGeo.attributes.position.needsUpdate = true;
    },
  };
}

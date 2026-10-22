import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { neonTextTexture, puddleTexture } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Mirror plane under a semi-transparent asphalt layer = wet street with neon reflections.
export function createGround(scene) {
  const size = 600, repeat = 40;
  const mirror = new Reflector(new THREE.PlaneGeometry(size, size), {
    clipBias: 0.003,
    textureWidth: Math.floor(window.innerWidth * 0.6),
    textureHeight: Math.floor(window.innerHeight * 0.6),
    color: 0x5a5e66,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(0, 0, -150);
  scene.add(mirror);

  const puddles = puddleTexture();
  puddles.repeat.set(repeat, repeat);
  const wet = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x06090f, roughness: 0.45, metalness: 0.5, transparent: true, opacity: 0.85, alphaMap: puddles }),
  );
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(0, 0.01, -150);
  scene.add(wet);

  return {
    update(dt, speed) {
      puddles.offset.y += (speed * dt * repeat) / size;
    },
  };
}

// Glowing chevrons + vertical katakana scrolling under the car.
export function createRunway(scene, { start = 30, spacing = 2.8, count = 48 } = {}) {
  const length = spacing * count;
  const items = [];
  const additive = (color, extra = {}) => new THREE.MeshBasicMaterial({
    color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...extra,
  });

  const shape = new THREE.Shape();
  shape.moveTo(0, 0.9);
  shape.lineTo(1.9, -0.5);
  shape.lineTo(1.9, -1.0);
  shape.lineTo(0, 0.35);
  shape.lineTo(-1.9, -1.0);
  shape.lineTo(-1.9, -0.5);
  shape.closePath();
  const chevronGeo = new THREE.ShapeGeometry(shape);
  chevronGeo.rotateX(-Math.PI / 2); // tip points down -z (direction of travel)
  const chevronMat = additive(new THREE.Color(0.08, 0.8, 0.45));
  const dashGeo = new THREE.BoxGeometry(0.12, 0.02, 1.2);
  const dashMat = additive(new THREE.Color(0.1, 0.55, 0.9));

  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    g.position.set(0, 0.03, start - i * spacing);
    g.add(new THREE.Mesh(chevronGeo, chevronMat));
    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        const d = new THREE.Mesh(dashGeo, dashMat);
        d.position.x = s * 4.2;
        g.add(d);
      }
    }
    scene.add(g);
    items.push(g);
  }

  const { texture, aspect } = neonTextTexture('ゲームセンター', { color: '#3dffb0', vertical: true, size: 96 });
  const textGeo = new THREE.PlaneGeometry(1.5, 1.5 / aspect);
  textGeo.rotateX(-Math.PI / 2);
  const textMat = additive(new THREE.Color(0.55, 0.55, 0.55), { map: texture });
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(textGeo, textMat);
    m.position.set(0, 0.035, start - 8 - i * (length / 2));
    scene.add(m);
    items.push(m);
  }

  // Static lane edges
  const railGeo = new THREE.BoxGeometry(0.08, 0.02, 400);
  const railMat = additive(new THREE.Color(0.08, 0.5, 0.75));
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(railGeo, railMat);
    r.position.set(s * 3.2, 0.02, -150);
    scene.add(r);
  }

  return {
    update(dt, speed) {
      for (const o of items) {
        o.position.z += speed * dt;
        if (o.position.z > start + spacing) o.position.z -= length;
      }
    },
  };
}

// Rain as line segments; streaks lean with the car's speed.
export function createRain(scene, { count = 4500, width = 70, top = 55, near = 30, far = -110 } = {}) {
  const positions = new Float32Array(count * 6);
  const drops = new Float32Array(count * 5); // x, y, z, len, vel
  const wind = 2.5;

  const reset = (i, anyHeight) => {
    const o = i * 5;
    drops[o] = (Math.random() - 0.5) * width;
    drops[o + 1] = anyHeight ? Math.random() * top : top + Math.random() * 5;
    drops[o + 2] = far + Math.random() * (near - far);
    drops[o + 3] = rand(0.6, 1.3);
    drops[o + 4] = rand(28, 40);
  };
  for (let i = 0; i < count; i++) reset(i, true);

  const geometry = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attr);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0x8fb8e8, transparent: true, opacity: 0.22, depthWrite: false,
  }));
  lines.frustumCulled = false;
  scene.add(lines);

  return {
    update(dt, speed) {
      for (let i = 0; i < count; i++) {
        const o = i * 5;
        drops[o] += wind * dt;
        drops[o + 1] -= drops[o + 4] * dt;
        drops[o + 2] += speed * dt;
        if (drops[o + 2] > near) {
          reset(i, true);
          drops[o + 2] = far + Math.random() * 10;
        } else if (drops[o + 1] < 0) {
          reset(i, false);
        }
        const x = drops[o], y = drops[o + 1], z = drops[o + 2], len = drops[o + 3], vel = drops[o + 4];
        const p = i * 6;
        positions[p] = x;
        positions[p + 1] = y;
        positions[p + 2] = z;
        positions[p + 3] = x - (wind / vel) * len;
        positions[p + 4] = y + len;
        positions[p + 5] = z - (speed / vel) * len;
      }
      attr.needsUpdate = true;
    },
  };
}

// Anime-style speed lines: bright streaks rushing past the camera, stronger with speed and boost.
export function createSpeedLines(scene, { count = 180 } = {}) {
  const pos = new Float32Array(count * 6);
  const col = new Float32Array(count * 6);
  const d = new Float32Array(count * 4); // x, y, z, brightness
  const place = (i, cx, cy, anywhere) => {
    const a = Math.random() * Math.PI * 2, r = rand(2.6, 11);
    d[i * 4] = cx + Math.cos(a) * r;
    d[i * 4 + 1] = Math.max(0.3, cy + Math.sin(a) * r * 0.7);
    d[i * 4 + 2] = anywhere ? rand(-110, 10) : rand(-130, -70);
    d[i * 4 + 3] = rand(0.4, 1);
  };
  for (let i = 0; i < count; i++) place(i, 0, 5, true);
  const geo = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const cAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pAttr);
  geo.setAttribute('color', cAttr);
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  return {
    // intensity 0..1
    update(dt, speed, intensity, cx, cy) {
      mat.opacity = intensity * 0.65;
      lines.visible = intensity > 0.01;
      if (!lines.visible) return;
      const len = 3 + speed * 0.09 * (0.5 + intensity);
      for (let i = 0; i < count; i++) {
        const o = i * 4;
        d[o + 2] += speed * dt * 1.7;
        if (d[o + 2] > 12) place(i, cx, cy, false);
        const x = d[o], y = d[o + 1], z = d[o + 2], b = d[o + 3];
        pos.set([x, y, z, x, y, z - len], i * 6);
        // head bright (cyan-white), tail fades out
        col.set([0.75 * b, 1.0 * b, 1.1 * b, 0, 0, 0], i * 6);
      }
      pAttr.needsUpdate = true;
      cAttr.needsUpdate = true;
    },
  };
}

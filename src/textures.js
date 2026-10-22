import * as THREE from 'three';

export const JP_FONT = '"Yu Gothic UI", "Yu Gothic", Meiryo, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

const rand = (a, b) => a + Math.random() * (b - a);

// Neon lettering drawn to a canvas: a blurred colored pass plus a whitish "hot core".
export function neonTextTexture(text, { color = '#3dffb0', vertical = false, size = 96, padding = 28, background = null, border = false } = {}) {
  const chars = [...text];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `900 ${size}px ${JP_FONT}`;
  const step = size * 1.08;

  ctx.font = font;
  const w = vertical ? size + padding * 2 : Math.ceil(ctx.measureText(text).width) + padding * 2;
  const h = vertical ? Math.ceil(chars.length * step) + padding * 2 : Math.ceil(size * 1.25) + padding * 2;
  canvas.width = w;
  canvas.height = h;

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  if (border) {
    const m = size * 0.12;
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.05;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.2;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  }

  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const draw = () => {
    if (vertical) chars.forEach((c, i) => ctx.fillText(c, w / 2, padding + step * (i + 0.5)));
    else ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  };
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.3;
  ctx.fillStyle = color;
  draw();
  draw();
  ctx.shadowBlur = size * 0.05;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  draw();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: w / h };
}

// Grid of randomly lit office/apartment windows, used as an emissive map on buildings.
export function windowTexture() {
  const cols = 16, rows = 32, cell = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const warm = ['#ffd59a', '#ffe9c4'];
  const cool = ['#9fe6ff', '#c3b2ff', '#ff9fd0', '#bfffe4'];
  const warmBias = Math.random();
  const density = rand(0.25, 0.5);
  for (let r = 0; r < rows; r++) {
    const floorLit = Math.random() < 0.85;
    for (let c = 0; c < cols; c++) {
      if (floorLit && Math.random() < density) {
        ctx.globalAlpha = rand(0.35, 1);
        const palette = Math.random() < warmBias ? warm : cool;
        ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#070a10';
      }
      ctx.fillRect(c * cell + 3, r * cell + 4, cell - 6, cell - 7);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

let glowCache = null;
// Soft white radial falloff; tint it with the material color.
export function glowTexture() {
  if (glowCache) return glowCache;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowCache = new THREE.CanvasTexture(canvas);
  glowCache.colorSpace = THREE.SRGBColorSpace;
  return glowCache;
}

// Puddle mask for the wet asphalt overlay: darker blotches let more reflection through.
export function puddleTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(200,200,200)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = rand(15, 70);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(40,40,40,0.9)');
    g.addColorStop(1, 'rgba(40,40,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Small dark "room" lit by neon strips, prefiltered into an env map so chrome picks up pink/cyan reflections.
export function neonEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x03050a);
  const panel = (color, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, y * 0.3, 0);
    env.add(m);
  };
  panel(new THREE.Color(3.0, 0.3, 1.6), -9, 2, -4, 1.5, 16);
  panel(new THREE.Color(3.0, 0.3, 1.6), -9, 1, 6, 1.2, 10);
  panel(new THREE.Color(0.3, 2.4, 3.2), 9, 2, -2, 1.5, 16);
  panel(new THREE.Color(0.3, 2.4, 3.2), 9, 0, 7, 1, 8);
  panel(new THREE.Color(1.4, 0.8, 3.5), 0, 3, -10, 10, 1);
  panel(new THREE.Color(0.3, 2.6, 1.4), 0, -5, 0, 4, 20);
  panel(new THREE.Color(0.25, 0.35, 0.55), 0, 12, 0, 22, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return texture;
}

// Tyre tread: dark rubber with chevron grooves, repeated around the tyre.
export function treadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2b2e';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#0b0b0d';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 8); ctx.lineTo(32, 26); ctx.lineTo(64, 8);
  ctx.moveTo(0, 40); ctx.lineTo(32, 58); ctx.lineTo(64, 40);
  ctx.stroke();
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(30, 0, 4, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 28);
  return texture;
}

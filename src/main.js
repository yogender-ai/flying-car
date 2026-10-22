import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCar, LIVERIES } from './car.js';
import { createCity } from './city.js';
import { createGround, createRunway, createRain, createSpeedLines } from './effects.js';
import { neonEnvironment } from './textures.js';
import { createObstacles, createBursts, LANE, setObstacleSeed } from './obstacles.js';
import { createAudio } from './audio.js';
import { createCrashFx } from './crashfx.js';
import { exportMp4, download, exportSupported } from './exporter.js';

// ------------------------------------------------------------------ tuning
const KMH = 7;               // display km/h per world unit/s
const METERS_PER_UNIT = KMH / 3.6;
const BASE_SPEED = 38;
const MAX_EXTRA_SPEED = 74;  // reached gradually with distance
const BOOST_MULT = 1.5;
const LAT_SPEED = 15, VERT_SPEED = 10;
const MAX_SHIELDS = 3;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const stage = $('stage');
let portrait = params.has('portrait') || localStorage.getItem('skyway-portrait') === '1';
let hudHidden = false;
document.body.classList.toggle('portrait', portrait);

// ------------------------------------------------------------------ renderer + scene
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
const haze = new THREE.Color(0x08141f);
scene.background = haze;
scene.fog = new THREE.FogExp2(haze, 0.0115);
const envMap = neonEnvironment(renderer);
scene.environment = envMap;
scene.environmentIntensity = 0.4;

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

const hemi = new THREE.HemisphereLight(0x4a6a9a, 0x080410, 0.55);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x8fb3ff, 0.6);
moon.position.set(-5, 20, -10);
scene.add(moon);
const pinkSpill = new THREE.PointLight(0xff2bd6, 30, 30, 2);
pinkSpill.position.set(-7, 8, -4);
scene.add(pinkSpill);
const cyanSpill = new THREE.PointLight(0x26f7ff, 30, 30, 2);
cyanSpill.position.set(7, 7, 2);
scene.add(cyanSpill);

const car = createCar({ envMap });
scene.add(car.object);
for (const m of car.trails) scene.add(m);
const city = createCity(scene);
const runway = createRunway(scene);
const ground = createGround(scene);
const rain = createRain(scene);
const speedLines = createSpeedLines(scene);
const obstacles = createObstacles(scene, envMap);
const bursts = createBursts(scene);
const crashFx = createCrashFx(scene, { paintMaterial: car.materials.paint, trimMaterial: car.materials.trim, tireMaterial: car.materials.tire });
const audio = createAudio();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.35, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let livery = Number(localStorage.getItem('skyway-livery') || 0) % LIVERIES.length;
car.setLivery(livery);

// ------------------------------------------------------------------ layout (16:9 / 9:16)
let exporting = false;
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h || exporting) return;
  const pr = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

function setPortrait(on) {
  portrait = on;
  localStorage.setItem('skyway-portrait', on ? '1' : '0');
  document.body.classList.toggle('portrait', on);
  ui.ratioBtns.forEach((b) => (b.textContent = on ? '9:16' : '16:9'));
  requestAnimationFrame(resize);
}

// ------------------------------------------------------------------ DOM
const ui = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), over: $('over'),
  score: $('score'), combo: $('combo'), dist: $('dist'), warn: $('warn'), speed: $('speed'), speedfill: $('speedfill'),
  shields: [...$('shields').children], boostfill: $('boostfill'), boostbar: $('boostbar'), popups: $('popups'), flash: $('flash'),
  bestMenu: $('bestMenu'), bestOver: $('bestOver'), finalScore: $('finalScore'), newBest: $('newBest'),
  stDist: $('stDist'), stOrbs: $('stOrbs'), stNear: $('stNear'), stGates: $('stGates'), muteBtn: $('muteBtn'), boostBtn: $('boostBtn'),
  liveryName: $('liveryName'), recBtn: $('recBtn'), recBadge: $('recBadge'), recTime: $('recTime'), soundHint: $('soundHint'),
  exportScreen: $('export'), exInfo: $('exInfo'), exChoices: $('exChoices'), exProgress: $('exProgress'), exFill: $('exFill'), exText: $('exText'),
  ratioBtns: [...document.querySelectorAll('[data-action="ratio"]')],
};
let best = Number(localStorage.getItem('skyway-best') || 0);
ui.bestMenu.textContent = best.toLocaleString();
ui.muteBtn.classList.toggle('off', audio.muted);
ui.liveryName.textContent = LIVERIES[livery].name;
ui.ratioBtns.forEach((b) => (b.textContent = portrait ? '9:16' : '16:9'));

// popups are tracked in JS too, so the recorder can draw them into the video
const activePopups = [];
let exportClockMs = 0;
const nowMs = () => (exporting ? exportClockMs : performance.now());
function popup(text, color = '#26f7ff', big = false) {
  const now = nowMs();
  // forget expired ones, skip repeats of a message that is still showing, keep at most 3 on screen
  for (let i = activePopups.length - 1; i >= 0; i--) {
    const k = (now - activePopups[i].t0) / 1000;
    if (k > 1 || k < 0) activePopups.splice(i, 1);
  }
  if (activePopups.some((p) => p.text === text && now - p.t0 < 700)) return;
  const small = activePopups.filter((p) => !p.big);
  if (!big && small.length >= 3) activePopups.splice(activePopups.indexOf(small[0]), 1);
  // stack small messages in rows so they never print on top of each other
  const used = new Set(activePopups.filter((p) => !p.big).map((p) => p.dy));
  let dy = 0;
  if (!big) for (let row = 0; row < 4; row++) { dy = -row * 30; if (!used.has(dy)) break; }
  activePopups.push({ text, color, big, dy, t0: now });
  if (exporting) return;
  const el = document.createElement('div');
  el.className = big ? 'popup big' : 'popup';
  el.textContent = text;
  el.style.color = color;
  el.style.top = `${dy}px`;
  ui.popups.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
let flashState = { color: '#000', a: 0 };
function flash(color, strength = 0.35) {
  ui.flash.style.transition = 'none';
  ui.flash.style.background = color;
  ui.flash.style.opacity = strength;
  requestAnimationFrame(() => { ui.flash.style.transition = 'opacity .45s ease-out'; ui.flash.style.opacity = 0; });
  flashState = { color, a: strength };
}

function changeLivery(d) {
  livery = (livery + d + LIVERIES.length) % LIVERIES.length;
  localStorage.setItem('skyway-livery', String(livery));
  ui.liveryName.textContent = car.setLivery(livery).name;
  audio.click();
}

// ------------------------------------------------------------------ clip recording
// While recording, every frame's time step and input is logged and the game sound is captured.
// When you stop, the run is replayed off-screen frame by frame at 4K / 60 fps and saved as MP4,
// so recording never slows the game down and the clip is perfectly smooth.
// Recording only stops when you press R: crashes, the game-over screen and new runs all stay in
// the same clip (each run becomes a segment that is replayed back to back).
let runLog = { seed: 1, frames: [] };
const rec = { on: false, start: 0, segments: [], audio: null, returnTo: null, cancel: false };
if (!exportSupported) ui.recBtn.classList.add('hidden');

const segSeconds = (seg) => seg.log.frames.slice(seg.start, seg.end).reduce((a, f) => a + f.dt, 0);
const liveSeconds = () => rec.segments.reduce((a, s) => a + segSeconds(s), 0)
  + runLog.frames.slice(rec.start).reduce((a, f) => a + f.dt, 0);

function toggleRecord() {
  audio.init();
  if (!exportSupported) { popup('USE CHROME OR EDGE TO RECORD', '#ff3355'); return; }
  if (exporting) return;
  if (rec.on) { stopRecording(); return; }
  if (state === 'menu') startGame();
  if (state !== 'playing' && state !== 'over') { popup('START A RUN TO RECORD', '#ffc23d'); return; }
  rec.on = true;
  rec.segments = [];
  rec.start = runLog.frames.length;
  audio.startCapture();
  audio.record();
  ui.recBtn.classList.add('on');
  ui.recBadge.classList.remove('hidden');
}
// called when a new run starts while recording: the finished run becomes a segment of the clip
function splitRecording() {
  rec.segments.push({ log: runLog, start: rec.start, end: runLog.frames.length });
  rec.start = 0;
}
function stopRecording() {
  if (!rec.on) return;
  rec.on = false;
  rec.segments.push({ log: runLog, start: rec.start, end: runLog.frames.length });
  rec.segments = rec.segments.filter((s) => s.end > s.start);
  rec.audio = audio.stopCapture();
  audio.record();
  ui.recBtn.classList.remove('on');
  ui.recBadge.classList.add('hidden');
  if (state === 'playing' || state === 'crashing' || state === 'paused') { state = 'paused'; audio.stopMusic(); rec.returnTo = 'pause'; }
  else rec.returnTo = state === 'over' ? 'over' : 'menu';
  const secs = rec.segments.reduce((a, s) => a + segSeconds(s), 0);
  if (secs < 0.5) { popup('CLIP TOO SHORT', '#ffc23d'); backFromExport(); return; }
  const runs = rec.segments.length;
  ui.exInfo.textContent = `${secs.toFixed(1)} s clip${runs > 1 ? ` · ${runs} runs` : ''} · ${portrait ? '9:16 vertical' : '16:9'} · 60 fps`;
  ui.exChoices.classList.remove('hidden');
  ui.exProgress.classList.add('hidden');
  show(ui.exportScreen);
}
function backFromExport() {
  show(rec.returnTo === 'pause' ? ui.pause : rec.returnTo === 'over' ? ui.over : ui.menu);
}

// Replays a logged run from its start without rendering.
let replayT = 0;
function replayInit(log = runLog) {
  beginRun(log.seed);
  runLog = log;
  replayT = 0;
}
function replayFrame(i) {
  const f = runLog.frames[i];
  simInput = f.input;
  replayT += f.dt;
  exportClockMs = replayT * 1000;
  tick(f.dt, replayT, false, true);
}

async function exportClip(resKey) {
  if (exporting) return;
  const long = resKey === '4k' ? 3840 : 1920;
  const short = resKey === '4k' ? 2160 : 1080;
  const width = portrait ? short : long, height = portrait ? long : short;
  const fps = 60;
  const segments = rec.segments;
  const clipSecs = segments.reduce((a, s) => a + segSeconds(s), 0);
  const frameCount = Math.max(1, Math.floor(clipSecs * fps));

  ui.exChoices.classList.add('hidden');
  ui.exProgress.classList.remove('hidden');
  ui.exFill.style.width = '0%';
  ui.exText.textContent = 'Preparing replay...';
  rec.cancel = false;
  const live = { log: runLog, state };
  exporting = true;
  activePopups.length = 0; // live-play messages must not leak into the video
  audio.silent = true;
  await new Promise((r) => setTimeout(r, 30));

  // render at the export size; the visible canvas keeps its on-screen size
  renderer.setPixelRatio(1);
  composer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  camera.aspect = width / height;

  try {
    let seg = -1, cursor = 0, clipT = 0;
    const openSegment = (k) => {
      seg = k;
      exportClockMs = 0;
      replayInit(segments[k].log);
      for (let i = 0; i < segments[k].start; i++) replayFrame(i);
      cursor = segments[k].start;
    };
    openSegment(0);
    const t0 = performance.now();
    const blob = await exportMp4({
      width, height, fps, frameCount,
      bitrate: resKey === '4k' ? 45_000_000 : 16_000_000,
      audio: rec.audio,
      isCancelled: () => rec.cancel,
      onProgress: (p) => {
        ui.exFill.style.width = `${(p * 100).toFixed(1)}%`;
        const el = (performance.now() - t0) / 1000, left = p > 0.02 ? el / p - el : 0;
        ui.exText.textContent = `Rendering ${resKey === '4k' ? '4K' : '1080p'} · ${Math.round(p * 100)}%${left ? ` · ~${Math.ceil(left)}s left` : ''}`;
      },
      async drawFrame(i, ctx, w, h) {
        // advance the replay (moving into the next run's segment when one ends) up to this frame's time
        const target = (i + 1) / fps;
        for (;;) {
          if (cursor >= segments[seg].end) {
            if (seg + 1 >= segments.length) break;
            openSegment(seg + 1);
            continue;
          }
          const f = runLog.frames[cursor];
          if (clipT + f.dt > target + 1e-6) break;
          clipT += f.dt;
          replayFrame(cursor++);
        }
        exportClockMs = replayT * 1000;
        composer.render();
        ctx.drawImage(canvas, 0, 0, w, h);
        drawRecordingHud(ctx, w, h);
      },
    });
    if (blob) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      download(blob, `neon-skyway-${resKey}-${stamp}.mp4`);
      ui.exText.textContent = `Saved to Downloads · ${(blob.size / 1048576).toFixed(0)} MB`;
    } else ui.exText.textContent = 'Export cancelled';
  } catch (err) {
    console.error(err);
    ui.exText.textContent = `Export failed: ${err.message}`;
  }

  // put the live game back exactly where it was by replaying the current run silently
  replayInit(live.log);
  for (let i = 0; i < runLog.frames.length; i++) replayFrame(i);
  simInput = null;
  if (live.state === 'paused') state = 'paused';
  exporting = false;
  activePopups.length = 0;
  audio.silent = false;
  resize();
  clock.getDelta();
  setTimeout(() => { if (!exporting) backFromExport(); }, 1800);
}

// HUD painted into the recorded video (the DOM HUD is not part of the canvas)
function drawRecordingHud(ctx, w, h) {
  const s = h / (portrait ? 1920 : 1080) * (portrait ? 1.6 : 1.25);
  const pad = 26 * s;
  ctx.save();
  if (flashState.a > 0.01) {
    ctx.globalAlpha = flashState.a; ctx.fillStyle = flashState.color; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
  }
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

  const glowText = (text, x, y, size, color, align = 'left', font = 'Orbitron') => {
    ctx.font = `700 ${size}px ${font}, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.shadowColor = color; ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  };
  if (!hudHidden && state === 'playing') {
    glowText('SCORE', pad, pad, 13 * s, '#7f95ad', 'left', '"Share Tech Mono"');
    glowText(Math.floor(g.score).toLocaleString(), pad, pad + 18 * s, 34 * s, '#e8f6ff');
    if (g.combo > 1) glowText(`x${g.combo}`, pad, pad + 58 * s, 22 * s, '#ff2bd6');
    glowText(`${Math.round(g.speed * KMH)}`, w - pad, pad + 18 * s, 34 * s, '#e8f6ff', 'right');
    glowText('KM/H', w - pad, pad, 13 * s, '#ff2bd6', 'right', '"Share Tech Mono"');
    // shields + boost bottom-left
    for (let i = 0; i < MAX_SHIELDS; i++) {
      ctx.fillStyle = i < g.shields ? '#3dffb0' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(pad + i * 32 * s, h - pad - 30 * s, 26 * s, 9 * s);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(pad, h - pad - 12 * s, 170 * s, 6 * s);
    ctx.fillStyle = g.boosting ? '#bff8ff' : '#ffc23d';
    ctx.fillRect(pad, h - pad - 12 * s, 170 * s * g.boostEnergy / 100, 6 * s);
  }
  // floating popups
  const now = nowMs();
  for (let i = activePopups.length - 1; i >= 0; i--) {
    const p = activePopups[i], k = (now - p.t0) / 1000;
    if (k > 1 || k < 0) { activePopups.splice(i, 1); continue; }
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    let size = (p.big ? 64 : 22) * s;
    ctx.font = `700 ${size}px Orbitron, sans-serif`;
    const tw = ctx.measureText(p.text).width;
    if (tw > w * 0.9) size *= (w * 0.9) / tw;
    glowText(p.text, w / 2, h * 0.36 + (p.dy - k * 60) * s, size, p.color, 'center');
    ctx.globalAlpha = 1;
  }
  if (state === 'over' || state === 'menu') {
    glowText('NEON SKYWAY', w / 2, h * 0.42, 54 * s, '#ffffff', 'center');
    if (state === 'over') glowText(`${Math.floor(g.score).toLocaleString()} PTS`, w / 2, h * 0.42 + 70 * s, 34 * s, '#26f7ff', 'center');
  }
  // channel badge, same design and place as the in-game one
  drawBrand(ctx, pad * 0.55, h * (portrait ? 0.70 : 0.61), s * (portrait ? 1.08 : 0.95));
  ctx.restore();
}

// The @AI-Smjho channel badge painted onto a canvas: monogram tile + handle + tagline.
// (x, y) is the top-left of the badge; s scales from CSS pixels.
function drawBrand(ctx, x, y, s) {
  ctx.save();
  const tile = 36 * s, r = 10 * s, padL = 6 * s;
  ctx.font = `700 ${14 * s}px Orbitron, sans-serif`;
  const textW = ctx.measureText('@AI-Smjho').width;
  const bw = padL + tile + 10 * s + Math.max(textW, 150 * s) + 16 * s, bh = tile + 12 * s;
  // glass backing, fading out to the right, with a pink edge
  const bg = ctx.createLinearGradient(x, 0, x + bw, 0);
  bg.addColorStop(0, 'rgba(7,11,22,0.78)'); bg.addColorStop(0.7, 'rgba(7,11,22,0.35)'); bg.addColorStop(1, 'rgba(7,11,22,0)');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 13 * s); ctx.fill();
  ctx.fillStyle = 'rgba(255,43,214,0.75)';
  ctx.fillRect(x, y + 4 * s, 2 * s, bh - 8 * s);
  // monogram tile with gradient border and glow
  const tx = x + padL, ty = y + 6 * s;
  ctx.shadowColor = 'rgba(255,43,214,0.55)'; ctx.shadowBlur = 14 * s;
  ctx.fillStyle = '#0a0e1b';
  ctx.beginPath(); ctx.roundRect(tx, ty, tile, tile, r); ctx.fill();
  ctx.shadowBlur = 0;
  const border = ctx.createLinearGradient(tx, ty, tx + tile, ty + tile);
  border.addColorStop(0, '#3ff3ff'); border.addColorStop(0.5, '#b06bff'); border.addColorStop(1, '#ff2bd6');
  ctx.strokeStyle = border; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.roundRect(tx + s, ty + s, tile - 2 * s, tile - 2 * s, r - s); ctx.stroke();
  const mono = ctx.createLinearGradient(tx, ty, tx + tile, ty + tile);
  mono.addColorStop(0, '#8ff9ff'); mono.addColorStop(1, '#ff6ae4');
  ctx.font = `900 ${15 * s}px Orbitron, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,106,228,0.6)'; ctx.shadowBlur = 5 * s;
  ctx.fillStyle = mono; ctx.fillText('AI', tx + tile / 2, ty + tile / 2 + s);
  ctx.shadowBlur = 0;
  // shimmer sweep across the tile every 4.5 s
  const ph = ((nowMs() / 1000) % 4.5) / 4.5;
  if (ph > 0.7 && ph < 0.85) {
    const k = (ph - 0.7) / 0.15, sx = tx - tile + k * tile * 3;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(tx, ty, tile, tile, r); ctx.clip();
    const sh = ctx.createLinearGradient(sx, ty, sx + tile * 0.6, ty + tile);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.5)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(tx, ty, tile, tile);
    ctx.restore();
  }
  // handle + tagline
  const lx = tx + tile + 10 * s;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = `700 ${14 * s}px Orbitron, sans-serif`;
  ctx.shadowColor = 'rgba(255,43,214,0.55)'; ctx.shadowBlur = 10 * s;
  ctx.fillStyle = '#ffffff'; ctx.fillText('@AI-Smjho', lx, ty + 3 * s);
  ctx.shadowBlur = 0;
  ctx.font = `${10 * s}px "Share Tech Mono", monospace`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${2.4 * s}px`;
  ctx.globalAlpha = 0.85; ctx.fillStyle = '#8fe9ff';
  ctx.fillText('NEON SKYWAY ・ ネオン', lx, ty + 22 * s);
  ctx.restore();
}

// ------------------------------------------------------------------ input
const keys = new Set();
const touch = { active: false, id: null, x0: 0, y0: 0, steer: 0, climb: 0, boost: false };
let state = 'menu'; // menu | playing | paused | crashing | over

// browsers only allow sound after a user gesture: unlock on the very first one
function unlockAudio() {
  audio.init();
  ui.soundHint.classList.add('hidden');
  if (state === 'playing' || state === 'menu') audio.startMusic();
}
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Enter' || (e.code === 'Space' && state !== 'playing')) {
    if (state === 'menu' || state === 'over') startGame();
    else if (state === 'paused') resume();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyV') setPortrait(!portrait);
  if (e.code === 'KeyR') toggleRecord();
  if (e.code === 'KeyH') { hudHidden = !hudHidden; document.body.classList.toggle('clean', hudHidden); }
  if (state === 'menu' && (e.code === 'ArrowLeft' || e.code === 'KeyQ')) changeLivery(-1);
  if (state === 'menu' && (e.code === 'ArrowRight' || e.code === 'KeyE')) changeLivery(1);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (state === 'playing' && !exporting) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && !exporting) pause(); });

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'playing' || touch.active) return;
  touch.active = true; touch.id = e.pointerId; touch.x0 = e.clientX; touch.y0 = e.clientY;
});
window.addEventListener('pointermove', (e) => {
  if (!touch.active || e.pointerId !== touch.id) return;
  const scale = Math.min(stage.clientWidth, stage.clientHeight) * 0.18;
  touch.steer = THREE.MathUtils.clamp((e.clientX - touch.x0) / scale, -1, 1);
  touch.climb = THREE.MathUtils.clamp(-(e.clientY - touch.y0) / scale, -1, 1);
});
const endTouch = (e) => { if (e.pointerId === touch.id) { touch.active = false; touch.steer = touch.climb = 0; } };
window.addEventListener('pointerup', endTouch);
window.addEventListener('pointercancel', endTouch);
ui.boostBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); touch.boost = true; ui.boostBtn.classList.add('on'); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ui.boostBtn.addEventListener(ev, () => { touch.boost = false; ui.boostBtn.classList.remove('on'); });

document.querySelectorAll('[data-action]').forEach((b) => {
  b.addEventListener('mouseenter', () => audio.hover());
  b.addEventListener('click', () => {
    audio.init(); audio.click();
    const a = b.dataset.action;
    if (a === 'start') startGame();
    if (a === 'resume') resume();
    if (a === 'menu') toMenu();
    if (a === 'ratio') setPortrait(!portrait);
    if (a === 'livery-prev') changeLivery(-1);
    if (a === 'livery-next') changeLivery(1);
    if (a === 'export-4k') exportClip('4k');
    if (a === 'export-1080') exportClip('1080');
    if (a === 'export-discard') backFromExport();
    if (a === 'export-cancel') rec.cancel = true;
  });
});
$('pauseBtn').addEventListener('click', () => (state === 'playing' ? pause() : resume()));
ui.muteBtn.addEventListener('click', toggleMute);
ui.recBtn.addEventListener('click', toggleRecord);
function toggleMute() { audio.init(); ui.muteBtn.classList.toggle('off', audio.toggleMute()); }

let padStartWas = false, padPauseWas = false;
let simInput = null;
function readInput() {
  if (simInput) return simInput;
  let steer = 0, climb = 0, boost = false;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) climb += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) climb -= 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Space')) boost = true;
  steer += touch.steer; climb += touch.climb; boost ||= touch.boost;

  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    steer += dz(pad.axes[0] || 0);
    climb -= dz(pad.axes[1] || 0);
    boost ||= pad.buttons[0]?.pressed || pad.buttons[7]?.pressed;
    const startBtn = pad.buttons[9]?.pressed, aBtn = pad.buttons[0]?.pressed;
    if ((startBtn || aBtn) && !padStartWas && (state === 'menu' || state === 'over')) startGame();
    if (startBtn && !padPauseWas) { if (state === 'playing') pause(); else if (state === 'paused') resume(); }
    padStartWas = startBtn || aBtn; padPauseWas = startBtn;
  }
  return { steer: THREE.MathUtils.clamp(steer, -1, 1), climb: THREE.MathUtils.clamp(climb, -1, 1), boost };
}

// ------------------------------------------------------------------ game state
const g = {};
let runId = 0;
// the wrecked car after a crash: a little rigid-body sim (tumble, bounce, slide, settle)
const wreck = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), spin: new THREE.Vector3(), grounded: false, side: 1, camA: 0 };
const BULLET_SCALE = 0.35;     // near-miss slow motion speed
const CRASH_LENGTH = 2.6;      // seconds from impact until the game-over screen (short and punchy)
const WRECK_GROUND = 0.42;
const COUNTDOWN = [['3', 0], ['2', 0.55], ['1', 1.1], ['GO!', 1.65]];
function resetRun() {
  Object.assign(g, {
    x: 0, y: 5, vx: 0, vy: 0, speed: BASE_SPEED, distance: 0, score: 0,
    combo: 1, comboTimer: 0, orbChain: 0, shields: MAX_SHIELDS, boostEnergy: 60, boosting: false, boostWarned: false,
    invuln: 0, hitSlow: 0, shake: 0, nextLightning: 12 + Math.random() * 15,
    orbs: 0, nears: 0, gates: 0, crashTimer: 0, nextMilestone: 300, gateWarned: false, braking: 0,
    time: 0, countdown: 0, wrecked: false, crashT: 0, pops: 0, bullet: 0, bulletCool: 0, fovPunch: 0,
  });
  obstacles.reset();
  car.resetTrails();
  car.revive();
  crashFx.reset();
  wreck.pos.set(0, 5, 0); wreck.vel.set(0, 0, 0); wreck.rot.set(0, 0, 0); wreck.spin.set(0, 0, 0); wreck.grounded = false;
  audio.wreckSounds?.(0, 0);
  car.object.visible = true;
  car.object.rotation.set(0, 0, 0);
  car.object.position.set(0, 5, 0);
}
resetRun();

function show(screen) {
  for (const s of [ui.menu, ui.pause, ui.over, ui.exportScreen]) s.classList.toggle('hidden', s !== screen);
}
// a run is fully determined by its seed plus the logged inputs, which is what makes clip export possible
function beginRun(seed) {
  resetRun();
  setObstacleSeed(seed);
  runLog = { seed, frames: [] };
  state = 'playing';
}
function startGame() {
  audio.init();
  if (rec.on) splitRecording();
  audio.pauseCapture(false);
  beginRun((Math.random() * 2 ** 31) | 0);
  runId++;
  show(null);
  ui.hud.classList.remove('hidden');
  audio.startMusic();
}
function pause() { state = 'paused'; show(ui.pause); audio.stopMusic(); audio.pauseCapture(true); }
function resume() { state = 'playing'; show(null); clock.getDelta(); audio.startMusic(); audio.pauseCapture(false); }
function toMenu() {
  state = 'menu';
  audio.pauseCapture(true);
  runId++;
  resetRun();
  show(ui.menu);
  ui.hud.classList.add('hidden');
  ui.bestMenu.textContent = best.toLocaleString();
}
function crash() {
  state = 'crashing';
  g.wrecked = true;
  g.crashT = 0;
  g.pops = 0;
  // launch the wreck: thrown up and sideways, spinning on every axis.
  // Seeded from the run so an exported replay crashes exactly like the live run did.
  let seed = (Math.floor(g.distance * 1000) ^ 0x5bd1e995) >>> 0;
  const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  wreck.pos.set(g.x, g.y, 0);
  wreck.side = g.vx >= 0 ? 1 : -1;
  wreck.vel.set(g.vx * 0.45 + wreck.side * (2 + rnd() * 2), 5 + rnd() * 2.5, 0);
  wreck.rot.set(0, 0, 0);
  wreck.spin.set(-3 - rnd() * 3, (rnd() - 0.5) * 4, -wreck.side * (6 + rnd() * 4));
  wreck.grounded = false;
  wreck.camA = Math.atan2(wreck.side * 6, 4);
  const p = new THREE.Vector3(g.x, g.y + 0.6, 0);
  crashFx.explode(p, new THREE.Vector3(g.vx, g.vy, 0));
  bursts.emit(p, new THREE.Color(2, 2, 2), 40, 24);
  flash('#ffb070', 0.75);
  g.shake = 1.8;
  popup('WRECKED ・ 大破', '#ff3355', true);
  if (!exporting) ui.hud.classList.add('hidden'); // cinematic: no HUD while the crash plays out
  audio.crash();
  audio.stopMusic();
}

// slow motion right after impact, easing back to real time
const crashTimeScale = (ct) => (ct < 0.5 ? 0.3 : ct < 0.9 ? THREE.MathUtils.lerp(0.3, 1, (ct - 0.5) / 0.4) : 1);

function stepWreck(sdt) {
  const P = wreck.pos, V = wreck.vel, R = wreck.rot, W = wreck.spin;
  V.y -= 22 * sdt;
  P.addScaledVector(V, sdt);
  R.addScaledVector(W, sdt);
  // bounce off the building walls
  if (Math.abs(P.x) > 8.4) {
    P.x = Math.sign(P.x) * 8.4;
    V.x *= -0.35;
    W.multiplyScalar(0.7);
    crashFx.impact(P);
    audio.thud(0.7);
    g.shake = Math.max(g.shake, 0.6);
  }
  // hit the street
  if (P.y < WRECK_GROUND) {
    P.y = WRECK_GROUND;
    if (V.y < -2.5) {
      const hard = Math.min(1, -V.y / 12);
      crashFx.impact(P);
      audio.thud(hard);
      g.shake = Math.max(g.shake, 0.4 + hard);
      V.y = -V.y * 0.32;
      W.multiplyScalar(0.55);
    } else {
      V.y = 0;
      wreck.grounded = true;
    }
  }
  if (wreck.grounded || P.y <= WRECK_GROUND + 0.05) {
    // slide: sideways friction, spin bleeds off, settle on wheels or roof
    V.x *= Math.exp(-sdt * 1.8);
    W.multiplyScalar(Math.exp(-sdt * 3));
    const flat = Math.round(R.z / Math.PI) * Math.PI;
    R.z += (flat - R.z) * (1 - Math.exp(-sdt * 5));
    R.x += (Math.round(R.x / (Math.PI * 2)) * Math.PI * 2 - R.x) * (1 - Math.exp(-sdt * 5));
    if (g.speed > 3) crashFx.scrape(new THREE.Vector3(P.x, 0.1, P.z + 1.5), g.speed);
  }
  crashFx.setWreck(P);
}
function gameOver() {
  state = 'over';
  if (exporting) return; // replaying a run for export: keep the export screen up
  const final = Math.floor(g.score);
  const isBest = final > best;
  if (isBest) { best = final; localStorage.setItem('skyway-best', String(best)); }
  ui.finalScore.textContent = final.toLocaleString();
  ui.newBest.classList.toggle('hidden', !isBest);
  ui.bestOver.textContent = best.toLocaleString();
  ui.stDist.textContent = ((g.distance * METERS_PER_UNIT) / 1000).toFixed(2);
  ui.stOrbs.textContent = g.orbs;
  ui.stNear.textContent = g.nears;
  ui.stGates.textContent = g.gates;
  ui.hud.classList.add('hidden');
  show(ui.over);
}

function addCombo(n) {
  const before = g.combo;
  g.combo = Math.min(8, g.combo + n);
  g.comboTimer = 4;
  if (g.combo > before) {
    audio.comboUp(g.combo);
    const callout = { 3: ['NICE!', '#3dffb0'], 5: ['INSANE!', '#ffc23d'], 8: ['UNSTOPPABLE!', '#ff2bd6'] }[g.combo];
    if (callout) { popup(callout[0], callout[1], true); g.fovPunch = Math.max(g.fovPunch, 0.7); }
    ui.combo.classList.add('pop');
    setTimeout(() => ui.combo.classList.remove('pop'), 150);
  }
}
const panOf = (x) => THREE.MathUtils.clamp((x - g.x) / 8, -1, 1);

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'pickup') {
      g.score += ev.points * g.combo;
      g.boostEnergy = Math.min(100, g.boostEnergy + ev.boost);
      g.orbs++;
      if (ev.kind === 'orb') {
        audio.pickup('orb', g.orbChain);
        g.orbChain++;
        g.comboTimer = Math.max(g.comboTimer, 2.5);
        if (g.orbChain % 5 === 0) { addCombo(1); popup(`ORB CHAIN x${g.combo}`, '#26f7ff'); }
        bursts.emit(ev.pos, new THREE.Color(0.3, 1.6, 2), 16, 6);
      } else if (ev.kind === 'boost') {
        audio.pickup('boost');
        popup('BOOST CELL', '#ffc23d');
        g.boostWarned = false;
        bursts.emit(ev.pos, new THREE.Color(2, 1.3, 0.2), 30, 8);
      } else if (ev.kind === 'shield') {
        audio.pickup('shield');
        g.shields = Math.min(MAX_SHIELDS, g.shields + 1);
        popup('+ SHIELD', '#3dffb0');
        bursts.emit(ev.pos, new THREE.Color(0.3, 2, 0.7), 30, 8);
      }
    } else if (ev.type === 'near') {
      g.nears++;
      addCombo(1);
      const pts = 150 * g.combo;
      g.score += pts;
      g.boostEnergy = Math.min(100, g.boostEnergy + 6);
      popup(`NEAR MISS +${pts}`, '#ff2bd6');
      audio.near(panOf(ev.pos.x));
      if (g.bulletCool <= 0) { g.bullet = 0.2; g.bulletCool = 1.1; g.fovPunch = 1; flash('#7af7ff', 0.12); }
    } else if (ev.type === 'pass') {
      if (ev.what === 'drone') audio.drone(panOf(ev.pos.x));
      audio.whoosh(panOf(ev.pos.x), ev.close);
    } else if (ev.type === 'gate') {
      g.gates++;
      addCombo(1);
      const pts = 400 * g.combo;
      g.score += pts;
      popup(`GATE CLEARED +${pts}`, '#3dffb0');
      audio.gate();
      bursts.emit(new THREE.Vector3(ev.pos.x, ev.pos.y, -1), new THREE.Color(0.3, 2, 1), 40, 9);
    } else if (ev.type === 'hit' && g.invuln <= 0) {
      g.shields--;
      g.combo = 1; g.orbChain = 0; g.comboTimer = 0;
      if (g.shields <= 0) { crash(); return; }
      g.invuln = 1.8;
      g.hitSlow = 1;
      g.shake = 0.7;
      flash('#ff2a4a', 0.4);
      popup(ev.what === 'gate' ? 'GATE HIT' : 'HIT', '#ff3355');
      bursts.emit(ev.pos, new THREE.Color(2, 0.5, 0.2), 60, 12);
      audio.hit();
      if (g.shields === 1) { audio.shieldLow(); popup('SHIELD LOW', '#ff3355'); }
    }
  }
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(0, 7.5, 9);
const camLook = new THREE.Vector3(0, 5, -12);
const tmp = new THREE.Vector3();
let hudTimer = 0;
let lightningLeft = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state === 'paused' || exporting) return;
  tick(dt, clock.elapsedTime, true);
}

let simTime = 0;
function tick(dt, t, render, replaying = false) {
  const input = readInput();
  // log every gameplay frame of the run (cheap) so any recorded stretch can be replayed exactly
  if (!replaying && (state === 'playing' || state === 'crashing' || (state === 'over' && rec.on))) runLog.frames.push({ dt, input: { ...input } });
  // near-miss bullet time: a split second of slow motion
  if (state === 'playing') {
    g.bulletCool = Math.max(0, g.bulletCool - dt);
    if (g.bullet > 0) { g.bullet -= dt; dt *= BULLET_SCALE; }
  }
  g.fovPunch *= Math.exp(-dt * 5);
  let boostAmt = 0;
  let wdt = dt; // world time step (slowed down during the crash)
  flashState.a *= Math.exp(-dt * 6);

  if (state === 'playing') {
    g.time += dt;
    // 3-2-1 countdown, driven by game time so it also appears in exported clips
    while (g.countdown < COUNTDOWN.length && g.time >= COUNTDOWN[g.countdown][1]) {
      const [txt] = COUNTDOWN[g.countdown++];
      popup(txt, txt === 'GO!' ? '#3dffb0' : '#ffffff', true);
      audio.countdown(txt === 'GO!');
    }
    // forward speed rises with distance; boost and hits change it
    const difficulty = Math.min(1, g.distance / 4200);
    const base = BASE_SPEED + MAX_EXTRA_SPEED * Math.min(1, g.distance / 5500);
    const wantBoost = input.boost && g.boostEnergy > 0;
    if (wantBoost && !g.boosting) audio.boostStart();
    if (input.boost && g.boostEnergy <= 0 && !g.boostWarned) { g.boostWarned = true; audio.boostEmpty(); popup('BOOST EMPTY', '#ffc23d'); }
    if (g.boostEnergy > 15) g.boostWarned = false;
    g.boosting = wantBoost;
    if (g.boosting) g.boostEnergy = Math.max(0, g.boostEnergy - 26 * dt);
    else g.boostEnergy = Math.min(100, g.boostEnergy + 2.5 * dt);
    g.hitSlow = Math.max(0, g.hitSlow - dt * 0.8);
    const target = base * (g.boosting ? BOOST_MULT : 1) * (1 - g.hitSlow * 0.45);
    g.braking = target < g.speed - 3 ? 1 : 0;
    g.speed += (target - g.speed) * (1 - Math.exp(-dt * 2.2));
    boostAmt = THREE.MathUtils.clamp((g.speed / base - 1) / (BOOST_MULT - 1), 0, 1);

    // speed milestones
    const kmh = g.speed * KMH;
    if (kmh >= g.nextMilestone) {
      if (!g.boosting) { popup(`${g.nextMilestone} KM/H`, '#26f7ff'); audio.speedUp(); }
      g.nextMilestone += 100;
    }

    // steering with inertia
    g.vx += (input.steer * LAT_SPEED - g.vx) * (1 - Math.exp(-dt * 6));
    g.vy += (input.climb * VERT_SPEED - g.vy) * (1 - Math.exp(-dt * 6));
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (Math.abs(g.x) > LANE.xMax) { g.x = Math.sign(g.x) * LANE.xMax; g.vx *= -0.2; }
    if (g.y < LANE.yMin) { g.y = LANE.yMin; g.vy = 0; }
    if (g.y > LANE.yMax) { g.y = LANE.yMax; g.vy = 0; }

    g.distance += g.speed * dt;
    g.score += g.speed * dt * 0.5;
    g.invuln = Math.max(0, g.invuln - dt);
    if (g.comboTimer > 0) { g.comboTimer -= dt; if (g.comboTimer <= 0) { g.combo = 1; g.orbChain = 0; } }

    handleEvents(obstacles.update(dt, g.time, g.speed, g, difficulty, g.invuln > 0));

    // distraction: lightning over the city
    g.nextLightning -= dt;
    if (g.nextLightning <= 0) {
      g.nextLightning = 14 + Math.random() * 22;
      lightningLeft = 0.45;
      flash('#cfe4ff', 0.28);
      setTimeout(() => audio.thunder(), 400 + Math.random() * 500);
    }

    // gate alarm when a security gate comes into range
    const gz = obstacles.gateAhead();
    const gateNear = gz !== null && gz > -170;
    if (gateNear && !g.gateWarned) audio.gateAlarm();
    g.gateWarned = gateNear;
  } else if (state === 'crashing' || (state === 'over' && g.wrecked)) {
    // cinematic crash: slow motion, tumbling wreck sliding to a stop, fire and secondary blasts
    if (state === 'crashing') g.crashT += dt;
    wdt = dt * (state === 'crashing' ? crashTimeScale(g.crashT) : 1);
    g.speed *= Math.exp(-wdt * 0.85);
    if (g.speed < 0.3) g.speed = 0;
    g.time += wdt;
    stepWreck(wdt);
    obstacles.update(wdt, g.time, g.speed, g, 0, true);
    if (state === 'crashing') {
      if (g.pops === 0 && g.crashT > 1.15) { g.pops = 1; crashFx.pop(wreck.pos.clone().add(new THREE.Vector3(0, 0.8, 0))); audio.pop(); g.shake = Math.max(g.shake, 0.7); flash('#ff8a30', 0.25); }
      if (g.pops === 1 && g.crashT > 1.9) { g.pops = 2; crashFx.pop(wreck.pos.clone().add(new THREE.Vector3(0.4, 0.9, -0.6))); audio.pop(); g.shake = Math.max(g.shake, 0.5); }
      if (g.crashT >= CRASH_LENGTH) gameOver();
    }
  } else {
    // menu / game over: attract mode, autopilot weave
    g.speed += (26 - g.speed) * (1 - Math.exp(-dt));
    g.x = Math.sin(t * 0.35) * 3.5;
    g.y = 5 + Math.sin(t * 0.5) * 1.2;
    g.vx = Math.cos(t * 0.35) * 3.5 * 0.35;
    g.vy = Math.cos(t * 0.5) * 0.6;
    if (state === 'over') obstacles.update(dt, t, g.speed, g, 0, true);
  }

  // police siren follows the nearest patrol drone ahead
  let siren = 0, sirenPan = 0;
  if (state === 'playing') {
    for (const e of obstacles.entities()) {
      if (!e.police) continue;
      const z = e.obj.position.z;
      if (z < 6 && z > -130) {
        const lvl = 1 - Math.abs(z) / 130;
        if (lvl > siren) { siren = lvl; sirenPan = panOf(e.obj.position.x); }
      }
    }
  }
  audio.siren(siren, sirenPan);

  // lightning lights up the sky briefly
  if (lightningLeft > 0) {
    lightningLeft -= dt;
    const k = Math.random() < 0.5 ? 1 : 0.3;
    hemi.intensity = 0.55 + k * 3 * (lightningLeft / 0.45);
  } else hemi.intensity = 0.55;

  // car
  if (g.wrecked) {
    car.object.position.copy(wreck.pos);
    car.object.rotation.set(wreck.rot.x, wreck.rot.y, wreck.rot.z);
    car.update(t, wdt, { speed: g.speed, wrecked: true });
  } else {
    car.object.position.set(g.x, g.y, 0);
    car.object.rotation.set(0, 0, 0);
    car.update(t, dt, { speed: g.speed, boost: boostAmt, steer: g.vx / LAT_SPEED, climb: g.vy / VERT_SPEED, invuln: g.invuln, braking: g.braking });
  }

  // world (wdt = slowed time during the crash)
  city.update(wdt, g.speed, t);
  runway.update(wdt, g.speed);
  ground.update(wdt, g.speed);
  rain.update(wdt, g.speed);
  const lineAmt = state === 'playing' ? THREE.MathUtils.clamp((g.speed - 60) / 90, 0, 0.55) + boostAmt * 0.6 + g.fovPunch * 0.4 : 0;
  speedLines.update(wdt, g.speed, Math.min(1, lineAmt), g.x, g.y);
  bursts.update(wdt, g.speed);
  crashFx.update(wdt, t, g.speed * wdt);

  // camera: in 9:16 it sits higher and further back so the car and the lane ahead both fit
  const W = stage.clientWidth, H = stage.clientHeight;
  if (g.wrecked) {
    // crash camera: close side shot during slow motion, then a slow orbit around the burning wreck
    const P = wreck.pos;
    if (state === 'crashing' && g.crashT < 0.8) {
      tmp.set(P.x + wreck.side * (portrait ? 7.5 : 6), P.y + (portrait ? 2.6 : 1.6), P.z + (portrait ? 9 : 5));
      camPos.lerp(tmp, 1 - Math.exp(-dt * 4));
    } else {
      wreck.camA += dt * 0.22;
      const r = (portrait ? 12.5 : 10.5) - (state === 'over' ? 0 : 1.5);
      tmp.set(P.x + Math.sin(wreck.camA) * r, Math.max(2.2, P.y + (portrait ? 4.2 : 3.3)), P.z + Math.cos(wreck.camA) * r);
      camPos.lerp(tmp, 1 - Math.exp(-dt * 1.6));
    }
    camLook.lerp(tmp.set(P.x, P.y + 0.5, P.z), 1 - Math.exp(-dt * 5));
  } else if (state === 'menu') {
    const a = t * 0.12, r = portrait ? 11 : 9.5;
    tmp.set(g.x + Math.sin(a) * r, g.y + (portrait ? 3 : 2.4), Math.cos(a) * r);
    camPos.lerp(tmp, 1 - Math.exp(-dt * 2));
    camLook.lerp(tmp.set(g.x, g.y + (portrait ? 1.6 : 0.6), 0), 1 - Math.exp(-dt * 3));
  } else if (portrait) {
    tmp.set(g.x * 0.55, g.y + 3.1 + boostAmt * 0.3, 10.5 + boostAmt * 1.8);
    camPos.lerp(tmp, 1 - Math.exp(-dt * 5));
    camLook.lerp(tmp.set(g.x * 0.7, g.y + 1.5, -14), 1 - Math.exp(-dt * 6));
  } else {
    tmp.set(g.x * 0.7, g.y + 2.3 + boostAmt * 0.2, 8.2 + boostAmt * 1.6);
    camPos.lerp(tmp, 1 - Math.exp(-dt * 5));
    camLook.lerp(tmp.set(g.x * 0.85, g.y + 0.9, -14), 1 - Math.exp(-dt * 6));
  }
  camera.position.copy(camPos);
  if (g.shake > 0) {
    g.shake = Math.max(0, g.shake - dt * 1.8);
    camera.position.x += (Math.random() - 0.5) * g.shake;
    camera.position.y += (Math.random() - 0.5) * g.shake;
  }
  camera.position.x += (Math.random() - 0.5) * boostAmt * 0.05;
  camera.lookAt(camLook);
  if (!g.wrecked) camera.rotation.z += -g.vx / LAT_SPEED * 0.05;
  const speedFov = THREE.MathUtils.clamp((g.speed - BASE_SPEED) / (MAX_EXTRA_SPEED * BOOST_MULT), 0, 1);
  camera.fov = (g.wrecked ? (portrait ? 62 : 52) : (portrait ? 70 : 60) + speedFov * 10 + boostAmt * 8) - g.fovPunch * 7;
  // on wide screens the menu panel sits on the left, so slide the picture right to keep the car visible
  // over the game-over screen the panel sits left (wide) or at the bottom (narrow), so frame the wreck in the free space
  if ((state === 'menu' || state === 'over') && W > 900) camera.setViewOffset(W, H, -W * 0.25, 0, W, H);
  else if (state === 'over') camera.setViewOffset(W, H, 0, H * 0.24, W, H);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  bloom.strength = 0.42 + boostAmt * 0.15;

  audio.update({ speed: g.speed, boost: boostAmt, boosting: g.boosting && state === 'playing', on: (state === 'playing' || state === 'menu' || state === 'over') && !g.wrecked, steer: g.vx / LAT_SPEED });
  // wreck: metal scraping while it slides, fire crackle while it burns
  audio.wreckSounds?.(g.wrecked && wreck.grounded ? Math.min(1, g.speed / 40) : 0, g.wrecked ? 1 : 0);

  if (document.body.dataset.state !== state) document.body.dataset.state = state;
  // HUD (throttled)
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.05;
    if (state === 'playing') {
      ui.score.textContent = Math.floor(g.score).toLocaleString();
      ui.combo.textContent = `x${g.combo}`;
      ui.combo.style.opacity = g.combo > 1 ? 1 : 0.35;
      ui.dist.textContent = `${((g.distance * METERS_PER_UNIT) / 1000).toFixed(2)} KM`;
      ui.speed.textContent = Math.round(g.speed * KMH);
      ui.speedfill.style.width = `${Math.min(100, (g.speed / ((BASE_SPEED + MAX_EXTRA_SPEED) * BOOST_MULT)) * 100)}%`;
      ui.boostfill.style.width = `${g.boostEnergy}%`;
      ui.boostbar.classList.toggle('active', g.boosting);
      ui.shields.forEach((b, i) => b.classList.toggle('off', i >= g.shields));
      ui.warn.classList.toggle('hidden', !g.gateWarned);
    }
    if (rec.on) {
      const s = Math.floor(liveSeconds());
      ui.recTime.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
  }

  if (render) composer.render();
}

// test hook: advance the simulation without rendering (used for automated play-testing)
window.__skyway = {
  g, obstacles,
  get state() { return state; },
  sim(seconds, inputFn) {
    for (let i = 0; i < seconds * 60; i++) {
      if (inputFn) inputFn(i / 60, g);
      simTime += 1 / 60;
      tick(1 / 60, simTime, false);
      if (state === 'over') break;
    }
  },
  get runLog() { return runLog; },
  rec, toggleRecord, exportClip, replayInit, replayFrame,
  setInput(steer, climb, boost) { simInput = { steer, climb, boost }; },
};
resize();
if (params.has('autostart')) {
  startGame();
  // ?sim=N fast-forwards N seconds of flight (dodging nothing) for screenshots and tests
  if (params.has('boost')) window.__skyway.setInput(0, 0, true); // dev: fast-forward with boost held
  if (params.get('sim')) window.__skyway.sim(Number(params.get('sim')));
  // ?crash=T flies straight into trouble, then stops T seconds after the crash (for crash screenshots)
  if (params.has('crash')) {
    for (let i = 0; i < 60 * 120 && state === 'playing'; i++) window.__skyway.sim(1 / 60);
    for (let i = 0; i < Number(params.get('crash')) * 60; i++) { simTime += 1 / 60; tick(1 / 60, simTime, false); }
  }
}
frame();

# 🚗 Neon Skyway — Cyberpunk Flying Car 3D Experience

[![Three.js](https://img.shields.io/badge/Three.js-r169-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![WebGL](https://img.shields.io/badge/WebGL-2.0-blueviolet?style=for-the-badge&logo=webgl)](https://www.khronos.org/webgl/)
[![Web Audio API](https://img.shields.io/badge/Audio-Web_Audio_API-success?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![No Build Step](https://img.shields.io/badge/Build-Zero_Config_ES_Modules-orange?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> A high-octane 3D cyberpunk flying-car arcade runner built in vanilla ES Modules with **Three.js** and **Web Audio API**. Pilot a repulsor-lift hover hypercar through a rain-drenched neon metropolis, thread high-voltage security gates, dodge autonomous drone cruisers, chain near-miss bullet time combos, and export buttery **4K 60FPS vertical clips** directly from your browser.

🎮 **[Play Live in Browser (GitHub Pages)](https://yogender-ai.github.io/flying-car/)**

---

## 📸 Overview & Visual Atmosphere

```
               ▲  SKY-CORRIDOR CEILING [ALTITUDE 3,000M]
               │     
   [ DRONE ]   │             ┌─────────────────┐
      ▼        │             │  SECURITY GATE  │
               │             │  [GREEN CLEAR]  │
  ───► 🚗 ──────────────────►│        ▼        │──────► COMBO x8
     AETHER                  └─────────────────┘
      CAR      │
               ▼  NEON MEGAPOLIS STREET LEVEL (RAIN & REFLECTIONS)
```

**Neon Skyway** drops you into the pilot seat of an agile anti-gravity cruiser navigating an infinite procedurally generated mega-city. The game runs entirely on client-side WebGL with zero bundlers, npm dependencies, or heavy build pipelines—just clean, performant modern JavaScript.

---

## ✨ Key Features

- **Dynamic 6-DOF Flight Mechanics**: Full pitch, yaw, roll stabilization, bank tilt physics, atmospheric drag, and a high-thrust afterburner boost mode.
- **Cinematic Near-Miss Bullet Time**: Scraping within inches of oncoming hover-traffic activates an instant slow-motion time dilation with camera punch, motion blur, and spatial audio whooshes.
- **Procedural Neon Megalopolis**: Dynamic infinite building generation, animated billboards, volumetric rain streaks, ground mist, lens flare reflections, and glowing street grids.
- **Precision Security Gates**: High-voltage city security barriers spawn with randomized green traversal gaps, challenging pilot reflexes under escalating speeds.
- **Tiered Combo & Scoring Engine**:
  - Distance accrued translates directly to score.
  - Pickups: **Quantum Orbs (+100)**, **Boost Fuel Cells (+150)**, and **Energy Shields (+200)**.
  - Near misses (+150) and clean gate clearances (+400) multiply your combo up to **x8** with dynamic callouts: `NICE! (x3)`, `INSANE! (x5)`, and `UNSTOPPABLE! (x8)`.
- **Hollywood-Grade 2.6s Crash Sequence**: Multi-stage slow-motion impact physics featuring fireball expansions, shockwave rings, chassis tumbling, sparks, and secondary debris detonations.
- **Deterministic 4K 60FPS Clip Recorder**:
  - Switch instantly between widescreen 16:9 and vertical 9:16 (optimized for TikTok, YouTube Shorts, and Instagram Reels).
  - Background deterministic input logging captures your run without dropping a single frame during gameplay.
  - Offscreen post-processing pipeline encodes up to **4K (2160 × 3840) at 60 FPS** in crisp H.264 MP4 with synchronized stereo audio.
- **Procedural Web Audio Engine**: 100% synthesized sound design with no external audio files required! Synthesizes engine turbine hum, afterburner roar, near-miss whooshes, shield impacts, gate chimes, and ambient synth tracks.
- **Multiple Vehicle Paint Finishes**: Choose between Glacier White, Midnight Obsidian, Cyber Cyan, Hot Magenta, Sunset Copper, and Royal Gold.
- **Multi-Input Support**: Full keyboard controls, smooth mobile touch dragging with virtual throttle, and plug-and-play Gamepad API support.

---

## 🕹️ Controls Guide

| Action | Keyboard | Mobile / Touch | Gamepad (Xbox / PS) |
|---|---|---|---|
| **Steer & Altitude** | `W` `A` `S` `D` or `Arrow Keys` | Drag Finger on Screen | Left Analog Stick |
| **Afterburner Boost** | Hold `Shift` or `Spacebar` | Hold `BOOST` button | `A` Button / `RT` Trigger |
| **Pause / Resume** | `P` or `Esc` | Tap `⏸` Icon | `Start` Button |
| **Toggle 16:9 / 9:16 Vertical** | `V` Key | Tap `16:9 / 9:16` button | — |
| **Record Cinematic Clip** | `R` Key | Tap `● REC` button | — |
| **Toggle HUD (Clean Video)** | `H` Key | — | — |
| **Cycle Paint Finish (Menu)** | `Q` / `E` or `←` / `→` | Tap `◀` / `▶` Paint buttons | D-Pad Left / Right |
| **Audio Mute** | `M` Key | Tap `♪` button | — |

---

## 🎬 Built-in 4K Vertical Clip Recording

Neon Skyway includes an internal deterministic rendering pipeline specifically engineered for content creators:

1. Press **`V`** to frame the canvas in vertical **9:16 format**.
2. Press **`R`** to start recording—a glowing red **`REC`** HUD indicator will track your clip time.
3. Fly your best run, chain near-miss combos, or capture an intense crash.
4. Press **`R`** again to finalize.
5. Select **4K · 60 FPS (2160 × 3840)** or **1080P · 60 FPS**.
6. The offscreen worker renders every recorded frame deterministically and downloads the `.mp4` directly to your local machine!

> **Clean Footage Tip**: Press **`H`** during gameplay or before export to hide all HUD overlays for cinematic reel footage.

---

## 🚀 Quickstart & Local Setup

### Option 1: Python No-Cache Server (Recommended)

Python 3 is all you need—no Node.js or build tools required:

```bash
# 1. Clone the repository
git clone https://github.com/yogender-ai/flying-car.git
cd flying-car

# 2. Launch the dev server
python serve.py
```

Open your browser to:
```
http://localhost:5173
```

*`serve.py` automatically injects `no-cache` headers so that any code modification refreshes instantly without browser caching.*

### Option 2: Any Static HTTP Server

```bash
# Using Node's serve
npx serve src -l 5173

# Or Python built-in server
python -m http.server 5173 --directory src
```

---

## 🏗️ Architecture & Codebase Map

```
flying-car/
├── index.html           # Root entrypoint & GitHub Pages launcher redirect
├── serve.py             # Zero-cache Python HTTP server
├── README.md            # Comprehensive project documentation
└── src/
    ├── index.html       # Game viewport, HUD layout, and modal overlays
    ├── style.css        # Cyberpunk visual styles, scanlines, and HUD styling
    ├── main.js          # Core loop, game state manager, event listeners, HUD
    ├── car.js           # 3D hovercar model, materials, physics & banking
    ├── city.js          # Procedural building generator, lighting & rain systems
    ├── obstacles.js     # Drone cruisers, traffic spawners & security gates
    ├── crashfx.js       # Cinematic crash explosion, shockwaves & debris physics
    ├── effects.js       # Speed lines, post-processing vignette & chromatic flare
    ├── audio.js         # Web Audio API procedural synthesizer engine
    ├── exporter.js      # Offscreen frame-by-frame 4K 60FPS MP4 video encoder
    └── textures.js      # Procedural canvas textures & building window maps
```

---

## 🔧 Developer URL Parameters & Automated Testing

You can pass query parameters to automate runs, record benchmarks, or test headless:

- `?autostart`: Launches a flight run immediately upon page load without waiting for menu input.
- `?portrait`: Initializes the viewport directly in 9:16 vertical mode.
- `?autostart&sim=20`: Fast-forwards the simulation by 20 seconds for automated integration testing.
- Console Hook: `window.__skyway.sim(seconds)` steps the physics engine without WebGL rendering.

---

## 🛠️ Technology Stack

- **Rendering Engine**: [Three.js r169](https://threejs.org/) (WebGL / PBR Shaders)
- **Audio Synthesis**: Native Browser Web Audio API (Subtractive & FM Synthesis)
- **Video Encoding**: Client-side WebCodecs / MediaRecorder H.264
- **Typography**: [Orbitron](https://fonts.google.com/specimen/Orbitron) & [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono)
- **Zero Build**: Native ES Modules with browser import maps

---

## 👤 Author & Credits

Developed by **[Yogender (yogender-ai)](https://github.com/yogender-ai)**  
Showcasing cutting-edge creative web development, real-time 3D simulation, and browser gaming.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

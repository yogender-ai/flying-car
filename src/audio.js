// All sound is synthesized with Web Audio: no audio files needed.
// Layers: engine + jet roar + wind + rain ambience (continuous), synthwave music, and one-shot effects.
const MASTER_VOL = 1.0;
const OUT_GAIN = 1.5;      // makeup gain after the compressor: louder in game and in clips

export function createAudio() {
  let ctx = null, master, comp, out, noiseBuf, musicGain, sfxBus;
  let silent = false;
  const cap = { on: false, paused: false, left: [], right: [], node: null };
  let engine, wind, roar, rain, siren, scrape, fire;
  let muted = localStorage.getItem('skyway-muted') === '1';
  let musicTimer = null, step = 0, nextNote = 0;

  function loopNoise(filterType, freq, q = 0.7) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    return { f, g };
  }

  function init() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 3;
    comp.attack.value = 0.003; comp.release.value = 0.18;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(comp);
    out = ctx.createGain();
    out.gain.value = OUT_GAIN;
    comp.connect(out);
    out.connect(ctx.destination);

    // clip capture: copies the final mix as raw PCM while recording (lossless, no MediaRecorder)
    cap.node = ctx.createScriptProcessor(4096, 2, 2);
    cap.node.onaudioprocess = (e) => {
      if (!cap.on || cap.paused) return;
      const l = e.inputBuffer.getChannelData(0), r = e.inputBuffer.getChannelData(1);
      const L = new Float32Array(l.length), R = new Float32Array(r.length);
      for (let i = 0; i < l.length; i++) { L[i] = Math.max(-1, Math.min(1, l[i])); R[i] = Math.max(-1, Math.min(1, r[i])); }
      cap.left.push(L); cap.right.push(R);
    };
    const sink = ctx.createGain(); sink.gain.value = 0;
    out.connect(cap.node); cap.node.connect(sink); sink.connect(ctx.destination);
    // effects get their own boost so they cut through the engine / wind / rain beds
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.8;
    sfxBus.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // engine: detuned saw + square sub through a wobbling lowpass
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 12;
    const sub = ctx.createOscillator(); sub.type = 'square';
    const subGain = ctx.createGain(); subGain.gain.value = 0.35;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 120;
    lfo.connect(lfoAmt); lfoAmt.connect(f.frequency);
    o1.connect(f); o2.connect(f); sub.connect(subGain); subGain.connect(f);
    f.connect(g); g.connect(master);
    for (const o of [o1, o2, sub, lfo]) o.start();
    engine = { o1, o2, sub, f, g, lfo };

    wind = loopNoise('bandpass', 500, 0.8);
    roar = loopNoise('lowpass', 700, 1.2);
    rain = loopNoise('highpass', 2500, 0.5);
    rain.g.gain.value = 0.02;
    scrape = loopNoise('bandpass', 2600, 2.5);   // metal grinding on asphalt
    fire = loopNoise('lowpass', 1400, 0.6);      // burning wreck

    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  }

  function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, dest = sfxBus, pan = 0, attack = 0.008 } = {}) {
    if (!ctx || silent) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, { vol = 0.4, from = 2000, to = 200, type = 'lowpass', q = 0.8, delay = 0, pan = 0 } = {}) {
    if (!ctx || silent) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(f); f.connect(g); out.connect(sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // A minor synthwave at 104 bpm: kick, bass, snare-ish noise, arpeggio.
  const BASS = [45, 45, 45, 45, 41, 41, 43, 43];
  const ARP = [69, 72, 76, 72, 69, 72, 77, 72, 65, 69, 72, 69, 67, 71, 74, 71];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function scheduleMusic() {
    const spb = 60 / 104 / 4;
    while (nextNote < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 16) % 8;
      const delay = Math.max(0, nextNote - ctx.currentTime);
      const s = step % 16;
      if (s % 4 === 0) tone(60, 0.18, { type: 'sine', vol: 0.5, slide: -35, delay, dest: musicGain });
      if (s === 4 || s === 12) noiseMusic(delay);
      if (s % 2 === 0) tone(midi(BASS[bar]), spb * 1.8, { type: 'sawtooth', vol: 0.16, delay, dest: musicGain });
      const a = ARP[s] + (bar >= 4 ? -2 : 0);
      if (s % 2 === 1 || Math.random() < 0.35) tone(midi(a), spb * 0.9, { type: 'square', vol: 0.05, delay, dest: musicGain });
      if (s === 0 && bar % 2 === 0) tone(midi(ARP[0] - 12), spb * 14, { type: 'triangle', vol: 0.06, delay, dest: musicGain, attack: 0.4 });
      nextNote += spb;
      step++;
    }
  }
  function noiseMusic(delay) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t, Math.random()); src.stop(t + 0.2);
  }

  const api = {
    init,
    get ready() { return !!ctx && ctx.state === 'running'; },
    // silent: used while exporting a clip, so the replay does not play sounds a second time
    set silent(v) {
      silent = v;
      if (ctx) master.gain.setTargetAtTime(v || muted ? 0 : MASTER_VOL, ctx.currentTime, 0.03);
    },
    startCapture() { if (!ctx) init(); cap.left = []; cap.right = []; cap.on = true; cap.paused = false; },
    pauseCapture(p) { cap.paused = p; },
    stopCapture() {
      cap.on = false;
      const n = cap.left.reduce((a, b) => a + b.length, 0);
      const left = new Float32Array(n), right = new Float32Array(n);
      let o = 0;
      cap.left.forEach((b, i) => { left.set(b, o); right.set(cap.right[i], o); o += b.length; });
      cap.left = []; cap.right = [];
      return { left, right, sampleRate: ctx ? ctx.sampleRate : 48000 };
    },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('skyway-muted', muted ? '1' : '0');
      if (master && !silent) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.05);
      return muted;
    },
    startMusic() {
      if (!ctx || musicTimer) return;
      nextNote = ctx.currentTime + 0.05;
      musicGain.gain.setTargetAtTime(1.1, ctx.currentTime, 0.4);
      musicTimer = setInterval(scheduleMusic, 50);
    },
    stopMusic() {
      if (!ctx || !musicTimer) return;
      clearInterval(musicTimer);
      musicTimer = null;
      musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    },
    // continuous layers, called every frame
    update({ speed, boost, boosting, on, steer }) {
      if (!ctx || silent) return;
      const t = ctx.currentTime, k = 0.08;
      const v = on ? 1 : 0;
      engine.o1.frequency.setTargetAtTime(48 + speed * 0.75 + boost * 40, t, k);
      engine.o2.frequency.setTargetAtTime(48 + speed * 0.75 + boost * 40, t, k);
      engine.sub.frequency.setTargetAtTime(24 + speed * 0.37, t, k);
      engine.f.frequency.setTargetAtTime(380 + speed * 10 + boost * 1400, t, k);
      engine.lfo.frequency.setTargetAtTime(6 + speed * 0.05, t, k);
      engine.g.gain.setTargetAtTime(v * (0.075 + boost * 0.05), t, 0.15);
      wind.f.frequency.setTargetAtTime(300 + speed * 9 + Math.abs(steer) * 300, t, k);
      wind.g.gain.setTargetAtTime(v * Math.min(0.08, speed * 0.0006), t, 0.2);
      roar.g.gain.setTargetAtTime(boosting ? 0.13 : 0, t, boosting ? 0.06 : 0.25);
      roar.f.frequency.setTargetAtTime(500 + boost * 1200, t, k);
    },
    // police siren while a patrol drone is near; pan follows its x
    siren(level, pan) {
      if (!ctx || silent) return;
      if (!siren) {
        const o = ctx.createOscillator(); o.type = 'square';
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
        const g = ctx.createGain(); g.gain.value = 0;
        const p = ctx.createStereoPanner();
        o.connect(f); f.connect(g); g.connect(p); p.connect(master); o.start();
        siren = { o, g, p };
      }
      const t = ctx.currentTime;
      siren.o.frequency.setTargetAtTime(Math.floor(t * 2.5) % 2 ? 960 : 720, t, 0.02);
      siren.g.gain.setTargetAtTime(level * 0.09, t, 0.1);
      siren.p.pan.setTargetAtTime(pan, t, 0.1);
    },

    // one-shots
    pickup(kind, chain = 0) {
      if (kind === 'boost') { tone(330, 0.35, { type: 'sawtooth', vol: 0.25, slide: 990 }); noise(0.4, { vol: 0.2, from: 500, to: 5000, type: 'bandpass' }); return; }
      if (kind === 'shield') { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.28, delay: i * 0.07 })); return; }
      const scale = [0, 2, 4, 7, 9, 12, 14, 16];
      const f = 660 * Math.pow(2, scale[chain % scale.length] / 12);
      tone(f, 0.14, { type: 'triangle', vol: 0.3, slide: f * 0.5 });
      tone(f * 2, 0.08, { type: 'sine', vol: 0.12, delay: 0.03 });
    },
    whoosh(pan = 0, close = 0.5) { noise(0.55, { vol: 0.25 + close * 0.35, from: 3500, to: 300, type: 'bandpass', q: 1.5, pan }); },
    near(pan = 0) {
      noise(0.5, { vol: 0.55, from: 4000, to: 250, type: 'bandpass', q: 1.2, pan });
      tone(880, 0.08, { type: 'square', vol: 0.12, delay: 0.05 }); tone(1320, 0.12, { type: 'square', vol: 0.12, delay: 0.12 });
    },
    comboUp(level) { tone(440 * Math.pow(2, level / 6), 0.18, { type: 'sawtooth', vol: 0.16, slide: 220 }); },
    gate() { [784, 988, 1175].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.3, delay: i * 0.06 })); noise(0.5, { vol: 0.25, from: 6000, to: 800, type: 'highpass' }); },
    gateAlarm() { tone(1250, 0.09, { type: 'square', vol: 0.14 }); tone(1250, 0.09, { type: 'square', vol: 0.14, delay: 0.16 }); },
    hit() {
      noise(0.7, { vol: 0.8, from: 4000, to: 80 });
      noise(0.25, { vol: 0.35, from: 9000, to: 3000, type: 'highpass' }); // glassy crunch
      tone(110, 0.45, { type: 'square', vol: 0.35, slide: -70 });
    },
    crash() {
      // impact: deep boom + blast + shattering glass + crunching metal
      tone(62, 1.6, { type: 'sine', vol: 0.9, slide: -40 });
      noise(1.9, { vol: 1.0, from: 3000, to: 35 });
      noise(0.6, { vol: 0.5, from: 9000, to: 2500, type: 'highpass', delay: 0.03 });
      for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 2500, 0.08, { type: 'triangle', vol: 0.08, delay: 0.05 + Math.random() * 0.4 });
      noise(0.9, { vol: 0.45, from: 1200, to: 300, type: 'bandpass', q: 3, delay: 0.12 });
      // slow-motion whoosh dropping in pitch
      tone(420, 0.8, { type: 'sawtooth', vol: 0.12, slide: -380, delay: 0.08 });
      noise(0.9, { vol: 0.3, from: 2000, to: 120, type: 'bandpass', q: 1.2, delay: 0.1 });
      // game-over sting once the dust settles
      [330, 247, 165].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.14, delay: 1.9 + i * 0.22 }));
    },
    thud(strength = 0.6) {
      tone(55 + Math.random() * 20, 0.5, { type: 'sine', vol: 0.4 + strength * 0.5, slide: -30 });
      noise(0.35, { vol: 0.3 + strength * 0.4, from: 1500, to: 100 });
      tone(320 + Math.random() * 200, 0.25, { type: 'square', vol: 0.06 + strength * 0.08, slide: -120 }); // metal clank
    },
    pop() {
      tone(80, 0.9, { type: 'sine', vol: 0.7, slide: -50 });
      noise(1.2, { vol: 0.75, from: 2500, to: 60 });
      noise(0.3, { vol: 0.3, from: 7000, to: 2000, type: 'highpass' });
    },
    // continuous wreck layers: 0..1 each
    wreckSounds(scrapeLevel, fireLevel) {
      if (!ctx || silent) return;
      const t = ctx.currentTime;
      scrape.g.gain.setTargetAtTime(scrapeLevel * (0.18 + Math.random() * 0.1), t, 0.03);
      scrape.f.frequency.setTargetAtTime(1800 + scrapeLevel * 1600 + Math.random() * 400, t, 0.02);
      fire.g.gain.setTargetAtTime(fireLevel * (0.06 + Math.random() * 0.05), t, 0.05);
      if (fireLevel > 0 && Math.random() < 0.08) noise(0.04 + Math.random() * 0.05, { vol: 0.12 + Math.random() * 0.2, from: 5000, to: 1500, type: 'highpass' }); // crackle
    },
    shieldLow() { tone(600, 0.12, { type: 'square', vol: 0.16 }); tone(450, 0.2, { type: 'square', vol: 0.16, delay: 0.15 }); },
    boostStart() { noise(0.6, { vol: 0.45, from: 300, to: 4000, type: 'bandpass', q: 1 }); tone(180, 0.4, { type: 'sawtooth', vol: 0.15, slide: 300 }); },
    boostEmpty() { tone(300, 0.25, { type: 'sawtooth', vol: 0.15, slide: -150 }); },
    speedUp() { tone(988, 0.1, { type: 'triangle', vol: 0.2 }); tone(1480, 0.18, { type: 'triangle', vol: 0.2, delay: 0.09 }); },
    countdown(go) { go ? tone(1046, 0.5, { type: 'square', vol: 0.22, slide: 200 }) : tone(523, 0.18, { type: 'square', vol: 0.2 }); },
    drone(pan = 0) { tone(180, 0.35, { type: 'sawtooth', vol: 0.1, slide: -60, pan }); },
    click() { tone(1400, 0.05, { type: 'square', vol: 0.1 }); },
    hover() { tone(2200, 0.03, { type: 'sine', vol: 0.05 }); },
    thunder() { noise(2.6, { vol: 0.75, from: 700, to: 30 }); noise(0.25, { vol: 0.5, from: 3000, to: 500, delay: 0.02 }); },
    record() { tone(880, 0.1, { type: 'sine', vol: 0.15 }); },
  };
  return api;
}

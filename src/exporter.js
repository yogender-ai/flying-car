// Offline clip export: renders a replay frame by frame (never in real time, so it never lags),
// encodes H.264 video + AAC audio with WebCodecs, and writes a standard, seekable MP4.
import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// yields to the browser without setTimeout (which background tabs throttle to 1 s)
const channel = new MessageChannel();
const yieldNow = () => new Promise((r) => { channel.port1.onmessage = () => r(); channel.port2.postMessage(0); });
const nextDequeue = (enc) => new Promise((r) => {
  if ('ondequeue' in enc) enc.addEventListener('dequeue', () => r(), { once: true });
  else setTimeout(r, 2);
});

export const exportSupported = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

async function pickVideoConfig(width, height, fps, bitrate) {
  // High profile, level 5.2 handles 4K60; fall back through lower levels / profiles
  for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.4d0034', 'avc1.640028']) {
    for (const [hardwareAcceleration, bitrateMode] of [['prefer-hardware', 'constant'], ['prefer-hardware', 'variable'], ['prefer-software', 'variable']]) {
      // constant bitrate keeps the rain and neon detail sharp instead of letting the encoder undershoot
      const config = { codec, width, height, bitrate, bitrateMode, framerate: fps, hardwareAcceleration, avc: { format: 'avc' }, latencyMode: 'quality' };
      try {
        const res = await VideoEncoder.isConfigSupported(config);
        if (res.supported) return res.config;
      } catch { /* try next */ }
    }
  }
  return null;
}

async function pickAudioConfig(sampleRate) {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const [codec, muxCodec] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const config = { codec, sampleRate, numberOfChannels: 2, bitrate: 256000 };
    try {
      const res = await AudioEncoder.isConfigSupported(config);
      if (res.supported) return { config: res.config, muxCodec };
    } catch { /* try next */ }
  }
  return null;
}

/**
 * @param width,height  output size in pixels (e.g. 2160 x 3840 for vertical 4K)
 * @param frameCount    number of video frames to render
 * @param drawFrame     async (i, ctx) => draws frame i onto the 2D context (width x height)
 * @param audio         { left: Float32Array, right: Float32Array, sampleRate } or null
 */
export async function exportMp4({ width, height, fps = 60, bitrate, frameCount, drawFrame, audio, onProgress, isCancelled }) {
  const vConfig = await pickVideoConfig(width, height, fps, bitrate);
  if (!vConfig) throw new Error(`This browser cannot encode ${width}x${height} H.264 video.`);
  const aInfo = audio && audio.left.length ? await pickAudioConfig(audio.sampleRate) : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: aInfo ? { codec: aInfo.muxCodec, numberOfChannels: 2, sampleRate: audio.sampleRate } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  venc.configure(vConfig);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  const frameUs = 1e6 / fps;

  for (let i = 0; i < frameCount; i++) {
    if (failure) throw failure;
    if (isCancelled?.()) { venc.close(); return null; }
    await drawFrame(i, ctx, width, height);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
    venc.encode(frame, { keyFrame: i % fps === 0 });
    frame.close();
    while (venc.encodeQueueSize > 4) await nextDequeue(venc);
    onProgress?.((i + 1) / frameCount, 'video');
    // MessageChannel yields are not throttled when the window is in the background, so the export keeps going
    if (i % 4 === 0) await yieldNow();
    if (i % 30 === 0 && !document.hidden) await sleep(0); // occasionally let the progress bar repaint
  }
  await venc.flush();
  venc.close();

  if (aInfo) {
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    aenc.configure(aInfo.config);
    const total = Math.min(audio.left.length, Math.round((frameCount / fps) * audio.sampleRate));
    const block = 2048;
    for (let off = 0; off < total; off += block) {
      const n = Math.min(block, total - off);
      const data = new Float32Array(n * 2);
      data.set(audio.left.subarray(off, off + n), 0);
      data.set(audio.right.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: audio.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / audio.sampleRate) * 1e6), data });
      aenc.encode(ad);
      ad.close();
      if (aenc.encodeQueueSize > 32) await nextDequeue(aenc);
    }
    await aenc.flush();
    aenc.close();
    if (failure) throw failure;
  }

  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
}

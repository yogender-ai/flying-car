"""Build the 20-second "What is Agentic AI?" vertical video.

Inputs:  images/scene1..5.(png|jpg|jpeg|webp)  (placeholders are used when missing)
         audio/voice1..5.mp3 + .json           (from make_voice.py)
Outputs: stickers/*.png        transparent stickers (reusable in Canva / CapCut)
         audio/music_mix.wav   final audio mix
         agentic_ai_20s.mp4    the video
"""
import json
import math
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).parent
IMAGES, AUDIO, STICKERS = ROOT / "images", ROOT / "audio", ROOT / "stickers"
OUT = ROOT / "agentic_ai_20s.mp4"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS, SR = 1080, 1920, 30, 44100
CTA_TEXT = "FOLLOW FOR MORE AI"   # change to your handle, e.g. "FOLLOW @FRUGALTESTING"

NAVY, BLUE, ORANGE = (11, 23, 54), (47, 128, 255), (255, 138, 31)
GREEN, GREY, RED, WHITE = (34, 197, 94), (120, 130, 150), (239, 68, 68), (255, 255, 255)
FONT_BLACK = "C:/Windows/Fonts/seguibl.ttf"
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SYMBOL = "C:/Windows/Fonts/seguisym.ttf"

VOICE_DELAY = 0.12   # seconds of silence before each scene's line
SCENE_TAIL = 0.25    # pause after each line before the cut
LAST_TAIL = 0.65     # hold on the final scene


def font(path, size):
    return ImageFont.truetype(path, size)


# ---------------------------------------------------------------- timing

def load_words():
    return [json.loads((AUDIO / f"voice{i}.json").read_text()) for i in range(1, 6)]


WORDS = load_words()
DURS = [w[-1]["end"] + VOICE_DELAY + SCENE_TAIL for w in WORDS]
DURS[-1] += LAST_TAIL - SCENE_TAIL
STARTS = list(np.cumsum([0] + DURS[:-1]))
TOTAL = sum(DURS)


def word_t(scene, word):
    """Scene-relative time at which `word` is spoken (first match)."""
    for w in WORDS[scene]:
        if w["word"].lower().strip(".,:'’") == word.lower():
            return w["start"] + VOICE_DELAY
    raise KeyError(f"{word!r} not in scene {scene + 1}")


# ---------------------------------------------------------------- stickers

def draw_check(d, cx, cy, r):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
    d.line([(cx - r * .45, cy + r * .02), (cx - r * .1, cy + r * .38), (cx + r * .5, cy - r * .35)],
           fill=WHITE, width=max(4, int(r * .22)), joint="curve")


def draw_target(d, cx, cy, r):
    for k, c in enumerate([RED, WHITE, RED, WHITE, RED]):
        rr = r * (1 - k * .2)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=c)


def draw_num(d, cx, cy, r, n):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    f = font(FONT_BLACK, int(r * 1.2))
    d.text((cx, cy), str(n), font=f, fill=NAVY, anchor="mm")


def pill(text, bg, fg=WHITE, size=58, icon=None, strike=False, path=FONT_BLACK):
    """Rounded badge with optional icon and drop shadow, returned as RGBA."""
    f = font(path, size)
    tw = f.getbbox(text)[2] - f.getbbox(text)[0]
    th = size
    pad_x, pad_y = int(size * .55), int(size * .38)
    icon_w = int(size * 1.25) if icon else 0
    bw, bh = tw + pad_x * 2 + icon_w, th + pad_y * 2
    m = 24  # margin for shadow
    img = Image.new("RGBA", (bw + m * 2, bh + m * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([m, m + 8, m + bw, m + bh + 8], bh // 2, fill=(0, 0, 0, 120))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([m, m, m + bw, m + bh], bh // 2, fill=bg, outline=WHITE, width=4)
    if icon:
        cx, cy, r = m + pad_x + size * .45, m + bh / 2, size * .5
        kind, _, arg = icon.partition(":")
        {"check": lambda: draw_check(d, cx, cy, r),
         "target": lambda: draw_target(d, cx, cy, r),
         "num": lambda: draw_num(d, cx, cy, r, arg)}[kind]()
    tx = m + pad_x + icon_w
    d.text((tx, m + bh / 2), text, font=f, fill=fg, anchor="lm")
    if strike:
        y = m + bh / 2
        d.line([(tx - 6, y), (tx + tw + 6, y)], fill=RED, width=max(6, size // 7))
    return img


def make_stickers():
    STICKERS.mkdir(exist_ok=True)
    s = {
        "title":     pill("WHAT IS AGENTIC AI?", NAVY, size=66),
        "answers":   pill("NORMAL AI → ANSWERS", GREY, size=50, path=FONT_BOLD),
        "does":      pill("AGENTIC AI → DOES THE WORK", ORANGE, size=54),
        "goal":      pill("ONE GOAL", NAVY, size=64, icon="target"),
        "quote":     pill("“Plan my client meeting”", WHITE, NAVY, size=52, path=FONT_BOLD),
        "plan":      pill("PLANS THE STEPS", BLUE, size=56, icon="num:1"),
        "tools":     pill("USES REAL TOOLS", ORANGE, size=56, icon="num:2"),
        "apps":      pill("EMAIL · CALENDAR · WEB", WHITE, NAVY, size=46, path=FONT_BOLD),
        "checks":    pill("CHECKS ITS WORK", NAVY, size=58, icon="check"),
        "fixes":     pill("FIXES MISTAKES", NAVY, size=58, icon="check"),
        "notchat":   pill("NOT A CHATBOT", GREY, size=56, strike=True),
        "teammate":  pill("A DIGITAL TEAMMATE", ORANGE, size=64),
        "cta":       pill(CTA_TEXT + "  →", WHITE, NAVY, size=50),
    }
    for name, img in s.items():
        img.save(STICKERS / f"{name}.png")
    return s


# (scene index, sticker, appear time, centre y)
def sticker_schedule():
    return [
        (0, "title",    0.05,                    250),
        (0, "answers",  word_t(0, "answers"),    390),
        (0, "does",     word_t(0, "does"),       510),
        (1, "goal",     word_t(1, "goal") - .1,  280),
        (1, "quote",    word_t(1, "plan"),       410),
        (2, "plan",     word_t(2, "plans"),      175),
        (2, "tools",    word_t(2, "uses"),       290),
        (2, "apps",     word_t(2, "email"),      1640),
        (3, "checks",   word_t(3, "checks"),     280),
        (3, "fixes",    word_t(3, "fixes"),      405),
        (4, "notchat",  word_t(4, "not"),        270),
        (4, "teammate", word_t(4, "digital"),    400),
        (4, "cta",      word_t(4, "teammate") + .35, 1760),
    ]


# ---------------------------------------------------------------- backgrounds

def placeholder(i):
    img = Image.new("RGB", (W, H))
    top, bot = np.array((20, 40, 90)), np.array(NAVY)
    grad = np.linspace(0, 1, H)[:, None, None]
    img = Image.fromarray(((top * (1 - grad) + bot * grad) * np.ones((1, W, 1))).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for k in range(6):
        r = 120 + k * 110
        d.ellipse([W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r], outline=(40, 70, 140), width=3)
    d.text((W / 2, H / 2 - 40), f"SCENE {i}", font=font(FONT_BLACK, 110), fill=(90, 130, 220), anchor="mm")
    d.text((W / 2, H / 2 + 70), f"add images/scene{i}.png", font=font(FONT_BOLD, 48), fill=(130, 160, 230), anchor="mm")
    return img


def load_bg(i):
    for ext in ("png", "jpg", "jpeg", "webp"):
        p = IMAGES / f"scene{i}.{ext}"
        if p.exists():
            img = Image.open(p).convert("RGB")
            break
    else:
        img = placeholder(i)
    # cover-fit at 120% so Ken Burns zoom/pan never shows edges
    s = max(W / img.width, H / img.height) * 1.2
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)


def shade_overlay():
    """Dark gradients at top and bottom so stickers and captions stay readable."""
    a = np.zeros(H)
    y = np.arange(H)
    a += np.clip(1 - y / 700, 0, 1) ** 1.6 * 175
    a += np.clip((y - 1150) / 770, 0, 1) ** 1.4 * 200
    ov = np.zeros((H, W, 4), np.uint8)
    ov[..., :3] = (5, 10, 25)
    ov[..., 3] = np.clip(a, 0, 255)[:, None]
    return Image.fromarray(ov, "RGBA")


def ease_out_back(x):
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def ease_out(x):
    return 1 - (1 - x) ** 3


def frame_bg(src, t, dur, i):
    """Ken Burns: zoom punch at the cut, then slow push-in with gentle pan."""
    p = t / dur
    punch = 0.10 * (1 - ease_out(min(t / 0.35, 1)))
    zoom = 1.04 + 0.07 * p + punch  # src is 1.2x cover-fit, so zoom 1.0 shows all of it
    cw, ch = 1.2 * W / zoom, 1.2 * H / zoom
    pan = (-1) ** i * 0.6 * (p - .5) * (src.width - cw)
    cx = min(max(src.width / 2 + pan, cw / 2), src.width - cw / 2)
    cy = src.height / 2
    box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
    return src.resize((W, H), Image.BILINEAR, box=box)


# ---------------------------------------------------------------- captions

CAP_FONT = font(FONT_BLACK, 84)
CAP_Y = 1470


def chunks(words, size=3, gap=0.12):
    """Group words into caption lines of up to `size`, breaking at pauses in the voice."""
    out, cur = [], []
    for k, w in enumerate(words):
        cur.append(w)
        nxt = words[k + 1] if k + 1 < len(words) else None
        if len(cur) == size or (nxt and nxt["start"] - w["end"] > gap):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


# words per caption line for each scene; falls back to automatic split if the script changes
CAPTION_LINES = [[4, 2, 3], [4, 1, 4], [4, 4, 4], [3, 3, 3, 2], [3, 3, 3]]


def split_lines(words, sizes):
    if sum(sizes) != len(words):
        return chunks(words)
    out, k = [], 0
    for s in sizes:
        out.append(words[k:k + s])
        k += s
    return out


CHUNKS = [split_lines(w, s) for w, s in zip(WORDS, CAPTION_LINES)]


def draw_caption(img, scene, t):
    words = WORDS[scene]
    ts = t - VOICE_DELAY
    if ts < words[0]["start"] - 0.05:
        return
    active = None
    for ch in CHUNKS[scene]:
        if ts >= ch[0]["start"] - 0.05:
            active = ch
    tokens = [w["word"].upper() for w in active]
    f = CAP_FONT
    space = f.getlength(" ")
    widths = [f.getlength(tok) for tok in tokens]
    total = sum(widths) + space * (len(tokens) - 1)
    scale = min(1, 980 / total)
    if scale < 1:
        f = font(FONT_BLACK, int(84 * scale))
        space = f.getlength(" ")
        widths = [f.getlength(tok) for tok in tokens]
        total = sum(widths) + space * (len(tokens) - 1)
    d = ImageDraw.Draw(img)
    x = (W - total) / 2
    latest = max((w for w in active if ts >= w["start"] - 0.03), key=lambda w: w["start"], default=None)
    for w, tok, wd in zip(active, tokens, widths):
        spoken = ts >= w["start"] - 0.03
        current = w is latest
        col = ORANGE if current else (WHITE if spoken else (200, 205, 215))
        y = CAP_Y - (10 if current else 0)
        d.text((x, y), tok, font=f, fill=col, anchor="ls", stroke_width=8, stroke_fill=(0, 0, 0))
        x += wd + space


# ---------------------------------------------------------------- render video

def render_video(path):
    stickers = make_stickers()
    sched = sticker_schedule()
    bgs = [load_bg(i) for i in range(1, 6)]
    shade = shade_overlay()
    n_frames = int(round(TOTAL * FPS))
    writer = imageio_ffmpeg.write_frames(
        str(path), (W, H), fps=FPS, codec="libx264", pix_fmt_in="rgb24",
        output_params=["-crf", "18", "-preset", "medium"], macro_block_size=8)
    writer.send(None)
    for fi in range(n_frames):
        gt = fi / FPS
        scene = max(k for k in range(5) if STARTS[k] <= gt + 1e-9)
        t = gt - STARTS[scene]
        img = frame_bg(bgs[scene], t, DURS[scene], scene).convert("RGBA")
        img = Image.alpha_composite(img, shade)
        if scene > 0 and t < 0.18:  # white flash on the cut
            flash = Image.new("RGBA", (W, H), (255, 255, 255, int(110 * (1 - t / 0.18))))
            img = Image.alpha_composite(img, flash)
        for sc, name, at, cy in sched:
            if sc != scene or t < at:
                continue
            k = min((t - at) / 0.28, 1)
            sc_ = max(ease_out_back(k), 0.01)
            st = stickers[name]
            if sc_ != 1:
                st = st.resize((max(1, int(st.width * sc_)), max(1, int(st.height * sc_))), Image.BILINEAR)
            if k < 1:
                a = st.getchannel("A").point(lambda v: int(v * min(k * 2.5, 1)))
                st.putalpha(a)
            # gentle float after it lands
            bob = 4 * math.sin((t - at) * 3) if k == 1 else 0
            img.alpha_composite(st, (int(W / 2 - st.width / 2), int(cy - st.height / 2 + bob)))
        draw_caption(img, scene, t)
        d = ImageDraw.Draw(img)  # progress bar
        d.rectangle([0, 0, W * gt / TOTAL, 10], fill=ORANGE)
        writer.send(img.convert("RGB").tobytes())
    writer.close()
    return sched


# ---------------------------------------------------------------- audio

def decode(mp3):
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", str(mp3), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def note(freq, dur, amp, attack=0.4, release=0.8):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / release).clip(0)
    return amp * env * (np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t))


def pluck(freq, amp=0.05, dur=0.5):
    t = np.arange(int(dur * SR)) / SR
    return amp * np.exp(-t * 7) * np.sin(2 * np.pi * freq * t) * (1 + 0.4 * np.sin(2 * np.pi * freq * 2 * t))


def add(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:j] += sig[: j - i]


def build_audio(sched, path):
    n = int((TOTAL + 0.3) * SR)
    music, sfx, voice = np.zeros(n), np.zeros(n), np.zeros(n)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    chords = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]  # Am F C G
    bar = 2.4
    for b in range(int(TOTAL / bar) + 1):
        ch = chords[b % 4]
        for m in ch:
            add(music, note(hz(m - 12), bar + 0.6, 0.035), b * bar)
        for k in range(8):  # light arpeggio
            add(music, pluck(hz(ch[k % 3] + 12 * (k // 3 % 2))), b * bar + k * bar / 8)
    rng = np.random.default_rng(1)
    for s in STARTS[1:]:  # whoosh on each cut
        d = 0.45
        t = np.arange(int(d * SR)) / SR
        w = rng.standard_normal(len(t))
        w = np.convolve(w, np.ones(24) / 24, mode="same")
        env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
        add(sfx, 0.5 * w * env, s - 0.22)
    for sc, _, at, _ in sched:  # pop on each sticker
        t = np.arange(int(0.07 * SR)) / SR
        f = 700 + 900 * t / 0.07
        add(sfx, 0.18 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40), STARTS[sc] + at)
    for i in range(5):
        add(voice, decode(AUDIO / f"voice{i + 1}.mp3"), STARTS[i] + VOICE_DELAY)
    # duck music under the voice
    env = np.convolve(np.abs(voice) > 0.02, np.ones(SR // 5) / (SR // 5), mode="same")
    music *= 1 - 0.45 * np.clip(env * 3, 0, 1)
    fade = np.ones(n)
    fade[-int(0.6 * SR):] = np.linspace(1, 0, int(0.6 * SR))
    mix = (voice * 1.0 + music * 0.9 + sfx * 0.6) * fade
    mix /= max(1e-6, np.abs(mix).max() / 0.92)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((mix * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- main

if __name__ == "__main__":
    silent = ROOT / "_video_noaudio.mp4"
    mixwav = AUDIO / "music_mix.wav"
    print(f"total {TOTAL:.2f}s, scenes: " + ", ".join(f"{d:.2f}" for d in DURS))
    found = [any((IMAGES / f"scene{i}.{e}").exists() for e in ("png", "jpg", "jpeg", "webp")) for i in range(1, 6)]
    print("images found:", found)
    sched = render_video(silent)
    build_audio(sched, mixwav)
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", str(silent), "-i", str(mixwav),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(OUT)], check=True)
    silent.unlink()
    print("wrote", OUT)

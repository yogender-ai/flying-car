"""Generate the voiceover (one clip per scene) plus word timings for captions."""
import asyncio
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).parent
OUT = ROOT / "audio"
VOICE = "en-US-AndrewMultilingualNeural"
RATE = "+10%"

LINES = [
    "Normal AI answers questions. Agentic AI does the work.",
    "Give it one goal. Like: plan my client meeting.",
    "It plans the steps, and uses real tools: email, calendar, the web.",
    "Then it checks its own work, and fixes mistakes by itself.",
    "That's agentic AI. Not a chatbot. A digital teammate.",
]


async def make(i, text):
    comm = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
    words, audio = [], bytearray()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            # offsets are in 100-nanosecond units
            words.append({
                "word": chunk["text"],
                "start": chunk["offset"] / 1e7,
                "end": (chunk["offset"] + chunk["duration"]) / 1e7,
            })
    (OUT / f"voice{i}.mp3").write_bytes(bytes(audio))
    (OUT / f"voice{i}.json").write_text(json.dumps(words, indent=1))
    print(f"scene {i}: {len(words)} words, ends at {words[-1]['end']:.2f}s")


async def main():
    OUT.mkdir(exist_ok=True)
    for i, text in enumerate(LINES, 1):
        await make(i, text)


asyncio.run(main())

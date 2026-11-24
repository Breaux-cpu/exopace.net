"""RTL-SDR bridge. No radio and no token means no samples."""
import asyncio
import json
import os
import struct
import sys

TOKEN = os.environ.get("EXOPACE_BRIDGE_TOKEN", "")


def authorize(header):
    if not TOKEN or header != "Bearer " + TOKEN:
        return 401
    return 200


def fft_packet(bins):
    return bytes([0x01]) + struct.pack("<" + "f" * len(bins), *bins)


def audio_packet(pcm):
    return bytes([0x02]) + pcm


def status_packet(info):
    return bytes([0x03]) + json.dumps(info, separators=(",", ":")).encode("utf-8")


def parse_tune(data):
    if not data or data[0] != 0x10:
        return None
    body = json.loads(data[1:].decode("utf-8"))
    freq = int(body.get("freq_hz", 0))
    if freq < 1 or freq > 1_800_000_000:
        raise ValueError("freq")
    return body


def path_token(path):
    if not path or "token=" not in path:
        return ""
    return path.split("token=", 1)[1].split("&", 1)[0]


async def handle(ws, path=None):
    header = ""
    request = getattr(ws, "request", None)
    headers = getattr(request, "headers", None) or getattr(ws, "request_headers", {})
    if headers:
        header = headers.get("Authorization") or headers.get("authorization") or ""
    path = path or getattr(ws, "path", "") or ""
    if authorize(header) != 200 and authorize("Bearer " + path_token(path)) != 200:
        await ws.close(code=4401)
        return
    await ws.send(status_packet({
        "freq_hz": 162550000,
        "mode": "FM",
        "gain": None,
        "sample_rate": 0,
        "state": "STANDBY",
    }))
    async for message in ws:
        if isinstance(message, str):
            message = message.encode("utf-8")
        tune = parse_tune(message)
        if tune:
            await ws.send(status_packet({
                "freq_hz": int(tune["freq_hz"]),
                "mode": tune.get("mode", "FM"),
                "gain": tune.get("gain"),
                "sample_rate": int(tune.get("sample_rate", 0) or 0),
                "state": "STANDBY",
            }))


def self_test():
    frame = fft_packet([0.0, -12.5])
    audio = audio_packet(struct.pack("<h", 0))
    status = status_packet({"freq_hz": 162550000, "mode": "FM", "gain": None, "sample_rate": 2400000})
    print(json.dumps({
        "fft": frame.hex(),
        "audio": audio.hex(),
        "status": status.hex(),
        "unauthorized": authorize(""),
        "authorized": authorize("Bearer " + TOKEN) if TOKEN else 401,
    }))


def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    try:
        import websockets
    except ImportError:
        sys.stderr.write("websockets is not installed\n")
        sys.exit(1)
    host = os.environ.get("EXOPACE_BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("EXOPACE_BRIDGE_PORT", "8765"))
    asyncio.run(websockets.serve(handle, host, port))


if __name__ == "__main__":
    main()

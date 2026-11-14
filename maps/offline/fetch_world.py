#!/usr/bin/env python3
"""Download a world elevation pyramid onto this machine.

Stops before free space falls under 4 GiB. A planet at 1:50,000 does not fit.
Military sheets are saved later from the map, one page at a time.
"""

import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DEST = Path(__file__).resolve().parents[1] / "tiles" / "terrarium"
AWS = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
MIN_FREE = 4 * 1024 * 1024 * 1024
MAX_Z = 8


def free_bytes(path):
    path.mkdir(parents=True, exist_ok=True)
    st = os.statvfs(path)
    return st.f_bavail * st.f_frsize


def one(z, x, y):
    dest = DEST / str(z) / str(x) / f"{y}.png"
    if dest.is_file() and dest.stat().st_size > 80:
        return dest.stat().st_size
    req = urllib.request.Request(AWS.format(z=z, x=x, y=y), headers={"User-Agent": "exopace.net"})
    with urllib.request.urlopen(req, timeout=40) as res:
        data = res.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return len(data)


def main():
    free = free_bytes(DEST)
    print(f"free {free // (1024 * 1024)} MiB, keep {MIN_FREE // (1024 * 1024)} MiB")
    if free < MIN_FREE + 20 * 1024 * 1024:
        print("not enough free space for a world copy")
        return 0
    try:
        sample = one(6, 18, 24)
    except Exception:
        sample = 12000
    estimate = max(sample, 8000)
    reached = -1
    for z in range(0, MAX_Z + 1):
        n = 2**z
        missing = []
        for x in range(n):
            for y in range(n):
                dest = DEST / str(z) / str(x) / f"{y}.png"
                if not (dest.is_file() and dest.stat().st_size > 80):
                    missing.append((z, x, y))
        need = len(missing) * estimate
        if free_bytes(DEST) - need < MIN_FREE:
            print(f"stop before z{z}: {len(missing)} tiles would pass the free-space line")
            break
        print(f"z{z}: {len(missing)} tiles")
        done = 0
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(one, z, x, y) for z, x, y in missing]
            for fut in as_completed(futures):
                fut.result()
                done += 1
                if done % 200 == 0:
                    print(f"z{z} {done}/{len(missing)}")
        reached = z
    print(f"world elevation through zoom {reached}")
    print("Higher zooms are per sheet, from Save sheets on the local map.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

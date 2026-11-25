#!/usr/bin/env python3
"""Writes the synthetic LAS file behind test/fixtures/octree-*: 20 000 points of a cone
(radius 5 m, height 3 m) standing on flat ground, 14 x 14 m, at national-grid-sized
coordinates. Its volume is known (pi * 5^2 * 3 / 3 = 78.540 m3), so the server-side volume
can be checked end to end. Convert with PotreeConverter 2.1.2, once with the default
encoding and once with --encoding BROTLI.

    python3 scripts/make-test-cloud.py cone.las
"""
import math
import random
import struct
import sys

N = 20000
CX, CY, GROUND = 500000.0, 1200000.0, 200.0
SCALE = 0.001


def height(x, y):
    return max(0.0, 3.0 * (1.0 - math.hypot(x, y) / 5.0))


def main(out):
    rnd = random.Random(42)
    pts = []
    for _ in range(N):
        x, y = rnd.uniform(-7, 7), rnd.uniform(-7, 7)
        pts.append((CX + x, CY + y, GROUND + height(x, y)))
    xs, ys, zs = zip(*pts)
    off = (CX, CY, GROUND)
    header = struct.pack(
        '<4sHH16sBB32s32sHHHIIBHI5I3d3d6d',
        b'LASF', 0, 0, b'\0' * 16, 1, 2, b'opcviewer test'.ljust(32, b'\0'),
        b'make-test-cloud.py'.ljust(32, b'\0'), 1, 2026, 227, 227, 0, 0, 20, N,
        N, 0, 0, 0, 0, SCALE, SCALE, SCALE, *off,
        max(xs), min(xs), max(ys), min(ys), max(zs), min(zs))
    assert len(header) == 227
    with open(out, 'wb') as f:
        f.write(header)
        for x, y, z in pts:
            f.write(struct.pack('<iiiHBBbBH', round((x - off[0]) / SCALE), round((y - off[1]) / SCALE),
                                round((z - off[2]) / SCALE), 100, 0x09, 2, 0, 0, 1))


if __name__ == '__main__':
    main(sys.argv[1])

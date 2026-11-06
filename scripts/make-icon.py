"""Builds assets/icon.png (1024², opaque) from the Android launcher foreground on Aura's night colour.

iOS icons can't be transparent, and Expo would fill the gaps with white. Pure Python, no Pillow.
Run: python3 scripts/make-icon.py
"""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/img/icon-512-fg.png"
OUT = ROOT / "assets/icon.png"
SIZE = 1024
NIGHT = (0x0F, 0x0E, 0x0C)
# The Android adaptive-icon foreground keeps its art in the middle 66%; iOS shows the whole square.
ZOOM = 1.32


def read_png(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, width, height, depth, color = 8, b"", 0, 0, 0, 0
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            assert depth == 8 and color in (2, 6) and interlace == 0, (depth, color, interlace)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    channels = 4 if color == 6 else 3
    raw = zlib.decompress(idat)
    stride = width * channels
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(height):
        f = raw[i]
        line = bytearray(raw[i + 1 : i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - channels] if x >= channels else 0
            b = prev[x]
            c = prev[x - channels] if x >= channels else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    def pixel(x, y):
        row = rows[y]
        o = x * channels
        return (row[o], row[o + 1], row[o + 2], row[o + 3] if channels == 4 else 255)
    return width, height, pixel


def write_png(path, width, height, rgb_rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rgb_rows)
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    w, h, pixel = read_png(SOURCE)
    rows = []
    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            # Sample the source, zoomed about its centre, bilinearly.
            sx = ((x + 0.5) / SIZE - 0.5) / ZOOM * w + w / 2 - 0.5
            sy = ((y + 0.5) / SIZE - 0.5) / ZOOM * h + h / 2 - 0.5
            x0, y0 = int(sx // 1), int(sy // 1)
            fx, fy = sx - x0, sy - y0
            acc = [0.0, 0.0, 0.0, 0.0]
            for dx, dy, wgt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
                px, py = x0 + dx, y0 + dy
                if 0 <= px < w and 0 <= py < h:
                    r, g, b, a = pixel(px, py)
                    acc[0] += r * a * wgt
                    acc[1] += g * a * wgt
                    acc[2] += b * a * wgt
                    acc[3] += a * wgt
            alpha = acc[3] / 255
            for c in range(3):
                colour = acc[c] / acc[3] if acc[3] else 0
                row.append(round(colour * alpha + NIGHT[c] * (1 - alpha)))
        rows.append(row)
    write_png(OUT, SIZE, SIZE, rows)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()

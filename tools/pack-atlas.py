#!/usr/bin/env python3
# 0x72 DungeonTileset II(CC0) 낱장 프레임을 한 장의 아틀라스로 묶는다 (요청 1번, 캐시 쉬움)
#   python3 tools/pack-atlas.py <frames 폴더>  → public/assets/dt2.png, dt2.json
import sys, os, json
from PIL import Image
src = sys.argv[1]
names = sorted(f[:-4] for f in os.listdir(src) if f.endswith(".png"))
imgs = {n: Image.open(os.path.join(src, n + ".png")).convert("RGBA") for n in names}
# 높이 순 선반 배치
order = sorted(names, key=lambda n: (-imgs[n].height, -imgs[n].width))
W = 512; x = y = row = 0; pos = {}
for n in order:
    w, h = imgs[n].size
    if x + w > W: x = 0; y += row + 1; row = 0
    pos[n] = (x, y, w, h); x += w + 1; row = max(row, h)
H = y + row + 1
H2 = 1
while H2 < H: H2 *= 2
atlas = Image.new("RGBA", (W, H2), (0, 0, 0, 0))
for n, (px, py, w, h) in pos.items(): atlas.paste(imgs[n], (px, py))
out = os.path.join(os.path.dirname(__file__), "..", "public", "assets")
atlas.save(os.path.join(out, "dt2.png"), optimize=True)
json.dump(pos, open(os.path.join(out, "dt2.json"), "w"), separators=(",", ":"))
print(len(pos), "frames ->", W, "x", H2)

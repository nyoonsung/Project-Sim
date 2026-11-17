#!/usr/bin/env python3
# Ninja Adventure(CC0) 에셋에서 마을용 조각만 골라 아틀라스 한 장으로 (public/assets/town.png + town.json)
#   python3 tools/pack-town.py <Ninja Adventure의 Assets/Sprites 폴더>
import sys, os, json
from PIL import Image
S = sys.argv[1]
T = "Backgrounds/Tilesets/"
H, N, E = T + "TilesetHouse.png", T + "TilesetNature.png", T + "TilesetElement.png"
spec = {
  # 건물 (64x48 = 4x3칸)
  "h_orange": [H, 0, 0, 64, 48], "h_beige": [H, 64, 0, 64, 48], "h_orange2": [H, 128, 0, 64, 48], "h_red": [H, 192, 0, 64, 48],
  "h_food": [H, 256, 0, 48, 48], "h_green": [H, 304, 0, 64, 48], "h_round": [H, 368, 0, 48, 48], "h_tall": [H, 416, 0, 48, 48],
  "lodge": [H, 400, 112, 64, 112], "lodge2": [H, 400, 224, 64, 80], "arch": [H, 464, 320, 64, 48], "torii": [H, 8, 80, 32, 32],
  "statue": [H, 16, 241, 30, 47], "awning": [H, 256, 256, 48, 24],
  # 깃발 (7색)
  **{f"banner{i}": [H, 352 + 16 * i, 320, 16, 32] for i in range(7)},
  # 자연
  "tree_round": [N, 0, 0, 32, 32], "tree_pine": [N, 32, 0, 32, 32], "tree_pink_s": [N, 224, 0, 32, 32], "tree_green_s": [N, 256, 0, 32, 32],
  "tree_pink": [N, 0, 288, 48, 48], "tree_green": [N, 48, 288, 48, 48], "tree_white": [N, 96, 288, 48, 48], "tree_orange": [N, 144, 288, 48, 48],
  "grove_green": [N, 64, 32, 64, 48], "grove_pink": [N, 192, 32, 64, 48], "grove_lime": [N, 256, 32, 64, 48], "grove_pine": [N, 0, 32, 64, 48],
  **{f"bush{i}": [N, x, 160, 16, 16] for i, x in enumerate([0, 16, 32, 64, 96, 128])},
  **{f"flower{i}": [N, x, 176, 16, 16] for i, x in enumerate([0, 16, 48, 96])},
  **{f"crystal{i}": [N, i * 16, 224, 16, 16] for i in range(4)},
  "rock_big": [N, 272, 160, 64, 48], "rock_s": [N, 240, 160, 32, 32], "stump": [N, 0, 132, 32, 20], "boulder": [N, 0, 192, 32, 32],
  # 소품
  # 땅 타일
  **{f"g{i}": [T + "TilesetFloor.png", c * 16, 192, 16, 16] for i, c in enumerate([0, 1, 2, 3, 4])},
  "gd0": [T + "TilesetFloor.png", 176, 192, 16, 16], "gd1": [T + "TilesetFloor.png", 192, 192, 16, 16],
  **{f"dirt{i}": [T + "TilesetFloor.png", c * 16, r * 16, 16, 16] for i, (c, r) in enumerate([(5, 8), (6, 8), (5, 9), (6, 9)])},
  "crate": [E, 0, 0, 16, 16], "jar": [E, 16, 0, 16, 16], "jars": [E, 32, 0, 16, 16], "redjar": [E, 48, 0, 16, 16], "bucket": [E, 64, 0, 16, 16],
  "box": [E, 128, 0, 16, 16], "pack": [E, 144, 0, 16, 16], "bigpot": [E, 192, 0, 16, 16], "chest": [E, 0, 16, 16, 16], "cauldron": [E, 16, 16, 16, 16],
  "bread": [E, 32, 32, 16, 16], "crates": [E, 48, 32, 16, 16], "signboard": [E, 176, 16, 48, 16], "scarecrow": [E, 0, 80, 16, 16],
}
# 여러 프레임 (가로로 이어진 시트)
anims = {
  "flag_red": ["Backgrounds/Animated/Flag/FlagRed16x16.png", 16, 16, 4], "flag_blue": ["Backgrounds/Animated/Flag/FlagBlue16x16.png", 16, 16, 4],
  "flag_yellow": ["Backgrounds/Animated/Flag/FlagYellow16x16.png", 16, 16, 4], "flag_green": ["Backgrounds/Animated/Flag/FlagGreen16x16.png", 16, 16, 4],
  "mill": ["Backgrounds/Animated/MillPropeller/MillPropeller_A_64x64.png", 64, 64, 4], "watermill": ["Backgrounds/Animated/WaterMill/Watermill_A_34x36.png", 34, 36, 3],
  "ripple": ["Backgrounds/Animated/Water Ripples/SpriteSheet16x16.png", 16, 16, 4],
  "cat": ["Actor/Animals/Cat/SpriteSheet.png", 16, 16, 2], "dog": ["Actor/Animals/Dog/SpriteSheet.png", 16, 16, 2],
  "chick_w": ["Actor/Animals/Chicken/SpriteSheetWhite.png", 16, 16, 2], "chick_b": ["Actor/Animals/Chicken/SpriteSheetBrown.png", 16, 16, 2],
}
imgs = {}
def load(p):
    if p not in imgs: imgs[p] = Image.open(os.path.join(S, p)).convert("RGBA")
    return imgs[p]
pieces = {}
for n, (f, x, y, w, h) in spec.items(): pieces[n] = load(f).crop((x, y, x + w, y + h))
for n, (f, w, h, k) in anims.items():
    im = load(f)
    for i in range(k): pieces[f"{n}_f{i}"] = im.crop((i * w, 0, i * w + w, h))
# 마을 사람: 4방향(아래·위·왼·오) x 걷기 4프레임
for who in ["Villager", "Villager2", "Villager3", "Villager4", "Woman", "OldMan", "OldMan2", "Noble", "Princess", "Monk", "Master", "Inspector"]:
    im = load(f"Actor/Characters/{who}/SpriteSheet.png")
    for d, dn in enumerate(["down", "up", "left", "right"]):
        for i in range(4): pieces[f"vil_{who.lower()}_{dn}_f{i}"] = im.crop((d * 16, i * 16, d * 16 + 16, i * 16 + 16))
# 선반 배치
order = sorted(pieces, key=lambda n: (-pieces[n].height, -pieces[n].width))
W = 512; x = y = row = 0; pos = {}
for n in order:
    w, h = pieces[n].size
    if x + w > W: x = 0; y += row + 1; row = 0
    pos[n] = (x, y, w, h); x += w + 1; row = max(row, h)
Ht = 1
while Ht < y + row + 1: Ht *= 2
atlas = Image.new("RGBA", (W, Ht), (0, 0, 0, 0))
for n, (px, py, w, h) in pos.items(): atlas.paste(pieces[n], (px, py))
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets")
atlas.save(os.path.join(out, "town.png"), optimize=True)
json.dump(pos, open(os.path.join(out, "town.json"), "w"), separators=(",", ":"))
print(len(pos), "pieces ->", W, "x", Ht)

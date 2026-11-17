#!/usr/bin/env python3
"""글꼴 줄이기: 장식용 글꼴(Galmuri9·14·11 Bold·Mono)을 자주 쓰는 글자만 남겨 용량을 줄인다.
   - 남기는 글자: 영문·숫자·기호, 한글 자모, 완성형(KS X 1001) 2,350자, 게임 코드에 쓰인 모든 한글
   - 결과적으로 한글 11,172자는 모두 남고(드문 글자 닉네임도 그대로 표시), 한자·일본어 등 안 쓰는 글자만 빠짐
   사용: python3 tools/subset-fonts.py <Galmuri 원본 dist 폴더>
"""
import sys, os, re, glob
from fontTools import subset

SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "fonts")

cps = set(range(0x20, 0x7F)) | set(range(0xA0, 0x100))
for a, b in [(0x2000, 0x206F), (0x2190, 0x21FF), (0x2460, 0x24FF), (0x2500, 0x25FF), (0x2600, 0x26FF), (0x2700, 0x27BF),
             (0x3000, 0x303F), (0x3131, 0x318E), (0xFF01, 0xFF5E), (0x2150, 0x218F), (0x00D7, 0x00D7), (0x2212, 0x2212), (0x221E, 0x221E)]:
    cps |= set(range(a, b + 1))
for c in range(0xAC00, 0xD7A4):  # 완성형 2,350자
    try:
        chr(c).encode("euc-kr"); cps.add(c)
    except UnicodeEncodeError:
        pass
# 게임 코드·화면 글자에 실제로 쓰인 글자는 전부 포함
for pat in ["public/**/*.js", "public/**/*.html", "public/**/*.css", "shared/**/*.js", "server/**/*.js"]:
    for f in glob.glob(os.path.join(ROOT, pat), recursive=True):
        if "/vendor/" in f: continue
        with open(f, encoding="utf-8", errors="ignore") as fh:
            for ch in fh.read():
                if ord(ch) >= 0x80: cps.add(ord(ch))

MONO = set(range(0x20, 0x7F)) | {0x21E7, 0x2190, 0x2191, 0x2192, 0x2193, 0x00B7}

def run(src, dst, keep):
    opt = subset.Options()
    opt.flavor = "woff2"
    opt.layout_features = ["*"]
    opt.name_IDs = ["*"]
    opt.notdef_outline = True
    f = subset.load_font(os.path.join(SRC, src), opt)
    s = subset.Subsetter(opt)
    s.populate(unicodes=keep)
    s.subset(f)
    subset.save_font(f, os.path.join(OUT, dst), opt)
    print(f"{src:24} {os.path.getsize(os.path.join(SRC, src))//1024:4}KB → {dst:24} {os.path.getsize(os.path.join(OUT, dst))//1024:4}KB")

run("Galmuri11.woff2", "Galmuri11-k.woff2", cps)
run("Galmuri9.woff2", "Galmuri9-k.woff2", cps)
run("Galmuri14.woff2", "Galmuri14-k.woff2", cps)
run("Galmuri11-Bold.woff2", "Galmuri11-Bold-k.woff2", cps)
run("GalmuriMono11.woff2", "GalmuriMono11-a.woff2", MONO)
print("남긴 글자 수:", len(cps))

// 직업별 주인공 도트 (직접 그린 원본 픽셀 아트, 32x52, 1배 크기로 그려 디테일을 살림)
//  검사(남) · 마법사(남) · 궁수(여) · 대장장이(남) · 권투사(남) · 도적(여) · 성직자(여)
//  프레임: idle 4 · run 4 · hit 1. DOM 없이 픽셀 배열만 만들어서 브라우저·노드 둘 다 사용 가능.
export const HW = 32, HH = 52;
const FX = 16; // 발 가운데 x

function buf() {
  const b = new Array(HW * HH).fill(null);
  const o = {
    b,
    p(x, y, c) { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < HW && y < HH) b[y * HW + x] = c; },
    g(x, y) { return x >= 0 && y >= 0 && x < HW && y < HH ? b[y * HW + x] : null; },
    rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.p(x, y, typeof c === "function" ? c(x, y) : c); },
    ell(cx, cy, rx, ry, c, clip) {
      for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
        if (d <= 1 && (!clip || clip(x, y))) o.p(x, y, typeof c === "function" ? c(x, y, dx, dy) : c);
      }
    },
    poly(pts, c, clip) {
      let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
      for (const [x, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside && (!clip || clip(x, y))) o.p(x, y, typeof c === "function" ? c(x, y) : c);
      }
    },
    line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) o.p(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c); },
  };
  return o;
}
// 바깥 테두리: 빈 칸 중 그림과 맞닿은 칸을 진한 색으로
function outline(B, ink) {
  const add = [];
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    if (B.g(x, y)) continue;
    if (B.g(x - 1, y) || B.g(x + 1, y) || B.g(x, y - 1) || B.g(x, y + 1)) add.push([x, y]);
  }
  for (const [x, y] of add) B.p(x, y, ink);
}
// 3단 음영: 빛은 오른쪽 위(얼굴 쪽)에서
const sh = (base, lite, dark, cx, cy, rx, ry, k = 0.35) => (x, y) => {
  const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
  if (dx < -k || dy > 0.62) return dark;
  if (dx > 0.25 && dy < -0.25) return lite;
  return base;
};
const vsh = (base, lite, dark, x0, x1) => (x) => (x <= x0 ? dark : x >= x1 ? lite : base);

// ── 공통 몸 부품 ───────────────────────────────────────────
function legs(B, P, st) {
  // st.l = [뒷다리 x이동, 앞다리 x이동], st.u = [뒷다리 들림, 앞다리 들림]
  const hip = 40;
  const draw = (cx, dx, up, back) => {
    const x = cx + dx, foot = 51 - up;
    const pc = back ? P.pantsD : P.pants, pl = back ? P.pantsD : P.pantsL ?? P.pants;
    B.rect(x - 2, hip, x + 2, foot - 4, (xx) => (xx === x - 2 ? P.pantsD : xx === x + 2 ? pl : pc));
    if (P.knee) B.rect(x - 2, hip + 4, x + 2, hip + 5, back ? P.bootD : P.knee);
    const bc = back ? P.bootD : P.boot;
    B.rect(x - 2, foot - 4, x + 3, foot, (xx, yy) => (yy === foot ? P.bootD : xx === x - 2 ? P.bootD : yy === foot - 4 ? P.bootL ?? bc : bc));
    B.p(x + 3, foot - 4, null);
    if (P.bootTrim) B.rect(x - 2, foot - 4, x + 2, foot - 4, P.bootTrim);
  };
  draw(13, st.l[0], st.u[0], true);
  draw(19, st.l[1], st.u[1], false);
}
function head(B, P, by, opt = {}) {
  const cx = 16.5, cy = 17.5 + by;
  // 목
  B.rect(15, 25 + by, 18, 28 + by, P.skinD);
  // 얼굴(피부)
  B.ell(cx, cy, 8.5, 8.6, (x, y) => (x < 11 ? P.skinD : x > 22 && y > 22 + by ? P.skinD : P.skin));
  // 볼 아래 그림자, 귀
  B.p(12, 20 + by, P.skinD); B.p(12, 21 + by, P.skinD); B.p(11, 20 + by, P.skin); B.p(11, 21 + by, P.skinD);
  if (opt.ear !== false) { B.rect(10, 19 + by, 11, 22 + by, P.skin); B.p(10, 20 + by, P.skinD); B.p(10, 21 + by, P.skinD); }
}
function face(B, P, by, opt = {}) {
  const y = 18 + by;
  const fem = opt.fem, hurt = opt.hurt;
  const eye = (x, near) => {
    if (hurt) { B.p(x, y + 2, P.ink); B.p(x + 1, y + 1, P.ink); B.p(x + 1, y + 3, P.ink); return; }
    if (fem) {
      // 큰 눈 + 속눈썹
      B.rect(x, y, x + 1, y + 4, P.eye);
      B.p(x, y, P.ink); B.p(x + 1, y, P.ink); B.p(near ? x + 2 : x - 1, y, P.ink);
      B.p(x, y + 1, "#ffffff"); B.p(x + 1, y + 4, P.eyeL ?? P.eye); B.p(x, y + 4, P.eyeD ?? P.ink);
      B.p(x + 1, y + 2, P.eyeL ?? P.eye);
    } else {
      B.rect(x, y + 1, x + 1, y + 3, P.eye);
      B.p(x, y + 1, "#ffffff"); B.p(x + 1, y + 3, P.eyeD ?? P.ink); B.p(x, y + 3, P.eyeD ?? P.ink);
      B.p(x, y, P.ink); B.p(x + 1, y, P.ink);
    }
  };
  eye(16, false); eye(21, true);
  if (opt.brow !== false && !fem) { const bc = P.brow ?? P.hairD; B.p(15, y - 2, bc); B.p(16, y - 1, bc); B.p(17, y - 1, bc); B.p(21, y - 1, bc); B.p(22, y - 1, bc); B.p(23, y - 2, bc); }
  if (fem && !hurt) { B.p(15, y + 5, P.blush); B.p(23, y + 5, P.blush); }
  if (opt.mouth !== false) { if (hurt) { B.rect(18, y + 6, 19, y + 7, P.mouth); } else { B.p(18, y + 6, P.mouth); if (!fem) B.p(19, y + 6, P.mouth); if (!fem && opt.grit) B.p(19, y + 6, "#ffffff"); } }
}
function arm(B, P, by, front, opt = {}) {
  // 앞팔: 어깨(22,29) → 손(24,34) / 뒷팔: (10,29) → (8,36)
  const sleeve = opt.sleeve ?? P.sleeve ?? P.top, sleeveD = opt.sleeveD ?? P.sleeveD ?? P.topD;
  if (front) {
    B.rect(21, 28 + by, 24, 31 + by, (x) => (x === 21 ? sleeveD : sleeve));
    B.rect(22, 32 + by, 24, 33 + by, opt.bare ? P.skinD : sleeveD);
    if (opt.cuff) B.rect(22, 33 + by, 25, 33 + by, opt.cuff);
    if (opt.glove) { B.ell(25, 34.5 + by, 3.3, 3.1, (x, y) => (y < 35 + by && x > 24 ? opt.gloveL : x < 23 ? opt.gloveD : opt.glove)); B.p(26, 33 + by, "#ffb0a0"); B.rect(22, 33 + by, 23, 33 + by, "#ffffff"); }
    else B.rect(23, 34 + by, 25, 36 + by, (x, y) => (y === 36 + by || x === 23 ? P.skinD : P.skin));
  } else {
    B.rect(7, 29 + by, 10, 34 + by, (x) => (x === 7 ? sleeveD : sleeveD));
    if (opt.cuff) B.rect(7, 34 + by, 10, 34 + by, opt.cuffD ?? opt.cuff);
    if (opt.glove) B.ell(8.5, 36.5 + by, 2.4, 2.3, (x) => (x < 8 ? opt.gloveD : opt.glove));
    else B.rect(7, 35 + by, 9, 37 + by, P.skinD);
  }
}
function torso(B, P, by, opt = {}) {
  // 어깨 둥글게, 허리까지
  const top = 27 + by, bot = 41;
  B.poly([[9, top + 2], [11, top], [22, top], [24, top + 2], [23, bot], [10, bot]], (x, y) => (x <= 11 ? P.topD : x >= 21 && y < top + 6 ? P.topL : P.top));
}

// 프레임별 자세
function poseOf(anim, f) {
  if (anim === "run") {
    const L = [[[-3, 3], [0, 0]], [[-1, 1], [0, 2]], [[3, -3], [0, 0]], [[1, -1], [2, 0]]][f];
    return { by: f % 2 ? -1 : 0, l: L[0], u: L[1], swing: [2, 0, -2, 0][f] };
  }
  if (anim === "hit") return { by: 1, l: [-1, 1], u: [0, 0], hurt: true, lean: -1 };
  return { by: f >= 2 ? 1 : 0, l: [0, 0], u: [0, 0], swing: 0 };
}

// ── 직업별 ────────────────────────────────────────────────
const SKIN = { skin: "#f8d4ae", skinD: "#e0a67a", mouth: "#c8706a", blush: "#ffb4b0" };
const DARK_SKIN = { skin: "#9a5a34", skinD: "#6e3a1e", mouth: "#4a1c10", blush: "#b05a40" };

const CLASSES = {
  // 검사: 뾰족한 갈색 머리, 파란 튜닉 + 금색 테두리, 붉은 망토·목도리, 갈색 벨트·부츠
  sword(B, st) {
    const P = { ...SKIN, ink: "#1a0e0a", hair: "#a8562a", hairL: "#d8823e", hairD: "#6a2e14", eye: "#3a2a1a", eyeD: "#1a0e0a",
      top: "#2f5ad0", topL: "#4f82f0", topD: "#1c3488", gold: "#f6c444", goldD: "#b8842a", cape: "#d02c2c", capeL: "#f05a4a", capeD: "#801818",
      pants: "#e0c89c", pantsL: "#f0dcb4", pantsD: "#b49a70", boot: "#8a4a22", bootL: "#b4682e", bootD: "#5a2c12" };
    const by = st.by;
    // 망토 (뒤로 펄럭)
    const fl = st.swing ? Math.abs(st.swing) : 0;
    B.poly([[11, 28 + by], [17, 28 + by], [14, 44], [6 - fl, 47], [3 - fl, 44], [7, 34 + by]], (x, y) => (x < 7 - fl / 2 ? P.capeD : y > 42 ? P.capeD : x > 12 ? P.capeL : P.cape));
    arm(B, P, by, false, { cuff: P.gold, cuffD: P.goldD });
    legs(B, P, st);
    torso(B, P, by);
    // 튜닉 아랫단 (치마처럼) + 금테
    B.poly([[9, 37], [24, 37], [25, 42], [8, 42]], (x) => (x <= 10 ? P.topD : x >= 22 ? P.topL : P.top));
    B.rect(8, 42, 25, 42, P.gold); B.p(8, 42, P.goldD);
    // 앞섶 금테
    B.rect(17, 28 + by, 17, 41, P.gold); B.rect(18, 28 + by, 18, 36, P.goldD);
    // 벨트
    B.rect(9, 37, 24, 38, (x) => (x < 12 ? "#4a2410" : "#6e3a1a")); B.rect(16, 36, 19, 39, P.gold); B.rect(17, 37, 18, 38, "#6e3a1a");
    // 허리 주머니
    B.rect(20, 39, 22, 41, "#7a4420"); B.p(21, 39, "#a8642e");
    head(B, P, by);
    // 머리카락: 뾰족뾰족
    const hy = by;
    B.ell(16.2, 14.5 + hy, 9.4, 7.6, (x, y) => (x < 12 ? P.hairD : y < 11 + hy && x > 15 ? P.hairL : P.hair), (x, y) => y <= 16 + hy || x <= 12);
    B.poly([[7, 14 + hy], [12, 12 + hy], [12, 25 + hy], [8, 22 + hy]], (x) => (x < 9 ? P.hairD : P.hair));
    const spikes = [[[8, 12], [2, 8], [10, 9]], [[9, 9], [5, 3], [13, 7]], [[12, 7], [11, 1], [17, 7]], [[16, 6], [19, 0], [20, 7]], [[19, 7], [26, 4], [23, 10]], [[22, 9], [28, 11], [24, 13]], [[7, 18], [3, 20], [8, 21]]];
    for (const s of spikes) B.poly(s.map(([x, y]) => [x, y + hy]), (x, y) => (y < 6 + hy && x > 14 ? P.hairL : x < 10 ? P.hairD : P.hair));
    // 앞머리 (이마 위로 뾰족하게 내려옴)
    const bang = [3, 4, 5, 3, 2, 4, 5, 3, 2, 3, 4, 2];
    for (let i = 0; i < bang.length; i++) { const x = 13 + i; for (let y = 14 + hy; y < 14 + hy + bang[i]; y++) B.p(x, y, y === 14 + hy + bang[i] - 1 ? P.hairD : P.hair); }
    for (const [a, b2, c, d] of [[14, 8, 13, 13], [18, 6, 17, 12], [22, 9, 22, 13], [11, 12, 10, 18]]) B.line(a, b2 + hy, c, d + hy, P.hairD);
    B.line(19, 7 + hy, 21, 10 + hy, P.hairL);
    face(B, P, by, { hurt: st.hurt, grit: false });
    // 붉은 목도리
    B.rect(12, 26 + by, 22, 28 + by, (x, y) => (y === 28 + by ? P.capeD : x > 18 ? P.capeL : P.cape));
    B.poly([[11, 27 + by], [14, 27 + by], [10, 33 + by], [8, 32 + by]], P.cape);
    // 어깨 금 장식
    B.ell(22.5, 29 + by, 2, 1.6, (x) => (x > 22 ? P.gold : P.goldD));
    arm(B, P, by, true, { cuff: P.gold });
    outline(B, P.ink);
  },
  // 마법사: 보라 후드 로브, 룬 무늬, 어두운 녹색 구슬
  mage(B, st) {
    const P = { ...SKIN, skin: "#dcb08a", skinD: "#a87a56", ink: "#140a1c", eye: "#d890ff", eyeD: "#5a1a8a", brow: "#3a2030", hairD: "#3a2030",
      top: "#6a2a9a", topL: "#9048c8", topD: "#3e1660", rune: "#c88af0", runeD: "#4a1e70", gold: "#e8c060",
      pants: "#4a1e6e", pantsD: "#2e1046", boot: "#2a1a24", bootD: "#140a12", bootL: "#3e2a36" };
    const by = st.by;
    // 떠 있는 어둠 구슬 (뒷손 위)
    const oy = 30 + Math.round(Math.sin((st.f ?? 0) * 1.6) * 1) + by;
    B.ell(5.5, oy, 3, 3, (x, y) => (x > 5 && y < oy ? "#7af0b0" : x < 5 ? "#0e2a1e" : "#2a7a50"));
    B.p(6, oy - 2, "#d8ffe8");
    arm(B, P, by, false, { sleeve: P.topD, sleeveD: P.topD });
    legs(B, P, st);
    // 긴 로브 (발목까지, 아래로 퍼짐)
    B.poly([[9, 29 + by], [11, 27 + by], [22, 27 + by], [24, 29 + by], [26, 49], [7, 49]], (x, y) => (x <= 10 + (y - 27) * 0.1 ? P.topD : x >= 21 ? P.topL : P.top));
    B.rect(7, 48, 26, 49, P.topD);
    // 로브 앞 룬 띠
    for (let y = 30 + by; y <= 47; y++) { B.p(17, y, P.runeD); B.p(18, y, (y % 4 === 0) ? P.rune : P.runeD); B.p(19, y, P.runeD); }
    for (let y = 33; y <= 46; y += 4) { B.p(16, y, P.rune); B.p(20, y + 2, P.rune); }
    // 허리 끈
    B.rect(10, 36, 23, 37, P.runeD); B.rect(21, 37, 22, 41, P.gold);
    head(B, P, by, { ear: false });
    face(B, P, by, { hurt: st.hurt });
    // 수염 살짝 (나이 든 마법사 느낌은 빼고 짧은 수염)
    B.poly([[14, 22 + by], [24, 22 + by], [23, 26 + by], [20, 30 + by], [17, 29 + by], [15, 25 + by]], (x, y) => (x < 17 ? "#6a5050" : y > 27 + by ? "#6a5050" : "#8a7068")); B.p(18, 23 + by, "#c06a6a"); B.p(19, 23 + by, "#5a3a40");
    // 후드: 머리 전체를 덮고 뒤로 뾰족, 얼굴에 그림자
    B.ell(16, 15.5 + by, 10, 9.5, (x, y) => (x < 11 ? P.topD : y < 10 + by && x > 15 ? P.topL : P.top), (x, y) => !(x >= 14 && x <= 24 && y >= 16 + by && y <= 27 + by));
    B.poly([[7, 10 + by], [1, 22 + by], [3, 28 + by], [8, 26 + by]], (x) => (x < 4 ? P.topD : P.top));
    B.poly([[23, 13 + by], [27, 15 + by], [26, 24 + by], [24, 27 + by], [24, 16 + by]], (x) => (x > 25 ? P.topD : P.top)); // 먼 쪽 후드 자락
    // 이마를 덮는 후드 앞자락 (가운데가 살짝 뾰족) + 안쪽 그늘
    B.poly([[13, 12 + by], [25, 13 + by], [25, 16 + by], [20, 17 + by], [14, 16 + by]], (x, y) => (y < 14 + by && x > 16 ? P.topL : P.top));
    for (let x = 14; x <= 24; x++) { const c = B.g(x, 17 + by); if (c === P.skin || c === P.skinD) B.p(x, 17 + by, "#5a3a5a"); }
    for (let x = 14; x <= 23; x++) { const c = B.g(x, 18 + by); if (c === P.skin) B.p(x, 18 + by, P.skinD); }
    // 후드 가장자리 무늬
    B.rect(13, 16 + by, 13, 27 + by, P.rune);
    arm(B, P, by, true, { sleeve: P.top, sleeveD: P.topD, cuff: P.rune });
    outline(B, P.ink);
  },
  // 궁수(여): 파란 머리 + 은빛 투구와 갑옷, 파란 천, 금 장식
  archer(B, st) {
    const P = { ...SKIN, ink: "#14141e", hair: "#3a6ae0", hairL: "#6a9cff", hairD: "#1e3a8a", eye: "#e04a6a", eyeL: "#ff8aa0", eyeD: "#7a1a30",
      top: "#c8d0dc", topL: "#f0f4fa", topD: "#7a8496", cloth: "#2e58c8", clothL: "#4a7ae8", clothD: "#1a2e78", gold: "#f0c050", goldD: "#a87a20",
      pants: "#3a3e4e", pantsL: "#50566a", pantsD: "#24262e", boot: "#7a4a26", bootL: "#a0683a", bootD: "#4a2a12", knee: "#c8d0dc" };
    const by = st.by;
    // 긴 포니테일 (뒤로)
    const sw = st.swing ?? 0;
    B.poly([[9, 13 + by], [5, 18 + by], [2 - sw / 2, 30 + by], [4 - sw / 2, 36 + by], [7, 30 + by], [10, 20 + by]], (x) => (x < 5 ? P.hairD : P.hair));
    arm(B, P, by, false, { sleeve: P.topD, sleeveD: P.topD });
    legs(B, P, st);
    // 파란 천 치마
    B.poly([[9, 36], [24, 36], [26, 44], [7, 44]], (x) => (x <= 10 ? P.clothD : x >= 22 ? P.clothL : P.cloth));
    B.rect(7, 44, 26, 44, P.gold);
    // 은빛 흉갑
    B.poly([[10, 29 + by], [12, 27 + by], [21, 27 + by], [23, 29 + by], [22, 37], [11, 37]], (x, y) => (x <= 12 ? P.topD : x >= 19 && y < 33 + by ? P.topL : P.top));
    B.rect(16, 29 + by, 16, 36, P.topD); B.p(18, 31 + by, P.gold); B.p(18, 32 + by, P.gold); B.p(17, 32 + by, P.gold); B.p(19, 32 + by, P.gold); B.p(18, 33 + by, P.gold);
    B.rect(11, 36, 22, 37, P.goldD); B.rect(16, 36, 17, 37, P.gold);
    head(B, P, by);
    // 앞머리 + 옆머리
    B.ell(16.5, 15 + by, 9, 6.5, (x) => (x < 12 ? P.hairD : P.hair), (x, y) => y <= 17 + by || x <= 12);
    B.poly([[8, 15 + by], [12, 15 + by], [12, 27 + by], [9, 26 + by]], (x) => (x < 10 ? P.hairD : P.hair));
    B.poly([[22, 16 + by], [25, 15 + by], [26, 24 + by], [24, 23 + by]], (x) => (x > 24 ? P.hairD : P.hair));
    const bang = [3, 5, 4, 2, 3, 5, 4, 2, 3, 2];
    for (let i = 0; i < bang.length; i++) for (let y = 16 + by; y < 16 + by + bang[i]; y++) B.p(13 + i, y, y > 17 + by ? P.hairD : P.hair);
    // 은빛 투구 (귀까지 덮고 앞쪽 챙)
    B.ell(16.5, 13.5 + by, 9.6, 6.4, (x, y) => (x < 11 ? P.topD : y < 10 + by && x > 15 ? P.topL : P.top), (x, y) => y <= 15 + by);
    B.rect(7, 14 + by, 26, 15 + by, (x) => (x < 11 ? P.topD : P.top)); B.rect(8, 15 + by, 26, 15 + by, P.topD);
    B.rect(16, 7 + by, 17, 14 + by, P.gold); // 가운데 금 줄
    B.poly([[7, 12 + by], [3, 9 + by], [5, 14 + by]], P.cloth); // 투구 옆 파란 깃
    face(B, P, by, { fem: true, hurt: st.hurt });
    // 어깨 보호대
    B.ell(22.5, 29 + by, 2.6, 2, (x, y) => (y < 29 + by ? P.topL : P.top));
    arm(B, P, by, true, { sleeve: P.top, sleeveD: P.topD, cuff: P.boot });
    outline(B, P.ink);
  },
  // 대장장이: 헝클어진 갈색 머리, 가죽 앞치마, 튼튼한 팔, 그을음
  smith(B, st) {
    const P = { ...SKIN, skin: "#f0c49a", skinD: "#c8925e", ink: "#1a100a", hair: "#7a4424", hairL: "#a8663a", hairD: "#4a2410", eye: "#2a1a10", eyeD: "#140a06",
      top: "#f0c49a", topL: "#ffdcb4", topD: "#c8925e", apron: "#6a4a32", apronL: "#8a6446", apronD: "#3e2a1c", strap: "#3e2a1c",
      pants: "#4a3a2e", pantsL: "#5e4a3a", pantsD: "#2e241c", boot: "#5a3a22", bootL: "#7a5232", bootD: "#2e1e10", band: "#8a2a1a" };
    const by = st.by;
    arm(B, P, by, false, { bare: true, sleeve: P.skinD, sleeveD: P.skinD, cuff: P.band, cuffD: "#5a1a10" });
    legs(B, P, st);
    torso(B, P, by);
    // 가슴 근육 선
    B.p(15, 31 + by, P.topD); B.p(16, 32 + by, P.topD); B.p(19, 31 + by, P.topD); B.p(20, 32 + by, P.topD);
    // 가죽 앞치마 (가슴부터 무릎까지)
    B.poly([[12, 30 + by], [22, 30 + by], [24, 46], [10, 46]], (x, y) => (x <= 12 ? P.apronD : x >= 21 ? P.apronL : P.apron));
    B.rect(10, 46, 24, 46, P.apronD);
    B.line(12, 30 + by, 15, 27 + by, P.strap); B.line(22, 30 + by, 19, 27 + by, P.strap);
    // 앞치마 주머니 + 연장
    B.rect(14, 38, 20, 41, P.apronD); B.rect(15, 38, 19, 38, P.apronL); B.p(15, 37, "#a0a8b8"); B.p(15, 36, "#a0a8b8"); B.p(18, 36, "#c0884a"); B.p(18, 37, "#c0884a");
    // 그을음
    B.p(13, 34, "#4a3a2e"); B.p(21, 43, "#3a2a1e"); B.p(17, 44, "#3a2a1e");
    head(B, P, by);
    // 헝클어진 머리
    B.ell(16.5, 14 + by, 9.6, 7, (x, y) => (x < 12 ? P.hairD : y < 11 + by && x > 15 ? P.hairL : P.hair), (x, y) => y <= 16 + by || x <= 12);
    B.poly([[7, 14 + by], [12, 13 + by], [12, 24 + by], [8, 22 + by]], (x) => (x < 9 ? P.hairD : P.hair));
    const tufts = [[[7, 11], [3, 9], [8, 14]], [[9, 9], [6, 5], [12, 8]], [[13, 8], [13, 4], [17, 8]], [[17, 8], [20, 4], [21, 9]], [[21, 9], [25, 7], [24, 12]], [[24, 12], [27, 14], [24, 15]]];
    for (const s of tufts) B.poly(s.map(([x, y]) => [x, y + by]), (x, y) => (y < 7 + by ? P.hairL : x < 10 ? P.hairD : P.hair));
    const bang = [2, 4, 3, 5, 2, 3, 4, 2, 3, 1, 2];
    for (let i = 0; i < bang.length; i++) for (let y = 15 + by; y < 15 + by + bang[i]; y++) B.p(13 + i, y, y > 16 + by ? P.hairD : P.hair);
    for (const [a, b2, c, d] of [[15, 8, 14, 13], [19, 7, 19, 12], [11, 12, 10, 17]]) B.line(a, b2 + by, c, d + by, P.hairD);
    // 머리띠
    B.rect(12, 14 + by, 25, 14 + by, P.band);
    face(B, P, by, { hurt: st.hurt });
    // 수염 그림자
    B.p(18, 25 + by, P.skinD); B.p(20, 25 + by, P.skinD); B.p(22, 24 + by, P.skinD);
    // 볼 그을음
    B.p(23, 22 + by, "#c8925e");
    arm(B, P, by, true, { bare: true, sleeve: P.skin, sleeveD: P.skinD, cuff: P.band });
    outline(B, P.ink);
  },
  // 권투사: 짙은 피부, 짧은 머리, 빨간 글러브와 트렁크, 흰 신발
  fist(B, st) {
    const P = { ...DARK_SKIN, ink: "#120806", hairD: "#141010", hair: "#241c1a", eye: "#1a0e08", eyeD: "#0a0604", brow: "#140c08",
      top: "#9a5a34", topL: "#b8784a", topD: "#6e3a1e",
      pants: "#ffffff", pantsL: "#ffffff", pantsD: "#d8d8e0", boot: "#f4f4f8", bootL: "#ffffff", bootD: "#a8acb8", bootTrim: "#d02a2a",
      red: "#d8262c", redL: "#ff5a4e", redD: "#7a1014" };
    const by = st.by;
    B.rect(8, 29 + by, 10, 32 + by, P.skinD); // 뒷어깨
    legs(B, P, { ...st, l: [st.l[0] - 1, st.l[1] + 1] });
    // 양말 위 다리는 피부색
    for (let y = 41; y <= 45; y++) for (let x = 9; x <= 23; x++) if (B.g(x, y) === P.pants || B.g(x, y) === P.pantsD) B.p(x, y, B.g(x, y) === P.pantsD ? P.skinD : P.skin);
    torso(B, P, by);
    // 복근·가슴
    B.rect(13, 31 + by, 15, 31 + by, P.topD); B.rect(18, 31 + by, 20, 31 + by, P.topD); B.p(16, 33 + by, P.topD); B.p(16, 35 + by, P.topD); B.p(18, 34 + by, P.topD); B.p(18, 36 + by, P.topD);
    B.p(21, 29 + by, P.topL); B.p(22, 30 + by, P.topL);
    // 빨간 트렁크 + 흰 허리띠
    B.poly([[9, 38], [24, 38], [25, 45], [18, 45], [16, 42], [15, 45], [8, 45]], (x) => (x <= 10 ? P.redD : x >= 22 ? P.redL : P.red));
    B.rect(9, 38, 24, 39, (x) => (x < 12 ? "#c8c8d0" : "#ffffff")); B.rect(23, 40, 23, 44, "#ffffff");
    head(B, P, by);
    // 짧은 머리 (페이드)
    B.ell(16.5, 14.5 + by, 9, 6.6, (x, y) => (x < 12 ? P.hairD : y < 11 + by && x > 16 ? "#3a2e2a" : P.hair), (x, y) => y <= 14 + by || x <= 12);
    B.rect(9, 14 + by, 11, 20 + by, P.hairD);
    for (let x = 13; x <= 24; x++) B.p(x, 15 + by, x % 2 ? P.hair : P.hairD);
    face(B, P, by, { hurt: st.hurt, grit: true });
    // 마우스피스 흰 이 + 땀방울
    B.p(25, 17 + by, "#a8e0ff");
    // 글러브: 뒷손은 턱 앞, 앞손은 앞으로
    B.rect(18, 28 + by, 20, 30 + by, P.skinD); // 뒷팔 (가슴 앞으로)
    B.ell(20.5, 27 + by, 3.4, 3.2, (x, y) => (x < 19 ? P.redD : y < 26 + by && x > 20 ? P.redL : P.red));
    B.p(22, 25 + by, "#ffb0a0"); B.rect(18, 29 + by, 22, 29 + by, P.redD);
    arm(B, P, by, true, { bare: true, sleeve: P.skin, sleeveD: P.skinD, glove: P.red, gloveL: P.redL, gloveD: P.redD });
        outline(B, P.ink);
  },
  // 도적(여): 남색 후드 망토, 복면, 파란 눈, 가죽 벨트
  rogue(B, st) {
    const P = { ...SKIN, ink: "#0a0a14", hair: "#2a2438", hairD: "#16121e", eye: "#3a8ae8", eyeL: "#5aa8ff", eyeD: "#1a3a7a",
      top: "#2a3050", topL: "#3e4870", topD: "#161a2e", cloak: "#20243c", cloakL: "#30365a", cloakD: "#10121e", mask: "#1a1e30",
      pants: "#262a3e", pantsL: "#343a52", pantsD: "#14162a", boot: "#3a2a24", bootL: "#5a4234", bootD: "#1e1410", leather: "#6a4428", leatherL: "#8a5e38" };
    const by = st.by, sw = st.swing ?? 0;
    // 망토 (뒤로 길게, 끝이 찢어진 모양)
    B.poly([[11, 27 + by], [16, 27 + by], [13, 46], [10, 44], [8, 48], [6, 44], [3 - sw / 2, 46], [5, 34 + by]], (x, y) => (x < 7 ? P.cloakD : x > 11 ? P.cloakL : P.cloak));
    arm(B, P, by, false, { sleeve: P.topD, sleeveD: P.topD, cuff: P.leather });
    legs(B, P, st);
    // 몸에 붙는 상의
    B.poly([[10, 29 + by], [12, 27 + by], [21, 27 + by], [23, 29 + by], [22, 41], [11, 41]], (x, y) => (x <= 12 ? P.topD : x >= 20 && y < 33 + by ? P.topL : P.top));
    B.line(12, 29 + by, 21, 37, P.leather); B.line(13, 29 + by, 22, 37, P.leatherL); // 대각선 가죽끈
    B.rect(11, 38, 22, 39, P.leather); B.rect(16, 38, 17, 39, "#c0c8d8");
    B.rect(19, 39, 21, 41, P.leather); B.p(20, 39, P.leatherL); // 주머니
    head(B, P, by, { ear: false });
    face(B, P, by, { fem: true, hurt: st.hurt, mouth: false });
    // 복면 (코 아래)
    B.poly([[11, 22 + by], [26, 22 + by], [24, 27 + by], [12, 28 + by]], (x, y) => (y === 22 + by ? P.cloakL : x < 14 ? P.cloakD : P.mask));
    // 앞머리 몇 가닥
    for (const [x, l] of [[14, 3], [15, 4], [16, 2], [19, 3], [20, 2], [23, 3]]) for (let y = 15 + by; y < 15 + by + l; y++) B.p(x, y, P.hair);
    // 후드
    B.ell(16.3, 15 + by, 10, 9, (x, y) => (x < 11 ? P.cloakD : y < 10 + by && x > 15 ? P.cloakL : P.cloak), (x, y) => !(x >= 13 && x <= 25 && y >= 15 + by && y <= 27 + by));
    B.poly([[8, 9 + by], [3, 18 + by], [5, 27 + by], [9, 25 + by]], (x) => (x < 5 ? P.cloakD : P.cloak));
    B.rect(13, 14 + by, 25, 14 + by, P.cloakD);
    // 후드 그늘
    for (let x = 14; x <= 24; x++) { const c = B.g(x, 15 + by); if (c === P.skin) B.p(x, 15 + by, P.skinD); }
    arm(B, P, by, true, { sleeve: P.top, sleeveD: P.topD, cuff: P.leather });
    outline(B, P.ink);
  },
  // 성직자(여): 긴 갈색 머리, 흰 베일 + 금빛 가시 후광 관, 흰 로브에 파란 띠·금장식
  priest(B, st) {
    const P = { ...SKIN, ink: "#2a2030", hair: "#8a5a3a", hairL: "#b07a52", hairD: "#5a3620", eye: "#8a5a3a", eyeL: "#c08a5e", eyeD: "#4a2a14",
      top: "#f4f2ee", topL: "#ffffff", topD: "#c4c4d4", blue: "#2e5ad0", blueL: "#4a7ef0", blueD: "#1a3488", gold: "#f0c44a", goldD: "#b0802a",
      pants: "#24202a", pantsL: "#34303c", pantsD: "#16141a", boot: "#24202a", bootL: "#3a3444", bootD: "#121016" };
    const by = st.by;
    // 금빛 가시 후광 (머리 뒤)
    const cx = 15, cy = 13 + by;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
      const l = i % 2 ? 9 : 12;
      B.line(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, cx + Math.cos(a) * l, cy + Math.sin(a) * l, i % 2 ? P.goldD : P.gold);
    }
    B.ell(cx, cy, 8.5, 8.5, P.gold, (x, y) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); return d > 7.4 && y < cy + 3; });
    // 긴 머리 (등 뒤로 허리까지)
    B.poly([[8, 16 + by], [12, 16 + by], [13, 30 + by], [11, 42], [6, 40], [5, 28 + by]], (x) => (x < 7 ? P.hairD : x > 10 ? P.hairL : P.hair));
    arm(B, P, by, false, { sleeve: P.topD, sleeveD: P.topD, cuff: P.gold, cuffD: P.goldD });
    legs(B, P, st);
    // 흰 로브 (발목 위까지, 앞이 살짝 트임)
    B.poly([[9, 29 + by], [11, 27 + by], [22, 27 + by], [24, 29 + by], [26, 47], [7, 47]], (x, y) => (x <= 10 + (y - 27) * 0.08 ? P.topD : x >= 22 ? P.topL : P.top));
    B.rect(7, 47, 26, 47, P.gold);
    // 파란 띠 (가운데 아래로) + 금 십자
    B.rect(16, 33, 19, 47, (x) => (x === 16 ? P.blueD : x === 19 ? P.blueL : P.blue));
    B.rect(17, 38, 18, 43, P.gold); B.rect(16, 39, 19, 39, P.gold);
    // 금 허리띠
    B.rect(10, 33, 23, 34, (x) => (x < 13 ? P.goldD : P.gold));
    // 가슴 금장식
    B.rect(14, 28 + by, 20, 28 + by, P.gold); B.p(17, 29 + by, P.blue); B.p(17, 30 + by, P.gold);
    head(B, P, by, { ear: false });
    // 앞머리
    B.ell(16.5, 15 + by, 8.8, 6, (x) => (x < 12 ? P.hairD : P.hair), (x, y) => y <= 17 + by);
    const bang = [3, 4, 5, 3, 2, 3, 4, 3, 2, 2];
    for (let i = 0; i < bang.length; i++) for (let y = 16 + by; y < 16 + by + bang[i]; y++) B.p(13 + i, y, y > 17 + by ? P.hairD : P.hair);
    face(B, P, by, { fem: true, hurt: st.hurt });
    // 흰 베일 (머리 위, 양 옆으로 늘어짐, 안쪽 파란 안감)
    B.ell(16, 15 + by, 10, 8.4, (x, y) => (x < 11 ? P.topD : y < 11 + by && x > 15 ? P.topL : P.top), (x, y) => y <= 15 + by || x <= 12);
    B.poly([[6, 14 + by], [12, 14 + by], [12, 26 + by], [10, 32 + by], [3, 30 + by]], (x) => (x < 6 ? P.topD : x > 10 ? P.blue : P.top));
    B.rect(12, 15 + by, 25, 15 + by, P.blue); B.rect(12, 14 + by, 25, 14 + by, P.gold); B.rect(12, 15 + by, 12, 26 + by, P.blue);
    B.p(19, 11 + by, P.gold); B.p(19, 10 + by, P.goldD); B.p(18, 11 + by, P.goldD); B.p(20, 11 + by, P.goldD); B.p(19, 12 + by, P.goldD);
    B.poly([[12, 17 + by], [14, 17 + by], [15, 26 + by], [14, 34 + by], [11, 36 + by], [12, 28 + by]], (x, y) => (x < 13 ? P.hairD : y < 22 + by ? P.hairL : P.hair));
    B.line(13, 20 + by, 13, 33 + by, P.hairD);
    arm(B, P, by, true, { sleeve: P.top, sleeveD: P.topD, cuff: P.gold });
    outline(B, P.ink);
  },
};

CLASSES.adventurer = (B, st) => {
  const P = { ...SKIN, ink: "#1a120a", hair: "#6a4426", hairL: "#8e603a", hairD: "#422814", eye: "#2a3a1a", eyeD: "#141a0a",
    top: "#4a8a3a", topL: "#6aae52", topD: "#2c5a24", vest: "#8a5a32", vestL: "#a8743e", vestD: "#5a3a1e",
    pants: "#7a6a52", pantsL: "#94826a", pantsD: "#54483a", boot: "#6a4424", bootL: "#8a5e34", bootD: "#3e2612" };
  const by = st.by;
  arm(B, P, by, false, {});
  legs(B, P, st);
  torso(B, P, by);
  B.poly([[9, 37], [24, 37], [25, 42], [8, 42]], (x) => (x <= 10 ? P.topD : x >= 22 ? P.topL : P.top));
  B.poly([[10, 29 + by], [15, 28 + by], [15, 40], [10, 40]], (x) => (x < 12 ? P.vestD : P.vest));
  B.poly([[19, 28 + by], [23, 29 + by], [23, 40], [19, 40]], (x) => (x > 21 ? P.vestL : P.vest));
  B.rect(9, 38, 24, 39, "#4a2c14"); B.rect(16, 38, 17, 39, "#c8a050");
  B.rect(8, 29 + by, 10, 41, P.vestD); // 등짐 끈
  head(B, P, by);
  B.ell(16.5, 14.5 + by, 9.2, 6.6, (x, y) => (x < 12 ? P.hairD : y < 11 + by && x > 15 ? P.hairL : P.hair), (x, y) => y <= 15 + by || x <= 12);
  B.poly([[8, 14 + by], [12, 13 + by], [12, 23 + by], [9, 21 + by]], (x) => (x < 10 ? P.hairD : P.hair));
  const bang = [2, 3, 4, 2, 3, 2, 3, 2, 1, 2];
  for (let i = 0; i < bang.length; i++) for (let y = 15 + by; y < 15 + by + bang[i]; y++) B.p(13 + i, y, y > 16 + by ? P.hairD : P.hair);
  B.line(15, 9 + by, 14, 14 + by, P.hairD); B.line(20, 9 + by, 21, 13 + by, P.hairD);
  face(B, P, by, { hurt: st.hurt });
  arm(B, P, by, true, { cuff: P.vest });
  outline(B, P.ink);
};
export const HERO_CLASSES = Object.keys(CLASSES);
/** 픽셀 배열(색 문자열 또는 null, HW*HH) */
export function paintHero(cls, anim, f) {
  const B = buf();
  const st = { ...poseOf(anim, f), f };
  CLASSES[cls](B, st);
  if (st.lean) { // 맞을 때 몸을 뒤로 젖힘: 윗부분을 1칸 뒤로
    const nb = B.b.slice();
    for (let y = 0; y < 38; y++) for (let x = 0; x < HW; x++) nb[y * HW + x] = B.g(x + 1, y);
    B.b.splice(0, B.b.length, ...nb);
  }
  return B.b;
}
/** RGBA 바이트 */
export function heroRGBA(cls, anim, f) {
  const px = paintHero(cls, anim, f), out = new Uint8ClampedArray(HW * HH * 4);
  px.forEach((c, i) => { if (!c) return; const n = parseInt(c.slice(1), 16); out[i * 4] = (n >> 16) & 255; out[i * 4 + 1] = (n >> 8) & 255; out[i * 4 + 2] = n & 255; out[i * 4 + 3] = 255; });
  return out;
}
export const HERO_ANIMS = { idle: 4, run: 4, hit: 1 };
export { FX };

/** 브라우저: 모든 직업·프레임을 캔버스로 만들어 아틀라스에 등록 (hero_<직업>_<idle|run|hit>_anim_f<n>) */
export function registerHeroes(add) {
  for (const cls of HERO_CLASSES) for (const [anim, n] of Object.entries(HERO_ANIMS)) for (let f = 0; f < n; f++) {
    const cv = document.createElement("canvas");
    cv.width = HW; cv.height = HH;
    cv.getContext("2d").putImageData(new ImageData(heroRGBA(cls, anim, f), HW, HH), 0, 0);
    add(`hero_${cls}_${anim}_anim_f${f}`, cv);
  }
}

// 아이템 아이콘 (작은 픽셀 그림)

const cache = new Map();
const P = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ── 장비 아이콘 (18×18 픽셀 아트)
//  모양을 '재질 채널'로 칠한 뒤 자동으로: 왼쪽 위에서 빛 → 4단계 명암, 재질별 진한 외곽선, 등급별 보석·오라·반짝임
//  재질 색은 재료(아이템 레벨 10단위, 제2 던전 재료 포함) 15가지
const N = 18;
const MAT_RAMP = [
  ["#f4d8a8", "#d4a066", "#9a6a3a", "#5e3e1e"], // 나무
  ["#ffe2b0", "#e8a868", "#ae6e36", "#6a3e1a"], // 청동
  ["#ffffff", "#ccd2dc", "#8e96a4", "#525866"], // 철
  ["#ffffff", "#c4dcf2", "#7c9cc0", "#44587c"], // 강철
  ["#f0ffff", "#a0ecff", "#48b4dc", "#226890"], // 미스릴
  ["#b8bcc8", "#6c7080", "#40424e", "#1e1f28"], // 흑철
  ["#f6e6ff", "#cca6ff", "#8a60d4", "#4a2c84"], // 아다만
  ["#fffcf2", "#f2e4c4", "#c8b088", "#86704c"], // 용골
  ["#ffffff", "#fff2c0", "#e8c464", "#a47e30"], // 성은
  ["#ffd0dc", "#ff6a8a", "#c42a4c", "#661028"], // 혼돈
  ["#f0fffc", "#a4f4e4", "#3cbab2", "#126468"], // 심해진주
  ["#fff4ff", "#ffb4f4", "#d26ee4", "#782c96"], // 공명수정
  ["#ffb0a0", "#e04444", "#8c1c26", "#480a12"], // 혈철
  ["#fffcea", "#f2e2aa", "#c2a85e", "#6a5a28"], // 영겁은
  ["#f0f2ff", "#acb4ff", "#6a62e2", "#2e2678"], // 성운
];
const WOOD = ["#e8b47a", "#b07a44", "#7a4e26", "#4a2c12"];
const GOLD = ["#fff6c0", "#ffd24a", "#d09a1c", "#7e560a"];
const LEATHER = ["#e0b086", "#ae7a4e", "#7a4e2c", "#462a14"];
const STRING = ["#ffffff", "#e8e2d4", "#b8b0a0", "#7a7468"];
const PAPER = ["#fffdf2", "#f2e8cc", "#d2c49c", "#9a8a62"];
const CORE = ["#3a3446", "#26222e", "#18151e", "#0c0a10"];
const GEM = { 일반: null, 희귀: ["#e6f4ff", "#7cc4ff", "#2e7ee0", "#163e8a"], 영웅: ["#fbeaff", "#dc9cff", "#9a50e0", "#4e2290"], 전설: ["#fff4d0", "#ffc04a", "#e07a14", "#82400a"], 신화: ["#fff0f0", "#ff7a8a", "#e02040", "#7a0a20"] };
const AURA = { 전설: "#ffb347", 신화: "#ff4a64", 심연: "#70f4e8" };
const TITLE_AURA = {
  "태초의": "#fff0b0", "몰락한 왕의": "#ff647d", "별을 삼킨": "#c18aff",
  "영원한": "#65d9e5", "잊힌 신의": "#ffe4a0", "끝없는": "#7caaff",
  "심연을 본": "#70f4e8", "황혼의": "#d88aff",
};
// 옷감 색: 등급을 살짝 닮게
const CLOTH = { 일반: ["#d8dce4", "#9aa2b2", "#626a7c", "#363c4a"], 희귀: ["#cfe6ff", "#6a9ee0", "#3a62a8", "#1c3466"], 영웅: ["#eedcff", "#a678d8", "#6a44a0", "#3a2260"], 전설: ["#fff0d0", "#e0a050", "#a0601e", "#5a320c"], 신화: ["#ffe0e4", "#e05a6a", "#a02436", "#5a0c1a"] };

function makeBuf() { return { c: new Array(N * N).fill(null), hi: new Set() }; }
function put(B, x, y, ch) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) B.c[y * N + x] = ch; }
function line(B, x0, y0, x1, y1, ch, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) put(B, x - (w - 1) / 2 + a, y - (w - 1) / 2 + b, ch);
  }
}
function rect(B, x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(B, x + i, y + j, ch); }
function disc(B, cx, cy, r, ch, sy = 1) { for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) if ((x * x) + (y * y) / (sy * sy) <= r * r + 0.3) put(B, cx + x, cy + y, ch); }
function poly(B, pts, ch) {
  const ys = pts.map((p) => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) for (let x = 0; x < N; x++) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) put(B, x, y, ch);
  }
}
const hl = (B, x, y) => { if (x >= 0 && y >= 0 && x < N && y < N) B.hi.add(y * N + x); };
const bez = (p0, c, p1, t) => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];

/** 모양 그리기 (채널: M 재질 · W 나무 · G 금 · R 보석 · L 가죽 · C 옷감 · S 줄 · P 종이 · K 어두운 속) */
function shape(B, it) {
  const v = it.variant ?? 0;
  switch (it.slot) {
    case "weapon":
      switch (it.type) {
        case "sword": line(B, 7, 10, 15, 2, "M", 2); for (let k = 0; k < 7; k++) hl(B, 9 + k, 7 - k); line(B, 3, 8, 8, 13, "G", 2); line(B, 5, 12, 2, 15, "W", 2); disc(B, 2, 15, 1, "G"); put(B, 6, 11, "R"); break;
        case "greatsword": line(B, 7, 10, 16, 1, "M", 3); for (let k = 0; k < 8; k++) hl(B, 9 + k, 6 - k); put(B, 16, 0, "M"); line(B, 2, 7, 9, 14, "G", 2); line(B, 5, 12, 2, 15, "W", 2); disc(B, 1.5, 15.5, 1, "G"); put(B, 6, 11, "R"); put(B, 5, 10, "R"); break;
        case "dagger": poly(B, [[7, 10], [13, 3], [14, 4], [8, 11]], "M"); line(B, 7, 10, 14, 3, "M", 2); hl(B, 11, 6); hl(B, 12, 5); line(B, 4, 8, 9, 13, "G", 1); line(B, 6, 11, 3, 14, "L", 2); disc(B, 3, 14, 1, "G"); put(B, 6, 11, "R"); break;
        case "club": line(B, 3, 15, 10, 8, "W", 2); disc(B, 12, 6, 3.6, "W"); for (const [x, y] of [[10, 4], [14, 5], [12, 8], [13, 3], [9, 7]]) put(B, x, y, "M"); line(B, 6, 12, 7, 11, "L", 2); break;
        case "mace": line(B, 3, 15, 10, 8, "W", 1); line(B, 4, 14, 6, 12, "L", 2); disc(B, 12, 6, 3, "M"); for (const [x, y] of [[12, 1], [16, 6], [12, 10], [8, 6], [15, 3], [9, 3]]) put(B, x, y, "M"); put(B, 12, 6, "R"); put(B, 11, 5, "R"); break;
        case "hammer": line(B, 3, 15, 11, 7, "W", 2); line(B, 8, 3, 15, 10, "M", 4); line(B, 9, 5, 13, 9, "K", 1); put(B, 11, 7, "R"); hl(B, 8, 2); hl(B, 9, 2); line(B, 5, 13, 6, 12, "L", 2); break;
        case "staff": line(B, 2, 16, 11, 7, "W", 2); line(B, 4, 14, 5, 13, "L", 2); for (let k = 0; k < 6; k++) { const a = -0.3 + k * 1.15; put(B, 13.5 + Math.cos(a) * 3.2, 4.5 + Math.sin(a) * 3.2, "G"); } disc(B, 13.5, 4.5, 2, "R"); hl(B, 13, 3); break;
        case "bow": {
          const p0 = [4, 16], c = [-1, -1], p1 = [16, 4];
          for (let t = 0; t <= 1; t += 0.02) { const [x, y] = bez(p0, c, p1, t); put(B, x, y, "W"); put(B, x + 0.6, y + 0.6, "W"); }
          line(B, 4, 16, 16, 4, "S", 1);
          for (const t of [0.46, 0.5, 0.54]) { const [x, y] = bez(p0, c, p1, t); put(B, x, y, "L"); put(B, x + 1, y + 1, "L"); }
          put(B, 4, 16, "G"); put(B, 16, 4, "G"); put(B, 3, 16, "G"); put(B, 16, 3, "G");
          line(B, 6, 12, 12, 6, "W", 1); put(B, 13, 5, "M"); put(B, 14, 4, "M"); put(B, 5, 12, "R"); put(B, 6, 13, "R");
          break;
        }
        case "knuckle":
          // 건틀릿 주먹: 접힌 손가락 4개(마디 징) + 엄지 + 손목 보호대
          poly(B, [[4, 5], [14, 5], [15, 7], [15, 11], [4, 12], [3, 8]], "M");
          for (const x of [6.5, 9, 11.5]) line(B, x, 6, x, 10, "K", 1);
          line(B, 4, 11, 11, 11, "M", 2);
          for (const x of [5, 7.6, 10.2, 12.8]) { put(B, x, 4, "M"); hl(B, Math.round(x), 5); }
          rect(B, 5, 13, 9, 4, "L"); line(B, 5, 13, 13, 13, "G", 1); put(B, 9, 15, "R"); put(B, 9, 8, "R");
          break;
      }
      break;
    case "offhand":
      if (it.type === "shield") { poly(B, [[3, 2], [15, 2], [15, 9], [9, 16.5], [3, 9]], "M"); poly(B, [[5, 4], [13, 4], [13, 9], [9, 14], [5, 9]], "C"); line(B, 9, 4, 9, 13, "G", 1); line(B, 5, 7, 13, 7, "G", 1); disc(B, 9, 7, 1.2, "R"); }
      else if (it.type === "quiver") { line(B, 5, 15, 11, 6, "L", 4); line(B, 4, 13, 9, 6, "G", 1); for (const [x, y] of [[9, 2], [12, 3], [14, 5]]) { line(B, x, y, x - 2, y + 4, "W", 1); put(B, x, y, "C"); put(B, x + 1, y - 1, "C"); put(B, x - 1, y - 1, "S"); } put(B, 8, 11, "R"); }
      else if (it.type === "tome") { rect(B, 3, 3, 11, 13, "C"); rect(B, 13, 4, 2, 11, "P"); for (const [x, y] of [[3, 3], [12, 3], [3, 15], [12, 15]]) { put(B, x, y, "G"); } line(B, 5, 3, 5, 15, "G", 1); disc(B, 9, 9, 2, "G"); disc(B, 9, 9, 1, "R"); }
      else { poly(B, [[6, 9], [13, 2], [12, 6], [8, 11]], "M"); line(B, 7, 10, 13, 3, "M", 2); hl(B, 10, 5); hl(B, 11, 4); line(B, 4, 8, 9, 13, "G", 1); line(B, 6, 11, 3, 14, "L", 2); disc(B, 3, 14, 1, "G"); put(B, 6, 11, "R"); }
      break;
    case "helmet":
      if (v === 0) { poly(B, [[9, 0.5], [14, 4], [15.5, 10], [15, 16], [3, 16], [2.5, 10], [4, 4]], "C"); disc(B, 9, 10.5, 3.3, "K", 1.15); line(B, 5, 15, 13, 15, "M", 1); put(B, 9, 15, "R"); put(B, 9, 3, "M"); put(B, 10, 2, "C"); }
      else if (v === 1) { disc(B, 9, 9, 6, "M"); rect(B, 3, 9, 13, 5, "M"); rect(B, 5, 10, 9, 2, "K"); rect(B, 8, 10, 2, 5, "M"); line(B, 9, 2, 9, 9, "G", 1); poly(B, [[9, 1], [14, 0], [12, 3]], "C"); put(B, 9, 5, "R"); }
      else if (v === 2) { disc(B, 9, 8, 4.6, "M"); rect(B, 1, 10, 16, 2, "M"); rect(B, 4, 12, 10, 3, "K"); line(B, 2, 10, 15, 10, "G", 1); put(B, 9, 6, "R"); }
      else { rect(B, 4, 5, 10, 11, "M"); disc(B, 9, 5.5, 5, "M", 0.7); rect(B, 5, 8, 8, 1, "K"); rect(B, 8, 8, 2, 5, "K"); for (const [x, y] of [[5, 12], [6, 14], [12, 14], [13, 12]]) put(B, x, y, "K"); line(B, 9, 2, 9, 6, "G", 1); put(B, 9, 2, "R"); }
      break;
    case "armor":
      if (v === 0) { poly(B, [[4, 3], [14, 3], [16, 6], [14, 8], [14, 16], [4, 16], [4, 8], [2, 6]], "L"); line(B, 9, 4, 9, 15, "K", 1); for (let y = 6; y < 15; y += 2) { put(B, 8, y, "S"); put(B, 10, y, "S"); } rect(B, 4, 12, 11, 1, "M"); put(B, 9, 12, "R"); }
      else if (v === 1) { poly(B, [[4, 3], [14, 3], [16, 7], [14, 9], [14, 16], [4, 16], [4, 9], [2, 7]], "M"); for (let y = 4; y < 16; y++) for (let x = 3; x < 16; x++) if ((x + y) % 2 === 0 && B.c[y * N + x] === "M") B.c[y * N + x] = "K"; rect(B, 4, 12, 11, 1, "L"); put(B, 9, 12, "G"); rect(B, 7, 3, 5, 2, "C"); put(B, 9, 4, "R"); }
      else if (v === 2) { poly(B, [[5, 4], [13, 4], [14, 16], [4, 16]], "M"); disc(B, 3.5, 5.5, 2.6, "M"); disc(B, 14.5, 5.5, 2.6, "M"); line(B, 5, 9, 13, 9, "K", 1); line(B, 5, 12, 13, 12, "K", 1); line(B, 9, 4, 9, 15, "G", 1); put(B, 3, 5, "G"); put(B, 15, 5, "G"); disc(B, 9, 7, 1, "R"); }
      else { poly(B, [[5, 2], [13, 2], [16, 6], [14, 8], [15, 16], [3, 16], [4, 8], [2, 6]], "C"); poly(B, [[7, 2], [11, 2], [9, 6]], "K"); rect(B, 4, 11, 11, 2, "L"); put(B, 9, 11, "G"); put(B, 9, 12, "G"); line(B, 6, 7, 6, 10, "M", 1); line(B, 12, 7, 12, 10, "M", 1); put(B, 9, 8, "R"); }
      break;
    case "trinket":
      if (v === 0) { for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; put(B, 9 + Math.cos(a) * 5, 11 + Math.sin(a) * 3.4, "G"); put(B, 9 + Math.cos(a) * 4.4, 11.4 + Math.sin(a) * 3, "G"); } poly(B, [[6, 6], [12, 6], [13, 4], [9, 1], [5, 4]], "M"); disc(B, 9, 4, 2.2, "R"); hl(B, 8, 3); }
      else if (v === 1) { for (let k = 0; k <= 20; k++) { const t = k / 20; const [x, y] = bez([2, 2], [9, 14], [16, 2], t); put(B, x, y, k % 2 ? "G" : "M"); } poly(B, [[9, 9], [12, 12], [9, 17], [6, 12]], "M"); disc(B, 9, 12.5, 1.7, "R"); put(B, 9, 9, "G"); }
      else if (v === 2) { poly(B, [[5, 4], [13, 4], [14, 15], [4, 15]], "P"); line(B, 9, 0, 9, 4, "S", 1); for (const [x, y] of [[7, 7], [9, 6], [11, 7], [9, 9], [7, 11], [11, 11], [9, 13]]) put(B, x, y, "C"); rect(B, 4, 4, 10, 1, "M"); disc(B, 9, 10, 1, "R"); }
      else { for (const cx of [5, 13]) { disc(B, cx, 2.6, 1.6, "G"); put(B, cx, 2.6, "K"); line(B, cx, 4.5, cx, 6.5, "G", 1); poly(B, [[cx, 6.6], [cx + 2.6, 10.4], [cx, 15.2], [cx - 2.6, 10.4]], "R"); put(B, cx, 6.8, "M"); hl(B, cx - 1, 9); } }
      break;
  }
}

function hexToRgb(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const mix = (a, b, k) => { const A = hexToRgb(a), Bc = hexToRgb(b); return `rgb(${Math.round(A[0] + (Bc[0] - A[0]) * k)},${Math.round(A[1] + (Bc[1] - A[1]) * k)},${Math.round(A[2] + (Bc[2] - A[2]) * k)})`; };

export function matIndex(it) {
  if (Number.isInteger(it.mat) && it.mat >= 0 && it.mat < MAT_RAMP.length) return it.mat;
  return Math.max(0, Math.min(MAT_RAMP.length - 1, Math.floor(((it.ilvl ?? 1) - 1) / 10)));
}
/** 재질의 대표색을 UI 카드의 얇은 장식에 공유한다. */
export function materialAccent(it) {
  return MAT_RAMP[matIndex(it)][1];
}

export function itemIcon(it) {
  const mi = matIndex(it);
  const key = `${it.slot}|${it.type}|${it.variant}|${it.rarity}|${mi}|${it.relic ?? ""}|${it.relicColor ?? ""}|${it.title ?? ""}|${it.ench ?? ""}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = N; cv.height = N;
  const g = cv.getContext("2d");
  const B = makeBuf();
  shape(B, it);
  const gem = GEM[it.rarity] ?? (it.rarity === "심연" ? ["#efffff", "#8efff2", "#36c8c0", "#12666c"] : null);
  const RAMP = { M: MAT_RAMP[mi], W: WOOD, G: GOLD, L: LEATHER, S: STRING, P: PAPER, K: CORE, C: CLOTH[it.rarity] ?? CLOTH.일반, R: gem ?? MAT_RAMP[mi] };
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : B.c[y * N + x]);
  // 오라 (전설·신화·제2 던전 유물): 외곽선 바깥으로 은은한 빛. 유물은 유물 고유 색
  const aura = it.relic ? it.relicColor ?? "#ff75d8" : (TITLE_AURA[it.title] ?? AURA[it.rarity]);
  if (aura) {
    // 부드러운 빛: 외곽선 바깥으로 갈수록 옅게 (대각선 방향은 더 옅게)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (at(x, y)) continue;
      let d = 9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (at(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy));
      if (d > 1.05 && d < 3.2) { g.globalAlpha = d < 2.1 ? 0.24 : 0.09; P(g, aura, x, y); }
    }
    g.globalAlpha = 1;
  }
  // 외곽선: 바로 옆 재질의 가장 어두운 색을 더 어둡게 (선택적 외곽선). 전설·신화·각인은 외곽선에 빛 색을 섞음
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (at(x, y)) continue;
    const nb = at(x, y - 1) ?? at(x - 1, y) ?? at(x + 1, y) ?? at(x, y + 1);
    if (nb) { const o = mix(RAMP[nb][3], "#07050c", nb === "K" ? 0.3 : 0.62); P(g, o, x, y); if (aura) { g.globalAlpha = 0.3; P(g, aura, x, y); g.globalAlpha = 1; } }
  }
  // 칠하기: 빛은 왼쪽 위에서. 위·왼쪽이 비면 밝게, 아래·오른쪽이 비면 어둡게
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = at(x, y);
    if (!ch) continue;
    const same = (dx, dy) => at(x + dx, y + dy) === ch;
    let tone = 2;
    const lit = !same(0, -1) || !same(-1, 0), dark = !same(0, 1) || !same(1, 0);
    if (lit && !dark) tone = !same(-1, -1) && !same(0, -1) && !same(-1, 0) ? 0 : 1;
    else if (dark && !lit) tone = 3;
    else if (lit && dark) tone = 1;
    else tone = (x + y) % 7 === 0 ? 1 : 2;
    if (ch === "R" && gem) tone = Math.min(tone, 2) === 0 ? 0 : tone === 3 ? 2 : 1; // 보석은 밝게
    if (B.hi.has(y * N + x)) tone = 0;
    P(g, RAMP[ch][tone], x, y);
  }
  // 보석 반짝임 (영웅 이상) · 신화 별빛
  if (gem && it.rarity !== "희귀") for (let i = 0; i < N * N; i++) if (B.c[i] === "R" && B.c[i - N] !== "R" && B.c[i - 1] !== "R") { P(g, "#ffffff", i % N, (i / N) | 0); break; }
  if (it.rarity === "신화") for (const [x, y] of [[1, 1], [16, 13], [2, 9]]) if (!at(x, y)) { P(g, "#ffd0d8", x, y); g.globalAlpha = 0.5; P(g, "#ff8a9a", x - 1, y); P(g, "#ff8a9a", x + 1, y); P(g, "#ff8a9a", x, y - 1); P(g, "#ff8a9a", x, y + 1); g.globalAlpha = 1; }
  // 접두 수식어별 작은 문장: 같은 재료·종류라도 이름의 개성이 아이콘에 드러난다.
  if (TITLE_AURA[it.title]) {
    const tc = TITLE_AURA[it.title];
    P(g, "#080612", 1, 1, 5, 5);
    P(g, tc, 2, 2, 3, 1); P(g, tc, 3, 1, 1, 3); P(g, "#ffffff", 3, 2);
  }
  // 인챈트 각인: 수선은 금색, 나머지는 보랏빛 작은 룬.
  if (it.ench) {
    const ec = it.ench === "mend" ? "#ffe08a" : "#d8a8ff";
    P(g, "#080612", 1, 14, 4, 3); P(g, ec, 2, 14, 2, 1); P(g, ec, 3, 13, 1, 3); P(g, "#ffffff", 3, 14);
  }
  // 제2 던전 유물 표시: 오른쪽 아래 작은 마름모 (유물 색)
  if (it.relic) { const rc = it.relicColor ?? "#ff75d8"; P(g, "#0a0612", 14, 15, 3, 1); P(g, "#0a0612", 15, 14, 1, 3); P(g, "#ffffff", 15, 15); g.globalAlpha = 0.85; P(g, rc, 14, 15); P(g, rc, 16, 15); P(g, rc, 15, 14); P(g, rc, 15, 16); g.globalAlpha = 1; }
  cache.set(key, cv);
  return cv;
}

// ── 스킬 아이콘: 스킬 종류(근접·투사체·범위·버프·회복·이동…)로 모양, 이펙트 속성(불·얼음·신성…)으로 색
const ELEM = [["fire", "#ff8a3a"], ["ice", "#8ae6ff"], ["holy", "#ffe27a"], ["shadow", "#b47aff"], ["nature", "#7ae06a"], ["arcane", "#d08cff"], ["lightning", "#fff05a"], ["explosions", "#ff6a3a"], ["scifi", "#6affe0"], ["weather", "#9ad0ff"]];
const GRADE_TINT = { 일반: "#d8dde6", 희귀: "#6ab4ff", 영웅: "#d8b0ff", 전설: "#ffbe5a", 신화: "#ff6a7a" };
export function skillColor(sk) {
  const fx = JSON.stringify(sk.fx ?? {});
  for (const [k, c] of ELEM) if (fx.includes(`"${k}/`)) return c;
  return GRADE_TINT[sk.grade] ?? "#d8dde6";
}
function kindOf(sk) {
  const ds = (sk.steps ?? []).map((s) => s.do);
  if (sk.kind === "passive") return "passive";
  if (ds.includes("heal")) return "heal";
  if (ds.includes("dash") || ds.includes("blink")) return "dash";
  if (ds.includes("shield")) return "shield";
  if (ds.includes("parry")) return "parry";
  if (ds.includes("taunt")) return "taunt";
  if (ds.includes("device")) return "device";
  if (ds.includes("channel")) return "channel";
  if (ds.includes("proj") || ds.includes("line")) return sk.anim === "shoot" ? "arrow" : "bolt";
  if (ds.includes("zone")) return "zone";
  if (ds.includes("area") || ds.includes("circle")) return "burst";
  if (ds.includes("melee")) return sk.anim === "thrust" ? "thrust" : "slash";
  if (ds.includes("buff")) return "buff";
  return "star";
}
const urls = new Map();
/** 스킬 아이콘 이미지 주소 (버튼용) */
export function skillIconURL(sk) {
  // 무기별 기본 공격은 그 무기 그림으로
  if (!urls.has(sk.id) && sk.weaponBasic) urls.set(sk.id, itemIcon({ slot: "weapon", type: sk.weaponBasic, variant: 0, rarity: "일반", ilvl: 21 }).toDataURL());
  if (!urls.has(sk.id)) urls.set(sk.id, skillIcon(sk).toDataURL());
  return urls.get(sk.id);
}
export function skillIcon(sk) {
  const key = "sk:" + sk.id;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = 24; cv.height = 24;
  const g = cv.getContext("2d");
  const c = skillColor(sk), ink = "#120e1a", wh = "#ffffff";
  const px = (x, y, color, w = 1, h = w) => P(g, color, Math.round(x), Math.round(y), w, h);
  const path = (pts, color, width = 2) => {
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = "square"; g.lineJoin = "miter";
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  };
  const poly = (pts, color) => {
    g.fillStyle = color; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
  };
  const diamond = (x, y, rx, ry, color) => poly([[x, y-ry],[x+rx,y],[x,y+ry],[x-rx,y]], color);
  const ray = (x, y, angle, len, color, width=1) => path([[x-Math.cos(angle)*2,y-Math.sin(angle)*2],[x+Math.cos(angle)*len,y+Math.sin(angle)*len]],color,width);
  const kind = kindOf(sk);
  switch (kind) {
    case "slash":
      path([[3,20],[8,13],[14,7],[21,3]], ink, 7);
      path([[3,19],[8,12],[14,6],[21,2]], c, 4);
      path([[8,13],[13,8],[18,4]], wh, 1);
      path([[4,20],[6,19]], wh, 1);
      break;
    case "thrust":
    case "arrow":
      path([[2,17],[14,9]], ink, 6);
      path([[3,16],[14,9]], kind === "arrow" ? "#c89060" : c, 3);
      poly([[11,5],[22,2],[18,13],[15,10]], ink);
      poly([[13,5],[21,3],[18,11],[15,9]], c);
      path([[14,7],[19,4]], wh, 1);
      if (kind === "arrow") path([[3,12],[6,16],[3,19]], c, 2);
      break;
    case "bolt":
      poly([[3,10],[11,10],[8,3],[21,3],[13,12],[17,12],[5,22],[9,13],[4,13]], ink);
      poly([[5,10],[12,10],[10,5],[19,5],[12,12],[15,12],[7,19],[10,12],[5,12]], c);
      path([[11,7],[16,7]], wh, 1);
      break;
    case "burst":
      for (let i=0;i<8;i++) ray(12,12,i*Math.PI/4,10,i%2?c:wh,i%2?2:1);
      diamond(12,12,5,5,ink); diamond(12,12,3,3,c); px(11,11,wh,2,2);
      break;
    case "zone":
      g.strokeStyle=c; g.lineWidth=2; g.beginPath(); g.arc(12,12,9,0,Math.PI*2); g.stroke();
      g.strokeStyle=wh; g.lineWidth=1; g.beginPath(); g.arc(12,12,5,0,Math.PI*2); g.stroke();
      for(let i=0;i<8;i++){const angle=i*Math.PI/4;px(12+Math.cos(angle)*9-1,12+Math.sin(angle)*9-1,c,2,2);}
      diamond(12,12,3,4,wh);
      break;
    case "buff":
      poly([[3,17],[5,8],[9,12],[12,4],[15,12],[19,8],[21,17],[16,20],[8,20]],ink);
      poly([[5,16],[7,10],[10,14],[12,7],[14,14],[18,10],[19,16],[15,18],[9,18]],c);
      diamond(12,12,2,4,wh); px(11,2,wh,2,2);
      break;
    case "heal":
      poly([[8,2],[16,2],[16,8],[22,8],[22,16],[16,16],[16,22],[8,22],[8,16],[2,16],[2,8],[8,8]],ink);
      poly([[9,4],[15,4],[15,9],[20,9],[20,15],[15,15],[15,20],[9,20],[9,15],[4,15],[4,9],[9,9]],c);
      px(10,7,wh,4,10); px(7,10,wh,10,4);
      break;
    case "shield":
      poly([[12,1],[22,5],[20,15],[12,23],[4,15],[2,5]],ink);
      poly([[12,3],[20,6],[18,14],[12,20],[6,14],[4,6]],c);
      path([[12,5],[12,18]],wh,1); path([[7,10],[17,10]],wh,1);
      diamond(12,10,2,3,"#fff6c0");
      break;
    case "dash":
      path([[2,5],[10,12],[2,19]],ink,6); path([[8,5],[16,12],[8,19]],ink,6);
      path([[2,5],[10,12],[2,19]],c,3); path([[8,5],[16,12],[8,19]],wh,2);
      path([[15,5],[21,12],[15,19]],c,2);
      break;
    case "parry":
      path([[4,3],[19,20]],ink,5); path([[20,3],[5,20]],ink,5);
      path([[4,3],[19,20]],c,2); path([[20,3],[5,20]],wh,2);
      diamond(12,12,4,4,c);
      break;
    case "taunt":
      poly([[3,5],[8,9],[12,2],[16,9],[21,5],[19,20],[5,20]],ink);
      poly([[5,8],[9,11],[12,5],[15,11],[19,8],[17,18],[7,18]],c);
      path([[8,15],[16,15]],wh,1);
      break;
    case "device":
      poly([[7,1],[17,1],[18,6],[23,9],[20,17],[15,19],[12,23],[7,19],[2,17],[1,9],[6,6]],ink);
      poly([[8,4],[16,4],[17,8],[20,10],[18,16],[13,18],[11,20],[8,17],[4,15],[4,10],[7,8]],c);
      g.strokeStyle=wh;g.lineWidth=1.5;g.beginPath();g.arc(12,12,4,0,Math.PI*2);g.stroke();diamond(12,12,2,3,wh);
      break;
    case "channel":
      g.strokeStyle=ink;g.lineWidth=5;g.beginPath();g.arc(12,12,8,-1.7,4.8);g.stroke();
      g.strokeStyle=c;g.lineWidth=2;g.beginPath();g.arc(12,12,8,-1.7,4.8);g.stroke();
      g.strokeStyle=wh;g.lineWidth=1;g.beginPath();g.arc(12,12,4,0,Math.PI*1.65);g.stroke();
      diamond(12,12,3,4,wh);
      break;
    case "passive":
      poly([[2,12],[7,5],[17,5],[22,12],[17,19],[7,19]],ink);
      poly([[4,12],[8,7],[16,7],[20,12],[16,17],[8,17]],c);
      g.strokeStyle=wh;g.lineWidth=1.5;g.beginPath();g.ellipse(12,12,5,3,0,0,Math.PI*2);g.stroke();
      diamond(12,12,2,3,wh);
      break;
    default:
      for(let i=0;i<8;i++) ray(12,12,i*Math.PI/4,10,c,2);
      diamond(12,12,6,6,ink); diamond(12,12,4,4,c); px(11,11,wh,2,2);
  }
  centerArt(cv);
  cache.set(key, cv);
  return cv;
}

/** 그림이 칸 한쪽으로 치우쳐 있으면 가운데로 옮김 (24x24 아이콘) */
function centerArt(cv) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height;
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return;
  const dx = Math.round((W - 1 - x1 - x0) / 2), dy = Math.round((H - 1 - y1 - y0) / 2);
  if (!dx && !dy) return;
  const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
  tmp.getContext("2d").drawImage(cv, 0, 0);
  g.clearRect(0, 0, W, H); g.drawImage(tmp, dx, dy);
}

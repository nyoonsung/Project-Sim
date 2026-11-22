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
// ── 스킬 아이콘 v2: 직업·행동·원소별 고유 실루엣을 가진 32px 픽셀풍 엠블럼
const urls = new Map();
const GRADE_TINT = { 일반: "#b9c4d4", 희귀: "#62b9ff", 영웅: "#c18aff", 전설: "#ffbf59", 신화: "#ff617f" };
const CLASS_TINT = {
  sword: ["#b84b54", "#ffb08c", "#571d36"],
  fist: ["#e36c32", "#ffd18a", "#5c281b"],
  archer: ["#4aa979", "#b8f2a2", "#183b37"],
  rogue: ["#8a5bc2", "#e2a9ff", "#281943"],
  mage: ["#596fe0", "#b4d6ff", "#202b68"],
  priest: ["#d5a63c", "#fff0a0", "#59401c"],
  smith: ["#3eaaa5", "#b2fff0", "#173f4b"],
};
function skillPalette(sk) {
  const source = String(sk.name ?? "") + " " + String(sk.id ?? "") + " " + JSON.stringify(sk.fx ?? {});
  const rules = [
    [/화룡|화염|불꽃|폭염|화상|fire|flame|meteor/i, ["#ff6537", "#ffe39a", "#6a1d24"]],
    [/얼음|빙|서리|눈보라|frost|ice|blizzard/i, ["#54bce8", "#e0fbff", "#163f70"]],
    [/번개|뇌령|천둥|전격|연쇄|lightning|thunder|chain/i, ["#f3d34f", "#fff9bf", "#604719"]],
    [/독|맹독|부식|poison|toxic/i, ["#82cb4d", "#e0ff9b", "#244a25"]],
    [/성역|성광|신의|천상|백광|광휘|축복|holy|radiance/i, ["#e8c35d", "#fff6c9", "#59441c"]],
    [/그림자|암살|어둠|혈월|무음|shadow|void|curse/i, ["#a16be0", "#f0d4ff", "#321b5a"]],
    [/바람|질풍|회오리|돌풍|wind|gale/i, ["#55cbb7", "#d6fff1", "#194e51"]],
    [/대지|산사태|지진|진동|quake|earth/i, ["#bd8a50", "#ffe0a6", "#563821"]],
  ];
  for (const [re, colors] of rules) if (re.test(source)) return colors;
  const cls = CLASS_TINT[sk.cls];
  if (cls) return cls;
  return [GRADE_TINT[sk.grade] ?? "#b9c4d4", "#ffffff", "#302a3c"];
}
export function skillColor(sk) { return skillPalette(sk)[0]; }

const ICON_MOTIF = {
  c_thrust:"ray", c_shot:"ray", c_bolt:"crystal", c_bash:"impact", c_smite:"impact", c_jab:"impact", c_stab:"shadow", c_pound:"impact", c_slash:"arc", c_dash:"dash", c_firstaid:"heart",
  sw_gale:"wind", sw_thrust:"ray", sw_block:"shield", sw_charge:"dash", sw_raid:"impact", sw_lowcut:"moon", sw_kick:"kick", sw_shoulder:"impact", sw_fiveslash:"twin", sw_moon:"moon", sw_draw:"arc", sw_vital:"target", sw_firedragon:"dragon", sw_thunder:"lightning", sw_eo_burst:"orbit", sw_eo_guard:"shield", sw_eo_rain:"rain", sw_final:"arc",
  fi_jab:"impact", fi_counter:"shield", fi_imun:"impact", fi_combo:"twin", fi_palm:"wave", fi_twinclaw:"twin", fi_meteorkick:"meteor", fi_thousand:"impact", fi_sidestep:"wind", fi_dive:"dash", fi_burst:"impact", fi_tiger:"dragon", fi_reddragon:"dragon", fi_spinkick:"kick", fi_whiteheat:"flame", fi_rising:"kick", fi_trip:"trap", fi_landslide:"vortex", fi_dance:"wind", fi_acupoint:"target", fi_suppress:"target", fi_final:"impact",
  ar_shot:"ray", ar_mastery:"crest", ar_double:"twin", ar_regain:"crest", ar_triple:"twin", ar_multi:"rain", ar_volley:"rain", ar_entangle:"vines", ar_lethal:"target", ar_evasion:"dash", ar_absolute:"crest", ar_storm:"wind", ar_explosion:"meteor", ar_bombard:"rain", ar_pierce:"lightning", ar_rain:"rain", ar_snipe:"target", ar_pinpoint:"target", ar_final:"rain",
  ro_cut:"shadow", ro_twin:"twin", ro_smoke:"smoke", ro_footwork:"wind", ro_shadowstep:"dash", ro_poison:"poison", ro_wire:"trap", ro_check:"target", ro_open:"shadow", ro_afterimage:"dash", ro_track:"target", ro_fan:"vortex", ro_bloodmoon:"moon", ro_finale:"shadow", ro_hunt:"target", ro_final:"shadow",
  ma_arcane:"crystal", ma_frostseal:"ice", ma_precise:"target", ma_firetrail:"flame", ma_blink:"vortex", ma_echo:"wave", ma_gravity:"vortex", ma_meteor:"meteor", ma_cut:"arc", ma_recall:"orbit", ma_chain:"lightning", ma_blizzard:"ice", ma_final:"meteor",
  pr_bolt:"ray", pr_answer:"holy", pr_afterglow:"orbit", pr_shard:"crystal", pr_bell:"bell", pr_halo:"holy", pr_sanctum:"holy", pr_ward:"shield", pr_relief:"heart", pr_corridor:"rune", pr_hymn:"crest", pr_convert:"vortex", pr_radiance:"holy", pr_martyr:"heart", pr_lightray:"ray", pr_grace:"wave", pr_final:"holy",
  sm_hammer:"forge", sm_rivet:"shield", sm_armor:"shield", sm_taunt:"crest", sm_mine:"trap", sm_drone:"orbit", sm_repair:"heart", sm_wall:"shield", sm_moth:"orbit", sm_circuit:"lightning", sm_rivetgun:"ray", sm_overload:"forge", sm_final:"forge",
};
function motifOf(sk) {
  const id = sk.id ?? "", name = sk.name ?? "";
  if (ICON_MOTIF[id]) return ICON_MOTIF[id];
  const source = String(id) + " " + String(name) + " " + JSON.stringify(sk.fx ?? {});
  if (/ar_(rain|bombard)|애로우 레인|화살 폭격/.test(source)) return "rain";
  if (/sw_moon|ro_bloodmoon|만월|혈월/.test(source)) return "moon";
  if (/sw_fiveslash|ro_twin|ar_triple|ar_multi|double|twin|쌍날|오연|연환|천수/.test(source)) return "twin";
  if (/fi_meteorkick|fi_spinkick|fi_rising|발차기|유성각|회천각|승룡각/.test(source)) return "kick";
  if (/sw_gale|fi_sidestep|질풍|횡이동|wind/.test(source)) return "wind";
  if (/ro_wire|sm_mine|덫|철사|지뢰|trap/.test(source)) return "trap";
  if (/ar_entangle|root-snare|인탱글|뿌리/.test(source)) return "vines";
  if (/ar_evasion|ar_absolute|ar_mastery|ar_regain|ma_precise|정밀 시전|마스터리|리게인|이베이젼|앱솔루트/.test(source)) return "crest";
  if (/ro_check|ro_track|fi_acupoint|급소|약점 추적|점혈|표식/.test(source)) return "target";
  if (/ma_firetrail|화염 궤적|flame/.test(source)) return "flame";
  if (/ma_gravity|중력 우물|vortex/.test(source)) return "vortex";
  if (/ma_echo|잔향|echo|공명/.test(source)) return "wave";
  if (/pr_bell|징벌의 종|bell/.test(source)) return "bell";
  if (/sm_drone|sm_moth|축전 방벽 드론|수리 나방/.test(source)) return "orbit";
  if (/ma_chain|연쇄 번개|번개|뇌령|lightning/.test(source)) return "lightning";
  if (/ma_blizzard|눈보라|서리|얼음|frost|ice/.test(source)) return "ice";
  if (/firedragon|reddragon|화룡|적룡/.test(source)) return "dragon";
  if (/meteor|유성|낙점/.test(source)) return "meteor";
  if (/final|궁극|종막|아포칼립스|신의 심판|천궁 강림|천공의 망치/.test(source)) {
    if (sk.cls === "archer") return "rain";
    if (sk.cls === "priest") return "holy";
    if (sk.cls === "smith") return "forge";
    if (sk.cls === "rogue") return "shadow";
    if (sk.cls === "mage") return "meteor";
    if (sk.cls === "fist") return "impact";
    if (sk.cls === "sword") return "blade";
  }
  if (/heal|회복|응급|구휼|은총|relief|firstaid/.test(source) || (sk.steps ?? []).some((s) => s.do === "heal")) return "heart";
  if (/shield|guard|막기|수호|방벽|검막|rivet/.test(source) || (sk.steps ?? []).some((s) => s.do === "shield" || s.do === "parry")) return "shield";
  if (/sm_|hammer|망치|리벳|회로|드론|지뢰|수리|forge|gear|armor/.test(source)) return "forge";
  if (/pr_|성역|성가|기도|찬가|빛|광휘|은총|holy/.test(source)) return "holy";
  if (/ro_|단검|그림자|독날|연막|암살|절개|처형|poison|shadow/.test(source)) return "shadow";
  if (/ar_|화살|사격|샷|보우|저격|arrow|bow/.test(source)) return "ray";
  if (/fi_|권|주먹|권무|권왕|정권|punch/.test(source)) return "impact";
  if (/sw_|검|베기|발도|일섬|어검|sword|blade|slash/.test(source)) return "arc";
  if (/dash|blink|도약|돌진|활주|횡이동|발놀림/.test(source) || (sk.steps ?? []).some((s) => s.do === "dash" || s.do === "blink")) return "dash";
  if (/buff|강화|마스터리|숙련|자세|기백|오라|절대|정밀/.test(source)) return "crest";
  if (/circle|zone|channel|area|우물|회랑|룬|문양|공명/.test(source)) return "rune";
  if ((sk.steps ?? []).some((s) => s.do === "device")) return "forge";
  if ((sk.steps ?? []).some((s) => s.do === "proj" || s.do === "line")) return sk.anim === "shoot" ? "ray" : "crystal";
  if ((sk.steps ?? []).some((s) => s.do === "melee")) return "arc";
  return "orb";
}
function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

function skillArt(sk) {
  const key = "skill-v2:" + sk.id;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  const [c, hi, deep] = skillPalette(sk);
  const seed = hashId(sk.id ?? sk.name ?? "skill");
  const v = seed % 5;
  const motif = motifOf(sk);
  const ink = "#090b16", steel = "#d9e7f2", white = "#ffffff";
  const px = (x, y, color, w = 1, h = w) => P(g, color, Math.round(x), Math.round(y), w, h);
  const poly = (pts, color) => { g.fillStyle = color; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
  const line = (pts, color, width = 1) => { g.strokeStyle = color; g.lineWidth = width; g.lineCap = "square"; g.lineJoin = "miter"; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
  const diamond = (x, y, rx, ry, color) => poly([[x,y-ry],[x+rx,y],[x,y+ry],[x-rx,y]],color);
  const ring = (x, y, r, color, width = 1) => { g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.stroke(); };
  const star = (x, y, r, color) => { const pts=[]; for(let i=0;i<8;i++){const a=-Math.PI/2+i*Math.PI/4,rr=i%2?r*0.42:r;pts.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr]);} poly(pts,color); };

  // 어두운 보석 바탕 + 절제된 방사광. 각 아이콘은 고유 패턴과 실루엣을 갖는다.
  g.fillStyle = "#090b16"; g.fillRect(0,0,32,32);
  const bg = g.createLinearGradient(2,1,30,31); bg.addColorStop(0,deep); bg.addColorStop(0.48,"#1a1b32"); bg.addColorStop(1,"#080a13");
  g.fillStyle=bg;g.fillRect(2,2,28,28);
  const halo=g.createRadialGradient(16,14,1,16,15,19);halo.addColorStop(0,c+"88");halo.addColorStop(0.45,c+"28");halo.addColorStop(1,"#00000000");
  g.fillStyle=halo;g.fillRect(2,2,28,28);
  g.globalAlpha=0.22;g.strokeStyle=hi;g.lineWidth=0.6;
  for(let i=0;i<3;i++){const yy=5+i*10+(v%3);g.beginPath();g.moveTo(3,yy);g.lineTo(29,yy-4);g.stroke();}
  g.globalAlpha=1;
  for(let i=0;i<6;i++){const x=4+((seed>>(i*3))&15),y=4+((seed>>(i*2+5))&15);px(x,y,i%2?hi:c,1);}
  g.save();
  switch(motif){
    case "arc": {
      g.strokeStyle=ink;g.lineWidth=8;g.beginPath();g.arc(15,17,11,-2.45,0.65);g.stroke();
      g.strokeStyle=c;g.lineWidth=5;g.beginPath();g.arc(15,17,11,-2.45,0.65);g.stroke();
      g.strokeStyle=hi;g.lineWidth=1.5;g.beginPath();g.arc(15,17,8,-2.35,0.45);g.stroke();
      star(25,7,3,white);px(5,24,hi,2,2);break;
    }
    case "ray":
    case "rain": {
      const n=motif==="rain"?5:1;
      for(let j=0;j<n;j++){
        const ox=motif==="rain"?(j-2)*5:0, oy=motif==="rain"?Math.abs(j-2)*2:0;
        line([[6+ox,23-oy],[22+ox,7-oy]],ink,5);
        line([[6+ox,22-oy],[21+ox,7-oy]],motif==="rain"?(j===2?white:hi):c,2);
        diamond(22+ox,7-oy,2,3,hi);
        px(6+ox,22-oy,white,2,2);
      }
      if(motif==="rain"){ring(16,18,12,c,1);star(16,18,3,white);}
      break;
    }
    case "impact": {
      poly([[16,2],[19,10],[28,7],[22,15],[29,22],[19,21],[16,30],[12,21],[3,24],[9,16],[3,9],[13,11]],ink);
      poly([[16,5],[18,12],[25,9],[21,16],[26,21],[18,20],[16,26],[13,20],[6,22],[11,16],[6,11],[14,13]],c);
      diamond(16,15,4,7,hi);px(15,13,white,2,4);
      for(let i=0;i<4;i++)line([[16,3+i%2],[16+(i-1.5)*6,0]],hi,1);
      break;
    }
    case "shadow": {
      g.strokeStyle=ink;g.lineWidth=6;g.beginPath();g.arc(16,16,9,-1.1,2.3);g.stroke();
      g.strokeStyle=c;g.lineWidth=3;g.beginPath();g.arc(16,16,9,-1.1,2.3);g.stroke();
      g.strokeStyle=hi;g.lineWidth=1.2;g.beginPath();g.arc(16,16,6,-0.8,2.1);g.stroke();
      for(let i=0;i<3;i++)line([[5+i*2,9+i*2],[11+i*2,15+i*2],[17+i*2,21+i*2]],i===1?white:hi,1);
      diamond(20,11,3,4,c);px(20,10,white,1,2);
      break;
    }
    case "holy": {
      ring(16,15,10,ink,4);ring(16,15,9,hi,1);ring(16,15,6,c,1);
      poly([[14,4],[18,4],[18,12],[26,12],[26,17],[18,17],[18,25],[14,25],[14,17],[6,17],[6,12],[14,12]],ink);
      poly([[15,5],[17,5],[17,13],[25,13],[25,16],[17,16],[17,24],[15,24],[15,16],[7,16],[7,13],[15,13]],white);
      line([[7,22],[10,26],[13,22]],hi,2);line([[19,22],[22,26],[25,22]],hi,2);
      star(16,4,3,hi);
      break;
    }
    case "forge": {
      ring(16,15,10,ink,5);ring(16,15,9,c,2);ring(16,15,5,hi,1);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;line([[16+Math.cos(a)*9,15+Math.sin(a)*9],[16+Math.cos(a)*13,15+Math.sin(a)*13]],ink,3);px(16+Math.cos(a)*11,15+Math.sin(a)*11,hi,2);}
      poly([[16,8],[22,12],[21,20],[16,24],[11,20],[10,12]],ink);
      poly([[16,10],[20,13],[19,19],[16,22],[13,19],[12,13]],c);
      diamond(16,15,3,5,white);px(15,13,hi,2,3);
      break;
    }
    case "lightning": {
      poly([[18,1],[8,15],[14,15],[10,29],[25,11],[18,11],[23,1]],ink);
      poly([[18,4],[11,14],[16,14],[12,25],[22,12],[17,12],[21,4]],hi);
      line([[7,9],[10,12],[8,16]],white,1);line([[23,17],[26,20],[24,24]],c,2);
      px(18,11,white,2,2);break;
    }
    case "ice":
    case "crystal": {
      poly([[16,2],[24,11],[21,25],[16,30],[10,24],[8,11]],ink);
      poly([[16,4],[22,12],[19,23],[16,27],[12,22],[10,12]],c);
      poly([[16,5],[16,25],[12,22],[10,12]],hi);line([[16,5],[21,12],[16,25]],white,1);
      for(const [x,y] of [[5,7],[26,7],[5,23],[27,22]])diamond(x,y,2,4,hi);
      break;
    }
    case "dragon": {
      g.strokeStyle=ink;g.lineWidth=7;g.beginPath();g.moveTo(5,24);g.bezierCurveTo(2,10,17,4,25,10);g.bezierCurveTo(29,14,23,21,17,18);g.stroke();
      g.strokeStyle=c;g.lineWidth=4;g.beginPath();g.moveTo(5,23);g.bezierCurveTo(3,11,17,5,24,11);g.bezierCurveTo(27,14,22,19,18,17);g.stroke();
      poly([[20,7],[29,5],[25,12],[21,12]],ink);poly([[22,8],[27,6],[24,10]],hi);
      star(8,12,4,white);for(let i=0;i<3;i++)px(5+i*3,27-i*2,hi,2,2);
      break;
    }
    case "meteor": {
      g.save();g.translate(16,16);g.rotate(-0.65);
      poly([[-12,1],[-3,-5],[8,-4],[12,1],[7,8],[-4,9]],ink);
      poly([[-8,1],[-2,-3],[7,-3],[10,1],[6,6],[-3,7]],c);
      poly([[-2,-2],[7,-2],[9,1],[3,2]],hi);
      for(let i=0;i<4;i++)line([[-16,5+i*3],[-7,5+i*3]],i%2?c:hi,1);
      g.restore();star(25,7,3,white);break;
    }
    case "shield": {
      poly([[16,2],[27,6],[25,19],[16,29],[7,19],[5,6]],ink);
      poly([[16,5],[24,8],[22,18],[16,25],[10,18],[8,8]],c);
      line([[16,6],[16,24]],hi,1);line([[10,12],[22,12]],hi,1);
      diamond(16,12,3,4,white);px(15,11,white,2,2);break;
    }
    case "heart": {
      poly([[16,27],[4,16],[3,10],[6,6],[11,6],[16,11],[21,6],[26,6],[29,11],[27,17]],ink);
      poly([[16,24],[6,15],[5,10],[8,8],[12,8],[16,13],[21,8],[25,8],[27,12],[25,16]],c);
      diamond(16,15,3,5,hi);px(13,9,white,2,2);break;
    }
    case "dash": {
      poly([[3,8],[13,16],[3,24],[3,19],[8,16],[3,12]],ink);
      poly([[11,5],[23,16],[11,27],[11,21],[17,16],[11,10]],c);
      line([[4,5],[11,10]],hi,1);line([[13,7],[21,15]],white,1);
      star(25,7,3,hi);px(6,26,white,2,1);break;
    }
    case "rune": {
      ring(16,16,11,ink,4);ring(16,16,10,c,1.5);ring(16,16,6,hi,1);
      poly([[16,5],[19,13],[25,16],[19,19],[16,27],[13,19],[7,16],[13,13]],ink);
      poly([[16,7],[18,14],[23,16],[18,18],[16,24],[14,18],[9,16],[14,14]],hi);
      diamond(16,16,3,4,white);
      for(let i=0;i<4;i++){const a=i*Math.PI/2;px(16+Math.cos(a)*10-1,16+Math.sin(a)*10-1,c,2,2);}break;
    }
    case "wind": {
      g.strokeStyle=ink;g.lineWidth=5;g.beginPath();g.ellipse(16,16,12,5,-0.45,-2.7,2.6);g.stroke();
      g.strokeStyle=c;g.lineWidth=2.5;g.beginPath();g.ellipse(16,16,12,5,-0.45,-2.7,2.6);g.stroke();
      g.strokeStyle=hi;g.lineWidth=1.5;g.beginPath();g.ellipse(16,16,7,3,0.45,-2.4,2.3);g.stroke();
      star(24,8,3,white);px(7,23,hi,2,2);break;
    }
    case "poison":
    case "smoke": {
      for(let i=0;i<6;i++){const a=i*Math.PI/3,xx=16+Math.cos(a)*7,yy=16+Math.sin(a)*6;g.fillStyle=motif==="smoke"?"#7b7892":c;g.beginPath();g.arc(xx,yy,4+(i%2),0,Math.PI*2);g.fill();}
      ring(16,16,7,hi,1);diamond(16,15,3,5,white);break;
    }
    case "moon": {
      ring(16,16,11,ink,4);ring(16,16,10,hi,1);
      g.fillStyle=c;g.beginPath();g.arc(15,16,9,0,Math.PI*2);g.fill();
      g.fillStyle=deep;g.beginPath();g.arc(20,12,8,0,Math.PI*2);g.fill();
      star(9,22,3,white);px(24,7,hi,2,2);break;
    }
    case "twin": {
      g.strokeStyle=ink;g.lineWidth=7;g.beginPath();g.arc(11,16,8,-2.1,1.1);g.stroke();g.beginPath();g.arc(21,16,8,2.1,5.3);g.stroke();
      g.strokeStyle=c;g.lineWidth=4;g.beginPath();g.arc(11,16,8,-2.1,1.1);g.stroke();g.beginPath();g.arc(21,16,8,2.1,5.3);g.stroke();
      star(16,16,4,hi);px(15,15,white,2,2);break;
    }
    case "kick": {
      g.strokeStyle=ink;g.lineWidth=7;g.beginPath();g.arc(15,16,11,-2.3,0.8);g.stroke();
      g.strokeStyle=c;g.lineWidth=4;g.beginPath();g.arc(15,16,11,-2.3,0.8);g.stroke();
      ring(16,16,5,hi,1);star(24,8,4,white);line([[5,25],[9,22]],hi,2);break;
    }
    case "trap": {
      poly([[7,7],[25,7],[25,25],[7,25]],ink);poly([[9,9],[23,9],[23,23],[9,23]],c);
      line([[9,9],[23,23]],hi,2);line([[23,9],[9,23]],hi,2);
      ring(16,16,5,white,1);diamond(16,16,2,4,hi);break;
    }
    case "vines": {
      g.strokeStyle=ink;g.lineWidth=5;g.beginPath();g.moveTo(5,25);g.bezierCurveTo(8,6,22,27,26,7);g.stroke();
      g.strokeStyle=c;g.lineWidth=2.5;g.beginPath();g.moveTo(5,25);g.bezierCurveTo(8,6,22,27,26,7);g.stroke();
      for(const [x,y,a] of [[9,13,-0.7],[17,17,0.3],[23,12,-0.4]]){g.save();g.translate(x,y);g.rotate(a);poly([[-1,0],[0,-5],[4,-2],[2,2]],hi);g.restore();}
      star(7,25,2,white);break;
    }
    case "target": {
      ring(16,16,12,ink,3);ring(16,16,10,c,1.5);ring(16,16,5,hi,1.5);
      line([[16,2],[16,10]],white,1);line([[16,22],[16,30]],white,1);
      line([[2,16],[10,16]],white,1);line([[22,16],[30,16]],white,1);
      diamond(16,16,2,3,hi);px(15,15,white,2,2);break;
    }
    case "flame": {
      poly([[16,2],[21,11],[27,16],[24,25],[17,29],[8,26],[5,19],[10,13],[12,7],[15,14]],ink);
      poly([[16,7],[20,14],[24,18],[21,24],[16,26],[10,23],[9,19],[14,14]],c);
      poly([[16,14],[19,20],[16,25],[13,22]],hi);px(15,19,white,2,2);break;
    }
    case "vortex": {
      g.strokeStyle=ink;g.lineWidth=5;g.beginPath();g.arc(16,16,11,-2.7,4.4);g.stroke();
      g.strokeStyle=c;g.lineWidth=2.5;g.beginPath();g.arc(16,16,11,-2.6,4.2);g.stroke();
      g.strokeStyle=hi;g.lineWidth=1.5;g.beginPath();g.arc(16,16,6,-2,3.6);g.stroke();
      star(16,16,3,white);for(let i=0;i<3;i++)px(5+i*10,6+(i%2)*19,hi,2,2);break;
    }
    case "wave": {
      for(let i=0;i<3;i++){g.strokeStyle=i===1?hi:c;g.lineWidth=3-i;g.beginPath();g.arc(8,16,6+i*5,-1.1,1.1);g.stroke();g.beginPath();g.arc(24,16,6+i*5,Math.PI-1.1,Math.PI+1.1);g.stroke();}
      diamond(16,16,3,6,white);break;
    }
    case "bell": {
      poly([[11,7],[13,3],[19,3],[21,7],[24,19],[27,22],[5,22],[8,19]],ink);
      poly([[12,8],[14,5],[18,5],[20,8],[22,18],[24,20],[8,20],[10,18]],hi);
      line([[9,13],[23,13]],c,2);ring(16,24,3,white,1);star(16,3,2,white);break;
    }
    case "orbit": {
      g.strokeStyle=ink;g.lineWidth=4;g.beginPath();g.ellipse(16,16,12,6,0.7,0,Math.PI*2);g.stroke();
      g.strokeStyle=c;g.lineWidth=2;g.beginPath();g.ellipse(16,16,12,6,0.7,0,Math.PI*2);g.stroke();
      g.strokeStyle=hi;g.lineWidth=2;g.beginPath();g.ellipse(16,16,6,12,-0.7,0,Math.PI*2);g.stroke();
      star(16,16,4,white);for(const [x,y] of [[6,10],[25,21],[20,5]]){diamond(x,y,2,3,hi);}break;
    }
    case "crest":
    case "orb":
    default: {
      ring(16,16,10,ink,4);ring(16,16,9,c,1.5);
      const points=[];for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;points.push([16+Math.cos(a)*7,16+Math.sin(a)*7]);}
      poly(points,ink);const inner=[];for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;inner.push([16+Math.cos(a)*5,16+Math.sin(a)*5]);}
      poly(inner,hi);diamond(16,15,3,5,white);
      for(let i=0;i<4;i++)star(5+(i%2)*22,7+Math.floor(i/2)*18,2,c);
      break;
    }
  }
  g.restore();

  const grade = ["일반","희귀","영웅","전설","신화"].indexOf(sk.grade);
  const rim = grade >= 3 ? (sk.grade === "신화" ? "#ff607c" : "#ffc45e") : grade === 2 ? "#b58aff" : grade === 1 ? "#5fbaff" : "#687487";
  g.strokeStyle="#03040a";g.lineWidth=2;g.strokeRect(1,1,30,30);
  g.strokeStyle=rim;g.lineWidth=1;g.strokeRect(2.5,2.5,27,27);
  line([[3,7],[3,3],[7,3]],hi,1);line([[25,3],[29,3],[29,7]],rim,1);
  line([[3,25],[3,29],[7,29]],rim,1);line([[25,29],[29,29],[29,25]],rim,1);
  if(grade>=1){diamond(27,5,2,3,grade>=3?"#fff1bd":rim);px(27,4,white,1,1);}
  if(grade>=3){g.globalAlpha=0.7;star(5,5,2,hi);star(27,27,2,hi);g.globalAlpha=1;}
  if(sk.kind==="ultimate"){star(16,4,3,white);g.globalAlpha=0.5;ring(16,16,13,hi,1);g.globalAlpha=1;}
  if(sk.kind==="passive"){px(5,15,hi,2,2);px(25,15,hi,2,2);}
  cv._motif = motif;
  cache.set(key,cv);
  return cv;
}
export function skillIconURL(sk) {
  if (!urls.has(sk.id)) urls.set(sk.id, skillArt(sk).toDataURL());
  return urls.get(sk.id);
}
export function skillIcon(sk) { return skillArt(sk); }

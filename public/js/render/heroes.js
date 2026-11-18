// 직업별 주인공 도트 (원본 픽셀 아트, 정면 치비 38x54, 1배 크기)
//  궁수(여) · 마법사(남) · 대장장이(남) · 권투사(남) · 도적(여) · 성직자(여). 검사·모험가는 기존 그림 사용.
//  프레임: idle 4 · run 4 · hit 1. DOM 없이 픽셀 배열만 만들어 브라우저·노드 모두에서 사용.
export const HW = 38, HH = 54;
const MX = (x) => HW - 1 - x; // 좌우 대칭

// ── 색 도우미
const hx = (s) => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };

function canvas() {
  const c = new Array(HW * HH).fill(null);
  const B = {
    c,
    p(x, y, col) { x = Math.round(x); y = Math.round(y); if (col && x >= 0 && y >= 0 && x < HW && y < HH) c[y * HW + x] = col; },
    g(x, y) { return x >= 0 && y >= 0 && x < HW && y < HH ? c[y * HW + x] : null; },
    clr(x, y) { if (x >= 0 && y >= 0 && x < HW && y < HH) c[y * HW + x] = null; },
    // 대칭으로 찍기
    pm(x, y, col) { B.p(x, y, col); B.p(MX(x), y, col); },
    rect(x0, y0, x1, y1, f) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) B.p(x, y, typeof f === "function" ? f(x, y) : f); },
    ell(cx, cy, rx, ry, f, clip) {
      for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!clip || clip(x, y))) B.p(x, y, typeof f === "function" ? f(x, y, dx, dy) : f);
      }
    },
    poly(pts, f, clip) {
      let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
      for (const [x, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const px = x + 0.5, py = y + 0.5;
        let ins = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
        }
        if (ins && (!clip || clip(x, y))) B.p(x, y, typeof f === "function" ? f(x, y) : f);
      }
    },
    polyM(pts, f, clip) { B.poly(pts, f, clip); B.poly(pts.map(([x, y]) => [HW - x, y]), typeof f === "function" ? (x, y) => f(MX(x), y, true) : f, clip && ((x, y) => clip(MX(x), y))); },
    line(x0, y0, x1, y1, col) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) B.p(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col); },
    // 글자 그림 찍기: rows = 문자열 배열, pal = 문자→색, '.'은 투명
    art(x0, y0, rows, pal, mirror = false) {
      rows.forEach((r, j) => [...r].forEach((ch, i) => { const col = pal[ch]; if (col) { B.p(x0 + i, y0 + j, col); if (mirror) B.p(MX(x0 + i), y0 + j, col); } }));
    },
  };
  return B;
}
// 색 있는 외곽선: 바깥 빈칸 중 그림과 맞닿은 칸을 (이웃 색을 아주 어둡게 + 잉크)로
function outline(B, ink) {
  const add = [];
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    if (B.g(x, y)) continue;
    const n = B.g(x, y + 1) ?? B.g(x, y - 1) ?? B.g(x - 1, y) ?? B.g(x + 1, y);
    if (n) add.push([x, y, mix(n, ink, 0.78)]);
  }
  for (const [x, y, c] of add) B.p(x, y, c);
}

// ── 얼굴 ────────────────────────────────────────────────
// 눈 (5x6). k 속눈썹, D 짙은 홍채, M 중간, L 밝은, W 반짝임
const EYE_F = { L: ["kkkkk", "kWWDD", "kWDDD", ".MMMM", ".MLLM", "..kk."], R: ["kkkkk", "WWDDk", "WDDDk", "MMMM.", "MLLM.", ".kk.."] };
const EYE_M = { L: [".kkkk", "kWWDD", ".WDDD", ".MMMM", ".MLLM"], R: ["kkkk.", "WWDDk", "WDDD.", "MMMM.", "MLLM."] };
const EYE_SHUT = { L: [".....", ".....", "kk...", "..kk.", "....k"], R: [".....", ".....", "...kk", ".kk..", "k...."] };
function face(B, F, st, o = {}) {
  const by = st.by;
  const E = st.hurt ? EYE_SHUT : o.fem ? EYE_F : EYE_M;
  const pal = { k: F.lash, D: F.irisD, M: F.iris, L: F.irisL, W: "#ffffff" };
  B.art(11, 21 + by, E.L, pal); B.art(22, 21 + by, E.R, pal);
  if (!st.hurt && o.brow) { B.line(11, 19 + by, 14, 18 + by, o.brow); B.line(23, 18 + by, 26, 19 + by, o.brow); } // 남자: 짙은 눈썹
  // 볼터치
  if (o.fem || o.blush) { B.p(10, 27 + by, F.blush); B.p(11, 27 + by, F.blush); B.p(26, 27 + by, F.blush); B.p(27, 27 + by, F.blush); }
  // 입
  if (st.hurt) { B.rect(18, 28 + by, 19, 29 + by, F.mouth); }
  else if (o.smile) { B.p(18, 29 + by, F.mouth); B.p(19, 29 + by, F.mouth); B.p(17, 28 + by, F.skinD); B.p(20, 28 + by, F.skinD); }
  else if (o.grin) { B.rect(17, 28 + by, 20, 29 + by, F.mouth); B.rect(17, 28 + by, 20, 28 + by, "#ffffff"); }
  else if (o.smirk) { B.p(18, 29 + by, F.mouth); B.p(19, 29 + by, F.mouth); B.p(20, 28 + by, F.mouth); }
  else { B.p(18, 29 + by, F.mouth); B.p(19, 29 + by, F.mouth); }
}
// 머리(피부): 둥근 얼굴 + 뾰족한 턱 살짝
function head(B, F, st) {
  const by = st.by;
  B.rect(17, 30 + by, 20, 33 + by, F.skinD); // 목
  B.ell(18.5, 21 + by, 10.6, 9.8, (x, y) => (y > 27 + by ? F.skinD : F.skin), (x, y) => !(y > 28 + by && (x < 12 || x > 25)) && !(y > 29 + by && (x < 14 || x > 23)));
  // 볼 음영
  for (let y = 24; y <= 29; y++) { B.p(8 + Math.max(0, y - 27) * 2, y + by, F.skinD); B.p(29 - Math.max(0, y - 27) * 2, y + by, F.skinD); }
}

// ── 몸 ───────────────────────────────────────────────────
// 다리 + 신발. st.leg = [왼발 들림, 오른발 들림] (0~2)
function legs(B, D, st, o = {}) {
  const top = o.top ?? 44;
  for (const [x0, up] of [[14, st.leg[0]], [20, st.leg[1]]]) {
    const foot = 53 - up;
    B.rect(x0, top, x0 + 3, foot - 4, (x) => (x === x0 ? D.legD : x === x0 + 3 ? D.legL ?? D.leg : D.leg));
    if (D.knee) B.rect(x0, foot - 6, x0 + 3, foot - 6, D.knee);
    // 신발 (발끝이 바깥으로 살짝)
    const out = x0 < 18 ? -1 : 0;
    B.rect(x0 + out, foot - 3, x0 + out + 4, foot, (x, y) => (y === foot ? D.bootD : y === foot - 3 ? D.bootL ?? D.boot : x === x0 + out ? D.bootD : D.boot));
    if (D.bootTrim) B.rect(x0, foot - 4, x0 + 3, foot - 4, D.bootTrim);
  }
}
// 팔 (양쪽). 손은 (10,41) / (27,41). st.arm = 흔들림(-1~1)
function arms(B, D, st, o = {}) {
  const by = st.by;
  for (const side of [0, 1]) {
    const sw = side ? -st.arm : st.arm;
    const x0 = side ? 25 : 9, y0 = 33 + by, y1 = 39 + by + sw;
    const sl = o.sleeve ?? D.top, slD = o.sleeveD ?? D.topD;
    B.rect(x0, y0, x0 + 3, y1, (x) => ((side ? x === x0 + 3 : x === x0) ? slD : sl));
    if (o.wide) B.rect(side ? x0 + 1 : x0 - 1, y1 - 2, side ? x0 + 4 : x0 + 2, y1, (x) => ((side ? x === x0 + 4 : x === x0 - 1) ? slD : sl));
    if (o.cuff) B.rect(x0, y1, x0 + 3, y1, o.cuff);
    if (o.glove) {
      const gx = side ? 27.5 : 10.5, gy = y1 + 2.5;
      B.ell(gx, gy, 3.1, 3, (x, y) => (y < gy - 1 && (side ? x < gx : x > gx - 1) ? o.gloveL : (side ? x > gx + 1 : x < gx - 1) ? o.gloveD : o.glove));
      B.p(side ? 27 : 10, Math.round(gy) - 2, "#ffffff");
    } else B.rect(x0 + 1, y1 + 1, x0 + 2, y1 + 2, (x, y) => (y === y1 + 2 ? D.skinD : D.skin));
  }
}

// 자세
function poseOf(anim, f) {
  if (anim === "run") return { by: [0, -1, 0, -1][f], leg: [[2, 0], [0, 0], [0, 2], [0, 0]][f], arm: [1, 0, -1, 0][f], sway: [1, 0, -1, 0][f], f };
  if (anim === "hit") return { by: 1, leg: [0, 0], arm: -1, hurt: true, sway: -1, f: 0 };
  return { by: f >= 2 ? 1 : 0, leg: [0, 0], arm: 0, sway: f >= 2 ? 1 : 0, f };
}

// ── 직업 ─────────────────────────────────────────────────
const SKIN = { skin: "#ffe4cc", skinD: "#f2b896", mouth: "#d0606a", blush: "#ffaab4" };

const HEROES = {
  // ★ 궁수(여): 숲의 엘프 레인저 — 꿀빛 긴 머리, 금빛 잎 장식관 + 에메랄드, 뾰족 귀, 초록 망토, 화살통
  archer(B, st) {
    const F = { ...SKIN, lash: "#3a2414", irisD: "#0e5a3a", iris: "#1fa865", irisL: "#8cf5b8" };
    const C = { hair: "#ffd27a", hairL: "#fff1c4", hairH: "#fffbe8", hairD: "#e8a845", hairDD: "#b8702a",
      green: "#2fae6a", greenL: "#5fd690", greenD: "#1a6e44", white: "#fbf7ee", whiteD: "#dcd4c4", gold: "#ffd75a", goldD: "#c8902a",
      leather: "#9a5c32", leatherD: "#5e3418", skin: SKIN.skin, skinD: SKIN.skinD };
    const D = { ...C, top: C.white, topD: C.whiteD, leg: "#fbf7ee", legL: "#ffffff", legD: "#dcd4c4", boot: "#7a4a26", bootL: "#a06838", bootD: "#4a2a12", bootTrim: C.gold };
    const by = st.by, sw = st.sway;
    // 등 뒤로 흘러내리는 긴 머리 (허리 아래까지, 움직일 때 살랑)
    B.polyM([[8, 18 + by], [13, 20 + by], [12, 34 + by], [10 - sw, 46], [6 - sw, 44], [5, 30 + by]], (x, y, m) => (x < 7 ? C.hairD : y > 38 ? C.hairD : x > 10 ? C.hair : C.hairL));
    // 화살통 (왼쪽 어깨 뒤로 깃털)
    for (const [x0, y0, c, cL] of [[4, 4, "#ff5a6a", "#ffa0aa"], [7, 2, "#2fae6a", "#8af5b0"], [10, 3, "#ffd75a", "#fff1b0"]]) {
      B.line(x0 + 1, y0 + 3 + by, x0 + 6, y0 + 14 + by, "#c8a070");
      B.art(x0 - 1, y0 + by, [".c.", "cLc", "cLc", ".c."], { c, L: cL });
    }
    arms(B, D, st, { sleeve: C.white, sleeveD: C.whiteD, cuff: C.gold });
    legs(B, D, st);
    // 몸: 흰 블라우스 + 갈색 코르셋 + 초록 치마(금테)
    B.polyM([[13, 33 + by], [19, 32 + by], [19, 43], [13, 43]], (x) => (x < 15 ? C.whiteD : C.white));
    B.polyM([[13, 37 + by], [19, 37 + by], [19, 42], [14, 42]], (x, y) => (y === 37 + by ? C.goldD : x < 15 ? C.leatherD : C.leather));
    for (let y = 38 + by; y <= 41; y += 1) { B.p(17 + (y % 2), y, C.gold); B.p(MX(17 + (y % 2)), y, C.gold); }
    B.polyM([[13, 42], [19, 42], [19, 47], [11 - (st.leg[0] ? 1 : 0), 47]], (x, y) => (y === 47 ? C.gold : x < 14 ? C.greenD : y < 44 ? C.greenL : C.green));
    // 초록 어깨 망토 + 금 브로치
    B.polyM([[10, 33 + by], [19, 32 + by], [19, 35 + by], [14, 37 + by], [9, 38 + by]], (x, y) => (y >= 36 + by ? C.greenD : x < 12 ? C.greenD : y < 34 + by ? C.greenL : C.green));
    B.rect(18, 33 + by, 19, 34 + by, C.gold); B.p(18, 33 + by, "#ffffff"); B.p(19, 35 + by, "#1fa865");
    head(B, F, st);
    // 뾰족한 엘프 귀
    B.polyM([[9, 20 + by], [3, 16 + by], [5, 19 + by], [9, 24 + by]], (x, y) => (y > 21 + by ? F.skinD : F.skin));
    B.pm(5, 18 + by, "#ffb8b8");
    // 머리 위쪽 덩어리
    B.ell(18.5, 18 + by, 12.2, 10, (x, y, dx, dy) => (dy < -0.55 ? (Math.abs(dx) < 0.45 ? C.hairL : C.hair) : Math.abs(dx) > 0.82 ? C.hairD : C.hair), (x, y) => y <= 17 + by);
    // 앞머리: 끝이 뾰족한 머리 다발
    const locks = [[10, 4, 8, 1], [13, 4, 9, 0], [16.5, 4, 7, 0], [19, 3, 5, 0], [21.5, 4, 7, 0], [25, 4, 9, 0], [28, 4, 8, -1]];
    for (const [x, w, len, tilt] of locks) B.poly([[x - w / 2, 15 + by], [x + w / 2, 15 + by], [x + tilt, 15 + len + by]], (xx, yy) => (Math.abs(xx + 0.5 - x) > w / 2 - 1 ? C.hairD : yy < 18 + by ? C.hair : C.hairD));
    // 옆머리 (얼굴 옆으로 길게)
    B.polyM([[7, 15 + by], [11, 15 + by], [11, 28 + by], [9, 33 + by], [7, 30 + by]], (x, y) => (x < 9 ? C.hairD : y > 27 + by ? C.hairD : C.hair));
    // 머리결 윤기 (천사링)
    for (const x of [11, 12, 13, 14, 15, 22, 23, 24, 25, 26]) B.p(x, 11 + by + (x < 13 || x > 24 ? 1 : 0), C.hairH);
    for (const x of [16, 21]) B.p(x, 11 + by, C.hairL);
    // 금빛 잎 장식관 + 에메랄드
    for (let x = 9; x <= 28; x++) B.p(x, 14 + by + (x < 12 || x > 25 ? 1 : 0), (x + st.f) % 4 === 0 ? C.goldD : C.gold);
    B.art(16, 11 + by, ["..kk..", ".kGGk.", "kGWgGk", ".kGGk.", "..kk.."], { k: C.goldD, G: "#1fbf74", g: "#0e7a48", W: "#c8ffe0" });
    for (const [x, y] of [[11, 13], [12, 12], [25, 12], [26, 13]]) B.p(x, y + by, C.green); // 잎사귀
    B.p(12, 13 + by, C.greenL); B.p(25, 13 + by, C.greenL);
    B.art(26, 12 + by, [".p.", "pyp", ".p."], { p: "#ffffff", y: "#ffb0c8" }); B.p(29, 14 + by, C.greenL);
    face(B, F, st, { fem: true, smile: true });
    outline(B, "#2a160c");
  },

  // 마법사(남): 별이 수놓인 남색 대마법사 로브 + 뾰족 모자, 은빛 머리, 떠다니는 마력 구슬
  mage(B, st) {
    const F = { ...SKIN, lash: "#1a1a3a", irisD: "#3a1a9a", iris: "#7a5aff", irisL: "#c8b0ff", mouth: "#b0606a" };
    const C = { navy: "#2a3a9a", navyL: "#4a62d8", navyD: "#18205e", gold: "#ffd75a", goldD: "#c08a28", hair: "#e8eaff", hairL: "#ffffff", hairD: "#a8acd8", hairDD: "#7076b0",
      glow: "#7ff0ff", glowD: "#2aa8d0", star: "#fff3a0" };
    const D = { top: C.navy, topD: C.navyD, skin: SKIN.skin, skinD: SKIN.skinD, leg: C.navyD, legD: "#10143e", boot: "#3a2a5a", bootL: "#5a4688", bootD: "#1e1630", bootTrim: C.gold };
    const by = st.by, f = st.f;
    // 떠다니는 마력 구슬 (프레임마다 위아래로)
    const orb = (cx, cy) => { B.ell(cx, cy, 2.4, 2.4, (x, y) => (x + 0.5 < cx && y + 0.5 < cy ? "#d8ffff" : x + 0.5 > cx + 0.5 ? C.glowD : C.glow)); B.p(Math.floor(cx) - 1, Math.floor(cy) - 1, "#ffffff"); };
    orb(3.5, 31 + [0, -1, -2, -1][f]); orb(34.5, 27 + [-2, -1, 0, -1][f]);
    arms(B, D, st, { sleeve: C.navy, sleeveD: C.navyD, cuff: C.gold, wide: true });
    legs(B, D, st, { top: 46 });
    // 긴 로브 (아래로 퍼짐) + 금테 + 별 무늬
    B.polyM([[12, 33 + by], [19, 32 + by], [19, 51], [9, 51]], (x, y) => (y >= 50 ? C.gold : x < 12 + (y - 33) * -0.1 + 0 && x < 12 ? C.navyD : x < 13 ? C.navyD : y < 37 + by ? C.navyL : C.navy));
    B.rect(18, 34 + by, 19, 50, (x) => (x === 18 ? C.gold : C.goldD)); // 앞섶 금줄
    for (const [x, y] of [[14, 40], [12, 46], [15, 48], [23, 39], [25, 45], [22, 48]]) { B.p(x, y, C.star); B.p(x - 1, y, C.goldD); B.p(x + 1, y, C.goldD); B.p(x, y - 1, C.goldD); B.p(x, y + 1, C.goldD); }
    // 높은 옷깃 + 보석 허리띠
    B.polyM([[12, 30 + by], [16, 32 + by], [15, 34 + by], [11, 33 + by]], (x) => (x < 13 ? C.goldD : C.gold));
    B.rect(12, 40 + by, 25, 41 + by, (x) => (x < 14 ? "#4a2a7a" : "#6a3aa8")); B.rect(18, 40 + by, 19, 41 + by, C.glow);
    head(B, F, st);
    // 은빛 머리: 옆으로 길게 + 앞머리
    B.polyM([[7, 15 + by], [11, 15 + by], [11, 27 + by], [8, 30 + by]], (x, y) => (x < 9 ? C.hairD : C.hair));
    const locks = [[10, 4, 7, 1], [13.5, 4, 8, 0], [17, 4, 6, 1], [21, 4, 7, -1], [24.5, 4, 8, 0], [28, 4, 7, -1]];
    for (const [x, w, len, tilt] of locks) B.poly([[x - w / 2, 15 + by], [x + w / 2, 15 + by], [x + tilt, 15 + len + by]], (xx, yy) => (Math.abs(xx + 0.5 - x) > w / 2 - 1 ? C.hairD : yy < 18 + by ? C.hairL : C.hair));
    B.rect(8, 14 + by, 29, 16 + by, (x, y) => (y === 16 + by ? C.hairD : C.hair));
    // 뾰족 모자: 넓은 챙 + 휘어진 꼭대기 + 금띠 + 별 보석
    B.poly([[10, 15 + by], [27, 15 + by], [24, 7 + by], [28, 1 + by], [31, 2 + by], [27, 0 + by], [21, 3 + by], [14, 8 + by]], (x, y) => (x < 15 ? C.navyD : x > 22 && y < 8 + by ? C.navyL : C.navy));
    B.ell(18.5, 15.5 + by, 15.5, 2.6, (x, y) => (y > 15 + by ? C.navyD : x > 22 ? C.navyL : C.navy));
    B.rect(11, 12 + by, 26, 13 + by, (x, y) => (y === 13 + by ? C.goldD : C.gold));
    B.art(16, 9 + by, ["..k..", ".kSk.", "kSWSk", ".kSk.", "..k.."], { k: C.goldD, S: C.glow, W: "#ffffff" });
    for (const [x, y] of [[13, 6], [25, 4], [20, 6]]) B.p(x, y + by, C.star);
    B.p(29, 1 + by, f % 2 ? "#ffffff" : C.star);
    face(B, F, st, { brow: "#9aa0d0" });
    outline(B, "#140c30");
  },
  // 대장장이(남): 적갈색 뾰족 머리 + 이마 위 고글, 가죽 앞치마, 놋쇠 장식, 튀는 불티
  smith(B, st) {
    const F = { ...SKIN, skin: "#ffd8b4", skinD: "#e8a87a", lash: "#3a1a0a", irisD: "#8a3a08", iris: "#e87a1a", irisL: "#ffc860", mouth: "#b8504a" };
    const C = { hair: "#d0562a", hairL: "#f08a4a", hairD: "#9a3418", brass: "#e8b84a", brassD: "#a87420", lens: "#7ae0f0", lensD: "#2a8aa8",
      shirt: "#3e4250", shirtL: "#565a6a", shirtD: "#262832", apron: "#9a6236", apronL: "#ba804a", apronD: "#62381a", ember: "#ffb030", emberL: "#fff0a0" };
    const D = { top: C.shirt, topD: C.shirtD, skin: F.skin, skinD: F.skinD, leg: "#5a4434", legL: "#6e5644", legD: "#3a2a1e", boot: "#4a3a32", bootL: "#6a5648", bootD: "#241a14", knee: "#3a2a1e", bootTrim: "#c8ccd8" };
    const by = st.by, f = st.f;
    // 불티 (위로 튀어오름)
    for (const [x, y0, k] of [[4, 40, 0], [33, 36, 1], [6, 30, 2], [31, 44, 3]]) { const y = y0 - ((f + k) % 4) * 3; B.p(x, y, (f + k) % 2 ? C.emberL : C.ember); if ((f + k) % 4 < 2) B.p(x, y + 1, "#ff6a1a"); }
    // 팔: 걷어올린 소매 + 가죽 팔목 보호대
    arms(B, D, st, { sleeve: F.skin, sleeveD: F.skinD, cuff: C.apronD });
    for (const x of [9, 25]) B.rect(x, 33 + by, x + 3, 34 + by, (xx) => (xx === x || xx === x + 3 ? C.shirtD : C.shirtL));
    legs(B, D, st);
    // 몸통: 짙은 셔츠 + 두꺼운 가죽 앞치마(놋쇠 리벳, 연장 주머니)
    B.polyM([[12, 33 + by], [19, 32 + by], [19, 44], [13, 44]], (x) => (x < 14 ? C.shirtD : C.shirt));
    B.polyM([[13, 35 + by], [19, 35 + by], [19, 49], [12, 49]], (x, y) => (y === 49 ? C.apronD : x < 14 ? C.apronD : y < 38 + by ? C.apronL : C.apron));
    B.line(13, 35 + by, 15, 32 + by, C.apronD); B.line(24, 35 + by, 22, 32 + by, C.apronD);
    for (const [x, y] of [[13, 36], [24, 36], [13, 47], [24, 47]]) B.p(x, y + (y < 40 ? by : 0), C.brass);
    B.rect(15, 41, 22, 45, (x, y) => (y === 41 ? C.apronL : x === 15 || x === 22 ? C.apronD : "#7a4a28")); // 주머니
    B.line(16, 38, 17, 41, "#c8ccd8"); B.p(16, 37, "#e8ecf4"); B.rect(20, 38, 21, 41, C.brass); B.p(20, 37, C.brassD); // 집게·끌
    B.rect(12, 43, 25, 43, C.brassD); // 허리띠
    head(B, F, st);
    // 뾰족뾰족 머리
    B.ell(18.5, 17 + by, 12, 9, (x, y, dx, dy) => (dy < -0.5 && Math.abs(dx) < 0.5 ? C.hairL : Math.abs(dx) > 0.8 ? C.hairD : C.hair), (x, y) => y <= 16 + by);
    const spikes = [[5, 12, 1, 6], [8, 8, 4, 3], [12, 6, 9, 1], [17, 6, 16, 0], [22, 6, 23, 0], [26, 7, 29, 2], [30, 10, 34, 6], [31, 14, 36, 13]];
    for (const [x0, y0, tx, ty] of spikes) B.poly([[x0, y0 + 5 + by], [x0 + 6, y0 + 3 + by], [tx, ty + by]], (x, y) => (y < ty + 3 + by ? C.hairL : C.hair));
    B.polyM([[7, 16 + by], [10, 15 + by], [10, 24 + by], [8, 22 + by]], (x) => (x < 9 ? C.hairD : C.hair));
    const locks = [[11, 3, 5, 0], [14, 4, 6, 1], [18, 4, 4, 0], [22, 4, 6, -1], [26, 3, 5, 0]];
    for (const [x, w, len, tilt] of locks) B.poly([[x - w / 2, 16 + by], [x + w / 2, 16 + by], [x + tilt, 16 + len + by]], (xx) => (Math.abs(xx + 0.5 - x) > w / 2 - 1 ? C.hairD : C.hair));
    // 이마 위 고글
    B.rect(8, 14 + by, 29, 15 + by, (x, y) => (y === 15 + by ? "#3a2a1e" : "#5a4434"));
    for (const cx of [13.5, 23.5]) { B.ell(cx, 13.5 + by, 3.4, 3, (x, y) => (Math.hypot(x + 0.5 - cx, (y + 0.5 - 13.5 - by) * 1.1) > 2.1 ? C.brass : y < 13 + by ? "#c8f8ff" : C.lens)); B.p(Math.floor(cx) - 1, 12 + by, "#ffffff"); }
    B.rect(17, 13 + by, 20, 14 + by, C.brassD);
    face(B, F, st, { brow: C.hairD, grin: true });
    B.rect(25, 26 + by, 27, 27 + by, "#fff4e8"); B.p(26, 26 + by, "#e8d8c8"); // 볼에 반창고
    outline(B, "#24140a");
  },
  // 권투사(남): 검은 머리에 붉은 끝 + 흩날리는 빨간 머리띠, 챔피언 금 벨트, 빨간·금 글러브
  fist(B, st) {
    const F = { skin: "#e8a878", skinD: "#c07a4a", lash: "#1a0a06", irisD: "#5a2a06", iris: "#d8780e", irisL: "#ffb43a", mouth: "#8a3a2a", blush: "#e8907a" };
    const C = { hair: "#2a2430", hairL: "#4a4058", hairD: "#141018", tip: "#ff3a3a", red: "#e82a2a", redL: "#ff6a5a", redD: "#8a1018", gold: "#ffd75a", goldD: "#c08a28", white: "#f8f8ff", whiteD: "#c8c8d8" };
    const D = { top: F.skin, topD: F.skinD, skin: F.skin, skinD: F.skinD, leg: F.skin, legL: "#f0b888", legD: F.skinD, boot: C.white, bootL: "#ffffff", bootD: C.whiteD, bootTrim: C.red, knee: C.white };
    const by = st.by, sw = st.sway;
    // 흩날리는 머리띠 끈 (뒤로)
    B.poly([[8, 15 + by], [10, 17 + by], [3 - sw, 24 + by], [1 - sw, 22 + by]], (x) => (x < 5 ? C.redD : C.red));
    B.poly([[8, 16 + by], [9, 18 + by], [5 - sw, 28 + by], [3 - sw, 27 + by]], (x) => (x < 6 ? C.redD : C.red));
    arms(B, D, st, { sleeve: F.skin, sleeveD: F.skinD, glove: C.red, gloveL: C.redL, gloveD: C.redD });
    for (const x of [9, 25]) B.rect(x, 39 + by + (x < 18 ? st.arm : -st.arm), x + 3, 39 + by + (x < 18 ? st.arm : -st.arm), C.gold); // 글러브 금 커프
    legs(B, D, st, { top: 46 });
    // 탄탄한 상체 (근육 음영)
    B.polyM([[12, 33 + by], [19, 32 + by], [19, 44], [13, 44]], (x, y) => (x < 14 ? F.skinD : F.skin));
    for (const [x, y] of [[15, 35], [16, 36], [17, 36], [15, 39], [17, 39], [15, 41], [17, 41]]) { B.p(x, y + by, F.skinD); B.p(MX(x), y + by, F.skinD); }
    B.p(14, 34 + by, "#ffc8a0"); B.p(23, 34 + by, "#ffc8a0");
    // 빨간 트렁크 + 챔피언 금 벨트
    B.polyM([[12, 43], [19, 43], [19, 47], [17, 49], [12, 49]], (x, y) => (x < 14 ? C.redD : y < 45 ? C.redL : C.red));
    B.rect(12, 42, 25, 44, (x, y) => (y === 42 ? C.goldD : x < 14 ? C.goldD : C.gold));
    B.art(16, 41, [".kkkk.", "kGWGGk", "kGGRGk", ".kkkk."], { k: C.goldD, G: C.gold, W: "#ffffff", R: C.red });
    B.rect(13, 47, 13, 49, C.white); B.rect(24, 47, 24, 49, C.white);
    head(B, F, st);
    // 뾰족한 검은 머리 + 붉은 끝
    B.ell(18.5, 17 + by, 12, 9, (x, y, dx, dy) => (dy < -0.5 && Math.abs(dx) < 0.5 ? C.hairL : C.hair), (x, y) => y <= 16 + by);
    const spikes = [[4, 13, 0, 8], [7, 9, 2, 3], [11, 7, 8, 0], [16, 6, 17, -1], [21, 6, 25, 0], [26, 8, 32, 2], [29, 11, 36, 8]];
    for (const [x0, y0, tx, ty] of spikes) B.poly([[x0, y0 + 6 + by], [x0 + 7, y0 + 4 + by], [tx, ty + by]], (x, y) => (y < ty + 3 + by ? C.tip : y < ty + 5 + by ? "#a02020" : C.hair));
    B.polyM([[7, 16 + by], [10, 15 + by], [10, 23 + by], [8, 21 + by]], C.hairD);
    // 빨간 머리띠
    B.rect(8, 15 + by, 29, 16 + by, (x, y) => (y === 16 + by ? C.redD : C.red)); B.rect(17, 15 + by, 20, 15 + by, C.gold);
    const locks = [[12, 3, 4, 0], [16, 3, 5, 1], [21, 3, 5, -1], [25, 3, 4, 0]];
    for (const [x, w, len, tilt] of locks) B.poly([[x - w / 2, 17 + by], [x + w / 2, 17 + by], [x + tilt, 17 + len + by]], C.hair);
    face(B, F, st, { brow: C.hairD, grin: true });
    B.p(27, 18 + by, "#a8e0ff"); B.p(27, 19 + by, "#e8f8ff"); // 땀방울
    outline(B, "#160806");
  },
  // 도적(여): 고양이귀 후드, 라벤더 단발, 보라 눈, 길게 휘날리는 진홍 목도리, 허벅지 단검
  rogue(B, st) {
    const F = { ...SKIN, lash: "#1e1030", irisD: "#4a1a8a", iris: "#a65aff", irisL: "#e0b8ff", mouth: "#c05a7a" };
    const C = { hood: "#3a3058", hoodL: "#54467e", hoodD: "#221c38", hair: "#d8ccff", hairL: "#f4f0ff", hairD: "#9e8ad8", scarf: "#e02a5a", scarfL: "#ff6088", scarfD: "#8a1238",
      suit: "#2c2840", suitL: "#403a5a", suitD: "#18162a", silver: "#d8dce8", silverD: "#8a90a8", belt: "#6a4a3a" };
    const D = { top: C.suit, topD: C.suitD, skin: SKIN.skin, skinD: SKIN.skinD, leg: "#262236", legL: "#36304a", legD: "#16142a", boot: "#3a2e40", bootL: "#54445e", bootD: "#1a1420", bootTrim: C.silver };
    const by = st.by, sw = st.sway;
    // 목도리 끝: 오른쪽 뒤로 길게 휘날림
    B.poly([[24, 31 + by], [27, 31 + by], [33 + sw, 40 + by], [35 + sw, 46 + by], [31 + sw, 44 + by], [30, 38 + by]], (x, y) => (y > 42 + by ? C.scarfD : x > 30 ? C.scarf : C.scarfL));
    // 후드 뒤 자락
    B.polyM([[8, 22 + by], [12, 28 + by], [11, 36 + by], [6, 34 + by]], (x) => (x < 8 ? C.hoodD : C.hood));
    arms(B, D, st, { sleeve: C.suit, sleeveD: C.suitD, cuff: C.silver });
    legs(B, D, st);
    // 허벅지 단검집 (오른쪽)
    B.rect(24, 45, 25, 48, C.belt); B.rect(24, 43, 25, 44, C.silver); B.p(24, 43, "#ffffff");
    // 몸: 짧은 재킷 + 교차 벨트 + 은 버클, 반바지
    B.polyM([[12, 33 + by], [19, 32 + by], [19, 44], [13, 44]], (x, y) => (x < 14 ? C.suitD : y < 36 + by ? C.suitL : C.suit));
    B.line(13, 34 + by, 24, 43, C.belt); B.line(24, 34 + by, 13, 43, C.belt);
    B.rect(17, 38 + (by > 0 ? 1 : 0), 20, 39 + (by > 0 ? 1 : 0), C.silver); B.p(18, 38 + (by > 0 ? 1 : 0), "#ffffff");
    B.polyM([[13, 43], [19, 43], [19, 46], [13, 46]], (x, y) => (y === 43 ? C.belt : x < 15 ? C.suitD : C.suit));
    B.rect(13, 43, 15, 45, "#7a5a48"); B.p(14, 44, C.silver); // 주머니
    head(B, F, st);
    // 라벤더 단발
    B.polyM([[7, 15 + by], [11, 15 + by], [11, 28 + by], [8, 29 + by]], (x, y) => (x < 9 ? C.hairD : y > 25 + by ? C.hairD : C.hair));
    const locks = [[10.5, 4, 8, 1], [14, 4, 9, 0], [17.5, 3, 6, 0], [20.5, 4, 8, 0], [24, 4, 9, 0], [27.5, 4, 8, -1]];
    for (const [x, w, len, tilt] of locks) B.poly([[x - w / 2, 14 + by], [x + w / 2, 14 + by], [x + tilt, 14 + len + by]], (xx, yy) => (Math.abs(xx + 0.5 - x) > w / 2 - 1 ? C.hairD : yy < 16 + by ? C.hairL : C.hair));
    // 고양이귀 후드: 머리를 감싸고 얼굴 둘레를 둥글게
    B.ell(18.5, 15.5 + by, 13.2, 11, (x, y, dx, dy) => (Math.abs(dx) > 0.8 ? C.hoodD : dy < -0.55 && Math.abs(dx) < 0.5 ? C.hoodL : C.hood),
      (x, y) => { const dx = (x + 0.5 - 18.5) / 10.4, dy = (y + 0.5 - 21 - by) / 8.8; return dx * dx + dy * dy > 1 || y < 14 + by; });
    B.polyM([[8, 9 + by], [6, 1 + by], [13, 6 + by]], (x, y) => (y > 3 + by && x > 7 ? "#ff8ab0" : C.hood)); // 귀 (안쪽 분홍)
    B.pm(7, 4 + by, C.hoodD);
    B.rect(9, 13 + by, 28, 13 + by, C.hoodD); B.pm(9, 14 + by, C.hoodD);
    // 목도리 감긴 부분
    B.rect(12, 30 + by, 25, 33 + by, (x, y) => (y === 33 + by ? C.scarfD : x < 14 ? C.scarfD : y === 30 + by ? C.scarfL : C.scarf));
    face(B, F, st, { fem: true, smirk: true });
    outline(B, "#120a1e");
  },
  // 성직자(여): 금빛 후광, 긴 백금발, 흰 베일(금테·파란 안감), 사파이어 관, 흰 성의
  priest(B, st) {
    const F = { ...SKIN, lash: "#4a3420", irisD: "#1a4aa8", iris: "#4a9aff", irisL: "#b8e4ff", mouth: "#d0707a" };
    const C = { hair: "#ffe49a", hairL: "#fff4cc", hairD: "#e0b660", hairDD: "#b8883a", white: "#fcfbf6", whiteL: "#ffffff", whiteD: "#d4d4e2", gold: "#ffd75a", goldL: "#fff1a8", goldD: "#c08a28",
      blue: "#2f62e0", blueL: "#5a90ff", blueD: "#1a3a98" };
    const D = { top: C.white, topD: C.whiteD, skin: SKIN.skin, skinD: SKIN.skinD, leg: "#f0eef8", legD: "#c8c8d8", boot: C.white, bootL: C.whiteL, bootD: C.whiteD, bootTrim: C.gold };
    const by = st.by, f = st.f, sw = st.sway;
    // 반짝이 (성스러운 빛)
    for (const [x, y, k] of [[3, 24, 0], [34, 20, 2], [5, 42, 1], [33, 38, 3]]) { if ((f + k) % 4 < 2) { B.p(x, y, C.goldL); if ((f + k) % 4 === 0) { B.p(x - 1, y, C.gold); B.p(x + 1, y, C.gold); B.p(x, y - 1, C.gold); B.p(x, y + 1, C.gold); } } }
    // 긴 백금발 (무릎까지)
    B.polyM([[8, 18 + by], [13, 20 + by], [12, 38 + by], [11 - sw, 50], [6 - sw, 48], [5, 32 + by]], (x, y) => (x < 7 ? C.hairD : y > 42 ? C.hairD : x > 10 ? C.hair : C.hairL));
    // 베일 뒷자락 (파란 안감)
    B.polyM([[7, 14 + by], [11, 15 + by], [9, 40 + by], [4 - sw, 42 + by], [4, 26 + by]], (x, y) => (x > 8 ? C.blue : x < 6 ? C.whiteD : C.white));
    arms(B, D, st, { sleeve: C.white, sleeveD: C.whiteD, cuff: C.gold, wide: true });
    legs(B, D, st, { top: 46 });
    // 흰 성의 + 파란 앞판 + 금 십자 + 금 자수
    B.polyM([[12, 33 + by], [19, 32 + by], [19, 51], [10, 51]], (x, y) => (y >= 50 ? C.gold : x < 13 ? C.whiteD : C.white));
    B.rect(16, 36 + by, 21, 50, (x) => (x === 16 ? C.blueD : x === 21 ? C.blueD : x === 17 ? C.blueL : C.blue));
    B.rect(18, 40, 19, 47, C.gold); B.rect(17, 42, 20, 43, C.gold); B.p(18, 40, C.goldL);
    for (const y of [38, 41, 44, 47]) { B.p(14, y, C.gold); B.p(23, y, C.gold); }
    B.polyM([[11, 30 + by], [19, 30 + by], [19, 37 + by], [13, 36 + by]], (x, y) => (y >= 36 + by ? C.gold : C.whiteL)); // 둥근 옷깃(금테): 턱 아래를 채움
    B.rect(18, 35 + by, 19, 36 + by, C.blue); B.p(18, 35 + by, C.blueL);
    head(B, F, st);
    // 앞머리 + 옆머리
    B.polyM([[7, 15 + by], [11, 15 + by], [11, 30 + by], [8, 33 + by]], (x, y) => (x < 9 ? C.hairD : C.hair));
    const locks = [[10.5, 4, 7, 1], [14, 4, 8, 0], [17.5, 3, 5, 0], [20.5, 3, 5, 0], [24, 4, 8, 0], [27.5, 4, 7, -1]];
    for (const [x, w, len, tilt] of locks) B.poly([[x - w / 2, 15 + by], [x + w / 2, 15 + by], [x + tilt, 15 + len + by]], (xx, yy) => (Math.abs(xx + 0.5 - x) > w / 2 - 1 ? C.hairD : yy < 18 + by ? C.hairL : C.hair));
    // 흰 베일 (머리 위, 금테)
    B.ell(18.5, 15.5 + by, 12.6, 9.6, (x, y, dx, dy) => (Math.abs(dx) > 0.8 ? C.whiteD : dy < -0.5 ? C.whiteL : C.white), (x, y) => y <= 15 + by);
    B.rect(6, 15 + by, 31, 15 + by, C.gold); B.rect(7, 14 + by, 30, 14 + by, C.goldD);
    // 사파이어 관
    B.art(16, 12 + by, ["..kk..", ".kBBk.", "kBWbBk", ".kBBk."], { k: C.goldD, B: C.blue, b: C.blueD, W: "#d8f0ff" });
    // 후광 (머리 위 금빛 고리)
    B.ell(18.5, 3 + by, 9, 2.4, (x, y) => (y < 3 + by ? C.goldL : C.gold), (x, y) => { const dx = (x + 0.5 - 18.5) / 6.6, dy = (y + 0.5 - 3 - by) / 1.1; return dx * dx + dy * dy > 1; });
    B.p(11 + (f % 4) * 4, 2 + by, "#ffffff");
    face(B, F, st, { fem: true, smile: true });
    outline(B, "#3a2a1a");
  },
};

export const HERO_CLASSES = Object.keys(HEROES);
export const HERO_ANIMS = { idle: 4, run: 4, hit: 1 };
/** 픽셀 배열(색 문자열 또는 null) */
export function paintHero(cls, anim, f) {
  const B = canvas();
  HEROES[cls](B, poseOf(anim, f));
  return B.c;
}
export function heroRGBA(cls, anim, f) {
  const px = paintHero(cls, anim, f), out = new Uint8ClampedArray(HW * HH * 4);
  px.forEach((c, i) => { if (!c) return; const [r, g, b] = hx(c); out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255; });
  return out;
}
/** 브라우저: 프레임을 캔버스로 만들어 아틀라스에 등록 (hero_<직업>_<idle|run|hit>_anim_f<n>) */
export function registerHeroes(add) {
  for (const cls of HERO_CLASSES) for (const [anim, n] of Object.entries(HERO_ANIMS)) for (let f = 0; f < n; f++) {
    const cv = document.createElement("canvas");
    cv.width = HW; cv.height = HH;
    cv.getContext("2d").putImageData(new ImageData(heroRGBA(cls, anim, f), HW, HH), 0, 0);
    add(`hero_${cls}_${anim}_anim_f${f}`, cv);
  }
}

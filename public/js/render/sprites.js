// 캐릭터·몬스터 스프라이트: pixelfx 픽셀 리그(3D 뼈대)를 직업 색으로 다시 칠해서 사용
import { posed, WEAPONS, skeleton } from "../../vendor/pixelfx/core/rig.js";
import { DUMMY_PAL } from "../../vendor/pixelfx/core/actor.js";
import { hex } from "../../vendor/pixelfx/core/color.js";
import { READY } from "../../vendor/pixelfx/core/poses.js";
import { STAND } from "../../vendor/pixelfx/core/rig.js";
import { CLASS_INFO } from "/shared/classes.js";
import { WEAPON_TYPES } from "/shared/items.js";

const C = (s) => hex(s) >>> 0;
const WC = { wood: C("#9a6a3a"), woodL: C("#c08a50"), woodD: C("#5e3c1e"), iron: C("#8890a0"), ironL: C("#e8edf6"), ironD: C("#4a5060"), gem: C("#7ff0ff"), gemD: C("#2a9ab0"), white: C("#ffffff") };

// ── 리그에 없는 무기 추가: 나무 몽둥이, 지팡이, 메이스
WEAPONS.club = { draw(T) { for (let i = -3; i <= 15; i += 0.4) { const w = 0.9 + Math.max(0, (i - 2) / 13) * 1.9; for (let k = -w; k <= w + 0.01; k += 0.4) T(i, k, k < -w * 0.4 ? WC.woodL : k > w * 0.4 ? WC.woodD : WC.wood); } } };
WEAPONS.staff = { two: -8, draw(T) {
  for (let i = -12; i <= 26; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? WC.woodD : WC.wood);
  for (let i = 25; i <= 32; i += 0.4) for (let k = -3.4; k <= 3.4; k += 0.4) { const d = Math.hypot(i - 28.5, k); if (d < 3.4) T(i, k, d < 1.6 ? WC.white : k < 0 ? WC.gem : WC.gemD); }
} };
WEAPONS.mace = { draw(T) {
  for (let i = -3; i <= 9; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? WC.woodD : WC.wood);
  for (let i = 8; i <= 16; i += 0.4) for (let k = -4.6; k <= 4.6; k += 0.4) { const d = Math.hypot(i - 12, k); if (d < 3.6 || (d < 4.6 && (Math.abs(k) < 0.5 || Math.abs(i - 12) < 0.5))) T(i, k, k < -1 ? WC.ironL : k > 1.5 ? WC.ironD : WC.iron); }
} };

// ── 포즈 (리그 좌표: 발 기준, y 음수가 위)
const W = (p, extra) => ({ ...p, ...extra });
const G = { ...READY };
export const POSES = {
  idle: [W(G, {}), W(G, { crouch: 4, fy: -20, by: -20 })],
  walk: [
    W(G, { ffx: 7, fbx: -6, fby: -6, crouch: 2, bx: 7 }),
    W(G, { ffx: 1, fbx: 0, crouch: 3 }),
    W(G, { ffx: -6, ffy: -6, fbx: 7, crouch: 2, bx: 11 }),
    W(G, { ffx: 1, fbx: 0, crouch: 3 }),
  ],
  slash: [W(G, { fx: -2, fy: -32, sa: -2.4, lean: -2, crouch: 2 }), W(G, { fx: 15, fy: -15, sa: 0.6, lean: 4, ffx: 9, crouch: 4 }), W(G, { fx: 13, fy: -18, sa: 0.3, lean: 2, ffx: 8, crouch: 3 })],
  thrust: [W(G, { fx: 2, fy: -21, sa: 0, lean: -3 }), W(G, { fx: 17, fy: -21, sa: 0, lean: 5, ffx: 10 }), W(G, { fx: 14, fy: -21, sa: 0, lean: 3, ffx: 8 })],
  stab: [W(G, { fx: 4, fy: -22, sa: 0.1, lean: 1 }), W(G, { fx: 17, fy: -20, sa: 0.1, lean: 6, ffx: 10, crouch: 4 }), W(G, { fx: 10, fy: -20, sa: 0, lean: 2 })],
  smash: [W(G, { fx: -4, fy: -36, sa: -2.7, lean: -3, two: 1 }), W(G, { fx: 12, fy: -10, sa: 0.9, lean: 6, crouch: 5, two: 1, ffx: 8 }), W(G, { fx: 12, fy: -12, sa: 0.7, lean: 4, crouch: 4, two: 1 })],
  punch: [W(G, { fx: 4, fy: -24, lean: -1 }), W(G, { fx: 17, fy: -25, lean: 4, ffx: 9 }), W(G, { bx: 16, by: -24, fx: 3, fy: -24, lean: 4, ffx: 9 })],
  kick: [W(G, { lean: -3, ffx: 4, ffy: -8 }), W(G, { lean: -5, ffx: 15, ffy: -16, fx: -4, fy: -26 }), W(G, { lean: -2, ffx: 8, ffy: -6 })],
  shoot: [W(G, { weapon: "bow", sa: 0, fx: 13, fy: -26, bx: 5, by: -27, pull: 1, nocked: 1 }), W(G, { weapon: "bow", sa: 0, fx: 13, fy: -26, bx: 1, by: -27, pull: 1, nocked: 1, lean: -1 }), W(G, { weapon: "bow", sa: 0, fx: 13, fy: -26, bx: 7, by: -26 })],
  cast: [W(G, { fx: 6, fy: -32, bx: 8, by: -30, lean: -2 }), W(G, { fx: 15, fy: -27, bx: 14, by: -26, lean: 3, ffx: 8 }), W(G, { fx: 12, fy: -24, bx: 11, by: -23, lean: 1 })],
  channel: [W(G, { fx: -2, fy: -38, bx: 5, by: -38, crouch: 1 }), W(G, { fx: -3, fy: -39, bx: 6, by: -39, crouch: 0 })],
  guard: [W(G, { fx: 9, fy: -27, sa: -1.5, bx: 10, by: -24, crouch: 4, lean: 1 })],
  dash: [W(G, { lean: 8, crouch: 5, ffx: -9, fbx: 9, fby: -3, fx: -4, fy: -18, bx: -2, by: -18 })],
  spin: [W(G, { yaw: 1.2, fx: 14, fy: -20 }), W(G, { yaw: 2.6, fx: 14, fy: -20 }), W(G, { yaw: 4.2, fx: 14, fy: -20 }), W(G, { yaw: 5.6, fx: 14, fy: -20 })],
  combo: [W(G, { fx: -2, fy: -32, sa: -2.4, lean: -2 }), W(G, { fx: 15, fy: -15, sa: 0.6, lean: 4, ffx: 9 }), W(G, { fx: 14, fy: -30, sa: -1.6, lean: 2, ffx: 9 }), W(G, { fx: 15, fy: -14, sa: 0.7, lean: 4, ffx: 9 })],
  hurt: [W(G, { lean: -5, crouch: 2, fx: 2, fy: -22 })],
};
export const ANIM_TIME = { slash: 0.32, thrust: 0.28, stab: 0.22, smash: 0.42, punch: 0.26, kick: 0.32, shoot: 0.36, cast: 0.4, channel: 2, guard: 0.6, dash: 0.3, spin: 0.36, combo: 0.6, hurt: 0.2 };

// ── 생김새 → 팔레트 매핑
const DP = Object.fromEntries(Object.entries(DUMMY_PAL).map(([k, v]) => [k, hex(v) >>> 0]));
function remapper(look) {
  const m = new Map();
  const a = look.armor.map(C), c = look.core.map(C);
  m.set(DP.A, a[0]); m.set(DP.B, a[1]); m.set(DP.C, a[2]); m.set(DP.D, a[3]);
  m.set(DP.E, c[0]); m.set(DP.F, c[1]); m.set(DP.G, c[2]); m.set(DP.J, c[2]);
  m.set(DP.m, C(look.mark ?? "#ffffff"));
  return m;
}

// ── 머리 장식 (얼굴 위치에 직접 그림)
function drawHead(put, look, sk) {
  const [hx, hy] = sk.joints.head, [cx, cy] = sk.joints.crown;
  const x = Math.round(cx), y = Math.round(cy);
  const col = C(look.headColor ?? "#555566"), dark = darken(col, 0.6), lite = lighten(col, 1.3), ink = DP.k;
  switch (look.head) {
    case "hood":
      for (let j = -1; j <= 5; j++) for (let i = -5; i <= 4; i++) { const e = (i * i) / 25 + ((j - 2) * (j - 2)) / 14; if (e < 1 && !(j > 2 && i > 0 && i < 4)) put(x + i, y + j, e > 0.75 ? ink : i < -1 ? dark : col); }
      for (let j = 3; j <= 8; j++) put(x - 5 - (j > 5 ? 1 : 0), y + j, dark);
      break;
    case "hat":
      for (let i = -8; i <= 8; i++) put(x + i, y + 1, i === -8 || i === 8 ? ink : dark);
      for (let j = 0; j <= 9; j++) { const w = Math.max(0, 4 - Math.floor(j / 2.4)); for (let i = -w; i <= w; i++) put(x + i - Math.floor(j / 3), y - j, i === -w || i === w ? ink : i < 0 ? dark : col); }
      put(x - 4, y - 9, lite);
      break;
    case "mitre":
      for (let j = 0; j <= 9; j++) { const w = j < 6 ? 3 : 3 - (j - 5); for (let i = -w; i <= w; i++) put(x + i, y - j, i === -w || i === w ? ink : i === 0 ? C("#e8c060") : col); }
      break;
    case "helm":
      for (let j = -1; j <= 5; j++) for (let i = -5; i <= 5; i++) { const e = (i * i) / 25 + ((j - 2) * (j - 2)) / 12; if (e < 1) put(x + i, y + j, e > 0.78 ? ink : j === 3 && i > 0 ? ink : i < -2 ? dark : j < 1 ? lite : col); }
      break;
    case "band":
      for (let i = -4; i <= 4; i++) put(x + i, y + 2, col);
      put(x - 5, y + 2, col); put(x - 6, y + 3, col); put(x - 7, y + 3, dark); put(x - 7, y + 4, dark);
      break;
    case "cap":
      for (let j = 0; j <= 3; j++) for (let i = -4; i <= 4; i++) { const e = (i * i) / 16 + ((j - 2) * (j - 2)) / 5; if (e < 1) put(x + i, y + j, e > 0.7 ? ink : col); }
      for (let i = 2; i <= 6; i++) put(x + i, y + 3, dark);
      break;
  }
}
const darken = (c, k) => (c & 0xff000000) | (Math.round(((c >>> 16) & 255) * k) << 16) | (Math.round(((c >>> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
const lighten = (c, k) => (c & 0xff000000) | (Math.min(255, Math.round(((c >>> 16) & 255) * k)) << 16) | (Math.min(255, Math.round(((c >>> 8) & 255) * k)) << 8) | Math.min(255, Math.round((c & 255) * k));

// 나무 방패 / 철 방패 (앞쪽 손 위치에 정면으로)
function drawShield(put, sk, type) {
  const [x0, y0] = sk.joints.handF;
  const x = Math.round(x0) + 1, y = Math.round(y0) - 1;
  const iron = type === "iron";
  for (let j = -7; j <= 7; j++) for (let i = -5; i <= 5; i++) {
    const e = (i * i) / 25 + (j * j) / 49;
    if (e > 1) continue;
    const c = e > 0.7 ? WC.ironD : iron ? (i < -1 ? WC.ironL : WC.iron) : Math.abs(i) < 1 ? WC.ironD : (i + 10) % 4 < 2 ? WC.wood : WC.woodL;
    put(x + i, y + j, e > 0.88 ? DP.k : c);
  }
  put(x, y, WC.ironL);
}

const cache = new Map();
/**
 * 스프라이트 하나: { canvas, ox, oy } (ox, oy = 발 위치)
 * look: { armor, core, mark, weapon, head, headColor, shield }
 */
export function sprite(look, lookKey, anim, frame, yaw = 0, scale = 1) {
  const key = `${lookKey}|${anim}|${frame}|${yaw}|${scale}`;
  let s = cache.get(key);
  if (s) return s;
  const list = POSES[anim] ?? POSES.idle;
  let pose = { ...list[frame % list.length] };
  if (anim !== "shoot") {
    if (look.weapon && look.weapon !== "bow") { pose.weapon = look.weapon; if (pose.sa == null) pose.sa = look.weapon === "staff" ? -1.4 : -0.9; }
    else if (look.weapon === "bow") { pose.weapon = "bow"; pose.sa = pose.sa ?? -1.3; }
    else delete pose.weapon;
  }
  if (pose.weapon === "staff" && anim !== "smash") pose.sa = Math.min(pose.sa ?? -1.4, -1.0);
  if (["greatsword", "hammer", "launcher", "scythe", "spear"].includes(pose.weapon) && anim !== "idle") pose.two = 1;
  if (yaw && anim !== "spin") pose.yaw = yaw;
  const r = posed(pose);
  const sk = skeleton(pose);
  const remap = remapper(look);
  const pad = 14;
  const x0 = Math.min(r.x0, -16) - pad, y0 = Math.min(r.y0, -40) - pad - 10, x1 = Math.max(r.x1, 16) + pad, y1 = r.y1 + 3;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const buf = new Uint32Array(w * h);
  const put = (x, y, c) => { const i = (y - y0) * w + (x - x0); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) buf[i] = c; };
  for (let i = 0; i < r.n; i++) {
    const c = r.color[i] >>> 0;
    put(r.xs[i], r.ys[i], remap.get(c) ?? c);
  }
  if (look.head) drawHead(put, look, sk);
  if (look.shield && !["shoot"].includes(anim)) drawShield(put, sk, look.shield);
  // 발밑 그림자는 렌더러가 따로
  const cv = new OffscreenCanvas(w * scale, h * scale);
  const g = cv.getContext("2d");
  const img = new ImageData(new Uint8ClampedArray(buf.buffer), w, h);
  if (scale === 1) g.putImageData(img, 0, 0);
  else {
    const tmp = new OffscreenCanvas(w, h);
    tmp.getContext("2d").putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, w * scale, h * scale);
  }
  s = { canvas: cv, ox: -x0 * scale, oy: -y0 * scale, w: w * scale, h: h * scale };
  cache.set(key, s);
  if (cache.size > 4000) cache.delete(cache.keys().next().value);
  return s;
}

/** 플레이어 생김새: 직업 + 장착 무기·보조장비 */
export function playerLook(cls, weaponType, offType) {
  const base = CLASS_INFO[cls]?.look ?? CLASS_INFO.adventurer.look;
  const rigW = weaponType ? WEAPON_TYPES[weaponType]?.rig ?? null : base.weapon;
  const look = { ...base, weapon: weaponType === "knuckle" ? null : rigW, shield: offType === "shield" ? (cls === "adventurer" ? "wood" : "iron") : null };
  if (!weaponType) look.weapon = null;
  return { look, key: `p:${cls}:${weaponType}:${offType}` };
}
export function monsterLook(def) {
  const r = def.look.rig;
  return { look: r, key: `m:${def.name}` };
}

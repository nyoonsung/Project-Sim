// 큰 순간의 연출: 화면 번쩍임 · 퍼지는 충격 고리 · 회전하는 빛줄기 · 불꽃 입자
// 보스 처치·정예 처치·레벨 업·별 밝힘 같은 '가끔' 일어나는 일에만 씀 → 미리 정한 개수 안에서만 그려서 가벼움
import { preset } from "../quality.js";

const rings = [], rays = [], sparks = [];
let flash = null;
const MAX = { rings: 24, rays: 4, sparks: 260 };
const now = () => performance.now() / 1000;
const level = () => (preset().name === "낮음" ? 0 : preset().name === "보통" ? 1 : 2);

/** 화면 전체 번쩍임 (색, 세기 0~1, 길이 초) */
export function screenFlash(color = "#ffffff", a = 0.5, d = 0.3) {
  if (!flash || a >= flash.a * Math.max(0, 1 - (now() - flash.t0) / flash.d)) flash = { color, a: Math.min(0.8, a), d, t0: now() };
}
/** 퍼지는 고리 (월드 좌표) */
export function shockRing(x, y, { color = "#ffd35a", r0 = 8, r1 = 140, d = 0.6, w = 4, delay = 0 } = {}) {
  if (rings.length >= MAX.rings) rings.shift();
  rings.push({ x, y, color, r0, r1, d, w, t0: now() + delay });
}
/** 회전하는 빛줄기 */
export function godRays(x, y, { color = "#ffe8a0", d = 1.4, n = 10, len = 260 } = {}) {
  if (level() === 0) return;
  if (rays.length >= MAX.rays) rays.shift();
  rays.push({ x, y, color, d, n: level() === 1 ? Math.ceil(n * 0.6) : n, len, t0: now(), rot: Math.random() * 6.28 });
}
/** 불꽃 입자 터뜨리기 */
export function sparkBurst(x, y, { colors = ["#ffd35a", "#ffffff", "#ff9a3a"], n = 40, speed = 220, up = 80, life = 0.9 } = {}) {
  n = Math.round(n * [0.3, 0.6, 1][level()]);
  for (let i = 0; i < n; i++) {
    if (sparks.length >= MAX.sparks) sparks.shift();
    const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.65);
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - up * Math.random(), c: colors[i % colors.length], t0: now(), life: life * (0.6 + Math.random() * 0.6), s: Math.random() < 0.2 ? 3 : 2 });
  }
}

/** 큰 순간 묶음 */
export const SPECTACLE = {
  bossKill(x, y) {
    screenFlash("#fff6d8", 0.55, 0.45);
    for (let i = 0; i < 3; i++) shockRing(x, y, { color: i === 1 ? "#ffffff" : "#ffd35a", r1: 180 + i * 70, d: 0.7 + i * 0.15, w: 6 - i, delay: i * 0.12 });
    godRays(x, y - 20, { color: "#ffe8a0", d: 1.8, n: 12, len: 320 });
    sparkBurst(x, y - 20, { n: 90, speed: 320, up: 140, life: 1.3 });
  },
  eliteKill(x, y) {
    shockRing(x, y, { color: "#ffb050", r1: 90, d: 0.45, w: 3 });
    sparkBurst(x, y - 10, { n: 18, speed: 180, colors: ["#ffb050", "#ffe08a"] });
  },
  levelUp(x, y) {
    shockRing(x, y, { color: "#7af0a0", r1: 120, d: 0.7, w: 4 });
    godRays(x, y - 16, { color: "#c8ffd8", d: 1.2, n: 8, len: 160 });
    sparkBurst(x, y - 20, { n: 36, colors: ["#7af0a0", "#ffffff", "#ffe08a"], speed: 160, up: 160 });
  },
  starLit(x, y, color = "#c8a0ff") {
    screenFlash(color, 0.45, 0.8);
    for (let i = 0; i < 4; i++) shockRing(x, y, { color: i % 2 ? "#ffffff" : color, r1: 120 + i * 90, d: 0.9 + i * 0.2, w: 4, delay: i * 0.18 });
    godRays(x, y - 20, { color, d: 2.6, n: 13, len: 360 });
    sparkBurst(x, y - 30, { n: 110, colors: [color, "#ffffff", "#ffe8b0"], speed: 260, up: 200, life: 1.6 });
  },
  phase(x, y, color = "#ff5a6e") {
    screenFlash(color, 0.25, 0.25);
    shockRing(x, y, { color, r1: 220, d: 0.55, w: 5 });
  },
};

let last = now();
/** 매 프레임 (빛 효과 위, UI 아래) */
export function drawSpectacle(ctx, cx, cy, VW, VH) {
  const t = now(), dt = Math.min(0.05, t - last);
  last = t;
  if (!rings.length && !rays.length && !sparks.length && !flash) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // 빛줄기
  for (let i = rays.length - 1; i >= 0; i--) {
    const r = rays[i], k = (t - r.t0) / r.d;
    if (k >= 1) { rays.splice(i, 1); continue; }
    const x = r.x - cx, y = r.y - cy, fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    ctx.fillStyle = r.color;
    for (let j = 0; j < r.n; j++) {
      const a = r.rot + (j / r.n) * Math.PI * 2 + k * 0.9, wa = 0.07 + (j % 3) * 0.025;
      const L = r.len * (0.6 + 0.4 * Math.sin(j * 2.3 + t * 3) ** 2);
      ctx.globalAlpha = 0.22 * fade;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - wa) * L, y + Math.sin(a - wa) * L * 0.7); ctx.lineTo(x + Math.cos(a + wa) * L, y + Math.sin(a + wa) * L * 0.7); ctx.closePath(); ctx.fill();
    }
  }
  // 고리
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i], k = (t - r.t0) / r.d;
    if (k < 0) continue;
    if (k >= 1) { rings.splice(i, 1); continue; }
    const e = 1 - (1 - k) ** 3, R = r.r0 + (r.r1 - r.r0) * e;
    ctx.globalAlpha = 0.85 * (1 - k);
    ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(1, r.w * (1 - k * 0.7));
    ctx.beginPath(); ctx.ellipse(r.x - cx, r.y - cy, R, R * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // 입자
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i], k = (t - p.t0) / p.life;
    if (k >= 1) { sparks.splice(i, 1); continue; }
    p.vy += 260 * dt; p.vx *= 1 - 1.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const x = p.x - cx, y = p.y - cy;
    if (x < -10 || y < -10 || x > VW + 10 || y > VH + 10) continue;
    ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c;
    ctx.fillRect(x | 0, y | 0, p.s, p.s);
  }
  ctx.globalCompositeOperation = "source-over";
  // 화면 번쩍임
  if (flash) {
    const k = (t - flash.t0) / flash.d;
    if (k >= 1) flash = null;
    else { ctx.globalAlpha = flash.a * (1 - k) ** 2; ctx.fillStyle = flash.color; ctx.fillRect(0, 0, VW, VH); }
  }
  ctx.restore();
}

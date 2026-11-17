// 스킬 연출 레이어: 등급(일반→희귀→영웅→전설→궁극기)과 숙련도(Lv.5·10)가 오를수록 화려해짐
//  - 바닥 충격파 고리, 회전하는 룬 진, 빛 기둥, 궤적 섬광, 가산 합성 불꽃, 숙련 오라
//  - 모두 월드 좌표, 'lighter' 합성으로 어둠 속에서 빛나게, 입자 수 상한으로 최적화
import { G } from "../game.js";
import { SKILLS } from "/shared/skills.js";
import { profTier } from "/shared/prof.js";
import { skillColor } from "../ui/icons.js";
import { addGlow } from "./glow.js";
import { addTrauma } from "../feel.js";

const now = () => performance.now() / 1000;
const GT = { 일반: 0, 희귀: 1, 영웅: 2, 전설: 3 };
const FX = { rings: [], runes: [], pillars: [], streaks: [], motes: [], stars: [] };
const MAX_MOTES = 420;

/** 스킬의 연출 등급 0~4 */
export function fxTier(sk) {
  if (!sk) return 0;
  if (sk.cls === "common") return sk.kind === "basic" ? 0 : 1;
  let t = GT[sk.grade] ?? 0;
  if (sk.kind === "ultimate") t = Math.max(t, 3) + 1;
  return Math.min(4, t);
}
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(c + (255 - c) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function burst(x, y, n, cols, spd = 140, opt = {}) {
  for (let i = 0; i < n; i++) {
    if (FX.motes.length >= MAX_MOTES) FX.motes.shift();
    const a = opt.dir != null ? opt.dir + (Math.random() - 0.5) * (opt.spread ?? 1.4) : Math.random() * Math.PI * 2;
    const v = spd * (0.35 + Math.random() * 0.9);
    FX.motes.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * (opt.flat ?? 0.6) - (opt.lift ?? 30), g: opt.g ?? 60, t: 0,
      life: (opt.life ?? 0.45) * (0.6 + Math.random() * 0.8), c: cols[(Math.random() * cols.length) | 0], s: Math.random() < 0.25 ? 3 : 2, tw: Math.random() < 0.3 });
  }
}
function ring(x, y, r0, r1, col, life, w = 2, k = 0.5) { FX.rings.push({ x, y, r0, r1, col, life, w, k, t0: now() }); }

/** 스킬 시전: 서버 cast 이벤트 { id, s, pl, x, y, ax, ay } */
export function castFx(e, ent) {
  const sk = SKILLS[e.s];
  if (!sk) return;
  const tier = fxTier(sk), pt = profTier(e.pl ?? 0);
  if (tier === 0 && pt === 0) return;
  const col = skillColor(sk), hi = lighten(col, 0.55);
  const x = ent?.rx ?? e.x, y = ent?.ry ?? e.y;
  const ax = e.ax ?? x, ay = e.ay ?? y;
  const steps = (sk.steps ?? []).map((s) => s.do);
  const ranged = steps.some((d) => d === "proj" || d === "line" || d === "beam");
  const areaAt = steps.includes("area") || steps.includes("zone");
  const range = sk.range ?? 200;
  const dx = ax - x, dy = ay - y, d = Math.hypot(dx, dy) || 1;
  const tx = areaAt ? x + (dx / d) * Math.min(d, range) : x, ty = areaAt ? y + (dy / d) * Math.min(d, range) : y;
  const aim = Math.atan2(dy, dx);
  const mine = e.id === G.you;
  // 기본 공격: 숙련도가 오르면 작은 섬광만
  if (sk.kind === "basic") {
    burst(x + Math.cos(aim) * 16, y - 12 + Math.sin(aim) * 10, 3 + pt * 3, pt >= 2 ? ["#fff6c0", "#ffd35a", hi] : [hi, "#ffffff"], 110, { dir: aim, spread: 0.8, life: 0.25 });
    if (pt >= 2) addGlow(x, y - 10, 40, "#ffd35a", 0.25);
    return;
  }
  // 1단계(희귀~): 발밑 충격파
  ring(x, y, 6, 30 + tier * 9 + pt * 6, col, 0.35 + tier * 0.05, 2);
  addGlow(x, y - 8, 60 + tier * 25, col, 0.25 + tier * 0.08);
  burst(x, y - 10, 5 + tier * 5 + pt * 6, [col, hi, "#ffffff"], 110 + tier * 25, { life: 0.4 + tier * 0.06 });
  // 2단계(영웅~): 회전 룬 진 + 궤적 섬광
  if (tier >= 2 || pt >= 1) FX.runes.push({ x, y, r: 26 + tier * 6, col, hi, t0: now(), life: 0.55 + tier * 0.1, n: 6 + tier * 2 });
  if (ranged && tier >= 2) FX.streaks.push({ x, y: y - 14, x2: x + Math.cos(aim) * Math.min(d, range), y2: y - 14 + Math.sin(aim) * Math.min(d, range), col, hi, t0: now(), life: 0.22, w: 2 + tier });
  if (areaAt && tier >= 1) { ring(tx, ty, 4, 34 + tier * 12, col, 0.5, 3, 0.5); ring(tx, ty, 2, 20 + tier * 8, hi, 0.4, 1.5, 0.5); }
  // 3단계(전설~): 빛 기둥 + 두 겹 고리 + 화면 흔들림
  if (tier >= 3) {
    FX.pillars.push({ x: tx, y: ty, col, hi, t0: now(), life: 0.55 + (tier - 3) * 0.25, w: 14 + (tier - 3) * 10 });
    ring(tx, ty, 10, 70 + (tier - 3) * 30, "#ffffff", 0.5, 2, 0.45);
    burst(tx, ty - 20, 18 + (tier - 3) * 14, [hi, "#ffffff", col, "#ffe08a"], 220, { life: 0.7, lift: 60 });
    addGlow(tx, ty - 20, 150 + (tier - 3) * 60, col, 0.55);
    if (mine) addTrauma(tier >= 4 ? 0.5 : 0.35);
  } else if (tier >= 2 && mine) addTrauma(0.18);
  // 4단계(궁극기): 사방으로 뻗는 빛살 별
  if (tier >= 4) FX.stars.push({ x: tx, y: ty - 18, col, hi, t0: now(), life: 0.7, n: 12 });
  // 숙련 Lv.5: 푸른 잔광, Lv.10: 황금 오라
  if (pt >= 1) burst(x, y - 18, 6, pt >= 2 ? ["#ffd35a", "#fff6c0", "#ffb347"] : ["#8ae0ff", "#d0f4ff"], 60, { life: 0.8, lift: 70, g: -30 });
  if (pt >= 2) { ring(x, y, 4, 46, "#ffd35a", 0.6, 2, 0.5); addGlow(x, y - 10, 90, "#ffb347", 0.35); }
}

/** 스킬에 맞은 적: 상위 등급일수록 큰 불꽃 */
export function hitFx(ent, e) {
  const sk = e.sk && SKILLS[e.sk];
  if (!sk || !ent) return;
  const tier = fxTier(sk);
  if (tier < 2 && !e.c) return;
  const col = skillColor(sk), hi = lighten(col, 0.6);
  burst(ent.rx, ent.ry - 14, 4 + tier * 3 + (e.c ? 6 : 0), [col, hi, "#ffffff"], 150 + tier * 20, { life: 0.35 });
  if (tier >= 3 || e.c) ring(ent.rx, ent.ry - 2, 4, 22 + tier * 4, e.c ? "#ffe08a" : col, 0.28, 2, 0.5);
  if (e.c && tier >= 3) FX.stars.push({ x: ent.rx, y: ent.ry - 16, col: "#ffe08a", hi: "#ffffff", t0: now(), life: 0.3, n: 8, small: true });
  addGlow(ent.rx, ent.ry - 12, 36 + tier * 10, col, 0.25 + (e.c ? 0.2 : 0));
}

/** 숙련도 레벨업: 황금 기둥 + 별빛 */
export function profUpFx(e, ent) {
  const x = ent?.rx ?? e.x, y = ent?.ry ?? e.y, big = e.lv >= 5;
  FX.pillars.push({ x, y, col: big ? "#ffb347" : "#8ab0ff", hi: "#ffffff", t0: now(), life: big ? 1.1 : 0.7, w: big ? 20 : 12 });
  ring(x, y, 6, big ? 80 : 50, big ? "#ffd35a" : "#9ad0ff", 0.8, 3, 0.45);
  burst(x, y - 24, big ? 40 : 20, big ? ["#ffd35a", "#fff6c0", "#ffffff", "#ffb347"] : ["#9ad0ff", "#ffffff"], 170, { life: 1, lift: 90, g: 20 });
  addGlow(x, y - 20, big ? 200 : 120, big ? "#ffb347" : "#8ab0ff", 0.6);
}

export function tickSkillFx(dt) {
  for (const p of FX.motes) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 1 - 3 * dt; }
  if (FX.motes.length) FX.motes = FX.motes.filter((p) => p.t < p.life);
  const t = now();
  for (const k of ["rings", "runes", "pillars", "streaks", "stars"]) if (FX[k].length) FX[k] = FX[k].filter((o) => t - o.t0 < o.life);
}

export function drawSkillFx(ctx, cx, cy) {
  const t = now();
  if (!FX.rings.length && !FX.motes.length && !FX.runes.length && !FX.pillars.length && !FX.streaks.length && !FX.stars.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // 바닥 고리
  for (const r of FX.rings) {
    const k = (t - r.t0) / r.life, e = 1 - Math.pow(1 - k, 3);
    const rad = r.r0 + (r.r1 - r.r0) * e;
    ctx.globalAlpha = Math.max(0, 1 - k) * 0.9;
    ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - k * 0.5);
    ctx.beginPath(); ctx.ellipse(r.x - cx, r.y - cy, rad, rad * r.k, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // 회전 룬 진
  for (const r of FX.runes) {
    const k = (t - r.t0) / r.life, a = (1 - k) * (k < 0.15 ? k / 0.15 : 1);
    const rot = (t - r.t0) * 3, x = r.x - cx, y = r.y - cy;
    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = r.col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, r.r, r.r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, r.r * 0.7, r.r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = r.hi;
    for (let i = 0; i < r.n; i++) {
      const q = rot + (i / r.n) * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(q) * r.r * 0.85) - 1, Math.round(y + Math.sin(q) * r.r * 0.425) - 1, 3, 3);
    }
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) { const q = -rot * 0.7 + (i * Math.PI * 2) / 3; const px = x + Math.cos(q) * r.r * 0.7, py = y + Math.sin(q) * r.r * 0.35; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  // 궤적 섬광
  for (const s of FX.streaks) {
    const k = (t - s.t0) / s.life;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.lineCap = "round";
    ctx.strokeStyle = s.col; ctx.lineWidth = s.w * 2 * (1 - k);
    ctx.beginPath(); ctx.moveTo(s.x - cx, s.y - cy); ctx.lineTo(s.x2 - cx, s.y2 - cy); ctx.stroke();
    ctx.strokeStyle = s.hi; ctx.lineWidth = Math.max(1, s.w * (1 - k));
    ctx.stroke();
  }
  // 빛 기둥
  for (const p of FX.pillars) {
    const k = (t - p.t0) / p.life, a = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
    const x = p.x - cx, y = p.y - cy, w = p.w * (1 - k * 0.4), h = 190;
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, p.col); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = a * 0.7; ctx.fillStyle = g; ctx.fillRect(x - w, y - h, w * 2, h);
    const g2 = ctx.createLinearGradient(x - w * 0.35, 0, x + w * 0.35, 0);
    g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(0.5, p.hi); g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = a; ctx.fillStyle = g2; ctx.fillRect(x - w * 0.35, y - h, w * 0.7, h);
  }
  // 빛살 별
  for (const s of FX.stars) {
    const k = (t - s.t0) / s.life, len = (s.small ? 26 : 90) * (0.4 + k * 0.8);
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = s.hi; ctx.lineWidth = s.small ? 1 : 2;
    ctx.beginPath();
    for (let i = 0; i < s.n; i++) {
      const q = (i / s.n) * Math.PI * 2 + k * 0.6, l = len * (i % 2 ? 0.55 : 1);
      ctx.moveTo(s.x - cx, s.y - cy); ctx.lineTo(s.x - cx + Math.cos(q) * l, s.y - cy + Math.sin(q) * l * 0.7);
    }
    ctx.stroke();
  }
  // 불꽃·빛 입자
  for (const p of FX.motes) {
    const k = p.t / p.life;
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.5) * (p.tw ? 0.6 + Math.sin(t * 40 + p.x) * 0.4 : 1);
    ctx.fillStyle = p.c;
    ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), p.s, p.s);
  }
  ctx.restore();
}

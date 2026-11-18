// 스킬 연출 레이어: 등급(일반→희귀→영웅→전설→궁극기)과 숙련도(Lv.5·10)가 오를수록 화려해짐
//  - 바닥 충격파 고리, 회전하는 룬 진, 빛 기둥, 궤적 섬광, 가산 합성 불꽃, 숙련 오라
//  - 모두 월드 좌표, 'lighter' 합성으로 어둠 속에서 빛나게, 입자 수 상한으로 최적화
import { G } from "../game.js";
import { othersScale } from "../quality.js";
import { SKILLS } from "/shared/skills.js";
import { profTier } from "/shared/prof.js";
import { skillColor } from "../ui/icons.js";
import { addGlow } from "./glow.js";
import { addTrauma } from "../feel.js";

const now = () => performance.now() / 1000;
const GT = { 일반: 0, 희귀: 1, 영웅: 2, 전설: 3 };
const FX = { rings: [], runes: [], pillars: [], streaks: [], motes: [], stars: [], sweeps: [] };
export const SFX_LIMITS = { motes: 420 };

const beams = new Map();
function beam(col) {
  let c = beams.get(col);
  if (c) return c;
  c = new OffscreenCanvas(32, 1);
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 32, 0);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, col); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 1);
  beams.set(col, c);
  return c;
}
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
    if (FX.motes.length >= SFX_LIMITS.motes) FX.motes.shift();
    const a = opt.dir != null ? opt.dir + (Math.random() - 0.5) * (opt.spread ?? 1.4) : Math.random() * Math.PI * 2;
    const v = spd * (0.35 + Math.random() * 0.9);
    FX.motes.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * (opt.flat ?? 0.6) - (opt.lift ?? 30), g: opt.g ?? 60, t: 0,
      life: (opt.life ?? 0.45) * (0.6 + Math.random() * 0.8), c: cols[(Math.random() * cols.length) | 0], s: Math.random() < 0.25 ? 3 : 2, tw: Math.random() < 0.3 });
  }
}
function ring(x, y, r0, r1, col, life, w = 2, k = 0.5) { FX.rings.push({ x, y, r0, r1, col, life, w, k, t0: now() }); }

// 스킬 이름으로 속성 색 (불·얼음·번개·독·빛·어둠·바람·땅)
const ELEM = [
  [/화염|불|화룡|열|용암|태양|작열|폭염|화상|잔불/, ["#ff7a2a", "#ffd35a", "#fff1b0"]],
  [/서리|얼음|빙|눈|한기|냉기/, ["#7ad8ff", "#d6f6ff", "#ffffff"]],
  [/번개|뇌|전격|천둥|섬광|전기|회로/, ["#ffe94a", "#fff8c0", "#9ad0ff"]],
  [/독|맹독|부식|역병/, ["#7ae05a", "#c8ff9a", "#2a8a3a"]],
  [/성|빛|신성|축복|기도|찬가|새벽|종|백광|광휘/, ["#ffe08a", "#ffffff", "#ffd35a"]],
  [/그림자|어둠|암|연막|그늘|심연/, ["#9a6aff", "#d0b0ff", "#3a2a5a"]],
  [/바람|질풍|돌풍|회오리/, ["#a0ffd8", "#ffffff", "#6ad0b0"]],
  [/대지|땅|산사태|붕괴|지진|망치|강타/, ["#d8a060", "#ffe0a0", "#8a6030"]],
];
function elemOf(sk) { for (const [re, cols] of ELEM) if (re.test(sk.name)) return cols; return null; }
const elemCache = new Map();
const elemColors = (sk) => { if (!elemCache.has(sk.id)) elemCache.set(sk.id, elemOf(sk)); return elemCache.get(sk.id); };

/** 스킬 시전: 서버 cast 이벤트 { id, s, pl, x, y, ax, ay } */
export function castFx(e, ent) {
  const sk = SKILLS[e.s];
  if (!sk) return;
  // 모든 스킬(기본 공격 제외)은 최소 1단계 연출
  let tier = Math.max(fxTier(sk), sk.kind === "basic" ? 0 : 1), pt = profTier(e.pl ?? 0);
  // 다른 사람 스킬: 품질·설정에 따라 연출 줄임 (내 스킬은 그대로)
  if (e.id !== G.you) { const k = othersScale(); if (k < 0.5) { tier = Math.min(tier, k < 0.3 ? 1 : 2); pt = 0; } if (Math.random() > k + 0.2) return; }
  // 근접 공격: 실제로 닿는 거리(사거리 + 적 몸 크기)에 휘두름 궤적을 그림 → 보이는 것 = 맞는 범위
  const mel = (sk.steps ?? []).find((s) => s.do === "melee");
  if (mel && ent) FX.sweeps.push({ id: e.id, r: mel.range + 10, arc: mel.arc ?? 60, a: (e.a ?? 0) / 1000, t0: now(), life: 0.18, col: sk.kind === "basic" ? "#ffffff" : skillColor(sk) });
  const el = elemColors(sk);
  const col = el?.[0] ?? skillColor(sk), hi = el?.[1] ?? lighten(col, 0.55);
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
  // 기본 공격: 앞쪽 섬광 + 작은 불꽃 (숙련도가 오르면 더 크게)
  if (sk.kind === "basic") {
    burst(x + Math.cos(aim) * 16, y - 12 + Math.sin(aim) * 10, 4 + pt * 3, pt >= 2 ? ["#fff6c0", "#ffd35a", hi] : [hi, "#ffffff", col], 120, { dir: aim, spread: 0.9, life: 0.25 });
    if (ranged) FX.streaks.push({ x, y: y - 14, x2: x + Math.cos(aim) * 40, y2: y - 14 + Math.sin(aim) * 40, col, hi, t0: now(), life: 0.12, w: 2 });
    addGlow(x + Math.cos(aim) * 14, y - 12, 30 + pt * 10, pt >= 2 ? "#ffd35a" : col, 0.18 + pt * 0.05);
    return;
  }
  // 종류별 대표 연출 (모든 스킬)
  const kinds = new Set(steps);
  if (kinds.has("dash") || kinds.has("blink")) {
    // 잔상 줄기 + 출발점 먼지
    const dist = (sk.steps.find((s) => s.dist)?.dist ?? 100);
    FX.streaks.push({ x, y: y - 10, x2: x + Math.cos(aim) * dist, y2: y - 10 + Math.sin(aim) * dist, col, hi, t0: now(), life: 0.3, w: 4 + tier });
    burst(x, y - 4, 8 + tier * 3, [hi, "#ffffff", col], 90, { dir: aim + Math.PI, spread: 1.2, life: 0.4 });
  }
  if (kinds.has("buff") || kinds.has("shield") || kinds.has("parry") || kinds.has("taunt")) {
    // 위로 솟는 오라 + 두 겹 고리
    ring(x, y, 8, 34 + tier * 6, hi, 0.5, 2, 0.5); ring(x, y, 4, 22 + tier * 4, col, 0.4, 3, 0.5);
    burst(x, y - 6, 10 + tier * 4, [col, hi, "#ffffff"], 50, { life: 0.9, lift: 80, g: -40 });
    FX.pillars.push({ x, y, col, hi, t0: now(), life: 0.45, w: 8 + tier * 3 });
  }
  if (kinds.has("heal")) {
    const hc = ["#8aff9a", "#e0ffe0", "#ffffff"];
    burst(tx, ty - 6, 14 + tier * 4, hc, 40, { life: 1.0, lift: 70, g: -50 });
    ring(tx, ty, 6, 40 + tier * 6, "#8aff9a", 0.6, 2, 0.5);
    addGlow(tx, ty - 10, 80, "#8aff9a", 0.4);
  }
  if (kinds.has("melee")) {
    // 휘두른 방향으로 불꽃 부채
    burst(x + Math.cos(aim) * 28, y - 12 + Math.sin(aim) * 16, 8 + tier * 4, [col, hi, "#ffffff"], 170, { dir: aim, spread: 1.6, life: 0.32 });
  }
  if (ranged) {
    // 발사 섬광 + 궤적
    burst(x + Math.cos(aim) * 14, y - 14 + Math.sin(aim) * 8, 6 + tier * 3, [hi, "#ffffff", col], 150, { dir: aim, spread: 0.7, life: 0.25 });
    FX.streaks.push({ x, y: y - 14, x2: x + Math.cos(aim) * Math.min(d, range), y2: y - 14 + Math.sin(aim) * Math.min(d, range), col, hi, t0: now(), life: 0.18, w: 1 + tier });
  }
  if (kinds.has("circle") || kinds.has("zone") || kinds.has("area") || kinds.has("device")) {
    FX.runes.push({ x: tx, y: ty, r: 22 + tier * 6, col, hi, t0: now(), life: 0.6, n: 6 + tier * 2 });
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
  if (FX.motes.length > SFX_LIMITS.motes * 0.8) return; // 입자가 많으면 적중 불꽃은 생략
  const tier = Math.max(fxTier(sk), sk.kind === "basic" ? 0 : 1);
  if (tier < 1 && !e.c && e.b !== G.you) return; // 남의 기본 공격 적중은 생략
  const el = elemColors(sk);
  const col = el?.[0] ?? skillColor(sk), hi = el?.[1] ?? lighten(col, 0.6);
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
  for (const k of ["rings", "runes", "pillars", "streaks", "stars", "sweeps"]) if (FX[k].length) FX[k] = FX[k].filter((o) => t - o.t0 < o.life);
}

export function drawSkillFx(ctx, cx, cy) {
  const t = now();
  if (!FX.rings.length && !FX.motes.length && !FX.runes.length && !FX.pillars.length && !FX.streaks.length && !FX.stars.length && !FX.sweeps.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // 근접 휘두름 궤적 (초승달 모양, 시전자를 따라감)
  for (const w of FX.sweeps) {
    const u = G.ents.get(w.id);
    if (!u) continue;
    const k = (t - w.t0) / w.life, x = u.rx - cx, y = u.ry - cy - 4;
    const half = (w.arc * Math.PI) / 360, a0 = w.a - half, a1 = w.a + half;
    ctx.globalAlpha = (1 - k) * 0.55;
    ctx.fillStyle = w.col;
    ctx.beginPath();
    if (w.arc <= 50) {
      // 찌르기: 앞으로 뻗는 창끝 모양
      const ca = Math.cos(w.a), sa = Math.sin(w.a), px = -sa, py = ca, len = w.r * (0.6 + k * 0.4);
      ctx.moveTo(x + px * 4, y + py * 4); ctx.lineTo(x + ca * len, y + sa * len); ctx.lineTo(x - px * 4, y - py * 4);
    } else {
      ctx.arc(x, y, w.r, a0, a1); ctx.arc(x, y, w.r * 0.62, a1, a0, true);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
    ctx.beginPath(); if (w.arc > 50) ctx.arc(x, y, w.r, a0, a1); else { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(w.a) * w.r, y + Math.sin(w.a) * w.r); } ctx.stroke();
  }
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
    // 색마다 한 번 만든 빛줄기 그림을 늘려 찍음 (매 프레임 그라디언트 생성 X)
    ctx.globalAlpha = a * 0.7; ctx.drawImage(beam(p.col), x - w, y - h, w * 2, h);
    ctx.globalAlpha = a; ctx.drawImage(beam(p.hi), x - w * 0.35, y - h, w * 0.7, h);
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

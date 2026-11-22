// 타격감: 효과음(Web Audio 합성), 히트스톱, 피격 번쩍임·찌그러짐, 밀림, 불꽃 입자, 카메라 반동, 진동
// 한 번 맞을 때 여러 반응을 0.1초 안에 겹쳐서 "때렸다"는 느낌을 만든다. 세기는 약타·강타·치명타·처치로 구분.
import { G } from "./game.js";

const now = () => performance.now() / 1000;

// ── 효과음 ─────────────────────────────────────────────
const A = { ctx: null, master: null, noise: null, on: true, last: new Map() };
try { A.on = localStorage.getItem("abyss-sound") !== "0"; } catch {}

export function unlockAudio() {
  if (A.ctx) { A.ctx.state === "suspended" && A.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  try { A.ctx = new C(); } catch { return; }
  A.master = A.ctx.createGain();
  A.master.gain.value = A.on ? 0.5 : 0;
  // 압축기: 소리가 겹쳐도 찢어지지 않게
  const comp = A.ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  A.master.connect(comp).connect(A.ctx.destination);
  const len = A.ctx.sampleRate * 0.5;
  A.noise = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  const d = A.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}
export function soundOn() { return A.on; }
export function toggleSound() {
  A.on = !A.on;
  try { localStorage.setItem("abyss-sound", A.on ? "1" : "0"); } catch {}
  if (A.master) A.master.gain.value = A.on ? 0.5 : 0;
  return A.on;
}
// 같은 소리가 한꺼번에 너무 많이 나지 않게 (최소 간격)
function gate(key, gap) {
  const t = now();
  if (t - (A.last.get(key) ?? 0) < gap) return false;
  A.last.set(key, t);
  return true;
}
function tone({ f0, f1 = f0, dur = 0.1, type = "square", vol = 0.3, at = 0, attack = 0.004 }) {
  const c = A.ctx, t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(A.master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise({ dur = 0.1, vol = 0.3, f = 2000, q = 1, type = "bandpass", at = 0, f1 }) {
  const c = A.ctx, t = c.currentTime + at;
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = A.noise;
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(fl).connect(g).connect(A.master);
  s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}
const SFX = {
  swing: () => { noise({ dur: 0.09, vol: 0.12, f: 1800, f1: 600, q: 0.8 }); },
  shoot: () => { tone({ f0: 900, f1: 300, dur: 0.08, type: "triangle", vol: 0.1 }); noise({ dur: 0.05, vol: 0.06, f: 3000 }); },
  magic: () => { tone({ f0: 500, f1: 1200, dur: 0.12, type: "sine", vol: 0.12 }); tone({ f0: 750, f1: 1800, dur: 0.1, type: "triangle", vol: 0.05, at: 0.02 }); },
  hit: (k = 1) => { // 묵직한 타격: 저음 쿵 + 짧은 잡음
    const p = 1 + (Math.random() - 0.5) * 0.15;
    tone({ f0: 160 * p, f1: 55, dur: 0.11 * k, type: "sine", vol: 0.45 });
    noise({ dur: 0.06, vol: 0.22 * k, f: 2400 * p, q: 0.7 });
  },
  crit: () => {
    tone({ f0: 220, f1: 50, dur: 0.18, type: "sine", vol: 0.55 });
    noise({ dur: 0.1, vol: 0.3, f: 3200, q: 0.6 });
    tone({ f0: 1400, f1: 2400, dur: 0.12, type: "square", vol: 0.06, at: 0.01 });
  },
  kill: () => { tone({ f0: 300, f1: 40, dur: 0.22, type: "sine", vol: 0.45 }); noise({ dur: 0.18, vol: 0.18, f: 900, f1: 200, q: 0.7, type: "lowpass" }); },
  hurt: () => { tone({ f0: 220, f1: 90, dur: 0.14, type: "sawtooth", vol: 0.16 }); noise({ dur: 0.08, vol: 0.12, f: 900 }); },
  coin: () => { tone({ f0: 1320, dur: 0.06, type: "square", vol: 0.07 }); tone({ f0: 1760, dur: 0.12, type: "square", vol: 0.07, at: 0.06 }); },
  item: () => { [880, 1108, 1320, 1760].forEach((f, i) => tone({ f0: f, dur: 0.12, type: "triangle", vol: 0.1, at: i * 0.06 })); },
  level: () => { [523, 659, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.2, type: "square", vol: 0.08, at: i * 0.09 })); },
  dash: () => { noise({ dur: 0.16, vol: 0.14, f: 600, f1: 2400, q: 0.6 }); },
  potion: () => { tone({ f0: 400, f1: 900, dur: 0.15, type: "sine", vol: 0.15 }); tone({ f0: 600, f1: 1300, dur: 0.15, type: "sine", vol: 0.08, at: 0.08 }); },
  wave: () => { tone({ f0: 110, f1: 90, dur: 0.5, type: "sawtooth", vol: 0.12 }); tone({ f0: 165, f1: 135, dur: 0.5, type: "sawtooth", vol: 0.08 }); },
  click: () => { tone({ f0: 1200, dur: 0.03, type: "square", vol: 0.04 }); },
};
export function sfx(name, ...a) {
  if (!A.ctx || !A.on || !SFX[name]) return;
  const gaps = { hit: 0.045, swing: 0.05, coin: 0.06, hurt: 0.08, kill: 0.05 };
  if (!gate(name, gaps[name] ?? 0.03)) return;
  try { SFX[name](...a); } catch {}
}
function vibrate(ms) { if (G.touch && navigator.vibrate) try { navigator.vibrate(ms); } catch {} }

// ── 화면 효과 ───────────────────────────────────────────
// (G는 game.js와 서로 불러오므로 모듈 로드 시점이 아니라 처음 쓸 때 준비)
function ensure() { if (!G.parts) { G.parts = []; G.camKick = { x: 0, y: 0 }; G.trauma = 0; } }
/** 화면 흔들림 '충격량' (0~1). 실제 흔들림은 충격량²에 비례해서 작은 타격은 살짝, 큰 타격은 확실히 */
let lastTraumaAt = 0;
export function addTrauma(v, gap = 0) {
  ensure();
  const t = now();
  if (gap && t - lastTraumaAt < gap) return;
  lastTraumaAt = t;
  G.trauma = Math.min(1, (G.trauma ?? 0) + v);
}
let shakeOn = (() => { try { return localStorage.getItem("abyss.shake") !== "0"; } catch { return true; } })();
export const shakeEnabled = () => shakeOn;
export function toggleShake() { shakeOn = !shakeOn; try { localStorage.setItem("abyss.shake", shakeOn ? "1" : "0"); } catch {} return shakeOn; }
function sparks(x, y, dir, n, cols, spd = 120) {
  ensure();
  for (let i = 0; i < n && G.parts.length < 260; i++) {
    const a = dir + (Math.random() - 0.5) * 1.6, v = spd * (0.4 + Math.random() * 0.8);
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.18 + Math.random() * 0.22, t: 0, c: cols[(Math.random() * cols.length) | 0], s: Math.random() < 0.3 ? 2 : 1 });
  }
}
/** 몬스터가 맞음 (내가 때렸을 수도, 파티원이 때렸을 수도) */
export function onEnemyHit(ent, e) {
  ensure();
  const me = G.ents.get(G.you);
  const t = now();
  const mine = me && t - (G.lastCastAt ?? -9) < 0.6 && Math.hypot(ent.rx - me.rx, ent.ry - me.ry) < 420;
  const heavy = ent.mh && e.v > ent.mh * 0.12;
  const stop = e.c ? 0.1 : heavy ? 0.075 : 0.045; // 치명타 6프레임, 강타 4~5, 약타 3
  ent.stopUntil = t + stop;
  ent.squashAt = t;
  const dir = me ? Math.atan2(ent.ry - me.ry, ent.rx - me.rx) : -Math.PI / 2;
  ent.knock = { dx: Math.cos(dir) * (e.c ? 5 : 3), dy: Math.sin(dir) * (e.c ? 5 : 3), t0: t };
  sparks(ent.rx, ent.ry - 14, dir, e.c ? 14 : heavy ? 9 : 6, e.c ? ["#fff6c0", "#ffd35a", "#ff9a30"] : ["#ffffff", "#ffe8b0", "#ffb070"], e.c ? 170 : 130);
  if (mine) {
    // 공격하는 쪽도 함께 멈춤 (둘 다 멈춰야 '맞았다'로 읽힘)
    if (me.anim && !me.anim.stopped && t - me.anim.t0 < 0.5) { me.anim.t0 += stop; me.anim.stopped = true; }
    G.camKick.x += Math.cos(dir) * (e.c ? 3 : 1.5); G.camKick.y += Math.sin(dir) * (e.c ? 3 : 1.5);
    if (e.c) { addTrauma(0.3, 0.04); vibrate(18); sfx("crit"); }
    else { addTrauma(heavy ? 0.18 : 0.07, 0.05); sfx("hit", heavy ? 1.3 : 1); }
  } else if (e.c) sfx("hit", 0.8);
}
export function onEnemyDie(ent) {
  const t = now();
  sparks(ent.rx, ent.ry - 12, -Math.PI / 2, 16, ["#ffffff", "#ffd0a0", "#ff7050", "#c0c0c0"], 150);
  ent.dieFlash = t;
  const me = G.ents.get(G.you);
  if (me && Math.hypot(ent.rx - me.rx, ent.ry - me.ry) < 400) { sfx("kill"); if (ent.k === "b") addTrauma(0.75); else addTrauma(0.07, 0.03); vibrate(ent.k === "b" ? 60 : 10); }
}
export function onMeHurt(v) {
  sfx("hurt");
  vibrate(v > (G.me?.mh ?? 999) * 0.15 ? 35 : 12);
  addTrauma(Math.min(0.5, 0.12 + (v / (G.me?.mh ?? 999)) * 1.8));
  const me = G.ents.get(G.you);
  if (me) sparks(me.rx, me.ry - 16, -Math.PI / 2, 6, ["#ff4050", "#c01828", "#ff8080"], 90);
}

/** 매 프레임: 입자 이동 + 카메라 반동 감쇠 */
export function tickFeel(dt) {
  ensure();
  let write = 0;
  for (let i = 0; i < G.parts.length; i++) {
    const p = G.parts[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 280 * dt; p.vx *= 1 - 4 * dt;
    if (p.t < p.life) G.parts[write++] = p;
  }
  G.parts.length = write;
  const k = Math.max(0, 1 - dt * 14);
  G.camKick.x *= k; G.camKick.y *= k;
  G.trauma = Math.max(0, (G.trauma ?? 0) - dt * 1.7);
}
export function drawParts(ctx, cx, cy) {
  if (!G.parts) return;
  for (const p of G.parts) {
    ctx.globalAlpha = Math.min(1, (1 - p.t / p.life) * 1.6);
    ctx.fillStyle = p.c;
    ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), p.s + 1, p.s + 1);
  }
  ctx.globalAlpha = 1;
}
/** 맞은 유닛 그리기 보정: 히트스톱 중 떨림 + 밀림 + 찌그러짐 */
export function hitOffset(e, t) {
  let ox = 0, oy = 0, sx = 1, sy = 1;
  if (e.stopUntil && t < e.stopUntil) { ox += (Math.random() - 0.5) * 3; oy += (Math.random() - 0.5) * 2; }
  if (e.knock) {
    const a = (t - e.knock.t0) / 0.14;
    if (a >= 1) e.knock = null;
    else { const f = Math.sin(Math.min(1, a) * Math.PI) ; ox += e.knock.dx * f; oy += e.knock.dy * f; }
  }
  if (e.squashAt && t - e.squashAt < 0.1) { const a = 1 - (t - e.squashAt) / 0.1; sx = 1 + 0.18 * a; sy = 1 - 0.14 * a; }
  return { ox, oy, sx, sy };
}

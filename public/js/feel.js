// 타격감: 효과음(Web Audio 합성), 히트스톱, 피격 번쩍임·찌그러짐, 밀림, 불꽃 입자, 카메라 반동, 진동
// 한 번 맞을 때 여러 반응을 0.1초 안에 겹쳐서 "때렸다"는 느낌을 만든다. 세기는 약타·강타·치명타·처치로 구분.
import { G } from "./game.js";

const now = () => performance.now() / 1000;

// ── 효과음 ─────────────────────────────────────────────
// 소리 엔진은 audio.js, 소리 설계는 sfx.js
import { AU, unlockAudio, setSoundOn } from "./audio.js";
import { SFX, elemOf } from "./sfx.js";
export { unlockAudio };
export function soundOn() { return AU.on; }
export function toggleSound() { setSoundOn(!AU.on); return AU.on; }
const last = new Map();
// 같은 소리가 한꺼번에 너무 많이 나지 않게 (최소 간격)
function gate(key, gap) {
  const t = now();
  if (t - (last.get(key) ?? 0) < gap) return false;
  last.set(key, t);
  return true;
}
const GAPS = { hit: 0.045, crit: 0.05, swing: 0.05, coin: 0.06, hurt: 0.08, kill: 0.05, item: 0.08, warn: 0.25, magic: 0.05, shoot: 0.04, dash: 0.08 };
// 직업별 타격 재질
const FLAVOR = { sword: "slash", rogue: "slash", fist: "blunt", archer: "pierce", mage: "arcane", priest: "holy", smith: "forge" };
const flavor = () => FLAVOR[G.char?.cls] ?? "slash";
function play(name, pan, a) {
  if (!AU.ctx || !AU.on || AU.ctx.state !== "running" || !SFX[name]) return;
  if (!gate(name, GAPS[name] ?? 0.03)) return;
  const o = { pan, blade: G.char?.cls === "sword" || G.char?.cls === "rogue" };
  try { SFX[name](AU.bus, AU.ctx.currentTime + 0.005, o, ...a); } catch {}
}
export function sfx(name, ...a) { play(name, 0, a); }
/** 화면 위치(wx)에 따라 좌우로 들리게 */
export function sfxAt(name, wx, ...a) {
  const me = G.ents.get(G.you);
  play(name, me && Number.isFinite(wx) ? Math.max(-0.75, Math.min(0.75, (wx - me.rx) / 420)) : 0, a);
}
/** 스킬 시전음: 동작(휘두름·쏘기·시전·돌진) + 속성(불·얼음·번개…) */
export function castSound(sk) {
  const el = elemOf(sk);
  sfx(sk.moveSkill ? "dash" : sk.anim === "shoot" ? "shoot" : sk.anim === "cast" ? "magic" : "swing", el);
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
    if (e.c) { addTrauma(0.3, 0.04); vibrate(18); sfxAt("crit", ent.rx, flavor()); }
    else { addTrauma(heavy ? 0.18 : 0.07, 0.05); sfxAt("hit", ent.rx, heavy ? 1.3 : 1, flavor()); }
  } else if (e.c) sfxAt("hit", ent.rx, 0.6, "blunt");
}
export function onEnemyDie(ent) {
  const t = now();
  sparks(ent.rx, ent.ry - 12, -Math.PI / 2, 16, ["#ffffff", "#ffd0a0", "#ff7050", "#c0c0c0"], 150);
  ent.dieFlash = t;
  const me = G.ents.get(G.you);
  if (me && Math.hypot(ent.rx - me.rx, ent.ry - me.ry) < 400) { sfxAt(ent.k === "b" ? "bosskill" : "kill", ent.rx); if (ent.k === "b") addTrauma(0.75); else addTrauma(0.07, 0.03); vibrate(ent.k === "b" ? 60 : 10); }
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

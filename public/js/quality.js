// 그래픽 품질: 자동(기본) · 높음 · 보통 · 낮음 + 다른 사람 이펙트 줄이기
// 자동: 초당 프레임이 떨어지면 한 단계씩 낮추고, 넉넉하면 천천히 다시 올림 (메이플처럼 이펙트 옵션)
import { GLOW_LIMITS } from "./render/glow.js";
import { FX_LIMITS } from "./render/fx.js";
import { SFX_LIMITS } from "./render/skillfx.js";

const STORE = "abyss.gfx";
const PRESET = [
  // 0: 낮음 — 빛 번짐·입자 크게 줄이고 아직 안 구운 이펙트는 거의 생략
  { glows: 28, live: 1, holes: 24, motes: 40, rings: 12, runes: 6, pillars: 4, streaks: 16, stars: 8, sweeps: 10, baked: 24, others: 0.12, weather: false, name: "낮음" },
  // 1: 보통 — 자동 모드 기본값도 다수 전투에 맞춰 부담을 낮춘다.
  { glows: 90, live: 3, holes: 64, motes: 130, rings: 36, runes: 18, pillars: 12, streaks: 52, stars: 24, sweeps: 30, baked: 64, others: 0.45, weather: true, name: "보통" },
  // 2: 높음 — 여유 있는 기기에서만 최대 연출
  { glows: 340, live: 8, holes: 120, motes: 360, rings: 90, runes: 48, pillars: 32, streaks: 120, stars: 56, sweeps: 72, baked: 120, others: 1, weather: true, name: "높음" },
];
export const Q = load();

function load() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(STORE) ?? "{}") ?? {}; } catch {}
  return { mode: ["auto", "high", "mid", "low"].includes(o.mode) ? o.mode : "auto", lessOthers: !!o.lessOthers, level: 1, low: 0, high: 0 };
}
function save() { try { localStorage.setItem(STORE, JSON.stringify({ mode: Q.mode, lessOthers: Q.lessOthers })); } catch {} }

export function setMode(mode) { Q.mode = mode; Q.level = mode === "high" ? 2 : mode === "mid" ? 1 : mode === "low" ? 0 : Q.level; apply(); save(); }
export function setLessOthers(on) { Q.lessOthers = on; apply(); save(); }
export const preset = () => PRESET[Q.level];
/** 다른 사람 이펙트를 얼마나 보여줄지 (0~1) */
export const othersScale = () => (Q.lessOthers ? Math.min(0.25, PRESET[Q.level].others) : PRESET[Q.level].others) * (globalThis.__crowdK ?? 1);

export function apply() {
  const p = PRESET[Q.level];
  GLOW_LIMITS.max = p.glows;
  FX_LIMITS.live = p.live;
  FX_LIMITS.baked = p.baked ?? 64;
  for (const key of Object.keys(SFX_LIMITS)) if (p[key] != null) SFX_LIMITS[key] = p[key];
  if (Q.renderer) Q.renderer.maxHoles = p.holes;
}
/** 매 프레임: 자동이면 최근 프레임 시간을 보고 단계 조절 */
export function tickQuality(dt, renderer) {
  if (!Q.renderer) {
    Q.renderer = renderer;
    Q.level = Q.mode === "high" ? 2 : Q.mode === "low" ? 0 : 1;
    apply();
  }
  if (Q.mode !== "auto" || document.hidden || dt > 0.6) return;
  const fps = 1 / Math.max(1e-3, dt);
  if (fps < 35) { Q.low += dt * 2; Q.high = 0; }
  else if (fps < 48) { Q.low += dt; Q.high = 0; }
  else if (fps > 58) { Q.high += dt; Q.low = Math.max(0, Q.low - dt * 2); }
  else { Q.low = Math.max(0, Q.low - dt); Q.high = 0; }
  if (Q.low > 0.8 && Q.level > 0) {
    Q.level = Math.max(0, Q.level - (fps < 32 ? 2 : 1));
    Q.low = 0; apply();
  } else if (Q.high > 8 && Q.level < 2) {
    Q.level++; Q.high = 0; apply();
  }
}

// 월드 렌더러: 타일 → 바닥 표시(예고·구역) → y정렬 유닛/오브젝트 → 투사체 → 이펙트 → 조명 → 날씨 → 머리 위 UI
import { G, localStep, moveDir, netClock, isAllyFx, isFoeEnt } from "../game.js";
import { titleDesign } from "/shared/titles.js";
import { tickQuality, preset } from "../quality.js";
import { frame as dtFrame, drawFoot as drawDTFoot } from "./dt2.js";
import { weatherLoop } from "./fx.js";
import { objectDepthY } from "./depth.js";
// 수호 골렘 색: 강철 몸 + 놋쇠 기운
const GOLEM_TINT = { m: "#c8d4e0", s: "#1a1206", sat: 0.35 };
// 바둑판으로 이어 붙일 수 없는 한 장짜리 날씨(빛줄기): 화면에 한 번만
const WHOLE_SCREEN = new Set(["weather/god-rays"]);
import { itemIcon } from "../ui/icons.js";
import { tickFeel, drawParts, hitOffset } from "../feel.js";
import { dtLookFor, drawDT } from "./looks.js";
import { drawTownObject, drawStrings, spawnFolk, tickFolk, folkList, drawFolk, drawTownNpc } from "./townart.js";
import { beginGlows, addGlow, drawGlows, forEachGlow, forEachChunk, staticList, lightChunks, resetStaticGlows, CH } from "./glow.js";
import { drawDungeonObject } from "./dungeonart.js";
import { tickSkillFx, drawSkillFx } from "./skillfx.js";
import { drawSpectacle } from "./spectacle.js";
import { shakeEnabled } from "../feel.js";
import { VIEW_W, VIEW_H, TILE } from "/shared/constants.js";
// 화면(논리 해상도): 가로 640×360, 휴대폰 세로면 400×(세로 길이에 맞춤)
let VW = VIEW_W, VH = VIEW_H;
export const viewSize = () => [VW, VH];
import { MONSTERS, BOSSES, ZONES } from "/shared/zones.js";
import { CONSTELLATIONS } from "/shared/astra.js";
import { SKILLS } from "/shared/skills.js";
import { CLASS_INFO } from "/shared/classes.js";
import { RARITY_COLOR } from "/shared/items.js";
import { sprite, playerLook, ANIM_TIME, POSES } from "./sprites.js";
import { FxLayer, loadFx, preloadFx, baked_, bakedFrame, orient, prebake } from "./fx.js";

const now = () => performance.now() / 1000;
const GROUND_FX = new Set(["holy/heal-aoe", "nature/toxic-puddle", "nature/poison-cloud", "arcane/rune-circle", "arcane/magic-circle-cast", "shadow/hex-sigil", "fire/fire-ring", "nature/quake", "impacts/ground-slam", "scifi/laser-grid", "nature/root-snare", "holy/sunburst", "shadow/black-hole", "arcane/portal", "fire/campfire", "shadow/shadow-flames"]);
const STATUS_FX = { burn: "status/burning", poison: "status/poisoned", freeze: "status/frozen", stun: "status/stunned", down: "status/stunned", slow: "status/slowed", shock: "lightning/electrified", weaken: "status/cursed", bleed: "status/bleeding", groggy: "status/stunned", root: "nature/root-snare", vitalmark: "shadow/hex-sigil", huntmark: "shadow/hex-sigil", blind: "status/confused",
  curse: "status/cursed", mark2: "shadow/hex-sigil", judged: "shadow/hex-sigil", judgebrand: "holy/halo", hawk: "shadow/hex-sigil", elemmark: "arcane/rune-circle" };

// NPC 생김새
const NPC_LOOK = {
  gate: { armor: ["#c8d0e0", "#98a4bc", "#68748f", "#47536b"], core: ["#2f5ea8", "#22447a", "#152b4f"], mark: "#ffd35a", weapon: "spear", head: "helm", headColor: "#a8b4c8" },
  shop: { armor: ["#e8d8b0", "#c8b088", "#9a8462", "#6a5a40"], core: ["#3a7a4a", "#2a5a36", "#1a3a22"], mark: "#ffd35a", weapon: null, head: "cap", headColor: "#3a7a4a" },
  smithy: { armor: ["#d8a07a", "#b07852", "#7e5436", "#523420"], core: ["#3a3a42", "#2a2a30", "#1a1a20"], mark: "#ff8a30", weapon: "hammer", head: "band", headColor: "#5a3a20" },
  trainer: { armor: ["#e8edf6", "#a9b6cc", "#6f7f9c", "#47536b"], core: ["#8a2a2a", "#601c1c", "#3a1010"], mark: "#ffd35a", weapon: "sword", head: "band", headColor: "#a02a2a" },
  class_master: { armor: ["#fff6d8", "#e8d4a0", "#c0a060", "#806838"], core: ["#5a2a8a", "#401c66", "#281040"], mark: "#ffffff", weapon: "staff", head: "mitre", headColor: "#fff6d8" },
};

/** 스킬 정의 안의 모든 이펙트 이름 (fx 객체 + 단계별 fx) */
const FXID = /^[a-z-]+\/[a-z0-9-]+$/;
export function skillFxIds(sk) {
  const out = [];
  const walk = (v) => { if (typeof v === "string") { if (FXID.test(v)) out.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(sk?.fx); walk(sk?.steps);
  return out;
}
// 조명용 둥근 빛 그림 (가운데 진하고 가장자리로 갈수록 투명)
let HOLE = null;
function holeSprite() {
  if (HOLE) return HOLE;
  HOLE = new OffscreenCanvas(64, 64);
  const g = HOLE.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.55, "rgba(0,0,0,0.7)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return HOLE;
}
/** 치명타 숫자 그림 (28px로 그려 0.75배로 찍음) */
function critImage(text) {
  const key = "crit|" + text, cached = floaterTextCache.get(key);
  if (cached) return cached;
  const m = new OffscreenCanvas(1, 1).getContext("2d");
  m.font = "28px Galmuri14";
  const w = Math.ceil(m.measureText(text).width) + 24, h = 48;
  const c = new OffscreenCanvas(w, h), g = c.getContext("2d");
  g.font = "28px Galmuri14"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineJoin = "round"; g.lineWidth = 6; g.strokeStyle = "#4a1800";
  g.shadowColor = "#ff9a3a"; g.shadowBlur = 8;
  g.strokeText(text, w / 2, h / 2);
  g.shadowBlur = 0;
  const gr = g.createLinearGradient(0, h / 2 - 12, 0, h / 2 + 12);
  gr.addColorStop(0, "#fff8d0"); gr.addColorStop(0.45, "#ffd35a"); gr.addColorStop(1, "#ff7a1a");
  g.fillStyle = gr; g.fillText(text, w / 2, h / 2);
  if (floaterTextCache.size >= 320) floaterTextCache.clear();
  floaterTextCache.set(key, c);
  return c;
}
function floaterImage(text, color, font) {
  const key = `text|${font}|${color}|${text}`;
  let c = floaterTextCache.get(key);
  if (c) return c;
  const m = (labelMeasure ??= new OffscreenCanvas(1, 1).getContext("2d"));
  m.font = font;
  const width = Math.ceil(m.measureText(text).width) + 8, height = Math.ceil(parseFloat(font) * 1.5) + 8;
  c = new OffscreenCanvas(width, height);
  const g = c.getContext("2d");
  g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineJoin = "round"; g.lineWidth = 3; g.strokeStyle = "#000";
  g.strokeText(text, width / 2, height / 2); g.fillStyle = color; g.fillText(text, width / 2, height / 2);
  if (floaterTextCache.size >= 320) floaterTextCache.clear();
  floaterTextCache.set(key, c);
  return c;
}
const lootBeams = new Map();
function lootBeam(col) {
  let c = lootBeams.get(col);
  if (c) return c;
  c = new OffscreenCanvas(1, 32);
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 32);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, col);
  g.fillStyle = gr; g.fillRect(0, 0, 1, 32);
  lootBeams.set(col, c);
  return c;
}
/** 고정 빛 어둠 조각: 어둠을 깔고 고정 빛 자리를 미리 뚫어 둠 (절반 해상도 128×128) */
function lightChunk(cx, cy, amb) {
  const k = cx + "," + cy;
  const hit = lightChunks.get(k);
  if (hit) return hit;
  const x0 = cx * CH, y0 = cy * CH, S = CH / 2;
  const cv = new OffscreenCanvas(S, S), g = cv.getContext("2d");
  g.fillStyle = amb; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = "destination-out"; g.imageSmoothingEnabled = true;
  const spr = holeSprite();
  const hole = (x, y, r, a) => {
    if (x + r < x0 || y + r < y0 || x - r > x0 + CH || y - r > y0 + CH) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(spr, (x - x0) / 2 - r / 2, (y - y0) / 2 - r / 2, r, r);
  };
  for (const [x, y, r, , a] of staticList()) hole(x, y, r * 1.3, a * 1.6);
  for (const o of G.objects) if (o.kind === "lamp" || o.kind === "npc" || o.kind === "portal") hole(o.x, o.y - 14, o.kind === "npc" ? 110 : 140, 0.85);
  lightChunks.set(k, cv);
  return cv;
}
const seenSkills = new Set();
/** 다른 사람(파티원) 스킬을 처음 보면 그 이펙트도 미리 구워 둠 */
export function warmSkill(id) {
  if (seenSkills.has(id)) return;
  seenSkills.add(id);
  const ids = skillFxIds(SKILLS[id]);
  preloadFx(ids).then(() => prebake(ids));
}

const labelCache = new Map();
const floaterTextCache = new Map();
let labelMeasure = null;
// 디자인 칭호: 캔버스(640px)에 그리면 뭉개지므로, 캔버스 위 이미지 층에 원본 해상도로 띄움
const titleImgs = new Map();
let titleLayer = null, titleRect = null, titleRectAt = 0;
function syncTitleLayer(cv, t = now()) {
  const marks = G.titleMarks ?? [];
  if (!marks.length && !titleImgs.size) return;
  if (!titleLayer) { titleLayer = document.createElement("div"); titleLayer.id = "title-layer"; cv.parentNode.insertBefore(titleLayer, cv.nextSibling); }
  if (!titleRect || t - titleRectAt > 0.12) {
    const r = cv.getBoundingClientRect(), pr = cv.parentNode.getBoundingClientRect();
    titleRect = { left: r.left - pr.left, top: r.top - pr.top, scale: r.width / VW };
    titleRectAt = t;
  }
  const { left, top, scale: k } = titleRect, seen = new Set();
  for (const m of marks) {
    const d = titleDesign(m.tt);
    let img = titleImgs.get(m.id);
    if (!img || img.dataset.tt !== m.tt) {
      img?.remove(); img = document.createElement("img"); img.src = d.src; img.dataset.tt = m.tt; img.className = "title-img";
      titleLayer.appendChild(img); titleImgs.set(m.id, img); img._titleWidth = -1; img._titlePos = "";
    }
    const width = d.w * k, height = width / d.ratio;
    if (Math.abs((img._titleWidth ?? -1) - width) > 0.25) { img._titleWidth = width; img.style.width = width + "px"; }
    const pos = `translate3d(${Math.round(left + m.x * k - width / 2)}px, ${Math.round(top + m.y * k - height)}px, 0)`;
    if (img._titlePos !== pos) { img._titlePos = pos; img.style.transform = pos; }
    seen.add(m.id);
  }
  for (const [id, img] of titleImgs) if (!seen.has(id)) { img.remove(); titleImgs.delete(id); }
}
// 보스 패턴 이름과 피하는 법
const BOSS_CALL = {
  cleave: ["휩쓸기", "뒤로 돌아가요"], slam: ["내려찍기", "멀리 떨어져요"], ring: ["고리 폭발", "보스에게 바짝 붙어요"],
  rain: ["낙하 공격", "빨간 원 밖으로"], barrage: ["마력탄 난사", "멀리 떨어져서 선 사이 틈으로"], beam: ["회전 광선", "분홍 부채꼴 밖으로"],
  charge: ["돌진", "빨간 줄 옆으로"], aimed: ["조준 사격", "옆으로 움직여요"], pools: ["독 장판", "장판 밟지 마요"],
  pull: ["끌어당기기", "반대로 버텨요"], summon: ["소환", "졸개부터 처리"],
  chase: ["추적 폭격", "멈추지 말고 계속 움직여요"], cross: ["십자 베기", "선 사이 대각선으로, 곧 X자"], donut: ["안팎 폭발", "밖으로 피했다가 다시 안으로"],
  spiral: ["나선 탄막", "탄 사이 틈을 따라 돌아요"], lanes: ["줄 공격", "비어 있는 줄로"],
  // 제2 던전 전용
  safespot: ["심연 붕괴", "빛나는 원 안으로 뛰어요!"], grid: ["격자 낙뢰", "빈 칸으로 — 곧 반대 줄, 그다음 세로줄"],
  multicharge: ["연속 돌진", "매번 다시 조준해요, 옆으로 계속"], walk: ["행진 폭발", "줄 옆으로 비켜요 (두 번 와요)"],
  nova: ["파도 고리", "첫 고리가 터지면 안쪽으로 파고들어요"],
};
export class Renderer {
  /** 화면 크기 바꾸기 (휴대폰 세로·가로 전환). focusY: 캐릭터가 화면 높이의 어디쯤 오게 할지 */
  setView(w, h, focusY = 0.5) {
    this.focusY = focusY;
    if (w === VW && h === VH) return;
    titleRect = null;
    VW = w; VH = h;
    this.cv.width = w; this.cv.height = h;
    this.ctx.imageSmoothingEnabled = false;
    this.front = new FxLayer(w, h);
    this.ground = new FxLayer(w, h);
    this.light = new OffscreenCanvas(Math.ceil(w / 2) + 1, Math.ceil(h / 2) + 1);
    this.lctx = this.light.getContext("2d");
  }
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.front = new FxLayer(VW, VH);
    this.ground = new FxLayer(VW, VH);
    this.weather = new FxLayer(320, 180);
    this.weather.every = 2; // 날씨는 배경이라 30fps로 충분
    this.light = new OffscreenCanvas(VW / 2 + 1, VH / 2 + 1);
    this.lctx = this.light.getContext("2d");
    this.zoneFx = new Map();
    this.focusY = 0.5;
    this.maxHoles = 120;
    this.white = new WeakMap();
    this.last = now();
    this.fps = 60;
    // 매 프레임 정렬용 객체와 배열을 재사용해 객체 생성·GC로 인한 순간 끊김을 줄인다.
    this.drawList = [];
    this.drawPool = [];
    this.drawPlayers = [];
  }

  onMap() {
    spawnFolk();
    this.front.clear(); this.ground.clear(); this.weather.clear(); this.zoneFx.clear();
    resetStaticGlows(); // 새 지도: 고정 빛 캐시 비우기
    const z = G.zone;
    const ids = ["arcane/portal", "fire/torch", "fire/campfire", "water/fountain", "fire/candle", "impacts/hit-spark", "impacts/hit-flash", "spawn/poof", "ui/level-up", "spawn/soul-rise", "status/stunned", "status/burning", "status/poisoned", "status/frozen", "status/slowed", "pickups/loot-beam"];
    if (G.kind !== "town") {
      ids.push(z.torch);
      for (const id of z.monsters) {
        const m = MONSTERS[id];
        if (m.look.critter) ids.push(m.look.critter); if (m.proj) ids.push(m.proj); if (m.aoe) ids.push(m.aoe); if (m.ai === "bomber") ids.push("explosions/small-explosion");
        // 소환하는 몬스터는 소환될 몬스터의 모습·공격도 미리 (처음 나올 때 멈칫 방지)
        const sm = m.summon && MONSTERS[m.summon];
        if (sm) { if (sm.look.critter) ids.push(sm.look.critter); if (sm.proj) ids.push(sm.proj); if (sm.aoe) ids.push(sm.aoe); }
      }
      // 제2 던전 전용 행동·보스 페이즈 이펙트 (순간이동·소환문·분노 등)
      if (G.dungeon >= 3) ids.push("explosions/dirt-explosion", "ice/frost-nova", "ice/ice-shatter", "water/wave-crash", "nature/root-snare", "nature/boulder", "lightning/lightning-strike", "arcane/time-stop", "fire/fire-ring", "fire/meteor", "arcane/rune-circle", "spawn/soul-rise", "shadow/eclipse");
      if (G.dungeon >= 2) ids.push("spawn/spawn-portal", "status/rage", "shadow/void-orb", "shadow/shadow-flames", "shadow/dark-explosion", "impacts/ground-slam", "arcane/blink-in", "arcane/blink-out", "nature/spore-burst", "explosions/small-explosion");
      for (const b of [z.mid, z.boss]) { const d = BOSSES[b]; if (d.look.critter) ids.push(d.look.critter); for (const p of d.patterns) if (p.fx) ids.push(p.fx); }
      if (G.mapKind === "boss" || G.floor % 5 === 0) ids.push("impacts/ground-slam", "melee/spear-sweep", "lightning/zap-hit", "arcane/arcane-orb", "shadow/dark-explosion"); // 공용 고급 보스 패턴
      if (z.weather) ids.push(z.weather);
    }
    // 내 직업의 모든 스킬 이펙트(장착 안 한 것 포함) + 흔한 타격 이펙트를 미리 구워 둠
    for (const s of Object.values(SKILLS)) if (s.cls === G.char?.cls || s.cls === "common") ids.push(...skillFxIds(s));
    preloadFx(ids).then(() => {
      prebake(ids.filter((id) => id && !id.startsWith("weather/")));
      if (G.kind !== "town" && z.weather) { const m = this.weather; m.clear(); loadFx(z.weather).then((mod) => mod && m.spawn(z.weather, mod.meta.origin[0], mod.meta.origin[1])); }
    });
  }

  fx(id, x, y, o = {}) {
    if (!id) return;
    (GROUND_FX.has(id) ? this.ground : this.front).spawn(id, x, y, o);
  }
  zone(e) {
    if (!e.fx) return;
    // 내 장판인지는 주인으로 판단 (예전엔 거리로 판단해서, 붐비는 곳에선 남의 장판도 다 내 것처럼 무겁게 그렸음)
    const other = e.own ? e.own !== G.you : e.tm !== 1 ? false : true;
    if (other && (G.crowdK ?? 1) < 1 && Math.random() > G.crowdK) return;
    const f = (GROUND_FX.has(e.fx) ? this.ground : this.front).spawn(e.fx, e.x, e.y, { life: e.d, follow: e.fol || undefined, pal: e.pal ?? undefined, s: e.r < 70 ? 0.7 : 1, other });
    if (f) this.zoneFx.set(e.id, f);
  }
  zoneEnd(id) { const f = this.zoneFx.get(id); if (f) { const t = performance.now() / 1000; if (f.swapped) f.swapped.until = t; if (f.inst) f.inst.stop(); else f.until = t; } this.zoneFx.delete(id); }
  statusFx(ent, s, d) {
    const id = STATUS_FX[s];
    if (!id) return;
    const cur = ent.stFx?.[s];
    // 이미 떠 있으면 시간만 연장 (구운 이펙트는 inst가 없음 — 예전엔 여기서 오류)
    if (cur && (cur.inst ? !cur.inst.done() : !cur.until || cur.until > now())) { cur.until = now() + d; return; }
    ent.stFx = ent.stFx ?? {};
    ent.stFx[s] = this.front.spawn(id, ent.rx, ent.ry, { follow: ent.id, life: d, s: ent.k === "b" ? 1.4 : ent.info?.m && MONSTERS[ent.info.m]?.look.critter ? 0.6 : 1, dy: s === "root" || s === "vitalmark" || s === "huntmark" ? 0 : 0 });
  }

  // ── 그리기
  frame() {
    const t = now();
    const elapsed = Math.max(1e-3, t - this.last);
    const dt = Math.min(0.1, elapsed);
    this.last = t;
    this.fps = this.fps * 0.95 + (1 / elapsed) * 0.05;
    tickQuality(elapsed, this);
    const ctx = this.ctx;
    if (!G.map) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VW, VH); return; }
    // 위치: 나는 매 프레임 즉시 이동, 다른 유닛은 보간
    localStep(dt);
    tickFeel(dt);
    tickSkillFx(dt);
    const rt = netClock.renderTime(dt, t);
    for (const e of G.ents.values()) {
      if (e.id === G.you) { e.rx = G.local.x; e.ry = G.local.y; continue; }
      const b = e.buf;
      if (b.length >= 2 && rt >= b[0][0]) {
        let i = b.length - 2;
        while (i > 0 && b[i][0] > rt) i--;
        const a = b[i], c = b[i + 1];
        const k = Math.max(0, Math.min(1, (rt - a[0]) / Math.max(1e-3, c[0] - a[0])));
        e.rx = a[1] + (c[1] - a[1]) * k; e.ry = a[2] + (c[2] - a[2]) * k;
      } else { e.rx = e.x; e.ry = e.y; }
    }
    // 카메라
    const me = G.ents.get(G.you);
    // 카메라: 캐릭터에 고정 (지도 밖은 안 보이게)
    const mw = G.map.w * TILE, mh = G.map.h * TILE;
    const tx = (me?.rx ?? G.local.x) - VW / 2, ty = (me?.ry ?? G.local.y) - VH * (this.focusY ?? 0.5) - 10;
    G.cam.x = Math.round(mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, tx)));
    G.cam.y = Math.round(mh <= VH ? (mh - VH) / 2 : Math.max(0, Math.min(mh - VH, ty)));
    let sx = 0, sy = 0;
    // 화면 흔들림: 충격량^1.5 × 최대 10px, 부드러운 진동(무작위 덜덜이 대신)
    const tr = G.trauma ?? 0, amp = shakeEnabled() ? Math.max(G.shake, Math.pow(tr, 1.5) * 10) : 0;
    if (amp > 0.05) {
      sx = amp * (Math.sin(t * 63.1) * 0.6 + Math.sin(t * 29.7 + 1.3) * 0.4);
      sy = amp * (Math.sin(t * 57.3 + 0.7) * 0.6 + Math.sin(t * 33.9 + 2.1) * 0.4);
    }
    G.shake = Math.max(0, G.shake - dt * 18);
    const cx = Math.round(G.cam.x + sx + (G.camKick?.x ?? 0)), cy = Math.round(G.cam.y + sy + (G.camKick?.y ?? 0));
    if (me) G.map.reveal(me.rx, me.ry);
    // 군중 수를 렌더 초반에 계산해 같은 프레임부터 이펙트 제한에 반영한다.
    {
      let n = 0;
      for (const e of G.ents.values()) if (e.k === "p" && e.id !== G.you && Math.abs(e.rx - cx - VW / 2) < VW && Math.abs(e.ry - cy - VH / 2) < VH) n++;
      G.crowdN = n;
      G.crowdK = globalThis.__crowdK = n <= 6 ? 1 : n <= 15 ? 0.5 : n <= 30 ? 0.3 : 0.15;
    }

    beginGlows();
    if (G.kind === "town") tickFolk(dt);
    this.front.update(dt, G.ents);
    this.ground.update(dt, G.ents);
    if (preset().weather && !(G.zone?.weather && weatherLoop(G.zone.weather)?.done)) this.weather.update(dt, G.ents);

    ctx.fillStyle = "#08070b";
    ctx.fillRect(0, 0, VW, VH);
    G.map.draw(ctx, cx, cy, VW, VH);
    this.drawLoot(ctx, cx, cy, t);
    this.drawZones(ctx, cx, cy, t);
    this.drawTels(ctx, cx, cy, t);
    this.ground.render(ctx, cx, cy);
    this.drawSorted(ctx, cx, cy, t);
    this.drawProjectiles(ctx, cx, cy, t);
    this.drawBeams(ctx, cx, cy, t);
    this.front.render(ctx, cx, cy);
    if (G.kind === "town") drawStrings(ctx, cx, cy, t);
    this.drawLighting(ctx, cx, cy, t);
    drawGlows(ctx, cx, cy, VW, VH);
    if (G.island === "astra" && G.kind === "town" || G.dungeon === 5 && G.kind !== "town" && G.kind !== "pvp") this.drawStarSky(ctx, cx, cy, t);
    drawSkillFx(ctx, cx, cy);
    drawSpectacle(ctx, cx, cy, VW, VH);
    const wl = G.kind !== "town" && G.zone?.weather && preset().weather ? weatherLoop(G.zone.weather) : null;
    if (wl?.done) {
      // 구워 둔 날씨 프레임을 2배로 늘려 바둑판처럼 깔기 (계산 없음)
      const f = wl.frames[Math.floor(t * wl.fps) % wl.n];
      ctx.imageSmoothingEnabled = true;
      if (WHOLE_SCREEN.has(G.zone.weather)) {
        // 빛줄기처럼 한 장짜리 장면은 바둑판으로 깔면 네모 경계가 생김 → 화면 전체에 한 번, 밝게만 더함(어두운 배경은 안 덮음)
        ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.5;
        ctx.drawImage(f, 0, 0, VW, VH);
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalAlpha = 0.45;
        const ox = -(((cx % 320) + 320) % 320), oy = -(((cy % 180) + 180) % 180);
        for (let yy = oy; yy < VH; yy += 180) for (let xx = ox; xx < VW; xx += 320) ctx.drawImage(f, xx, yy, 320, 180);
      }
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1;
    } else if (this.weather.list.length && preset().weather) {
      const wc = this.wctx ?? (this.wctx = this.mkWeatherCtx());
      wc.clearRect(0, 0, 320, 180);
      this.weather.render(wc, 0, 0);
      if (WHOLE_SCREEN.has(G.zone?.weather)) {
        ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.5; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.wcv, 0, 0, VW, VH);
        ctx.globalCompositeOperation = "source-over"; ctx.imageSmoothingEnabled = false;
      } else {
        ctx.globalAlpha = G.kind === "town" ? 0.5 : 0.45;
        const ox = -(((cx % 320) + 320) % 320), oy = -(((cy % 180) + 180) % 180);
        for (let yy = oy; yy < VH; yy += 180) for (let xx = ox; xx < VW; xx += 320) ctx.drawImage(this.wcv, xx, yy);
      }
      ctx.globalAlpha = 1;
    }
    this.drawDarkness(ctx, cx, cy, t);
    this.drawTelsOver(ctx, cx, cy, t);
    if (G.titleMarks) G.titleMarks.length = 0; else G.titleMarks = [];
    this.drawOverhead(ctx, cx, cy, t);
    if (G.hurtFlash > 0) {
      // 맞았을 때 붉은 테두리: 한 번 만든 그림을 세기만 바꿔 찍음
      if (!this.vig || this.vig.width !== VW || this.vig.height !== VH) {
        this.vig = new OffscreenCanvas(VW, VH);
        const vg = this.vig.getContext("2d"), gr = vg.createRadialGradient(VW / 2, VH / 2, 120, VW / 2, VH / 2, 380);
        gr.addColorStop(0, "rgba(200,0,20,0)"); gr.addColorStop(1, "rgba(200,0,20,1)");
        vg.fillStyle = gr; vg.fillRect(0, 0, VW, VH);
      }
      ctx.globalAlpha = Math.min(1, G.hurtFlash); ctx.drawImage(this.vig, 0, 0); ctx.globalAlpha = 1;
      G.hurtFlash = Math.max(0, G.hurtFlash - dt);
    }
    syncTitleLayer(this.cv, t);
    if (me && me.hp < 0.3 && !me.dead) {
      ctx.fillStyle = `rgba(160,0,20,${0.12 + Math.sin(t * 5) * 0.06})`;
      ctx.fillRect(0, 0, VW, 6); ctx.fillRect(0, VH - 6, VW, 6); ctx.fillRect(0, 0, 6, VH); ctx.fillRect(VW - 6, 0, 6, VH);
    }
  }
  mkWeatherCtx() { this.wcv = new OffscreenCanvas(320, 180); const c = this.wcv.getContext("2d"); return c; }

  // 바닥 아이템: 실제 아이템 그림 + 등급 색 빛기둥·테두리 (예전 파란 점 대신)
  drawLoot(ctx, cx, cy, t) {
    const RANK = { 일반: 0, 희귀: 1, 영웅: 2, 전설: 3, 신화: 4 };
    for (const l of G.loot.values()) {
      const x = Math.round(l.x - cx), y = Math.round(l.y - cy);
      if (x < -40 || y < -60 || x > VW + 40 || y > VH + 40) continue;
      const col = l.s === "cons" ? "#ff6a7a" : RARITY_COLOR[l.r] ?? "#ccc";
      const rk = RANK[l.r] ?? 0;
      const bob = Math.round(Math.sin(t * 3 + l.id) * 1.5);
      if (l.s !== "cons" && rk >= 1) {
        const hgt = 18 + rk * 12;
        ctx.globalAlpha = 0.35 + Math.sin(t * 4 + l.id) * 0.1;
        ctx.drawImage(lootBeam(col), x - 3, y - hgt, 6, hgt);
        ctx.globalAlpha = 1;
        addGlow(l.x, l.y - 6, 26 + rk * 10, col, 0.25 + rk * 0.06);
      }
      ctx.fillStyle = "#0008"; ctx.beginPath(); ctx.ellipse(x, y + 3, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
      let icon = null;
      if (l.s === "cons") icon = dtFrame("flask_red");
      else icon = itemIcon({ slot: l.s, type: l.ty, variant: l.v, rarity: l.r, ilvl: l.il ?? 1, relic: l.rl, relicColor: l.rc });
      if (icon) {
        const w = l.s === "cons" ? 16 : 18;
        // 등급 색 테두리(아이콘 뒤에 살짝 큰 사각 빛)
        ctx.fillStyle = col; ctx.globalAlpha = 0.55;
        ctx.fillRect(x - w / 2 - 1, y - w - 2 + bob - 1, w + 2, w + 2);
        ctx.globalAlpha = 1; ctx.fillStyle = "#0c0a12"; ctx.fillRect(x - w / 2, y - w - 2 + bob, w, w);
        ctx.drawImage(icon, x - w / 2, y - w - 2 + bob, w, w);
      }
      if (rk >= 2 && Math.sin(t * 6 + l.id * 3) > 0.9) { ctx.fillStyle = "#fff"; ctx.fillRect(x + 6, y - 20 + bob, 2, 2); }
    }
    // 자동 획득: 아이템이 내 쪽으로 포물선을 그리며 날아옴
    if (G.lootFly?.length) {
      const tn = performance.now() / 1000, fly = G.lootFly;
      let write = 0;
      for (let i = 0; i < fly.length; i++) {
        const f = fly[i];
        if (tn - f.t0 >= 0.5) continue;
        fly[write++] = f;
        const k = (tn - f.t0) / 0.5, e = k * k;
        const to = G.ents.get(f.to);
        const tx = to ? to.rx : f.x, ty = to ? to.ry - 14 : f.y;
        const x = f.x + (tx - f.x) * e - cx, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 30 - cy;
        const icon = f.s === "cons" ? dtFrame("flask_red") : itemIcon({ slot: f.s, type: f.ty, variant: f.v, rarity: f.r, ilvl: f.il ?? 1, relic: f.rl, relicColor: f.rc });
        ctx.globalAlpha = 1 - k * 0.5;
        if (icon) ctx.drawImage(icon, Math.round(x - 8), Math.round(y - 8), 16, 16);
        ctx.globalAlpha = 1;
      }
      fly.length = write;
    }
  }

  drawZones(ctx, cx, cy, t) {
    for (const z of G.zones.values()) {
      let x = z.x, y = z.y;
      if (z.fol) { const f = G.ents.get(z.fol); if (f) { x = f.rx; y = f.ry; } }
      const zAlly = isAllyFx(z);
      ctx.strokeStyle = zAlly ? "rgba(120,220,255,0.55)" : "rgba(180,60,255,0.6)";
      ctx.fillStyle = zAlly ? "rgba(120,220,255,0.07)" : "rgba(160,40,200,0.12)";
      ctx.beginPath(); ctx.ellipse(Math.round(x - cx), Math.round(y - cy), z.r, z.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([4, 3]); ctx.lineDashOffset = -t * 12; ctx.stroke(); ctx.setLineDash([]);
    }
  }

  drawTels(ctx, cx, cy, t) {
    for (const s of G.tels.values()) {
      const k = Math.min(1, (t - s.t0) / Math.max(0.05, s.d));
      const ally = isAllyFx(s);
      // 잔상 재생(gh 1)은 보랏빛, 반복 예고(gh 2)는 주황빛으로 구분
      const edge = ally ? "rgba(120,220,255,0.8)" : s.gh === 1 ? "rgba(200,120,255,0.9)" : s.gh === 2 ? "rgba(255,170,60,0.9)" : "rgba(255,60,60,0.9)";
      const fill = ally ? "rgba(120,220,255,0.10)" : s.gh === 1 ? "rgba(160,80,255,0.2)" : s.gh === 2 ? "rgba(255,150,40,0.2)" : "rgba(255,40,40,0.22)";
      const prog = ally ? "rgba(120,220,255,0.18)" : s.gh === 1 ? "rgba(180,100,255,0.4)" : s.gh === 2 ? "rgba(255,160,50,0.4)" : "rgba(255,70,40,0.42)";
      const x = s.x - cx, y = s.y - cy;
      ctx.lineWidth = 1;
      ctx.strokeStyle = edge;
      if (s.sh === "c") {
        ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, s.r, s.r * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = prog; ctx.beginPath(); ctx.ellipse(x, y, s.r * k, s.r * 0.75 * k, 0, 0, Math.PI * 2); ctx.fill();
      } else if (s.sh === "ring") {
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.ellipse(x, y, s.r2, s.r2 * 0.75, 0, 0, Math.PI * 2); ctx.ellipse(x, y, s.r, s.r * 0.75, 0, 0, Math.PI * 2, true); ctx.fill("evenodd"); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y, s.r, s.r * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
        const rr = s.r + (s.r2 - s.r) * k;
        ctx.fillStyle = prog; ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.75, 0, 0, Math.PI * 2); ctx.ellipse(x, y, s.r, s.r * 0.75, 0, 0, Math.PI * 2, true); ctx.fill("evenodd");
      } else if (s.sh === "cone") {
        const half = (s.arc * Math.PI) / 360;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.75);
        ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s.r, s.a - half, s.a + half); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = prog; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s.r * k, s.a - half, s.a + half); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (s.sh === "r") {
        ctx.save(); ctx.translate(x, y); ctx.rotate(s.a);
        ctx.fillStyle = fill; ctx.fillRect(0, -s.w / 2, s.l, s.w); ctx.strokeRect(0, -s.w / 2, s.l, s.w);
        ctx.fillStyle = prog; ctx.fillRect(0, -s.w / 2, s.l * k, s.w);
        ctx.restore();
      } else if (s.sh === "safe") {
        // 가짜 안전 지대: 안전 원처럼 보이지만 금 간 붉은 문양
        ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(120,255,140,0.8)";
        ctx.beginPath(); ctx.ellipse(x, y, s.r, s.r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      } else if (s.sh === "flood") {
        // 수위: 투기장 전체가 물빛으로 차오르고, 발판(원)만 비어 있음
        const W = s.l, H = s.w;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, W, H);
        for (const [px, py, pr] of s.pts ?? []) { ctx.moveTo(px - cx + pr, py - cy); ctx.ellipse(px - cx, py - cy, pr, pr * 0.75, 0, 0, Math.PI * 2, true); }
        ctx.fillStyle = `rgba(40,140,255,${0.12 + 0.22 * k})`; ctx.fill("evenodd");
        ctx.restore();
        ctx.strokeStyle = "rgba(160,255,220,0.95)"; ctx.setLineDash([5, 3]);
        for (const [px, py, pr] of s.pts ?? []) { ctx.beginPath(); ctx.ellipse(px - cx, py - cy, pr, pr * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]);
      }
      if (s.g) this.drawGlyph(ctx, x, y, s.g, t, s.r);
    }
  }
  /** 안전 지대 바닥 문양: 1 진짜(금빛 별 문양) · 2 가짜(금 간 붉은 문양) */
  drawGlyph(ctx, x, y, g, t, r = 50) {
    const s = Math.max(10, Math.min(26, r * 0.4));
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.75);
    if (g === 1) {
      ctx.strokeStyle = `rgba(255,220,90,${0.75 + Math.sin(t * 6) * 0.2})`; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5; ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 1.25, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,70,70,0.85)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.2); ctx.lineTo(-s * 0.2, s * 0.3); ctx.lineTo(s * 0.3, -s * 0.4); ctx.lineTo(s, s * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s); ctx.lineTo(0, -s * 0.1); ctx.lineTo(s * 0.2, s); ctx.stroke();
    }
    ctx.restore(); ctx.lineWidth = 1;
  }
  /** 시야 제한(90층 보스): 내 주변만 보이고 나머지는 어둠. 예고 테두리는 그 위에 다시 그려져 보인다 */
  drawDarkness(ctx, cx, cy, t) {
    const D = G.dark;
    if (!D) return;
    if (t > D.until) { G.dark = null; return; }
    const me = G.ents.get(G.you);
    if (!me) return;
    const fade = Math.min(1, (t - D.t0) / 0.4, (D.until - t) / 0.4);
    const x = me.rx - cx, y = me.ry - cy - 12, r = D.r;
    const gr = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(2,0,8,${0.94 * fade})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = `rgba(2,0,8,${0.94 * fade})`;
    ctx.fillRect(0, 0, VW, Math.max(0, y - r)); ctx.fillRect(0, y + r, VW, VH);
    ctx.fillRect(0, Math.max(0, y - r), Math.max(0, x - r), r * 2); ctx.fillRect(x + r, Math.max(0, y - r), VW, r * 2);
    // 보스 실루엣은 희미하게
    if (G.boss) { const b = G.ents.get(G.boss.id ?? G.boss); if (b) { ctx.fillStyle = "rgba(200,80,255,0.25)"; ctx.beginPath(); ctx.ellipse(b.rx - cx, b.ry - cy - 20, 22, 30, 0, 0, Math.PI * 2); ctx.fill(); } }
  }

  /** 보스·몬스터 공격 예고를 어둠·이펙트 위에 한 번 더: 굵은 테두리(곧 터지면 깜빡임), 화면 밖 예고는 가장자리 화살표, 보스 패턴 이름 */
  drawTelsOver(ctx, cx, cy, t) {
    const flash = (k) => (k > 0.7 && Math.floor(t * 14) % 2 ? "rgba(255,255,255,0.95)" : `rgba(255,${k > 0.7 ? 200 : 70},60,${0.75 + 0.25 * Math.sin(t * 10)})`);
    ctx.save();
    ctx.lineWidth = 2;
    for (const s of G.tels.values()) {
      if (isAllyFx(s)) continue;
      const k = Math.min(1, (t - s.t0) / Math.max(0.05, s.d));
      if (k >= 1) continue;
      const x = s.x - cx, y = s.y - cy;
      const R = Math.max(s.r ?? 0, s.r2 ?? 0, s.l ?? 0, 20);
      // 화면 밖이면 가장자리에 화살표
      if (x + R < 0 || y + R < 0 || x - R > VW || y - R > VH) { this.edgeArrow(ctx, x, y, t); continue; }
      ctx.strokeStyle = flash(k);
      if (s.sh === "c") { ctx.beginPath(); ctx.ellipse(x, y, s.r, s.r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (s.sh === "ring") { ctx.beginPath(); ctx.ellipse(x, y, s.r2, s.r2 * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(120,255,140,0.9)"; ctx.beginPath(); ctx.ellipse(x, y, s.r, s.r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      else if (s.sh === "cone") { const half = (s.arc * Math.PI) / 360; ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.75); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s.r, s.a - half, s.a + half); ctx.closePath(); ctx.restore(); ctx.stroke(); }
      else if (s.sh === "r") { ctx.save(); ctx.translate(x, y); ctx.rotate(s.a); ctx.strokeRect(0, -s.w / 2, s.l, s.w); ctx.restore(); }
      else if (s.sh === "flood") { for (const [px, py, pr] of s.pts ?? []) { ctx.strokeStyle = "rgba(160,255,220,0.95)"; ctx.beginPath(); ctx.ellipse(px - cx, py - cy, pr, pr * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); } }
      if (s.g) this.drawGlyph(ctx, x, y, s.g, t, s.r);
    }
    // 보스 광선: 돌아갈 범위(부채꼴)를 미리 보여 줌
    for (const b of G.beams) {
      if (!b.boss) continue;
      const boss = G.ents.get(b.boss); if (!boss) continue;
      const age = t - b.t0, x = boss.rx - cx, y = boss.ry - cy - 16;
      const a0 = b.a, a1 = b.a + b.rot * b.d, lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      const cur = age < b.at ? a0 : b.a + b.rot * (age - b.at);
      ctx.fillStyle = `rgba(255,60,160,${age < b.at ? 0.16 : 0.08})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, b.l, b.rot > 0 ? cur : lo, b.rot > 0 ? hi : cur); ctx.closePath(); ctx.fill();
      if (age < b.at) { ctx.strokeStyle = flash(age / b.at); ctx.lineWidth = Math.max(2, b.w * 0.5); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a0) * b.l, y + Math.sin(a0) * b.l); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 2; }
    }
    // 탄막 사전 경고: 탄이 날아갈 길(바퀴살)을 점점 진하게 + 남은 시간 숫자
    if (G.warns?.length) G.warns = G.warns.filter((w) => {
      const age = t - w.t0;
      if (age > w.d) return false;
      const k = age / w.d, x = w.x - cx, y = w.y - cy, L = 520;
      ctx.lineWidth = 2;
      if (w.k !== "spiral") for (let wave = 0; wave < Math.min(2, w.w); wave++) {
        const off = (wave * Math.PI) / w.n;
        ctx.strokeStyle = wave ? `rgba(255,200,80,${0.25 + 0.35 * k})` : `rgba(255,70,200,${0.35 + 0.5 * k})`;
        if (k > 0.8 && Math.floor(t * 14) % 2) ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        for (let i = 0; i < w.n; i++) { const a = (i / w.n) * Math.PI * 2 + off; ctx.moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); }
        ctx.stroke();
      }
      // 커지는 경고 원 + 남은 초
      ctx.strokeStyle = `rgba(255,80,200,${0.5 + 0.4 * Math.sin(t * 12)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, 30 + 40 * k, (30 + 40 * k) * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.font = "16px Galmuri14"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const n = Math.ceil(w.d - age);
      ctx.fillStyle = "#000"; ctx.fillText(String(n), x + 1, y - 46 + 1); ctx.fillStyle = "#ffe08a"; ctx.fillText(String(n), x, y - 46);
      ctx.lineWidth = 2;
      return true;
    });
    // 보스 패턴 이름 + 피하는 법
    const bc = G.bossCall;
    if (bc && t - bc.t0 < (bc.hold ?? 1.6)) {
      const boss = G.ents.get(bc.id), info = BOSS_CALL[bc.p];
      if (boss && info) {
        // 화면 위쪽 가운데(보스 체력바 아래)에 고정 → 보스 위치와 상관없이 항상 같은 곳에서 읽힘
        const x = VW / 2, y = 62 + Math.max(0, 8 - (t - bc.t0) * 40);
        ctx.globalAlpha = Math.min(1, ((bc.hold ?? 1.6) - (t - bc.t0)) * 3);
        ctx.font = "12px Galmuri11"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const txt = bc.hold ? `! ${info[0]} ${Math.ceil(bc.hold - (t - bc.t0))}초 뒤 — ${info[1]}` : `! ${info[0]} — ${info[1]}`, w = ctx.measureText(txt).width + 14;
        ctx.fillStyle = "rgba(20,10,20,0.85)"; ctx.fillRect(Math.round(x - w / 2), Math.round(y - 9), Math.round(w), 18);
        ctx.strokeStyle = "#ffd35a"; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x - w / 2) + 0.5, Math.round(y - 9) + 0.5, Math.round(w) - 1, 17);
        ctx.fillStyle = "#ffe08a"; ctx.fillText(txt, Math.round(x), Math.round(y) + 1);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  edgeArrow(ctx, x, y, t) {
    const ex = Math.max(14, Math.min(VW - 14, x)), ey = Math.max(14, Math.min(VH - 14, y));
    const a = Math.atan2(y - VH / 2, x - VW / 2);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.fillStyle = `rgba(255,70,50,${0.6 + 0.4 * Math.sin(t * 12)})`;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // y 정렬해서 그릴 것들
  drawSorted(ctx, cx, cy, t) {
    const list = this.drawList, pool = this.drawPool, players = this.drawPlayers;
    list.length = 0; players.length = 0;
    const inView = (x, y, m = 80) => x - cx > -m && y - cy > -m && x - cx < VW + m && y - cy < VH + m * 1.5;
    for (const e of G.ents.values()) if (e.k === "p" && !e.dead && inView(e.rx, e.ry, 120)) players.push(e);
    let count = 0;
    const add = (y, o = null, e = null, f = null) => {
      const it = pool[count] ?? (pool[count] = {});
      it.y = y; it.o = o; it.e = e; it.f = f;
      list.push(it); count++;
    };
    for (const o of G.objects) if (inView(o.x, o.y, 160)) add(objectDepthY(o, players), o);
    for (const e of G.ents.values()) if (inView(e.rx, e.ry)) add(e.ry, null, e);
    if (G.kind === "town") for (const f of folkList()) if (inView(f.x, f.y)) add(f.y, null, null, f);
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.o) this.drawObject(ctx, it.o, cx, cy, t);
      else if (it.f) drawFolk(ctx, it.f, cx, cy, t);
      else this.drawEnt(ctx, it.e, cx, cy, t);
    }
  }

  /** 마을의 결투장 명예의 전당: 상위 5명을 판자에 크게 표시 */
  drawPvpBoard(ctx, o, x, y, t) {
    const W = 150, H = 90, top = y - H - 10;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y - 2, 78, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a2410"; ctx.fillRect(x - W / 2 + 6, top + 10, 5, H + 2); ctx.fillRect(x + W / 2 - 11, top + 10, 5, H + 2);
    ctx.fillStyle = "#6a4422"; ctx.fillRect(x - W / 2, top, W, H);
    ctx.fillStyle = "#1c1410"; ctx.fillRect(x - W / 2 + 4, top + 14, W - 8, H - 18);
    ctx.fillStyle = "#c8a050"; ctx.fillRect(x - W / 2, top, W, 3); ctx.fillRect(x - W / 2, top + H - 3, W, 3);
    ctx.fillStyle = "#8a1a24"; ctx.fillRect(x - 56, top - 7, 112, 17);
    ctx.fillStyle = "#ffd35a"; ctx.fillRect(x - 56, top - 7, 112, 2);
    this.label(ctx, "⚔ 결투장 명예의 전당", x, top + 7, "#ffe08a");
    const list = G.pvpTop ?? [];
    if (!list.length) this.label(ctx, "아직 기록이 없어요", x, top + 44, "#a0a0a0");
    const COL = ["#ffd35a", "#d8e0f0", "#e0a060", "#9ad0ff", "#9ad0ff"];
    for (let i = 0; i < Math.min(5, list.length); i++) {
      const r = list[i], yy = top + 28 + i * 13;
      const name = r.n.length > 9 ? r.n.slice(0, 9) + "…" : r.n;
      this.label(ctx, `${i + 1}. ${name}`, x - 20, yy, COL[i]);
      this.label(ctx, `${r.r}`, x + 52, yy, COL[i]);
    }
    if (o.glow !== false) addGlow(o.x, o.y - 50, 90, "#ffb050", 0.25 + Math.sin(t * 2) * 0.05, "pvpb|" + o.x);
    const near = G.ents.get(G.you);
    if (near && Math.hypot(near.rx - o.x, near.ry - o.y) < 90) this.label(ctx, G.touch ? "눌러서 순위 보기" : "[G] 순위 보기", x, top - 14, "#ffd35a");
  }
  /** 결투장 중앙 거점: 열리기 전엔 희미하게, 열리면 금빛, 결계가 좁혀지면 붉게 */
  drawPvpZone(ctx, o, x, y, t) {
    const st = G.pvp, on = st?.z, storm = st?.st;
    const r = st?.zr ?? 92;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = storm ? `rgba(255,70,70,${0.7 + Math.sin(t * 6) * 0.2})` : on ? `rgba(255,210,90,${0.7 + Math.sin(t * 4) * 0.2})` : "rgba(200,200,220,0.25)";
    ctx.fillStyle = storm ? "rgba(255,60,60,0.10)" : on ? "rgba(255,200,80,0.10)" : "rgba(200,200,220,0.04)";
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * (on ? 20 : 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    if (on) this.label(ctx, storm ? "거점 (결계 수축 중)" : "거점", x, y - r * 0.75 - 4, storm ? "#ff8a8a" : "#ffe08a");
  }

  drawObject(ctx, o, cx, cy, t) {
    const x = Math.round(o.x - cx), y = Math.round(o.y - cy);
    if (o.kind === "pvpboard") return this.drawPvpBoard(ctx, o, x, y, t);
    if (o.kind === "pvpzone") return this.drawPvpZone(ctx, o, x, y, t);
    if (G.kind === "pvp" && o.kind === "flag" && drawTownObject(ctx, o, x, y, t)) return;
    if (G.kind === "town" && drawTownObject(ctx, o, x, y, t)) return;
    if (G.kind !== "town" && drawDungeonObject(ctx, o, x, y, t)) return;
    if (o.kind === "npc" && G.kind === "town" && drawTownNpc(ctx, o, x, y, t)) {
      this.label(ctx, o.name, x, y - 40, "#9ef0a0");
      const near = G.ents.get(G.you);
      if (near && Math.hypot(near.rx - o.x, near.ry - o.y) < 70) this.label(ctx, G.touch ? "눌러서 대화" : "[G] 대화", x, y - 50, "#ffd35a");
      return;
    }
    switch (o.kind) {
      case "torch": case "campfire": case "fountain": case "lamp": {
        const b = baked_(o.fx ?? (o.kind === "campfire" ? "fire/campfire" : o.kind === "fountain" ? "water/fountain" : "fire/torch"));
        const f = bakedFrame(b, t + (o.x % 7) * 0.13);
        if (f) {
          const s = o.kind === "lamp" ? 0.8 : o.kind === "torch" ? 0.75 : 1;
          if (o.kind === "lamp") { ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x - 1, y - 18, 3, 20); }
          ctx.drawImage(f, Math.round(x - b.ox * s), Math.round(y - b.oy * s - (o.kind === "lamp" ? 18 : 0)), Math.round(b.w * s), Math.round(b.h * s));
        }
        // 불빛 색 번짐
        if (o.kind === "torch" || o.kind === "campfire" || o.kind === "lamp") addGlow(o.x, o.y - 18, o.kind === "campfire" ? 130 : 95, G.zone?.torchColor ?? "#ff9a3a", (o.kind === "campfire" ? 0.45 : 0.35) * (0.9 + Math.sin(t * 11 + o.x) * 0.1), o.kind === "lamp" ? o : null);
        break;
      }
      case "portal": {
        const locked = o.id === "exit" && !G.exitOpen;
        const pal = o.color === "town" ? ["#062010", "#0e4a1e", "#1f8a34", "#4fd060", "#b0ff9a", "#f0fff0"] : o.id === "safe" || o.id === "victory" ? ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"] : o.color === "dungeon2" ? ["#140410", "#50102e", "#b02060", "#ff5a9a", "#ffd0e8", "#ffffff"] : o.color === "dungeon3" ? ["#041420", "#0e3a5a", "#2080c0", "#6ad8ff", "#d8f4ff", "#ffffff"] : o.color === "dungeon4" ? ["#181004", "#4a3410", "#a07a20", "#ffd860", "#fff4c0", "#ffffff"] : null;
        const b = baked_("arcane/portal", pal);
        const f = bakedFrame(b, t);
        if (!locked) addGlow(o.x, o.y - 20, 120, pal ? (o.color === "town" ? "#6aff7a" : o.color === "dungeon2" ? "#ff4a8a" : o.color === "dungeon3" ? "#5ad0ff" : o.color === "dungeon4" ? "#ffd35a" : "#ffd35a") : "#b07aff", 0.5, o);
        if (f) { ctx.globalAlpha = locked ? 0.25 : 1; const s = 0.55; ctx.drawImage(f, Math.round(x - b.ox * s), Math.round(y - b.oy * s), Math.round(b.w * s), Math.round(b.h * s)); ctx.globalAlpha = 1; }
        if (o.label || locked) this.label(ctx, locked ? "출구 (몬스터를 모두 처치하면 열림)" : o.label, x, y - 44, locked ? "#888" : "#ffe08a");
        break;
      }
      case "npc": {
        const look = NPC_LOOK[o.id];
        if (look) {
          const s = sprite(look, "npc:" + o.id, "idle", Math.floor(t * 1.5) % 2, 0.6);
          this.shadow(ctx, x, y, 10);
          ctx.drawImage(s.canvas, x - s.ox, y - s.oy);
        } else if (o.id === "board") {
          ctx.fillStyle = "#5a3a20"; ctx.fillRect(x - 2, y - 26, 4, 26); ctx.fillStyle = "#8a5a30"; ctx.fillRect(x - 14, y - 34, 28, 18); ctx.fillStyle = "#e8d8b0"; ctx.fillRect(x - 11, y - 31, 9, 6); ctx.fillRect(x + 1, y - 31, 10, 8);
        }
        this.label(ctx, o.name, x, y - 46, "#9ef0a0");
        const near = G.ents.get(G.you);
        if (near && Math.hypot(near.rx - o.x, near.ry - o.y) < 70) this.label(ctx, "[G] 대화", x, y - 56, "#ffd35a");
        break;
      }
      case "starchart": {
        // 아스트라엘 성도 비석: 검은 돌기둥 + 13개 별 고리. 밝힌 별은 그 별자리 색으로 빛남
        const stars = G.char?.astra?.stars ?? {};
        this.shadow(ctx, x, y, 18);
        ctx.fillStyle = "#1a1630"; ctx.fillRect(x - 10, y - 52, 20, 52);
        ctx.fillStyle = "#2c2650"; ctx.fillRect(x - 10, y - 52, 6, 52);
        ctx.fillStyle = "#0e0c1c"; ctx.fillRect(x - 14, y - 6, 28, 6);
        ctx.fillStyle = "#3a3270"; ctx.beginPath(); ctx.moveTo(x - 10, y - 52); ctx.lineTo(x, y - 62); ctx.lineTo(x + 10, y - 52); ctx.fill();
        const cyy = y - 86, R = 26;
        let litN = 0;
        for (let i = 0; i < 13; i++) {
          const k = CONSTELLATIONS[i], on = !!stars[k.key];
          const a = -Math.PI / 2 + (i / 13) * Math.PI * 2 + t * 0.15;
          const sx = Math.round(x + Math.cos(a) * R), sy = Math.round(cyy + Math.sin(a) * R * 0.55);
          if (on) {
            litN++;
            const tw = 0.75 + Math.sin(t * 3 + i) * 0.25;
            ctx.globalAlpha = tw; ctx.fillStyle = k.color; ctx.fillRect(sx - 2, sy - 2, 5, 5);
            ctx.fillStyle = "#fff"; ctx.fillRect(sx - 1, sy - 1, 3, 3); ctx.globalAlpha = 1;
          } else if (!k.hidden) { ctx.fillStyle = "#3a3458"; ctx.fillRect(sx - 1, sy - 1, 3, 3); }
        }
        ctx.fillStyle = litN ? "#e8d8ff" : "#6a6090"; ctx.fillRect(x - 2, y - 40, 4, 4);
        addGlow(o.x, o.y - 70, 120 + litN * 6, "#b890ff", 0.25 + litN * 0.03 + Math.sin(t * 1.5) * 0.04, "starchart|" + o.x);
        this.label(ctx, `${o.name} (${litN}/13)`, x, y - 122, "#d8c0ff");
        break;
      }
      case "statue": {
        ctx.fillStyle = "#3a3a44"; ctx.fillRect(x - 10, y - 6, 20, 8);
        const s = sprite({ armor: ["#c8c8d0", "#a0a0aa", "#78788a", "#50505e"], core: ["#60606e", "#4a4a56", "#34343e"], mark: "#c8c8d0", weapon: "greatsword", head: "helm", headColor: "#a0a0aa" }, "statue", "guard", 0, 0.6);
        ctx.drawImage(s.canvas, x - s.ox, y - s.oy - 6);
        break;
      }
      case "sign": ctx.fillStyle = "#5a3a20"; ctx.fillRect(x - 1, y - 18, 3, 18); ctx.fillStyle = "#9a6a3a"; ctx.fillRect(x - 12, y - 26, 24, 10); this.label(ctx, o.text, x, y - 30, "#ffd35a"); break;
      case "dummy": {
        ctx.fillStyle = "#5a3a20"; ctx.fillRect(x - 1, y - 30, 3, 30); ctx.fillRect(x - 12, y - 24, 24, 3);
        ctx.fillStyle = "#d8b860"; ctx.fillRect(x - 6, y - 34, 12, 20); ctx.fillStyle = "#b89040"; ctx.fillRect(x - 6, y - 20, 12, 2); ctx.fillRect(x - 6, y - 28, 12, 1);
        ctx.fillStyle = "#c03030"; ctx.beginPath(); ctx.arc(x, y - 25, 3, 0, 7); ctx.fill();
        ctx.fillStyle = "#d8b860"; ctx.fillRect(x - 4, y - 42, 8, 8);
        this.label(ctx, "훈련 허수아비", x, y - 50, "#ccc");
        break;
      }
      case "tree": {
        const v = o.v ?? 0;
        this.shadow(ctx, x, y, 14);
        ctx.fillStyle = "#5a3a20"; ctx.fillRect(x - 3, y - 18, 6, 18);
        const greens = [["#2e6a2a", "#3e8a36", "#5aa848"], ["#2a5e3a", "#3a7e4a", "#58a05e"], ["#4a6a20", "#5e8a2a", "#86b03a"]][v % 3];
        for (const [dx, dy, r, c] of [[0, -30, 14, 0], [-8, -24, 10, 0], [8, -25, 10, 0], [0, -36, 10, 1], [-5, -32, 7, 2], [5, -28, 5, 2]]) { ctx.fillStyle = greens[c]; ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); }
        break;
      }
    }
  }

  shadow(ctx, x, y, w) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x, y + 1, w, w * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  }

  whiteOf(s) {
    let w = this.white.get(s.canvas);
    if (!w) {
      w = new OffscreenCanvas(s.canvas.width, s.canvas.height);
      const g = w.getContext("2d");
      g.drawImage(s.canvas, 0, 0);
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w.width, w.height);
      this.white.set(s.canvas, w);
    }
    return w;
  }

  drawEnt(ctx, e, cx, cy, t) {
    const ho = e.k === "m" || e.k === "b" ? hitOffset(e, t) : null;
    const x = Math.round(e.rx - cx + (ho?.ox ?? 0)), y = Math.round(e.ry - cy + (ho?.oy ?? 0));
    const info = e.info ?? {};
    const hurt = (e.hurtAt && t - e.hurtAt < 0.09) || (e.dieFlash && t - e.dieFlash < 0.12);
    const dying = e.dead && e.k !== "p";
    if (dying) ctx.globalAlpha = Math.max(0, 1 - (t - e.diedAt) / 0.4);
    if (e.k === "d") { this.drawDevice(ctx, e, x, y, t); ctx.globalAlpha = 1; return; }
    let look, key, critter = null, scale = 1;
    if (e.k === "p") ({ look, key } = playerLook(info.c, info.w, info.o));
    else if (e.k === "m") {
      const def = MONSTERS[info.m];
      if (info.m === "dummy" || !def) { ctx.globalAlpha = 1; return; }
      if (def.look.critter) { critter = def.look; scale = def.look.scale ?? 1; }
      else { look = def.look.rig; key = "m:" + info.m; scale = 1; }
      if (info.el) scale *= 1.15;
    } else if (e.k === "b") {
      const def = BOSSES[info.b];
      if (def.look.critter) { critter = def.look; scale = def.look.scale ?? 1; }
      else { look = def.look.rig; key = "b:" + info.b; scale = Math.max(1, Math.round(def.look.scale ?? 2)); }
    }
    // 애니메이션
    let anim = "idle", frame = Math.floor(t * 2 + e.id) % 2;
    const mine = e.id === G.you;
    const moving = mine ? (() => { const [mx, my] = moveDir(); return (mx || my) && !(e.fl & 10) && !G.me?.dead; })() : e.movedAt && t - e.movedAt < 0.15;
    if (e.anim && t - e.anim.t0 < (ANIM_TIME[e.anim.name] ?? 0.3) * Math.max(1, e.anim.n > 2 ? e.anim.n / 2 : 1)) {
      anim = POSES[e.anim.name] ? e.anim.name : "slash";
      const dur = (ANIM_TIME[anim] ?? 0.3) * Math.max(1, e.anim.n > 2 ? e.anim.n / 2 : 1);
      const n = POSES[anim].length;
      frame = Math.min(n - 1, Math.floor(((t - e.anim.t0) / dur) * n * (e.anim.n > 2 ? e.anim.n / 2 : 1)) % (n));
    } else if (e.fl & 2) { anim = "channel"; frame = Math.floor(t * 4) % 2; }
    else if (e.fl & 64 || (e.parryUntil && t < e.parryUntil)) { anim = "guard"; frame = 0; }
    else if (moving) { anim = "walk"; frame = Math.floor(t * 9 + e.id) % 4; }
    if (hurt && anim === "idle") anim = "hurt";
    // 방향 (나는 마우스 쪽을 바로 봄)
    const a = mine && !e.anim?.lock ? Math.atan2(G.mouse.wy - (e.ry - 16), G.mouse.wx - e.rx) : e.facing ?? 0;
    const flip = Math.cos(a) < 0;
    const sn = Math.sin(a);
    const yaw = sn > 0.6 ? 0.6 : sn < -0.6 ? -0.6 : 0;
    // 그림자
    const r = e.k === "b" ? 22 : critter ? 9 * scale : 10;
    if (!(critter?.critter && MONSTERS[info.m]?.fly) || true) this.shadow(ctx, x, y, r);
    const L = dtLookFor(e);
    if (L) {
      // 0x72 스프라이트 (몸 + 손에 든 무기)
      let ap = null;
      if (e.anim) {
        const d = (ANIM_TIME[e.anim.name] ?? 0.3) * Math.max(1, e.anim.n > 2 ? e.anim.n / 2 : 1);
        const p = (t - e.anim.t0) / d;
        if (p >= 0 && p < 1) ap = { name: e.anim.name, p };
      }
      ctx.save();
      if (ho && (ho.sx !== 1 || ho.sy !== 1)) { ctx.translate(x, y); ctx.scale(ho.sx, ho.sy); ctx.translate(-x, -y); }
      if (e.dead && e.k === "p") { ctx.globalAlpha = 0.55; ctx.translate(x, y); ctx.rotate(-Math.PI / 2); ctx.translate(-x - 4, -y - 6); }
      drawDT(ctx, e, L, x, y, { moving: !!moving, hurt: !!hurt, flip, aim: a, anim: ap, t, glow: info.el ? 0.16 + Math.sin(t * 6) * 0.08 : 0 });
      ctx.restore();
    } else {
    ctx.save();
    ctx.translate(x, y);
    if (ho && (ho.sx !== 1 || ho.sy !== 1)) ctx.scale(ho.sx, ho.sy);
    if (flip) ctx.scale(-1, 1);
    if (e.dead && e.k === "p") { ctx.globalAlpha = 0.55; ctx.rotate(-Math.PI / 2); ctx.translate(-4, -6); }
    if (e.st?.has("freeze") || e.st?.has("stun") && false) { /* 상태 이펙트가 따로 그려짐 */ }
    if (critter) {
      const b = baked_(critter.critter, critter.palette ?? null);
      const f = bakedFrame(b, t + e.id * 0.37);
      if (f) {
        const s = scale >= 1.5 ? Math.round(scale) : scale;
        const fly = MONSTERS[info.m]?.fly || BOSSES[info.b]?.fly;
        const bob = fly ? Math.sin(t * 3 + e.id) * 3 - 8 : 0;
        ctx.drawImage(hurt ? this.whiteOf({ canvas: f }) : f, Math.round(-b.ox * s), Math.round(-b.oy * s + bob), Math.round(b.w * s), Math.round(b.h * s));
      } else { ctx.fillStyle = "#8a4"; ctx.fillRect(-8, -16, 16, 16); }
    } else if (look) {
      const s = sprite(look, key, anim, frame, yaw, scale);
      ctx.drawImage(hurt ? this.whiteOf(s) : s.canvas, -s.ox, -s.oy);
      if (info.el) { ctx.globalAlpha = 0.25 + Math.sin(t * 6) * 0.1; ctx.drawImage(this.whiteOf(s), -s.ox, -s.oy); }
    }
    ctx.restore();
    }
    ctx.globalAlpha = 1;
    // 보호막 테두리
    if (e.fl & 4) { ctx.strokeStyle = "rgba(200,230,255,0.6)"; ctx.beginPath(); ctx.ellipse(x, y - 18, 16, 24, 0, 0, Math.PI * 2); ctx.stroke(); }
    // 예고 (몬스터 공격 준비)
    if (e.fl & 16 && e.k !== "p") { ctx.fillStyle = "#ff4040"; ctx.fillRect(x - 1, y - 52 * (e.k === "b" ? 1.6 : 1), 3, 8); ctx.fillRect(x - 1, y - 42 * (e.k === "b" ? 1.6 : 1), 3, 2); }
  }

  drawDevice(ctx, e, x, y, t) {
    const d = e.info.d;
    if (d === "mine") { ctx.fillStyle = "#2a2a30"; ctx.beginPath(); ctx.ellipse(x, y, 7, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = Math.floor(t * 4) % 2 ? "#ff4030" : "#601010"; ctx.fillRect(x - 1, y - 2, 2, 2); }
    else if (d === "wire") { ctx.strokeStyle = "rgba(220,220,240,0.7)"; ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.stroke(); ctx.fillStyle = "#555"; ctx.fillRect(x - 15, y - 3, 2, 5); ctx.fillRect(x + 13, y - 3, 2, 5); }
    else if (d === "wall") {
      ctx.save(); ctx.translate(x, y); ctx.rotate(e.facing + Math.PI / 2);
      ctx.fillStyle = "#6a5236"; ctx.fillRect(-28, -18, 56, 18); ctx.fillStyle = "#9c7652"; ctx.fillRect(-26, -16, 52, 4);
      ctx.fillStyle = "#8890a0"; for (let k = -24; k <= 24; k += 12) ctx.fillRect(k, -14, 3, 3);
      ctx.restore();
    } else if (d === "golem") {
      // 수호 골렘 7호: 강철·놋쇠 거구 + 가슴의 하늘색 동력 코어 + '7' 명판. 걸을 땐 걷는 동작, 내려찍을 땐 앞으로 덮침
      if (e._gx !== e.x || e._gy !== e.y) { e._gx = e.x; e._gy = e.y; e._gMove = t; }
      const moving = t - (e._gMove ?? -9) < 0.15;
      const slam = e.anim && t - e.anim.t0 < 0.4 ? (t - e.anim.t0) / 0.4 : 0;
      const flip = Math.cos(e.facing) < 0, dir = flip ? -1 : 1;
      const lunge = slam ? Math.round(Math.sin(slam * Math.PI) * 6) * dir : 0;
      const bob = slam ? -Math.round(Math.sin(slam * Math.PI) * 3) : 0;
      const name = (moving ? "ogre_run_anim_f" : "ogre_idle_anim_f") + (Math.floor(t * (moving ? 9 : 5)) % 4);
      this.shadow(ctx, x, y, 16);
      const gx = Math.round(x + lunge), gy = Math.round(y + bob);
      drawDTFoot(ctx, name, gx, gy, { tint: GOLEM_TINT, scale: 2, flip });
      // 동력 코어 (맥박처럼 빛남) + 눈빛
      const pulse = 0.6 + Math.sin(t * 6) * 0.25 + (slam ? 0.4 : 0);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(80,220,255,${Math.min(1, pulse) * 0.35})`; ctx.beginPath(); ctx.arc(gx, gy - 26, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#1a2a3a"; ctx.fillRect(gx - 4, gy - 30, 8, 8);
      ctx.fillStyle = "#5ae8ff"; ctx.fillRect(gx - 3, gy - 29, 6, 6);
      ctx.fillStyle = "#e8ffff"; ctx.fillRect(gx - 2, gy - 28, 2, 2);
      ctx.fillStyle = "#7ae8ff"; ctx.fillRect(gx + dir * 3 - 1, gy - 46, 2, 2); ctx.fillRect(gx + dir * 8 - 1, gy - 46, 2, 2); // 눈
      // '7' 놋쇠 명판 (어깨)
      ctx.fillStyle = "#3a2410"; ctx.fillRect(gx - dir * 10 - 4, gy - 40, 8, 9);
      ctx.fillStyle = "#e8b84a"; ctx.fillRect(gx - dir * 10 - 3, gy - 39, 6, 7);
      ctx.fillStyle = "#3a2410"; ctx.fillRect(gx - dir * 10 - 2, gy - 38, 4, 1); ctx.fillRect(gx - dir * 10 + 1, gy - 37, 1, 2); ctx.fillRect(gx - dir * 10, gy - 35, 1, 2);
      if (slam > 0.45 && slam < 0.7) { ctx.fillStyle = "rgba(255,240,200,0.5)"; ctx.fillRect(gx + dir * 14 - 6, gy - 2, 12, 2); }
    } else if (d === "circuit") { /* 빔으로 그림 */ }
    else if (d === "turret") {
      // 메카닉 자동 포탑: 삼각대 + 회전 포신
      const big = e.info.big;
      this.shadow(ctx, x, y, big ? 14 : 11);
      ctx.fillStyle = "#2a3a48"; ctx.fillRect(x - 9, y - 4, 3, 6); ctx.fillRect(x + 6, y - 4, 3, 6); ctx.fillRect(x - 1, y - 3, 3, 6);
      ctx.fillStyle = big ? "#5a8ab8" : "#4a6a88"; ctx.fillRect(x - 8, y - 16, 16, 12);
      ctx.fillStyle = "#8ad0ff"; ctx.fillRect(x - 3, y - 13, 6, 5);
      ctx.save(); ctx.translate(x, y - 11); ctx.rotate(e.facing);
      ctx.fillStyle = "#c8d8e8"; ctx.fillRect(0, -2, big ? 16 : 12, 4);
      ctx.restore();
      addGlow(e.rx, e.ry - 12, 36, "#60c8ff", 0.25, "tur" + e.id);
    } else if (d === "pet") {
      const skin = e.info.sk ?? "hound";
      const SK = { hound: ["chort", { m: "#ff9070", s: "#200404" }, 1.6], demon: ["big_demon", { m: "#c070ff", s: "#100018" }, 1.7], wraith: ["necromancer", { m: "#b0a0ff", s: "#06021a" }, 1.6], clone: ["elf_m", { m: "#5a4a70", s: "#000000", sat: 0.3 }, 1.8] }[skin] ?? ["chort", null, 1.6];
      if (e._gx !== e.x || e._gy !== e.y) { e._gx = e.x; e._gy = e.y; e._gMove = t; }
      const moving = t - (e._gMove ?? -9) < 0.15;
      this.shadow(ctx, x, y, skin === "demon" ? 16 : 11);
      if (skin === "clone") ctx.globalAlpha = 0.6;
      drawDTFoot(ctx, `${SK[0]}_${moving ? "run" : "idle"}_anim_f${Math.floor(t * (moving ? 9 : 5)) % 4}`, Math.round(x), Math.round(y), { tint: SK[1], scale: SK[2], flip: Math.cos(e.facing) < 0 });
      ctx.globalAlpha = 1;
    }
  }

  drawProjectiles(ctx, cx, cy, t) {
    for (const [id, p] of G.projectiles) {
      const age = t - p.t0;
      const dist = age * p.v;
      if (dist > p.r + 20) { G.projectiles.delete(id); continue; }
      const x = p.x + Math.cos(p.a) * dist - cx, y = p.y + Math.sin(p.a) * dist - cy;
      if (x < -180 || y < -180 || x > VW + 180 || y > VH + 180) continue;
      const b = p.fx ? baked_(p.fx, p.pal ?? null) : null;
      const f = bakedFrame(b, age);
      if (f) {
        const s = p.s ?? (b.w > 140 ? 0.6 : 0.8);
        ctx.save(); ctx.translate(Math.round(x), Math.round(y));
        const { flip, angle } = orient(p.a);
        ctx.rotate(angle); if (flip) ctx.scale(-1, 1);
        ctx.drawImage(f, Math.round(-b.ox * s), Math.round(-b.oy * s), Math.round(b.w * s), Math.round(b.h * s));
        ctx.restore();
      } else {
        ctx.fillStyle = isAllyFx(p) ? "#9ef" : "#f84";
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
    }
  }

  drawBeams(ctx, cx, cy, t) {
    const beams = G.beams;
    let kept = 0;
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i], age = t - b.t0;
      if (b.boss) {
        const boss = G.ents.get(b.boss);
        if (!boss || age > b.at + b.d) continue;
        const x = boss.rx - cx, y = boss.ry - cy - 16;
        if (x < -b.l - 100 || y < -b.l - 100 || x > VW + b.l + 100 || y > VH + b.l + 100) { beams[kept++] = b; continue; }
        if (age < b.at) {
          ctx.strokeStyle = "rgba(255,60,60,0.7)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b.a) * b.l, y + Math.sin(b.a) * b.l); ctx.stroke();
        } else {
          const a = b.a + b.rot * (age - b.at), width = b.w * (0.8 + Math.sin(t * 30) * 0.15);
          ctx.lineCap = "round";
          ctx.strokeStyle = "rgba(255,80,200,0.35)"; ctx.lineWidth = width;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * b.l, y + Math.sin(a) * b.l); ctx.stroke();
          ctx.strokeStyle = "rgba(255,160,255,0.7)"; ctx.lineWidth = width * 0.55;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * b.l, y + Math.sin(a) * b.l); ctx.stroke();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = width * 0.2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * b.l, y + Math.sin(a) * b.l); ctx.stroke();
          ctx.lineWidth = 1; ctx.lineCap = "butt";
        }
        beams[kept++] = b;
        continue;
      }
      if (age > b.d) continue;
      const x0 = b.x0 - cx, y0 = b.y0 - cy - 14, x1 = b.x1 - cx, y1 = b.y1 - cy - 14;
      if (Math.max(x0, x1) < -100 || Math.max(y0, y1) < -100 || Math.min(x0, x1) > VW + 100 || Math.min(y0, y1) > VH + 100) { beams[kept++] = b; continue; }
      const col = b.fx === "circuit" ? "#ffb040" : b.fx === "wind" ? "#70ffd0" : b.fx === "curse" ? "#c070ff" : b.fx === "snipe" ? "#fff0a0" : "#bfe8ff";
      ctx.strokeStyle = col; ctx.lineWidth = b.fx === "circuit" ? 1 : 2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      const n = 6;
      for (let k = 1; k < n; k++) ctx.lineTo(x0 + ((x1 - x0) * k) / n + (Math.random() - 0.5) * 10, y0 + ((y1 - y0) * k) / n + (Math.random() - 0.5) * 10);
      ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineWidth = 1;
      beams[kept++] = b;
    }
    beams.length = kept;
  }

  /** 아스트라엘의 밤하늘: 반짝이는 별빛 입자 + 가끔 떨어지는 별똥별 (미리 정한 점만 찍어서 가벼움) */
  drawStarSky(ctx, cx, cy, t) {
    if (!this.skyStars) {
      let sd = 7;
      const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      this.skyStars = Array.from({ length: 70 }, () => ({ x: r() * 1600, y: r() * 900, p: r() * 6.28, s: r() < 0.15 ? 2 : 1, c: r() < 0.3 ? "#d8c0ff" : r() < 0.5 ? "#ffe8b0" : "#ffffff", z: 0.15 + r() * 0.3 }));
    }
    const n = Math.round(this.skyStars.length * (preset().weather ? 1 : 0.4));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i++) {
      const s = this.skyStars[i];
      const a = 0.2 + 0.5 * Math.max(0, Math.sin(t * (1.2 + (i % 5) * 0.3) + s.p));
      if (a < 0.25) continue;
      const x = (((s.x - cx * s.z) % VW) + VW) % VW, y = (((s.y - cy * s.z) % VH) + VH) % VH;
      ctx.globalAlpha = a; ctx.fillStyle = s.c; ctx.fillRect(x | 0, y | 0, s.s, s.s);
      if (s.s === 2 && a > 0.6) { ctx.globalAlpha = a * 0.4; ctx.fillRect((x | 0) - 2, (y | 0) + 0, 6, 1); ctx.fillRect((x | 0), (y | 0) - 2, 1, 6); }
    }
    // 별똥별: 7초마다 하나
    const k = Math.floor(t / 7), ph = t / 7 - k;
    if (ph < 0.12) {
      const q = ph / 0.12, sx = ((k * 977) % 600) + 200, sy = ((k * 331) % 120) + 20;
      const x = sx - q * 220, y = sy + q * 110;
      const g = ctx.createLinearGradient(x, y, x + 60, y - 30);
      g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(200,160,255,0)");
      ctx.globalAlpha = 1 - q * 0.6; ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y - 30); ctx.stroke();
    }
    ctx.restore();
  }

  drawLighting(ctx, cx, cy, t) {
    const town = G.kind === "town";
    // 아스트라엘은 늘 밤: 더 어둡게, 별빛·등불이 돋보이게
    const z = town ? (G.island === "astra" ? { ambient: 0.6, light: 130 } : { ambient: 0.4, light: 110 }) : G.zone;
    // 빛 지도는 절반 해상도라, 화면이 1px 움직일 때마다 빛 구멍이 0.5px씩 번갈아 어긋나 깜박였음
    // → 빛 지도를 '월드의 짝수 좌표'에 고정하고, 그릴 때만 0~1px 밀어서 맞춤
    const icx = Math.round(cx), icy = Math.round(cy);
    const bx = icx - (((icx % 2) + 2) % 2), by = icy - (((icy % 2) + 2) % 2);
    const dx = cx - bx, dy = cy - by;
    const L = this.lctx, W = this.light.width, H = this.light.height;
    // 렉 줄이기: 붐비거나 품질이 높음이 아니면 빛 지도는 두 프레임에 한 번만 새로 그림 (그 사이엔 화면 이동만큼 밀어서 재사용)
    const crowded = (G.crowdN ?? 0) > 12, lite = preset().name !== "높음" || crowded;
    this.lightFrame = (this.lightFrame ?? 0) + 1;
    if (lite && this.lightFrame % 2 && this.lightAt && this.lightAt.kind === G.kind && Math.abs(this.lightAt.bx - bx) < 64 && Math.abs(this.lightAt.by - by) < 64) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.light, this.lightAt.bx - bx - dx, this.lightAt.by - by - dy, W * 2, H * 2);
      ctx.imageSmoothingEnabled = false;
      return;
    }
    this.lightAt = { bx, by, kind: G.kind };
    L.globalCompositeOperation = "source-over";
    L.globalAlpha = 1;
    L.clearRect(0, 0, W, H);
    const amb = `rgba(6,4,14,${G.mapKind === "safe" ? 0.55 : z.ambient})`;
    L.fillStyle = amb;
    L.fillRect(0, 0, W, H);
    // 고정 빛(가로등·창문·수정·포탈 등)은 미리 뚫어 둔 조각을 붙이기만
    forEachChunk(bx, by, VW + 2, VH + 2, (x, y) => { const c = lightChunk(x, y, amb); const px = (x * CH - bx) / 2, py = (y * CH - by) / 2; L.clearRect(px, py, CH / 2, CH / 2); L.drawImage(c, px, py); });
    L.globalCompositeOperation = "destination-out";
    // 빛 구멍: 매번 그라디언트를 새로 만들지 않고, 미리 만든 둥근 빛 그림 한 장을 크기·세기만 바꿔 찍음 (훨씬 가벼움)
    L.imageSmoothingEnabled = true;
    const spr = holeSprite();
    let holes = 0;
    const hole = (x0, y0, r, a = 1) => {
      if (holes >= this.maxHoles || x0 < -r || y0 < -r || x0 > VW + r || y0 > VH + r) return false;
      holes++;
      const x = x0 + dx, y = y0 + dy;
      L.globalAlpha = Math.min(1, a);
      L.drawImage(spr, x / 2 - r / 2, y / 2 - r / 2, r, r);
      return true;
    };
    // 플레이어 빛: 나 + 가까운 순서로 최대 10명 (사람이 많으면 빛이 겹쳐 차이가 안 나는데 그리기만 무거움)
    const me = G.ents.get(G.you);
    if (me && !me.dead) hole(me.rx - cx, me.ry - cy - 14, z.light * 1.6);
    const ps = this.lightPs ?? (this.lightPs = []);
    ps.length = 0;
    for (const e of G.ents.values()) if (e.k === "p" && !e.dead && e !== me) { const x = e.rx - cx, y = e.ry - cy; if (x > -150 && y > -150 && x < VW + 150 && y < VH + 150) ps.push(e); }
    if (ps.length > 10 && me) ps.sort((a, b) => Math.abs(a.rx - me.rx) + Math.abs(a.ry - me.ry) - Math.abs(b.rx - me.rx) - Math.abs(b.ry - me.ry));
    for (let i = 0; i < ps.length && i < 10 && holes < this.maxHoles; i++) hole(ps[i].rx - cx, ps[i].ry - cy - 14, z.light * 1.1);
    if (holes < this.maxHoles) for (const o of G.objects) {
      if (o.kind !== "torch" && o.kind !== "campfire") continue;
      const x = o.x - cx, y = o.y - cy;
      hole(x, y - 14, (o.kind === "torch" ? 120 : 200) * (0.92 + Math.sin(t * 9 + o.x) * 0.06), 0.85);
      if (holes >= this.maxHoles) break;
    }
    if (holes < this.maxHoles) for (const p of G.projectiles.values()) {
      const d = (t - p.t0) * p.v;
      hole(p.x + Math.cos(p.a) * d - cx, p.y + Math.sin(p.a) * d - cy, 60, 0.6);
      if (holes >= this.maxHoles) break;
    }
    if (holes < this.maxHoles) for (const e of G.ents.values()) {
      if (e.k === "b") hole(e.rx - cx, e.ry - cy - 20, 160, 0.7);
      if (holes >= this.maxHoles) break;
    }
    if (holes < this.maxHoles) for (const l of G.loot.values()) {
      hole(l.x - cx, l.y - cy, 30, 0.5);
      if (holes >= this.maxHoles) break;
    }
    if (holes < this.maxHoles) forEachGlow((x, y, r, c, a) => {
      if (holes >= this.maxHoles) return false;
      hole(x - cx, y - cy, r * 1.3, Math.min(1, a * 1.6));
      return holes < this.maxHoles;
    });
    L.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, -dx, -dy, W * 2, H * 2);
    ctx.imageSmoothingEnabled = false;
  }

  /** 글자 그리기: 같은 글자·색은 그림으로 한 번 만들어 재사용 (사람이 많을 때 글자 그리기가 무거움) */
  label(ctx, text, x, y, col = "#fff", font = "10px Galmuri9") {
    const key = text + "|" + col + "|" + font;
    let c = labelCache.get(key);
    if (!c) {
      const m = (labelMeasure ??= new OffscreenCanvas(1, 1).getContext("2d"));
      m.font = font;
      const w = Math.ceil(m.measureText(text).width) + 3, h = parseInt(font) + 5;
      c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d");
      g.font = font; g.textAlign = "left"; g.textBaseline = "alphabetic";
      g.fillStyle = "#000"; g.fillText(text, 2, h - 3);
      g.fillStyle = col; g.fillText(text, 1, h - 4);
      if (labelCache.size > 600) labelCache.clear();
      labelCache.set(key, c);
    }
    ctx.drawImage(c, Math.round(x - (c.width - 3) / 2 - 1), Math.round(y - c.height + 4));
  }

  drawOverhead(ctx, cx, cy, t) {
    drawParts(ctx, cx, cy);
    // 아주 붐빌 때(20명 넘게 보임): 멀리 있는 남의 이름표·칭호는 생략 (겹쳐서 읽을 수도 없고 그리기만 무거움)
    const me = G.ents.get(G.you), thin = (G.crowdN ?? 0) > 20 && me;
    const partyNames = thin && G.party?.length ? new Set(G.party.map((m) => m.name)) : null;
    for (const e of G.ents.values()) {
      if (e.k === "d" || e.dead && e.k !== "p") continue;
      const info = e.info ?? {};
      if (info.m === "dummy") continue;
      const x = Math.round(e.rx - cx), y = Math.round(e.ry - cy);
      if (x < -60 || x > VW + 60 || y < -40 || y > VH + 80) continue;
      if (e.k === "p") {
        const top = y - 48;
        const foeP = isFoeEnt(e);
        if (thin && e.id !== G.you && !foeP && !partyNames?.has(info.n) && Math.abs(e.rx - me.rx) + Math.abs(e.ry - me.ry) > 150) continue;
        this.label(ctx, info.n, x, top - 4, e.id === G.you ? "#ffffff" : foeP ? "#ff7a7a" : "#8fd0ff");
        // 칭호: 디자인이 있으면 그림(화면 위 또렷한 이미지 층에), 없으면 색 글자
        if (info.tt && titleDesign(info.tt)) (G.titleMarks ??= []).push({ id: e.id, tt: info.tt, x, y: top - 14 });
        else if (info.tt) this.label(ctx, `「${info.tt}」`, x, top - 15, info.tc ?? "#ffd35a");
        if (e.id !== G.you && foeP) { ctx.fillStyle = "#000"; ctx.fillRect(x - 17, top, 34, 5); ctx.fillStyle = "#ff3a4a"; ctx.fillRect(x - 16, top + 1, Math.round(32 * e.hp), 3); }
        else if (e.id !== G.you) { ctx.fillStyle = "#000"; ctx.fillRect(x - 13, top, 26, 3); ctx.fillStyle = "#e0424e"; ctx.fillRect(x - 12, top + 1, Math.round(24 * e.hp), 1); }
        if (e.casting) {
          const k = Math.min(1, (t - e.casting.t0) / e.casting.d);
          if (k < 1) { ctx.fillStyle = "#000"; ctx.fillRect(x - 15, y + 6, 30, 4); ctx.fillStyle = "#ffd35a"; ctx.fillRect(x - 14, y + 7, Math.round(28 * k), 2); }
          else e.casting = null;
        }
      } else if (e.k === "m") {
        const def = MONSTERS[info.m];
        const h = def?.look.critter ? 30 * (def.look.scale ?? 1) : 46;
        const top = y - h - (def?.fly ? 10 : 0);
        if (e.hp < 1 || info.el) {
          ctx.fillStyle = "#000"; ctx.fillRect(x - 13, top, 26, 4);
          ctx.fillStyle = info.el ? "#ff9a30" : "#d03040"; ctx.fillRect(x - 12, top + 1, Math.max(1, Math.round(24 * e.hp)), 2);
        }
        if (info.el) this.label(ctx, info.n, x, top - 3, "#ffb050");
      }
    }
    // 터치 조준선
    if (G.aimLine) {
      const me = G.ents.get(G.you);
      if (me) {
        const x0 = Math.round(me.rx - cx), y0 = Math.round(me.ry - 16 - cy), x1 = Math.round(G.aimLine.x - cx), y1 = Math.round(G.aimLine.y - cy);
        ctx.save();
        ctx.strokeStyle = "rgba(255,230,140,0.85)"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(x1, y1, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // 데미지 숫자
    const floaters = G.floaters;
    let write = 0;
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i], age = t - f.t0;
      if (age > 1.1) continue;
      floaters[write++] = f;
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy - age * 26);
      ctx.globalAlpha = Math.min(1, (1.1 - age) * 3);
      const style = {
        dmg: ["#ffffff", "14px Galmuri14"], crit: ["#ffcf3a", "bold 16px Galmuri11"], hurt: ["#ff5a5a", "14px Galmuri14"], heal: ["#6aff8a", "14px Galmuri14"],
        dot: ["#c8a0ff", "10px Galmuri9"], absorb: ["#c8e0ff", "10px Galmuri9"], miss: ["#aaaaaa", "10px Galmuri9"], gold: ["#ffd35a", "10px Galmuri9"], status: ["#ffb0ff", "12px Galmuri11"],
      }[f.kind] ?? ["#fff", "12px Galmuri11"];
      const crit = f.kind === "crit";
      const pop = age < 0.12 ? 1 + (1 - age / 0.12) * (crit ? 0.9 : 0.5) : 1;
      ctx.save(); ctx.translate(x + (f.vx ?? 0) * age, y); ctx.scale(pop, pop);
      const img = f.img ??= crit ? critImage(f.text + "!") : floaterImage(f.text, style[0], style[1]);
      const scale = crit ? 0.75 : 1;
      ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    floaters.length = write;
  }
}

// 월드 렌더러: 타일 → 바닥 표시(예고·구역) → y정렬 유닛/오브젝트 → 투사체 → 이펙트 → 조명 → 날씨 → 머리 위 UI
import { G, localStep, moveDir } from "../game.js";
import { tickFeel, drawParts, hitOffset } from "../feel.js";
import { dtLookFor, drawDT } from "./looks.js";
import { drawTownObject, drawStrings, spawnFolk, tickFolk, folkList, drawFolk, drawTownNpc } from "./townart.js";
import { beginGlows, addGlow, drawGlows, forEachGlow } from "./glow.js";
import { drawDungeonObject } from "./dungeonart.js";
import { VIEW_W, VIEW_H, TILE } from "/shared/constants.js";
import { MONSTERS, BOSSES, ZONES } from "/shared/zones.js";
import { SKILLS } from "/shared/skills.js";
import { CLASS_INFO } from "/shared/classes.js";
import { RARITY_COLOR } from "/shared/items.js";
import { sprite, playerLook, ANIM_TIME, POSES } from "./sprites.js";
import { FxLayer, loadFx, preloadFx, baked_, bakedFrame, orient, prebake } from "./fx.js";

const now = () => performance.now() / 1000;
const GROUND_FX = new Set(["holy/heal-aoe", "nature/toxic-puddle", "nature/poison-cloud", "arcane/rune-circle", "arcane/magic-circle-cast", "shadow/hex-sigil", "fire/fire-ring", "nature/quake", "impacts/ground-slam", "scifi/laser-grid", "nature/root-snare", "holy/sunburst", "shadow/black-hole", "arcane/portal", "fire/campfire", "shadow/shadow-flames"]);
const STATUS_FX = { burn: "status/burning", poison: "status/poisoned", freeze: "status/frozen", stun: "status/stunned", down: "status/stunned", slow: "status/slowed", shock: "lightning/electrified", weaken: "status/cursed", bleed: "status/bleeding", groggy: "status/stunned", root: "nature/root-snare", vitalmark: "shadow/hex-sigil", huntmark: "shadow/hex-sigil", blind: "status/confused" };

// NPC 생김새
const NPC_LOOK = {
  gate: { armor: ["#c8d0e0", "#98a4bc", "#68748f", "#47536b"], core: ["#2f5ea8", "#22447a", "#152b4f"], mark: "#ffd35a", weapon: "spear", head: "helm", headColor: "#a8b4c8" },
  shop: { armor: ["#e8d8b0", "#c8b088", "#9a8462", "#6a5a40"], core: ["#3a7a4a", "#2a5a36", "#1a3a22"], mark: "#ffd35a", weapon: null, head: "cap", headColor: "#3a7a4a" },
  smithy: { armor: ["#d8a07a", "#b07852", "#7e5436", "#523420"], core: ["#3a3a42", "#2a2a30", "#1a1a20"], mark: "#ff8a30", weapon: "hammer", head: "band", headColor: "#5a3a20" },
  trainer: { armor: ["#e8edf6", "#a9b6cc", "#6f7f9c", "#47536b"], core: ["#8a2a2a", "#601c1c", "#3a1010"], mark: "#ffd35a", weapon: "sword", head: "band", headColor: "#a02a2a" },
  class_master: { armor: ["#fff6d8", "#e8d4a0", "#c0a060", "#806838"], core: ["#5a2a8a", "#401c66", "#281040"], mark: "#ffffff", weapon: "staff", head: "mitre", headColor: "#fff6d8" },
};

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.front = new FxLayer(VIEW_W, VIEW_H);
    this.ground = new FxLayer(VIEW_W, VIEW_H);
    this.weather = new FxLayer(320, 180);
    this.weather.every = 2; // 날씨는 배경이라 30fps로 충분
    this.light = new OffscreenCanvas(VIEW_W / 2, VIEW_H / 2);
    this.lctx = this.light.getContext("2d");
    this.zoneFx = new Map();
    this.white = new WeakMap();
    this.last = now();
    this.fps = 60;
  }

  onMap() {
    spawnFolk();
    this.front.clear(); this.ground.clear(); this.weather.clear(); this.zoneFx.clear();
    const z = G.zone;
    const ids = ["arcane/portal", "fire/torch", "fire/campfire", "water/fountain", "fire/candle", "impacts/hit-spark", "impacts/hit-flash", "spawn/poof", "ui/level-up", "spawn/soul-rise", "status/stunned", "status/burning", "status/poisoned", "status/frozen", "status/slowed", "pickups/loot-beam"];
    if (G.kind !== "town") {
      ids.push(z.torch);
      for (const id of z.monsters) { const m = MONSTERS[id]; if (m.look.critter) ids.push(m.look.critter); if (m.proj) ids.push(m.proj); if (m.aoe) ids.push(m.aoe); }
      for (const b of [z.mid, z.boss]) { const d = BOSSES[b]; if (d.look.critter) ids.push(d.look.critter); for (const p of d.patterns) if (p.fx) ids.push(p.fx); }
      if (z.weather) ids.push(z.weather);
    }
    for (const id of G.char?.skills ?? []) { const s = SKILLS[id]; if (s?.fx) ids.push(...Object.values(s.fx).filter((v) => typeof v === "string")); }
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
    const f = (GROUND_FX.has(e.fx) ? this.ground : this.front).spawn(e.fx, e.x, e.y, { life: e.d, follow: e.fol || undefined, pal: e.pal ?? undefined, s: e.r < 70 ? 0.7 : 1 });
    if (f) this.zoneFx.set(e.id, f);
  }
  zoneEnd(id) { const f = this.zoneFx.get(id); if (f) f.inst.stop(); this.zoneFx.delete(id); }
  statusFx(ent, s, d) {
    const id = STATUS_FX[s];
    if (!id) return;
    if (ent.stFx?.[s] && !ent.stFx[s].inst.done()) { ent.stFx[s].until = now() + d; return; }
    ent.stFx = ent.stFx ?? {};
    ent.stFx[s] = this.front.spawn(id, ent.rx, ent.ry, { follow: ent.id, life: d, s: ent.k === "b" ? 1.4 : ent.info?.m && MONSTERS[ent.info.m]?.look.critter ? 0.6 : 1, dy: s === "root" || s === "vitalmark" || s === "huntmark" ? 0 : 0 });
  }

  // ── 그리기
  frame() {
    const t = now();
    const dt = Math.min(0.1, t - this.last);
    this.last = t;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const ctx = this.ctx;
    if (!G.map) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    // 위치: 나는 매 프레임 즉시 이동, 다른 유닛은 보간
    localStep(dt);
    tickFeel(dt);
    const rt = t - 0.1;
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
    const tx = (me?.rx ?? G.local.x) - VIEW_W / 2, ty = (me?.ry ?? G.local.y) - VIEW_H / 2 - 10;
    G.cam.x = Math.round(mw <= VIEW_W ? (mw - VIEW_W) / 2 : Math.max(0, Math.min(mw - VIEW_W, tx)));
    G.cam.y = Math.round(mh <= VIEW_H ? (mh - VIEW_H) / 2 : Math.max(0, Math.min(mh - VIEW_H, ty)));
    let sx = 0, sy = 0;
    if (G.shake > 0) { sx = (Math.random() - 0.5) * G.shake * 2; sy = (Math.random() - 0.5) * G.shake * 2; G.shake = Math.max(0, G.shake - dt * 18); }
    const cx = Math.round(G.cam.x + sx + (G.camKick?.x ?? 0)), cy = Math.round(G.cam.y + sy + (G.camKick?.y ?? 0));
    if (me) G.map.reveal(me.rx, me.ry);

    beginGlows();
    if (G.kind === "town") tickFolk(dt);
    this.front.update(dt, G.ents);
    this.ground.update(dt, G.ents);
    this.weather.update(dt, G.ents);

    ctx.fillStyle = "#08070b";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    G.map.draw(ctx, cx, cy, VIEW_W, VIEW_H);
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
    drawGlows(ctx, cx, cy, VIEW_W, VIEW_H);
    if (this.weather.list.length) {
      const wc = this.wctx ?? (this.wctx = this.mkWeatherCtx());
      wc.clearRect(0, 0, 320, 180);
      this.weather.render(wc, 0, 0);
      ctx.globalAlpha = G.kind === "town" ? 0.5 : 0.45;
      const ox = -(((cx % 320) + 320) % 320), oy = -(((cy % 180) + 180) % 180);
      for (let yy = oy; yy < VIEW_H; yy += 180) for (let xx = ox; xx < VIEW_W; xx += 320) ctx.drawImage(this.wcv, xx, yy);
      ctx.globalAlpha = 1;
    }
    this.drawOverhead(ctx, cx, cy, t);
    if (G.hurtFlash > 0) {
      const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 120, VIEW_W / 2, VIEW_H / 2, 380);
      g.addColorStop(0, "rgba(200,0,20,0)"); g.addColorStop(1, `rgba(200,0,20,${G.hurtFlash})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      G.hurtFlash = Math.max(0, G.hurtFlash - dt);
    }
    if (me && me.hp < 0.3 && !me.dead) {
      ctx.fillStyle = `rgba(160,0,20,${0.12 + Math.sin(t * 5) * 0.06})`;
      ctx.fillRect(0, 0, VIEW_W, 6); ctx.fillRect(0, VIEW_H - 6, VIEW_W, 6); ctx.fillRect(0, 0, 6, VIEW_H); ctx.fillRect(VIEW_W - 6, 0, 6, VIEW_H);
    }
  }
  mkWeatherCtx() { this.wcv = new OffscreenCanvas(320, 180); const c = this.wcv.getContext("2d"); return c; }

  drawLoot(ctx, cx, cy, t) {
    for (const l of G.loot.values()) {
      const x = l.x - cx, y = l.y - cy;
      if (x < -40 || y < -40 || x > VIEW_W + 40 || y > VIEW_H + 40) continue;
      const col = l.s === "cons" ? "#ff6a7a" : RARITY_COLOR[l.r] ?? "#ccc";
      const bob = Math.sin(t * 3 + l.id) * 1.5;
      if (l.r === "전설" || l.r === "신화" || l.r === "영웅") {
        ctx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.1;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 40, 4, 40);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#000a"; ctx.fillRect(Math.round(x) - 5, Math.round(y) + 2, 10, 2);
      ctx.fillStyle = "#000"; ctx.fillRect(Math.round(x) - 4, Math.round(y - 7 + bob), 8, 8);
      ctx.fillStyle = col; ctx.fillRect(Math.round(x) - 3, Math.round(y - 6 + bob), 6, 6);
      ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(x) - 2, Math.round(y - 5 + bob), 2, 2);
    }
  }

  drawZones(ctx, cx, cy, t) {
    for (const z of G.zones.values()) {
      let x = z.x, y = z.y;
      if (z.fol) { const f = G.ents.get(z.fol); if (f) { x = f.rx; y = f.ry; } }
      ctx.strokeStyle = z.tm ? "rgba(120,220,255,0.55)" : "rgba(180,60,255,0.6)";
      ctx.fillStyle = z.tm ? "rgba(120,220,255,0.07)" : "rgba(160,40,200,0.12)";
      ctx.beginPath(); ctx.ellipse(Math.round(x - cx), Math.round(y - cy), z.r, z.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([4, 3]); ctx.lineDashOffset = -t * 12; ctx.stroke(); ctx.setLineDash([]);
    }
  }

  drawTels(ctx, cx, cy, t) {
    for (const s of G.tels.values()) {
      const k = Math.min(1, (t - s.t0) / Math.max(0.05, s.d));
      const ally = s.tm === 1;
      const edge = ally ? "rgba(120,220,255,0.8)" : "rgba(255,60,60,0.9)";
      const fill = ally ? "rgba(120,220,255,0.10)" : "rgba(255,40,40,0.16)";
      const prog = ally ? "rgba(120,220,255,0.18)" : "rgba(255,70,40,0.32)";
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
      }
    }
  }

  // y 정렬해서 그릴 것들
  drawSorted(ctx, cx, cy, t) {
    const list = [];
    const inView = (x, y, m = 80) => x - cx > -m && y - cy > -m && x - cx < VIEW_W + m && y - cy < VIEW_H + m * 1.5;
    for (const o of G.objects) if (inView(o.x, o.y, 160)) list.push({ y: o.flatY ?? (o.kind === "torch" ? o.y - 20 : o.flat ? o.y - 14 : o.y), o });
    for (const e of G.ents.values()) if (inView(e.rx, e.ry)) list.push({ y: e.ry, e });
    if (G.kind === "town") for (const f of folkList()) if (inView(f.x, f.y)) list.push({ y: f.y, f });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.o) this.drawObject(ctx, it.o, cx, cy, t);
      else if (it.f) drawFolk(ctx, it.f, cx, cy, t);
      else this.drawEnt(ctx, it.e, cx, cy, t);
    }
  }

  drawObject(ctx, o, cx, cy, t) {
    const x = Math.round(o.x - cx), y = Math.round(o.y - cy);
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
        if (o.kind === "torch" || o.kind === "campfire" || o.kind === "lamp") addGlow(o.x, o.y - 18, o.kind === "campfire" ? 130 : 95, G.zone?.torchColor ?? "#ff9a3a", (o.kind === "campfire" ? 0.45 : 0.35) * (0.9 + Math.sin(t * 11 + o.x) * 0.1));
        break;
      }
      case "portal": {
        const locked = o.id === "exit" && !G.exitOpen;
        const pal = o.color === "town" ? ["#062010", "#0e4a1e", "#1f8a34", "#4fd060", "#b0ff9a", "#f0fff0"] : o.id === "safe" || o.id === "victory" ? ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"] : null;
        const b = baked_("arcane/portal", pal);
        const f = bakedFrame(b, t);
        if (!locked) addGlow(o.x, o.y - 20, 120, pal ? (o.color === "town" ? "#6aff7a" : "#ffd35a") : "#b07aff", 0.5);
        if (f) { ctx.globalAlpha = locked ? 0.25 : 1; const s = 0.55; ctx.drawImage(f, Math.round(x - b.ox * s), Math.round(y - b.oy * s), Math.round(b.w * s), Math.round(b.h * s)); ctx.globalAlpha = 1; }
        if (o.label || locked) this.label(ctx, locked ? "출구 (웨이브를 모두 물리치면 열림)" : o.label, x, y - 44, locked ? "#888" : "#ffe08a");
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
      const s = sprite({ armor: ["#f0d080", "#c8a050", "#987030", "#604418"], core: ["#4a4a52", "#34343a", "#202024"], mark: "#40e0ff", weapon: "hammer", head: "helm", headColor: "#c8a050" }, "golem", e.anim && t - e.anim.t0 < 0.4 ? "smash" : "idle", e.anim && t - e.anim.t0 < 0.4 ? Math.min(2, Math.floor((t - e.anim.t0) / 0.13)) : Math.floor(t * 2) % 2, Math.sin(e.facing) > 0.6 ? 0.6 : 0, 1);
      this.shadow(ctx, x, y, 12);
      ctx.save(); ctx.translate(x, y); if (Math.cos(e.facing) < 0) ctx.scale(-1, 1); ctx.drawImage(s.canvas, -s.ox, -s.oy); ctx.restore();
    } else if (d === "circuit") { /* 빔으로 그림 */ }
  }

  drawProjectiles(ctx, cx, cy, t) {
    for (const [id, p] of G.projectiles) {
      const age = t - p.t0;
      const dist = age * p.v;
      if (dist > p.r + 20) { G.projectiles.delete(id); continue; }
      const x = p.x + Math.cos(p.a) * dist - cx, y = p.y + Math.sin(p.a) * dist - cy;
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
        ctx.fillStyle = p.tm ? "#9ef" : "#f84";
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
    }
  }

  drawBeams(ctx, cx, cy, t) {
    G.beams = G.beams.filter((b) => {
      const age = t - b.t0;
      if (b.boss) {
        const boss = G.ents.get(b.boss);
        if (!boss || age > b.at + b.d) return false;
        const x = boss.rx - cx, y = boss.ry - cy - 16;
        if (age < b.at) {
          ctx.strokeStyle = "rgba(255,60,60,0.7)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b.a) * b.l, y + Math.sin(b.a) * b.l); ctx.stroke();
          return true;
        }
        const a = b.a + b.rot * (age - b.at);
        const w = b.w * (0.8 + Math.sin(t * 30) * 0.15);
        for (const [lw, col] of [[w, "rgba(255,80,200,0.35)"], [w * 0.55, "rgba(255,160,255,0.7)"], [w * 0.2, "#fff"]]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * b.l, y + Math.sin(a) * b.l); ctx.stroke();
        }
        ctx.lineWidth = 1; ctx.lineCap = "butt";
        return true;
      }
      if (age > b.d) return false;
      const x0 = b.x0 - cx, y0 = b.y0 - cy - 14, x1 = b.x1 - cx, y1 = b.y1 - cy - 14;
      const col = b.fx === "circuit" ? "#ffb040" : "#bfe8ff";
      ctx.strokeStyle = col; ctx.lineWidth = b.fx === "circuit" ? 1 : 2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      const n = 6;
      for (let k = 1; k < n; k++) ctx.lineTo(x0 + ((x1 - x0) * k) / n + (Math.random() - 0.5) * 10, y0 + ((y1 - y0) * k) / n + (Math.random() - 0.5) * 10);
      ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineWidth = 1;
      return true;
    });
  }

  drawLighting(ctx, cx, cy, t) {
    const town = G.kind === "town";
    const z = town ? { ambient: 0.4, light: 110 } : G.zone;
    const L = this.lctx, W = VIEW_W / 2, H = VIEW_H / 2;
    L.globalCompositeOperation = "source-over";
    L.clearRect(0, 0, W, H);
    L.fillStyle = `rgba(6,4,14,${G.mapKind === "safe" ? 0.55 : z.ambient})`;
    L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = "destination-out";
    const hole = (x, y, r, a = 1) => {
      const g = L.createRadialGradient(x / 2, y / 2, 0, x / 2, y / 2, r / 2);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.7})`); g.addColorStop(1, "rgba(0,0,0,0)");
      L.fillStyle = g; L.fillRect(x / 2 - r / 2, y / 2 - r / 2, r, r);
    };
    for (const e of G.ents.values()) if (e.k === "p" && !e.dead) hole(e.rx - cx, e.ry - cy - 14, e.id === G.you ? z.light * 1.6 : z.light * 1.1);
    for (const o of G.objects) {
      if (!["torch", "campfire", "portal", "lamp", "npc"].includes(o.kind)) continue;
      const x = o.x - cx, y = o.y - cy;
      if (x < -150 || y < -150 || x > VIEW_W + 150 || y > VIEW_H + 150) continue;
      hole(x, y - 14, (o.kind === "torch" ? 120 : o.kind === "campfire" ? 200 : o.kind === "npc" ? 110 : 140) * (0.92 + Math.sin(t * 9 + o.x) * 0.06), 0.85);
    }
    for (const p of G.projectiles.values()) { const d = (t - p.t0) * p.v; hole(p.x + Math.cos(p.a) * d - cx, p.y + Math.sin(p.a) * d - cy, 60, 0.6); }
    for (const e of G.ents.values()) if (e.k === "b") hole(e.rx - cx, e.ry - cy - 20, 160, 0.7);
    for (const l of G.loot.values()) hole(l.x - cx, l.y - cy, 30, 0.5);
    // 색 빛이 있는 곳도 밝게
    forEachGlow((x, y, r, c, a) => { const sx = x - cx, sy = y - cy; if (sx > -r && sy > -r && sx < VIEW_W + r && sy < VIEW_H + r) hole(sx, sy, r * 1.3, Math.min(1, a * 1.6)); });
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
    ctx.imageSmoothingEnabled = false;
  }

  label(ctx, text, x, y, col = "#fff", font = "10px Galmuri9") {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.fillStyle = "#000";
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = col;
    ctx.fillText(text, x, y);
  }

  drawOverhead(ctx, cx, cy, t) {
    drawParts(ctx, cx, cy);
    for (const e of G.ents.values()) {
      if (e.k === "d" || e.dead && e.k !== "p") continue;
      const info = e.info ?? {};
      if (info.m === "dummy") continue;
      const x = Math.round(e.rx - cx), y = Math.round(e.ry - cy);
      if (x < -60 || x > VIEW_W + 60 || y < -40 || y > VIEW_H + 80) continue;
      if (e.k === "p") {
        const top = y - 48;
        this.label(ctx, info.n, x, top - 4, e.id === G.you ? "#ffffff" : "#8fd0ff");
        if (e.id !== G.you) { ctx.fillStyle = "#000"; ctx.fillRect(x - 13, top, 26, 3); ctx.fillStyle = "#e0424e"; ctx.fillRect(x - 12, top + 1, Math.round(24 * e.hp), 1); }
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
    G.floaters = G.floaters.filter((f) => {
      const age = t - f.t0;
      if (age > 1.1) return false;
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy - age * 26);
      ctx.globalAlpha = Math.min(1, (1.1 - age) * 3);
      const style = {
        dmg: ["#ffffff", "12px Galmuri11"], crit: ["#ffcf3a", "bold 16px Galmuri11"], hurt: ["#ff5a5a", "12px Galmuri11"], heal: ["#6aff8a", "12px Galmuri11"],
        dot: ["#c8a0ff", "10px Galmuri9"], absorb: ["#c8e0ff", "10px Galmuri9"], miss: ["#aaaaaa", "10px Galmuri9"], gold: ["#ffd35a", "10px Galmuri9"], status: ["#ffb0ff", "12px Galmuri11"],
      }[f.kind] ?? ["#fff", "12px Galmuri11"];
      // 튀어나왔다가 자리 잡는 숫자 (치명타는 더 크게)
      const crit = f.kind === "crit";
      const pop = age < 0.12 ? 1 + (1 - age / 0.12) * (crit ? 0.9 : 0.5) : 1;
      ctx.save();
      ctx.translate(x + (f.vx ?? 0) * age, y);
      ctx.scale(pop, pop);
      ctx.font = crit ? "bold 17px Galmuri11" : style[1];
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = crit ? 4 : 3; ctx.strokeStyle = crit ? "#3a1a00" : "#000";
      const text = crit ? f.text + "!" : f.text;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = style[0]; ctx.fillText(text, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
      return true;
    });
  }
}

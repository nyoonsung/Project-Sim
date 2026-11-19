// 마을 그림: 건물·나무·소품(Ninja Adventure, CC0) + 빛나는 간판, 줄 전구, 가로등, 노점, 깃발, 풍차, 물레방아,
// 돌아다니는 마을 사람과 동물. 빛은 glow.js로 모아 저녁 조명에 더한다.
import { G } from "../game.js";
import { TILE, T } from "/shared/constants.js";
import { frame, has } from "./dt2.js";
import { addGlow } from "./glow.js";

const S = 2; // 원본 16px → 32px
const img = (name) => frame("t:" + name);
const draw = (ctx, name, x, y, scale = S) => {
  const c = img(name);
  if (!c) return null;
  const w = c.width * scale, h = c.height * scale;
  ctx.drawImage(c, Math.round(x - w / 2), Math.round(y - h), w, h);
  return c;
};
function shadow(ctx, x, y, rx, ry = rx * 0.35, a = 0.28) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

// ── 빛나는 간판 (한 번 그려 캐시)
const signCache = new Map();
function signCanvas(text, color) {
  const key = text + color;
  if (signCache.has(key)) return signCache.get(key);
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = "bold 12px Galmuri11";
  const tw = Math.ceil(g.measureText(text).width);
  c.width = tw + 28; c.height = 30;
  const w = c.width, h = c.height;
  // 바깥 빛번짐
  g.shadowColor = color; g.shadowBlur = 8;
  g.fillStyle = "#120c1a"; g.fillRect(6, 5, w - 12, h - 10);
  g.shadowBlur = 0;
  g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(7, 6, w - 14, h - 12);
  g.globalAlpha = 0.35; g.strokeStyle = "#ffffff"; g.lineWidth = 1; g.strokeRect(9, 8, w - 18, h - 16); g.globalAlpha = 1;
  g.font = "bold 12px Galmuri11"; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = color; g.shadowBlur = 6;
  g.fillStyle = "#ffffff"; g.fillText(text, w / 2, h / 2 + 1);
  g.shadowBlur = 0; g.fillStyle = color; g.globalAlpha = 0.55; g.fillText(text, w / 2, h / 2 + 1); g.globalAlpha = 1;
  signCache.set(key, c);
  return c;
}

const BULBS = ["#ff5a7a", "#ffd35a", "#5ad8ff", "#a0ff6a", "#ff8af0", "#ffb04a"];

/** y 정렬 목록에서 호출: 마을 오브젝트 하나 그리기. 그렸으면 true */
export function drawTownObject(ctx, o, x, y, t) {
  switch (o.kind) {
    case "prop": {
      const c = img(o.s);
      if (!c) return true;
      if (!o.flat && !o.small) shadow(ctx, x, y - 2, c.width * 0.9, 8, 0.3);
      else if (o.small && !o.flat) shadow(ctx, x, y - 1, 11, 4, 0.25);
      draw(ctx, o.s, x, y);
      if (o.mill) {
        const f = Math.floor(t * 6) % 4;
        draw(ctx, "mill_f" + f, x, y - c.height * S + 34, 1.6);
      }
      if (o.sign) {
        const sc = signCanvas(o.sign.text, o.sign.color);
        const flick = 0.92 + Math.sin(t * 13 + x) * 0.04 + (Math.sin(t * 37 + y) > 0.97 ? -0.3 : 0);
        ctx.globalAlpha = flick;
        ctx.drawImage(sc, Math.round(x - sc.width / 2), Math.round(y - c.height * S - 6));
        ctx.globalAlpha = 1;
        addGlow(o.x, o.y - c.height * S + 8, 90, o.sign.color, 0.45 * flick, "sign|"+o.x+","+o.y);
      }
      if (o.win) addGlow(o.x, o.y - 26, 64, o.win, 0.2, "win|"+o.x+","+o.y);
      if (o.glow) addGlow(o.x, o.y - 50, 140, o.glow, 0.5 + Math.sin(t * 2) * 0.1, "pglow|"+o.x+","+o.y);
      return true;
    }
    case "flag": {
      ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x - 1, y - 58, 3, 58);
      ctx.fillStyle = "#c8a050"; ctx.fillRect(x - 2, y - 60, 5, 3);
      draw(ctx, o.c + "_f" + (Math.floor(t * 8 + x) % 4), x + 17, y - 26);
      return true;
    }
    case "stall": {
      // 기둥 + 진열대 + 차양 + 물건
      shadow(ctx, x, y - 2, 46, 8, 0.3);
      ctx.fillStyle = "#4a2e18"; ctx.fillRect(x - 46, y - 60, 4, 58); ctx.fillRect(x + 42, y - 60, 4, 58);
      ctx.fillStyle = "#7a4a26"; ctx.fillRect(x - 44, y - 22, 88, 18);
      ctx.fillStyle = "#9a6232"; ctx.fillRect(x - 44, y - 24, 88, 4);
      ctx.fillStyle = "#3a2010"; ctx.fillRect(x - 44, y - 6, 88, 3);
      (o.goods ?? []).forEach((s, i) => draw(ctx, s, x - 28 + i * 28, y - 18));
      draw(ctx, "awning", x, y - 46);
      addGlow(o.x, o.y - 30, 70, o.win ?? "#ffd35a", 0.25, "w2|"+o.x+","+o.y);
      return true;
    }
    case "mosaic": {
      // 분수 둘레 둥근 모자이크 바닥
      const R0 = 60, R1 = 44;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, R0, R0 * 0.62, 0, 0, Math.PI * 2); ctx.fillStyle = "#9a7a58"; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y, R0 - 3, (R0 - 3) * 0.62, 0, 0, Math.PI * 2); ctx.fillStyle = "#e4cfa6"; ctx.fill();
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, rx = Math.cos(a), ry = Math.sin(a) * 0.62;
        ctx.fillStyle = k % 2 ? "#3a8ac8" : "#d8a040";
        ctx.fillRect(Math.round(x + rx * (R0 - 9)) - 2, Math.round(y + ry * (R0 - 9)) - 2, 5, 4);
      }
      ctx.beginPath(); ctx.ellipse(x, y, R1, R1 * 0.62, 0, 0, Math.PI * 2); ctx.fillStyle = "#c8ac84"; ctx.fill();
      ctx.restore();
      return true;
    }
    case "bench": {
      shadow(ctx, x, y - 1, 20, 4, 0.3);
      ctx.fillStyle = "#3a2414"; ctx.fillRect(x - 18, y - 10, 3, 10); ctx.fillRect(x + 15, y - 10, 3, 10);
      ctx.fillStyle = "#8a5a30"; ctx.fillRect(x - 20, y - 14, 40, 5);
      ctx.fillStyle = "#a8743e"; ctx.fillRect(x - 20, y - 14, 40, 2);
      ctx.fillStyle = "#6a4222"; ctx.fillRect(x - 20, y - 24, 40, 4); ctx.fillRect(x - 18, y - 20, 3, 6); ctx.fillRect(x + 15, y - 20, 3, 6);
      return true;
    }
    case "planter": {
      shadow(ctx, x, y - 1, 16, 4, 0.3);
      ctx.fillStyle = "#4a2e18"; ctx.fillRect(x - 15, y - 14, 30, 14);
      ctx.fillStyle = "#7a4a26"; ctx.fillRect(x - 14, y - 13, 28, 12);
      ctx.fillStyle = "#9a6232"; ctx.fillRect(x - 15, y - 15, 30, 3);
      draw(ctx, o.s, x - 6, y - 8);
      draw(ctx, o.f, x + 7, y - 10);
      return true;
    }
    case "ripple": {
      draw(ctx, "ripple_f" + (Math.floor(t * 4 + x * 0.1) % 4), x, y);
      ctx.fillStyle = "#4aa040"; ctx.beginPath(); ctx.ellipse(x + 12, y - 4, 6, 3, 0, 0.4, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff9ad0"; ctx.fillRect(x + 11, y - 6, 2, 2);
      return true;
    }
    case "watermill": {
      draw(ctx, "watermill_f" + (Math.floor(t * 5) % 3), x, y);
      return true;
    }
    case "lamp": {
      if (!o.post) return false;
      // 가로등: 쇠기둥 + 등불
      shadow(ctx, x, y - 1, 6, 3, 0.3);
      ctx.fillStyle = "#1c1824"; ctx.fillRect(x - 2, y - 46, 4, 46);
      ctx.fillStyle = "#2a2434"; ctx.fillRect(x - 4, y - 4, 8, 4);
      ctx.fillStyle = "#1c1824"; ctx.fillRect(x - 6, y - 56, 12, 3); ctx.fillRect(x - 5, y - 47, 10, 2);
      const fl = 0.85 + Math.sin(t * 7 + x * 0.3) * 0.1;
      ctx.fillStyle = `rgba(255,214,140,${fl})`; ctx.fillRect(x - 4, y - 53, 8, 6);
      ctx.fillStyle = "#fff6d8"; ctx.fillRect(x - 2, y - 52, 4, 3);
      addGlow(o.x, o.y - 50, 90, "#ffc870", 0.32 * fl, "lamp|"+o.x+","+o.y);
      return true;
    }
  }
  return false;
}

/** 줄 전구 (사람 머리 위에 걸려 있어 y 정렬 뒤에 그림) */
export function drawStrings(ctx, cx, cy, t) {
  for (const o of G.objects) {
    if (o.kind !== "lights") continue;
    let k = 0;
    for (let i = 0; i + 1 < o.pts.length; i++) {
      const [x0, y0] = o.pts[i], [x1, y1] = o.pts[i + 1];
      const ax = x0 - cx, ay = y0 - 46 - cy, bx = x1 - cx, by = y1 - 46 - cy;
      if (Math.max(ax, bx) < -40 || Math.min(ax, bx) > 680 || Math.max(ay, by) < -60 || Math.min(ay, by) > 420) { k += 10; continue; }
      const len = Math.hypot(bx - ax, by - ay), sag = Math.min(26, len * 0.12);
      ctx.strokeStyle = "rgba(20,14,24,0.9)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag * 2, bx, by); ctx.stroke();
      const n = Math.max(3, Math.floor(len / 16));
      for (let j = 1; j < n; j++, k++) {
        const u = j / n;
        const px = (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * ((ax + bx) / 2) + u * u * bx;
        const py = (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * ((ay + by) / 2 + sag * 2) + u * u * by;
        const col = BULBS[(k + i) % BULBS.length];
        const tw = 0.7 + 0.3 * Math.sin(t * 3 + k * 1.7);
        ctx.fillStyle = col; ctx.globalAlpha = tw;
        ctx.fillRect(Math.round(px) - 1, Math.round(py), 3, 4);
        ctx.fillStyle = "#ffffff"; ctx.globalAlpha = tw * 0.8; ctx.fillRect(Math.round(px), Math.round(py) + 1, 1, 1);
        ctx.globalAlpha = 1;
        if (j % 2 === 0) addGlow(px + cx, py + cy, 30, col, 0.45 * tw, "bulb|"+o.pts[0][0]+","+o.pts[0][1]+","+k);
      }
    }
  }
}

// ── 돌아다니는 마을 사람·동물 (화면 꾸미기, 서버와 무관)
const WHO = ["villager", "villager2", "villager3", "villager4", "woman", "oldman", "oldman2", "noble", "princess"];
const PETS = ["cat", "dog", "chick_w", "chick_b", "chick_w"];
let folk = [];
const walkable = (tx, ty) => { const t = G.map?.t?.(tx, ty); return t === T.PLAZA || t === T.PATH || t === T.GRASS; };
export function spawnFolk() {
  folk = [];
  if (G.kind !== "town" || !G.map) return;
  const spots = [];
  for (let y = 2; y < G.map.h - 2; y++) for (let x = 2; x < G.map.w - 2; x++) { const t = G.map.t(x, y); if (t === T.PLAZA || t === T.PATH) spots.push([x, y]); }
  const pick = () => spots[Math.floor(Math.random() * spots.length)];
  for (let i = 0; i < 10; i++) { const [x, y] = pick(); folk.push({ who: WHO[i % WHO.length], x: x * TILE + 16, y: y * TILE + 20, tx: null, wait: Math.random() * 3, dir: "down", spd: 26 + Math.random() * 14, pet: false, id: -1000 - i }); }
  for (let i = 0; i < 6; i++) { const [x, y] = pick(); folk.push({ who: PETS[i % PETS.length], x: x * TILE + 16, y: y * TILE + 20, tx: null, wait: Math.random() * 3, dir: "left", spd: 30 + Math.random() * 20, pet: true, id: -2000 - i }); }
}
export function tickFolk(dt) {
  for (const f of folk) {
    if (f.wait > 0) { f.wait -= dt; continue; }
    if (!f.tx) {
      for (let k = 0; k < 8; k++) {
        const tx = f.x + (Math.random() - 0.5) * (f.pet ? 160 : 260), ty = f.y + (Math.random() - 0.5) * (f.pet ? 120 : 200);
        if (walkable(Math.floor(tx / TILE), Math.floor(ty / TILE))) { f.tx = tx; f.ty = ty; break; }
      }
      if (!f.tx) { f.wait = 1; continue; }
    }
    const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy);
    if (d < 2) { f.tx = null; f.wait = 1 + Math.random() * (f.pet ? 2 : 4); continue; }
    const nx = f.x + (dx / d) * f.spd * dt, ny = f.y + (dy / d) * f.spd * dt;
    if (!walkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) { f.tx = null; f.wait = 0.5; continue; }
    f.x = nx; f.y = ny;
    f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }
}
export function folkList() { return folk; }
export function drawFolk(ctx, f, cx, cy, t) {
  const x = Math.round(f.x - cx), y = Math.round(f.y - cy);
  const moving = !!f.tx && f.wait <= 0;
  shadow(ctx, x, y - 1, f.pet ? 7 : 9, 3, 0.3);
  if (f.pet) {
    const fr = moving ? Math.floor(t * 6) % 2 : 0;
    const c = img(f.who + "_f" + fr);
    if (!c) return;
    ctx.save(); ctx.translate(x, y); if (f.dir === "right") ctx.scale(-1, 1);
    ctx.drawImage(c, -16, -30, 32, 32); ctx.restore();
    return;
  }
  const fr = moving ? Math.floor(t * 7) % 4 : 0;
  draw(ctx, `vil_${f.who}_${f.dir}_f${fr}`, x, y + 2);
}

// NPC → 마을 사람 그림
const NPC_VIL = { shop: "woman", smithy: "master", trainer: "monk", gate: "inspector", gate2: "inspector", vault: "princess", enchanter: "princess" };
export function drawTownNpc(ctx, o, x, y, t) {
  const who = NPC_VIL[o.id];
  if (!who || !has(`t:vil_${who}_down_f0`)) return false;
  shadow(ctx, x, y - 1, 10, 3, 0.35);
  const bob = Math.sin(t * 2.4 + x) > 0.6 ? 1 : 0;
  draw(ctx, `vil_${who}_down_f0`, x, y + 2 - bob);
  return true;
}

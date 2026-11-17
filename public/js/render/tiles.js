// 타일맵 렌더링: 3/4 시점 벽(윗면+앞면), 구역 팔레트, 장식. 512px 덩어리로 미리 그려 둔다.
import { TILE, T } from "/shared/constants.js";

const CHUNK = 16; // 타일
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
};

const TOWN = {
  grass: ["#4f8a3c", "#5a9a44", "#467c35", "#6aae50"], path: ["#b08a5a", "#a07e52", "#c49c68", "#8e6e46"], plaza: ["#b8ab96", "#a89c88", "#c8bca6", "#988c78"],
  wallTop: ["#a6402e", "#8c3426", "#c25038"], wallFace: ["#d8c4a0", "#c0aa86", "#a08a68"], outer: ["#7a7068", "#5e5650", "#9a908a"],
  water: ["#3a78c0", "#4a8ad0", "#2a5ea0"],
};

export class TileMap {
  constructor(map, zone) {
    this.map = map;
    this.w = map.w; this.h = map.h;
    this.tiles = Uint8Array.from(atob(map.tiles), (c) => c.charCodeAt(0));
    this.zone = zone;
    this.town = map.kind === "town";
    this.chunks = new Map();
    this.doorsOpen = map.doorsOpen;
    this.decos = (map.objects ?? []).filter((o) => o.kind === "deco");
    this.explored = new Uint8Array(this.w * this.h);
  }
  t(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? T.VOID : this.tiles[y * this.w + x]; }
  walkable(t) { return t === T.FLOOR || t === T.DECO || t === T.GRASS || t === T.PATH || t === T.PLAZA || t === T.DOOR; }

  chunk(cx, cy) {
    const key = cx + "," + cy;
    let c = this.chunks.get(key);
    if (c) return c;
    c = new OffscreenCanvas(CHUNK * TILE, CHUNK * TILE);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) this.drawTile(g, cx * CHUNK + tx, cy * CHUNK + ty, tx * TILE, ty * TILE);
    for (const d of this.decos) {
      const x = d.x - cx * CHUNK * TILE, y = d.y - cy * CHUNK * TILE;
      if (x > -20 && y > -20 && x < CHUNK * TILE + 20 && y < CHUNK * TILE + 20) this.drawDeco(g, d, x, y);
    }
    this.chunks.set(key, c);
    return c;
  }

  drawTile(g, x, y, px, py) {
    const t = this.t(x, y);
    const below = this.t(x, y + 1), above = this.t(x, y - 1);
    const r = hash(x, y);
    if (this.town) return this.drawTownTile(g, t, x, y, px, py, r, below, above);
    const Z = this.zone;
    const F = Z.floor, Wl = Z.wall;
    if (t === T.VOID) { g.fillStyle = "#08070b"; g.fillRect(px, py, TILE, TILE); return; }
    if (this.walkable(t) || t === T.WATER || t === T.PIT) {
      // 바닥 석판
      g.fillStyle = F[0]; g.fillRect(px, py, TILE, TILE);
      const slab = hash(x >> 1, y >> 1, 3);
      g.fillStyle = slab < 0.33 ? F[1] : slab < 0.66 ? F[0] : F[3];
      g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      g.fillStyle = F[2];
      if ((x + y) % 2 === 0) { g.fillRect(px, py, TILE, 1); g.fillRect(px, py, 1, TILE); }
      // 얼룩·자갈
      for (let k = 0; k < 6; k++) { const a = hash(x, y, k + 10); if (a < 0.45) { g.fillStyle = a < 0.2 ? F[2] : F[3]; g.fillRect(px + Math.floor(hash(x, y, k + 20) * 30), py + Math.floor(hash(x, y, k + 30) * 30), a < 0.1 ? 2 : 1, 1); } }
      if (r < 0.08) { g.fillStyle = F[2]; const sx = px + 6 + Math.floor(r * 200) % 18; for (let k = 0; k < 7; k++) g.fillRect(sx + k, py + 10 + Math.round(Math.sin(k) * 2), 1, 1); }
      // 벽 아래 그림자
      if (above === T.WALL) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(px, py, TILE, 6); g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(px, py + 6, TILE, 5); }
      if (t === T.WATER) {
        g.fillStyle = shade(Z.accent, 0.35); g.fillRect(px, py, TILE, TILE);
        g.fillStyle = "#1a3a5a"; g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        g.fillStyle = "#2a5a80"; for (let k = 0; k < 3; k++) g.fillRect(px + 4 + Math.floor(hash(x, y, k) * 20), py + 6 + k * 8, 6, 1);
      }
      if (t === T.PIT) {
        g.fillStyle = "#050407"; g.fillRect(px, py, TILE, TILE);
        if (this.t(x, y - 1) !== T.PIT) { g.fillStyle = F[2]; g.fillRect(px, py, TILE, 4); g.fillStyle = "#000"; g.fillRect(px, py + 4, TILE, 2); }
      }
      return;
    }
    if (t === T.WALL) {
      const face = this.walkable(below) || below === T.WATER || below === T.PIT;
      if (face) {
        // 벽 앞면: 벽돌
        g.fillStyle = Wl[1]; g.fillRect(px, py, TILE, TILE);
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 8 : 0;
          for (let bx = -8; bx < TILE; bx += 16) {
            const v = hash(x * 4 + bx, y * 4 + row, 5);
            g.fillStyle = v < 0.3 ? Wl[2] : v < 0.8 ? Wl[1] : Wl[0];
            g.fillRect(px + bx + off + 1, py + row * 8 + 1, 14, 6);
          }
          g.fillStyle = Wl[3];
          g.fillRect(px, py + row * 8 + 7, TILE, 1);
        }
        g.fillStyle = Wl[0]; g.fillRect(px, py, TILE, 2);
        g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(px, py + TILE - 4, TILE, 4);
        if (r < 0.12 && this.zone.deco.includes("moss")) { g.fillStyle = "#4f7a3a"; g.fillRect(px + 4, py + 2, 8, 3); g.fillRect(px + 6, py + 5, 3, 4); }
        if (r > 0.9) { g.fillStyle = Wl[3]; g.fillRect(px + 10, py + 9, 1, 10); g.fillRect(px + 11, py + 14, 1, 6); }
      } else {
        // 벽 윗면
        g.fillStyle = Wl[3]; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = shade(Wl[3], 1.25);
        for (let k = 0; k < 4; k++) if (hash(x, y, k + 40) < 0.5) g.fillRect(px + Math.floor(hash(x, y, k + 50) * 28), py + Math.floor(hash(x, y, k + 60) * 28), 3, 2);
        // 바닥 쪽 테두리 강조
        const bt = this.t(x, y + 1);
        if (bt === T.WALL && this.walkable(this.t(x, y + 2))) { g.fillStyle = Wl[0]; g.fillRect(px, py + TILE - 3, TILE, 3); g.fillStyle = Wl[2]; g.fillRect(px, py + TILE - 5, TILE, 2); }
        if (this.walkable(this.t(x - 1, y)) || this.t(x - 1, y) === T.VOID) { g.fillStyle = Wl[2]; g.fillRect(px, py, 2, TILE); }
        if (this.walkable(this.t(x + 1, y)) || this.t(x + 1, y) === T.VOID) { g.fillStyle = Wl[2]; g.fillRect(px + TILE - 2, py, 2, TILE); }
      }
      return;
    }
    if (t === T.DOOR) { g.fillStyle = F[2]; g.fillRect(px, py, TILE, TILE); }
  }

  drawTownTile(g, t, x, y, px, py, r, below, above) {
    const P = TOWN;
    if (t === T.GRASS || t === T.VOID) {
      g.fillStyle = P.grass[0]; g.fillRect(px, py, TILE, TILE);
      for (let k = 0; k < 10; k++) { const a = hash(x, y, k); g.fillStyle = P.grass[1 + (k % 3)]; g.fillRect(px + Math.floor(hash(x, y, k + 9) * 31), py + Math.floor(a * 31), 1, a < 0.3 ? 2 : 1); }
    } else if (t === T.PATH) {
      g.fillStyle = P.path[0]; g.fillRect(px, py, TILE, TILE);
      for (let k = 0; k < 8; k++) { g.fillStyle = P.path[1 + (k % 3)]; g.fillRect(px + Math.floor(hash(x, y, k + 3) * 30), py + Math.floor(hash(x, y, k + 13) * 30), 2, 1); }
    } else if (t === T.PLAZA) {
      g.fillStyle = P.plaza[3]; g.fillRect(px, py, TILE, TILE);
      const v = hash(x, y, 2);
      g.fillStyle = v < 0.3 ? P.plaza[1] : v < 0.7 ? P.plaza[0] : P.plaza[2];
      g.fillRect(px + 1, py + 1, 15, 15); g.fillRect(px + 17, py + 1, 14, 15); g.fillRect(px + 1, py + 17, 15, 14); g.fillRect(px + 17, py + 17, 14, 14);
    } else if (t === T.WATER) {
      g.fillStyle = P.water[2]; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = P.water[0]; g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      g.fillStyle = P.water[1]; for (let k = 0; k < 3; k++) g.fillRect(px + 3 + Math.floor(hash(x, y, k) * 20), py + 5 + k * 9, 7, 1);
      if (above !== T.WATER) { g.fillStyle = "#3c6a2c"; g.fillRect(px, py, TILE, 3); }
    } else if (t === T.WALL) {
      const outer = x === 0 || y <= 1 || x === this.w - 1 || y === this.h - 1;
      const face = below !== T.WALL;
      if (outer) {
        g.fillStyle = face ? P.outer[0] : P.outer[1]; g.fillRect(px, py, TILE, TILE);
        if (face) for (let row = 0; row < 4; row++) { g.fillStyle = P.outer[1]; g.fillRect(px, py + row * 8 + 7, TILE, 1); g.fillStyle = P.outer[2]; g.fillRect(px + (row % 2 ? 4 : 12), py + row * 8 + 1, 10, 2); }
        else { g.fillStyle = P.outer[2]; g.fillRect(px, py + TILE - 3, TILE, 3); }
        return;
      }
      if (face) {
        // 집 벽 (회벽 + 목재 기둥 + 창문)
        g.fillStyle = P.wallFace[0]; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = "#7a5230"; g.fillRect(px, py, 3, TILE); g.fillRect(px, py, TILE, 3);
        if (hash(x, y, 7) < 0.45) { g.fillStyle = "#5a3a20"; g.fillRect(px + 9, py + 8, 14, 12); g.fillStyle = "#ffd98a"; g.fillRect(px + 11, py + 10, 10, 8); g.fillStyle = "#5a3a20"; g.fillRect(px + 15, py + 10, 2, 8); g.fillRect(px + 11, py + 13, 10, 1); }
        else if (hash(x, y, 8) < 0.25) { g.fillStyle = "#5a3a20"; g.fillRect(px + 8, py + 6, 16, 26); g.fillStyle = "#8a5a30"; g.fillRect(px + 10, py + 8, 12, 24); g.fillStyle = "#e0b040"; g.fillRect(px + 19, py + 20, 2, 2); }
        g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(px, py + TILE - 3, TILE, 3);
      } else {
        // 지붕 기와
        g.fillStyle = P.wallTop[1]; g.fillRect(px, py, TILE, TILE);
        for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) { g.fillStyle = (row + k) % 2 ? P.wallTop[0] : P.wallTop[2]; g.fillRect(px + k * 8 + (row % 2 ? 4 : 0), py + row * 8, 7, 6); }
        if (this.t(x, y + 1) === T.WALL && this.t(x, y + 2) !== T.WALL) { g.fillStyle = "#5a2418"; g.fillRect(px, py + TILE - 3, TILE, 3); }
      }
    } else { g.fillStyle = P.grass[0]; g.fillRect(px, py, TILE, TILE); }
  }

  drawDeco(g, d, x, y) {
    const v = d.v ?? 0, Z = this.zone;
    const px = (dx, dy, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x + dx), Math.round(y + dy), w, h); };
    switch (d.deco) {
      case "bones": px(-5, 0, "#e8e0c8", 10, 2); px(-6, -1, "#e8e0c8", 2, 4); px(4, -1, "#e8e0c8", 2, 4); if (v % 2) { px(2, -5, "#e8e0c8", 5, 4); px(3, -4, "#222", 1, 1); px(5, -4, "#222", 1, 1); } break;
      case "moss": for (let k = 0; k < 9; k++) px(Math.cos(k) * 6, Math.sin(k * 1.7) * 3, k % 2 ? "#5a8a3a" : "#3e6a2a", 2, 1); break;
      case "crack": for (let k = 0; k < 10; k++) px(k - 5, Math.round(Math.sin(k * 0.9 + v) * 2), "rgba(0,0,0,0.45)"); break;
      case "crate": px(-7, -12, "#3a2410", 14, 13); px(-6, -11, "#8a5a2a", 12, 11); px(-6, -6, "#5a3a1a", 12, 1); px(-1, -11, "#5a3a1a", 1, 11); break;
      case "mushroom": px(-1, -3, "#e8dcc8", 2, 4); px(-4, -6, "#c03040", 8, 3); px(-3, -7, "#d84050", 6, 1); px(-2, -6, "#fff", 1, 1); px(2, -5, "#fff", 1, 1); break;
      case "puddle": px(-7, -1, "#2a4a3a", 14, 3); px(-5, -2, "#3a6a50", 10, 1); break;
      case "lava": px(-8, -2, "#5a1408", 16, 5); px(-6, -1, "#e04010", 12, 3); px(-3, 0, "#ffd060", 5, 1); break;
      case "anvil": px(-7, -8, "#2a2a30", 14, 3); px(-3, -5, "#3a3a44", 6, 4); px(-6, -1, "#2a2a30", 12, 2); px(-6, -8, "#6a6a78", 12, 1); break;
      case "ice": px(-4, -6, "#a8e0ff", 3, 7); px(0, -9, "#d8f4ff", 3, 10); px(3, -4, "#80c0e8", 2, 5); break;
      case "banner": px(-1, -24, "#3a2a1a", 2, 24); px(1, -23, Z.accent, 8, 12); px(1, -11, shade(Z.accent, 0.6), 4, 3); px(5, -11, shade(Z.accent, 0.6), 4, 2); break;
      case "rune": g.strokeStyle = shade(Z.accent, 0.8); g.globalAlpha = 0.5; g.beginPath(); g.arc(Math.round(x), Math.round(y), 9, 0, Math.PI * 2); g.stroke(); px(-4, -1, Z.accent, 8, 1); px(-1, -4, Z.accent, 1, 8); g.globalAlpha = 1; break;
      case "gear": g.fillStyle = "#6a5a40"; g.beginPath(); g.arc(Math.round(x), Math.round(y), 7, 0, Math.PI * 2); g.fill(); for (let k = 0; k < 8; k++) px(Math.cos(k * 0.785) * 8 - 1, Math.sin(k * 0.785) * 8 - 1, "#6a5a40", 3, 3); px(-2, -2, "#2a2418", 4, 4); break;
      case "pipe": px(-12, -4, "#5a5a62", 24, 6); px(-12, -4, "#8a8a92", 24, 1); px(-3, -6, "#4a4a52", 5, 10); break;
      case "candle": px(-1, -6, "#f0e8d0", 3, 6); px(0, -8, "#ffd060", 1, 2); break;
      case "flower": { const c = ["#ff6a8a", "#ffd84a", "#a080ff", "#ffffff"][v % 4]; px(0, 0, "#3a6a2a", 1, 3); px(-1, -1, c, 3, 1); px(0, -2, c, 1, 3); break; }
      case "grasstuft": px(-2, -3, "#6aae50", 1, 4); px(0, -4, "#7ac060", 1, 5); px(2, -3, "#5a9a44", 1, 4); break;
      case "rock": px(-4, -3, "#7a7068", 8, 4); px(-3, -4, "#9a908a", 5, 1); break;
    }
  }

  /** 화면에 보이는 덩어리만 그림 */
  draw(ctx, camX, camY, vw, vh) {
    const S = CHUNK * TILE;
    const c0 = Math.floor(camX / S), c1 = Math.floor((camX + vw) / S), r0 = Math.floor(camY / S), r1 = Math.floor((camY + vh) / S);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= this.w || cy * CHUNK >= this.h) continue;
      ctx.drawImage(this.chunk(cx, cy), Math.floor(cx * S - camX), Math.floor(cy * S - camY));
    }
    // 문 (열림/닫힘)
    for (let y = Math.floor(camY / TILE); y <= Math.floor((camY + vh) / TILE); y++) for (let x = Math.floor(camX / TILE); x <= Math.floor((camX + vw) / TILE); x++) {
      if (this.t(x, y) !== T.DOOR) continue;
      const px = Math.floor(x * TILE - camX), py = Math.floor(y * TILE - camY);
      if (this.doorsOpen) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(px, py, TILE, 4); continue; }
      ctx.fillStyle = "#2a2630"; ctx.fillRect(px, py - 10, TILE, TILE + 10);
      ctx.fillStyle = "#6a6478";
      for (let k = 2; k < TILE; k += 6) ctx.fillRect(px + k, py - 10, 2, TILE + 10);
      ctx.fillRect(px, py - 2, TILE, 2); ctx.fillRect(px, py + 14, TILE, 2);
    }
  }

  /** 미니맵 (탐색한 곳만) */
  reveal(px, py, r = 9) {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
    let changed = false;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      if (!this.explored[y * this.w + x]) { this.explored[y * this.w + x] = 1; changed = true; }
    }
    return changed;
  }
}

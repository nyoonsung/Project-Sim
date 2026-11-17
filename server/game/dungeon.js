// 층 생성: 방+통로(일반층), 보스 투기장(5·10의 배수층), 안전 구역(전직소), 마을
import { T, TILE } from "../../shared/constants.js";
import { rng } from "../../shared/rng.js";
import { zoneOf, floorKind } from "../../shared/zones.js";

function grid(w, h, fill = T.VOID) {
  return { w, h, tiles: new Uint8Array(w * h).fill(fill), objects: [], spawns: [] };
}
const set = (m, x, y, t) => { if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.tiles[y * m.w + x] = t; };
const get = (m, x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? T.VOID : m.tiles[y * m.w + x]);
const carveRect = (m, x, y, w, h, t = T.FLOOR) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(m, i, j, t); };
const center = (r) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
const px = (tx) => tx * TILE + TILE / 2;

// 바닥 주변을 벽으로 감싼다 (3/4 시점: 바닥 위쪽 벽은 2칸 높이로 보이게 한 칸 더)
function wallUp(m) {
  const out = m.tiles.slice();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (get(m, x, y) !== T.VOID) continue;
    let near = false;
    for (let dy = -1; dy <= 2 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
      const t = get(m, x + dx, y + dy);
      if (t !== T.VOID && t !== T.WALL) near = true;
    }
    if (near) out[y * m.w + x] = T.WALL;
  }
  m.tiles = out;
}

function corridor(m, a, b, R, width = 3) {
  let [x, y] = a;
  const [x2, y2] = b;
  const horizFirst = R.chance(0.5);
  const half = Math.floor(width / 2);
  const stepX = () => { while (x !== x2) { carveRect(m, x - half, y - half, width, width); x += Math.sign(x2 - x); } };
  const stepY = () => { while (y !== y2) { carveRect(m, x - half, y - half, width, width); y += Math.sign(y2 - y); } };
  if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  carveRect(m, x - half, y - half, width, width);
}

// 벽 앞면(아래가 바닥인 벽)에 횃불
function addTorches(m, R, zone, every = 7) {
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    if (get(m, x, y) === T.WALL && get(m, x, y + 1) === T.FLOOR && get(m, x, y - 1) === T.WALL && (x + y * 3) % every === 0 && R.chance(0.55))
      m.objects.push({ kind: "torch", fx: zone.torch, x: px(x), y: y * TILE + TILE - 4 });
  }
}
function addDeco(m, R, zone, n) {
  for (let i = 0; i < n; i++) {
    const x = R.int(1, m.w - 2), y = R.int(1, m.h - 2);
    if (get(m, x, y) === T.FLOOR) m.objects.push({ kind: "deco", deco: R.pick(zone.deco), x: px(x) + R.int(-8, 8), y: px(y) + R.int(-8, 8), v: R.int(0, 3) });
  }
}

// 방 모양: 기둥 홀·십자방·팔각방·원형방·섬·강과 다리·칸막이·잔해 (통로는 나중에 방 가운데까지 뚫리므로 연결은 항상 보장)
const SHAPES = ["plain", "pillars", "cross", "octagon", "round", "island", "river", "partition", "rubble", "pool"];
function shapeRoom(m, r, R, shape) {
  const [cx, cy] = center(r);
  const inR = (x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const nearC = (x, y, d) => Math.abs(x - cx) <= d && Math.abs(y - cy) <= d;
  switch (shape) {
    case "pillars":
      for (let y = r.y + 2; y < r.y + r.h - 2; y += 3) for (let x = r.x + 2; x < r.x + r.w - 2; x += 3) if (!nearC(x, y, 1)) set(m, x, y, T.WALL);
      break;
    case "cross": {
      const tw = Math.max(1, Math.floor(r.w / 3.2)), th = Math.max(1, Math.floor(r.h / 3.2));
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const inCornerX = x < r.x + tw || x >= r.x + r.w - tw, inCornerY = y < r.y + th || y >= r.y + r.h - th;
        if (inCornerX && inCornerY) set(m, x, y, T.VOID);
      }
      break;
    }
    case "octagon": {
      const c = Math.floor(Math.min(r.w, r.h) / 3);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const dx = Math.min(x - r.x, r.x + r.w - 1 - x), dy = Math.min(y - r.y, r.y + r.h - 1 - y);
        if (dx + dy < c) set(m, x, y, T.VOID);
      }
      break;
    }
    case "round": {
      const rx = r.w / 2, ry = r.h / 2;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const nx = (x + 0.5 - (r.x + rx)) / rx, ny = (y + 0.5 - (r.y + ry)) / ry;
        if (nx * nx + ny * ny > 1.02) set(m, x, y, T.VOID);
      }
      break;
    }
    case "island": {
      // 가운데 섬을 물(또는 구덩이) 고리가 감쌈
      const liq = R.chance(0.5) ? T.WATER : T.PIT;
      const a = Math.max(2, Math.floor(Math.min(r.w, r.h) / 2) - 2);
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
        if (d === a || d === a - 1) set(m, x, y, liq);
      }
      // 다리 두 개
      for (const [dx, dy] of R.chance(0.5) ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]]) for (let k = 0; k <= a; k++) { set(m, cx + dx * k, cy + dy * k, T.FLOOR); set(m, cx + dx * k + dy, cy + dy * k + dx, T.FLOOR); }
      break;
    }
    case "river": {
      const horiz = r.w < r.h ? false : R.chance(0.6);
      const liq = R.chance(0.7) ? T.WATER : T.PIT;
      for (let k = 0; k < (horiz ? r.w : r.h); k++) for (let t = 0; t < 2; t++) {
        const x = horiz ? r.x + k : cx + t - 1 + (Math.sin(k * 0.7) > 0.6 ? 1 : 0), y = horiz ? cy + t - 1 + (Math.sin(k * 0.7) > 0.6 ? 1 : 0) : r.y + k;
        if (inR(x, y) && !nearC(x, y, 1)) set(m, x, y, liq);
      }
      break;
    }
    case "partition": {
      const vert = r.w >= r.h;
      const n = vert ? Math.floor(r.w / 5) : Math.floor(r.h / 5);
      for (let i = 1; i <= n; i++) {
        const gap = R.int(1, (vert ? r.h : r.w) - 3);
        for (let k = 1; k < (vert ? r.h : r.w) - 1; k++) {
          if (k === gap || k === gap + 1) continue;
          const x = vert ? r.x + Math.round((i * r.w) / (n + 1)) : r.x + k, y = vert ? r.y + k : r.y + Math.round((i * r.h) / (n + 1));
          if (!nearC(x, y, 1)) set(m, x, y, T.WALL);
        }
      }
      break;
    }
    case "rubble":
      for (let i = 0; i < Math.round((r.w * r.h) / 9); i++) {
        const x = R.int(r.x + 1, r.x + r.w - 2), y = R.int(r.y + 1, r.y + r.h - 2);
        if (!nearC(x, y, 1)) set(m, x, y, R.chance(0.75) ? T.WALL : T.PIT);
      }
      break;
    case "pool": {
      const liq = R.pick([T.WATER, T.PIT, T.WATER]);
      const pw = R.int(2, Math.max(2, Math.floor(r.w / 3))), ph = R.int(2, Math.max(2, Math.floor(r.h / 3)));
      const ox = R.chance(0.5) ? r.x + 1 : r.x + r.w - 1 - pw, oy = R.chance(0.5) ? r.y + 1 : r.y + r.h - 1 - ph;
      carveRect(m, ox, oy, pw, ph, liq);
      break;
    }
  }
}

/** 시작점에서 걸어서 갈 수 있는 칸 표시 */
function reachable(m, sx, sy) {
  const ok = new Uint8Array(m.w * m.h);
  const walk = (t) => t === T.FLOOR || t === T.DECO || t === T.DOOR;
  const q = [sy * m.w + sx];
  ok[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % m.w, y = (i / m.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * m.w + nx;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || ok[j] || !walk(m.tiles[j])) continue;
      ok[j] = 1; q.push(j);
    }
  }
  return ok;
}

/** 일반층: 방 8~15개(모양 10가지), 최소 신장 트리 + 루프 통로 */
function normalFloor(floor, seed, party) {
  const R = rng(seed);
  const zone = zoneOf(floor);
  const W = Math.min(90, 52 + floor), H = Math.min(70, 40 + Math.floor(floor * 0.6));
  const m = grid(W, H);
  const rooms = [];
  const want = Math.min(15, 8 + Math.floor(floor / 12));
  for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
    const w = R.int(9, 17), h = R.int(8, 13);
    const x = R.int(2, W - w - 3), y = R.int(3, H - h - 3);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h });
  }
  for (const r of rooms) carveRect(m, r.x, r.y, r.w, r.h);
  // 방 모양 (시작 방은 평범하게)
  rooms.forEach((r, i) => { r.shape = i === 0 ? "plain" : R.pick(SHAPES); shapeRoom(m, r, R, r.shape); });
  // MST(프림) 연결
  const connected = [0], rest = rooms.map((_, i) => i).slice(1);
  while (rest.length) {
    let best = null;
    for (const a of connected) for (const b of rest) {
      const [ax, ay] = center(rooms[a]), [bx, by] = center(rooms[b]);
      const d = Math.abs(ax - bx) + Math.abs(ay - by);
      if (!best || d < best.d) best = { a, b, d };
    }
    corridor(m, center(rooms[best.a]), center(rooms[best.b]), R, R.chance(0.3) ? 2 : 3);
    connected.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
  }
  for (let i = 0; i < 2; i++) corridor(m, center(R.pick(rooms)), center(R.pick(rooms)), R, 2);
  wallUp(m);
  // 시작 방 = 0, 출구 = 시작에서 가장 먼 방
  const [sx, sy] = center(rooms[0]);
  let far = 1, fd = -1;
  rooms.forEach((r, i) => { const [cx, cy] = center(r); const d = Math.abs(cx - sx) + Math.abs(cy - sy); if (d > fd) { fd = d; far = i; } });
  m.start = [px(sx), px(sy)];
  const [ex, ey] = center(rooms[far]);
  m.exit = [px(ex), px(ey)];
  m.objects.push({ kind: "portal", id: "exit", x: m.exit[0], y: m.exit[1], locked: true });
  // 몬스터 배치 (걸어서 갈 수 있는 곳에만)
  const reach = reachable(m, sx, sy);
  const pool = zone.monsters;
  rooms.forEach((r, i) => {
    if (i === 0) return;
    const n = Math.max(2, Math.round((r.w * r.h) / 29 * (0.8 + floor * 0.004)));
    for (let k = 0; k < n; k++) {
      const tx = R.int(r.x + 1, r.x + r.w - 2), ty = R.int(r.y + 1, r.y + r.h - 2);
      if (get(m, tx, ty) !== T.FLOOR || !reach[ty * W + tx]) continue;
      m.spawns.push({ id: R.pick(pool), x: px(tx), y: px(ty), elite: R.chance(0.06 + floor * 0.0015) });
    }
  });
  addTorches(m, R, zone);
  addDeco(m, R, zone, Math.round(W * H / 40));
  m.objects = m.objects.filter((o) => o.kind !== "deco" || reach[Math.floor(o.y / TILE) * W + Math.floor(o.x / TILE)]);
  m.kind = "normal";
  return m;
}

/** 보스층: 입구 방 → 통로 → 투기장 (투기장 진입 시 문이 닫힘) */
function bossFloor(floor, seed) {
  const R = rng(seed);
  const zone = zoneOf(floor);
  const kind = floorKind(floor);
  const AW = kind === "boss" ? 30 : 26, AH = kind === "boss" ? 22 : 19;
  const W = AW + 8, H = AH + 26;
  const m = grid(W, H);
  const ax = 4, ay = 4;
  carveRect(m, ax, ay, AW, AH);
  // 투기장 기둥
  for (const [cx, cy] of [[ax + 4, ay + 4], [ax + AW - 6, ay + 4], [ax + 4, ay + AH - 6], [ax + AW - 6, ay + AH - 6]]) carveRect(m, cx, cy, 2, 2, T.WALL);
  const mid = ax + Math.floor(AW / 2);
  // 문(투기장 아래쪽 입구)
  carveRect(m, mid - 1, ay + AH, 3, 1, T.DOOR);
  carveRect(m, mid - 1, ay + AH + 1, 3, 9);
  const ry = ay + AH + 10;
  carveRect(m, mid - 5, ry, 11, 8);
  wallUp(m);
  m.start = [px(mid), px(ry + 5)];
  m.bossAt = [px(mid), px(ay + 6)];
  m.arena = { x0: ax * TILE, y0: ay * TILE, x1: (ax + AW) * TILE, y1: (ay + AH) * TILE };
  m.doorsOpen = true;
  m.boss = kind === "boss" ? zone.boss : zone.mid;
  addTorches(m, R, zone, 5);
  addDeco(m, R, zone, 20);
  m.objects.push({ kind: "sign", x: px(mid + 3), y: px(ry + 1), text: kind === "boss" ? "주요 보스의 방" : "중간보스의 방" });
  m.kind = kind;
  return m;
}

/** 안전 구역: 10층 보스 처치 후. 전직소 + 다음 층/마을 포탈 */
export function safeZone(floor) {
  const R = rng(floor * 977);
  const zone = zoneOf(floor);
  const m = grid(26, 20);
  carveRect(m, 3, 4, 20, 13);
  wallUp(m);
  m.start = [px(12), px(14)];
  m.objects.push({ kind: "npc", id: "class_master", name: "전직소 관리인", x: px(12), y: px(7) });
  m.objects.push({ kind: "statue", x: px(8), y: px(6) }, { kind: "statue", x: px(17), y: px(6) });
  m.objects.push({ kind: "campfire", fx: "fire/campfire", x: px(12), y: px(11) });
  m.objects.push({ kind: "portal", id: "next", x: px(20), y: px(13), label: `${floor + 1}층으로` });
  m.objects.push({ kind: "portal", id: "town", x: px(5), y: px(13), label: "마을로", color: "town" });
  addTorches(m, R, zone, 3);
  m.kind = "safe";
  m.safe = true;
  return m;
}

export function makeFloor(floor, seed, party = 1) {
  const kind = floorKind(floor);
  return kind === "normal" ? normalFloor(floor, seed, party) : bossFloor(floor, seed);
}

/** 마을: 따뜻하고 밝은 색감의 허브 */
export function makeTown() {
  const W = 56, H = 40;
  const m = grid(W, H, T.GRASS);
  const R = rng(4242);
  // 외곽 벽(성벽)
  for (let x = 0; x < W; x++) { set(m, x, 0, T.WALL); set(m, x, 1, T.WALL); set(m, x, H - 1, T.WALL); }
  for (let y = 0; y < H; y++) { set(m, 0, y, T.WALL); set(m, W - 1, y, T.WALL); }
  // 광장과 길
  carveRect(m, 20, 14, 16, 12, T.PLAZA);
  carveRect(m, 26, 2, 4, 12, T.PATH);
  carveRect(m, 26, 26, 4, 13, T.PATH);
  carveRect(m, 1, 18, 19, 4, T.PATH);
  carveRect(m, 36, 18, 19, 4, T.PATH);
  // 건물 (벽 덩어리)
  const houses = [[4, 5, 9, 7], [40, 5, 10, 7], [4, 27, 9, 7], [40, 27, 10, 7], [14, 4, 7, 5], [33, 4, 6, 5]];
  for (const [x, y, w, h] of houses) carveRect(m, x, y, w, h, T.WALL);
  // 연못
  carveRect(m, 14, 30, 6, 4, T.WATER);
  m.start = [px(28), px(22)];
  m.objects.push(
    { kind: "fountain", fx: "water/fountain", x: px(28), y: px(19) },
    { kind: "npc", id: "gate", name: "던전 관문지기", x: px(28), y: px(4) },
    { kind: "portal", id: "dungeon", x: px(28), y: px(3), label: "던전 입구", color: "dungeon" },
    { kind: "npc", id: "shop", name: "잡화 상인 미라", x: px(8), y: px(13) },
    { kind: "npc", id: "smithy", name: "대장장이 브론", x: px(45), y: px(13) },
    { kind: "campfire", fx: "fire/campfire", x: px(45), y: px(15) },
    { kind: "npc", id: "trainer", name: "훈련 교관", x: px(8), y: px(25) },
    { kind: "dummy", id: "dummy", x: px(12), y: px(24) },
    { kind: "npc", id: "board", name: "모험가 게시판", x: px(33), y: px(15) },
  );
  for (let i = 0; i < 46; i++) {
    const x = R.int(2, W - 3), y = R.int(3, H - 3);
    if (get(m, x, y) === T.GRASS && get(m, x, y + 1) === T.GRASS && Math.abs(x - 28) > 3) m.objects.push({ kind: "tree", x: px(x), y: px(y) + 8, v: R.int(0, 2) });
  }
  for (let i = 0; i < 60; i++) {
    const x = R.int(2, W - 3), y = R.int(3, H - 3);
    if (get(m, x, y) === T.GRASS) m.objects.push({ kind: "deco", deco: R.pick(["flower", "flower", "grasstuft", "rock"]), x: px(x) + R.int(-10, 10), y: px(y) + R.int(-10, 10), v: R.int(0, 3) });
  }
  for (const [x, y] of [[21, 15], [34, 15], [21, 24], [34, 24]]) m.objects.push({ kind: "lamp", fx: "fire/candle", x: px(x), y: px(y) });
  m.kind = "town";
  m.safe = true;
  return m;
}

const toB64 = (u8) => (typeof Buffer !== "undefined" ? Buffer.from(u8).toString("base64") : btoa(String.fromCharCode(...u8)));
/** 지도를 클라이언트로 보낼 형태로 */
export function mapPayload(m, extra = {}) {
  return {
    w: m.w, h: m.h, tiles: toB64(m.tiles), kind: m.kind, doorsOpen: !!m.doorsOpen,
    objects: m.objects, start: m.start, arena: m.arena ?? null, ...extra,
  };
}

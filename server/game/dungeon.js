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

/** 일반층: 방 8~14개, 최소 신장 트리 + 루프 통로 */
function normalFloor(floor, seed, party) {
  const R = rng(seed);
  const zone = zoneOf(floor);
  const W = Math.min(90, 52 + floor), H = Math.min(70, 40 + Math.floor(floor * 0.6));
  const m = grid(W, H);
  const rooms = [];
  const want = Math.min(15, 8 + Math.floor(floor / 12));
  for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
    const w = R.int(8, 15), h = R.int(7, 12);
    const x = R.int(2, W - w - 3), y = R.int(3, H - h - 3);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h });
  }
  for (const r of rooms) carveRect(m, r.x, r.y, r.w, r.h);
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
  // 방 안 장애물 (물·구덩이·기둥)
  for (const r of rooms.slice(1)) {
    if (r.w >= 11 && r.h >= 9 && R.chance(0.45)) {
      const kind = R.pick([T.WATER, T.PIT, T.WALL]);
      const cw = R.int(2, 3), chh = R.int(2, 3);
      carveRect(m, r.x + Math.floor(r.w / 2) - 1, r.y + Math.floor(r.h / 2) - 1, cw, chh, kind);
    }
    if (R.chance(0.35)) for (const [cx, cy] of [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]]) set(m, cx, cy, T.WALL);
  }
  wallUp(m);
  // 시작 방 = 0, 출구 = 시작에서 가장 먼 방
  const [sx, sy] = center(rooms[0]);
  let far = 1, fd = -1;
  rooms.forEach((r, i) => { const [cx, cy] = center(r); const d = Math.abs(cx - sx) + Math.abs(cy - sy); if (d > fd) { fd = d; far = i; } });
  m.start = [px(sx), px(sy)];
  const [ex, ey] = center(rooms[far]);
  m.exit = [px(ex), px(ey)];
  m.objects.push({ kind: "portal", id: "exit", x: m.exit[0], y: m.exit[1], locked: true });
  // 몬스터 배치
  const pool = zone.monsters;
  rooms.forEach((r, i) => {
    if (i === 0) return;
    const n = Math.max(2, Math.round((r.w * r.h) / 26 * (0.8 + floor * 0.004)));
    for (let k = 0; k < n; k++) {
      const tx = R.int(r.x + 1, r.x + r.w - 2), ty = R.int(r.y + 1, r.y + r.h - 2);
      if (get(m, tx, ty) !== T.FLOOR) continue;
      m.spawns.push({ id: R.pick(pool), x: px(tx), y: px(ty), elite: R.chance(0.06 + floor * 0.0015) });
    }
  });
  addTorches(m, R, zone);
  addDeco(m, R, zone, Math.round(W * H / 40));
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

/** 지도를 클라이언트로 보낼 형태로 */
export function mapPayload(m, extra = {}) {
  return {
    w: m.w, h: m.h, tiles: Buffer.from(m.tiles).toString("base64"), kind: m.kind, doorsOpen: !!m.doorsOpen,
    objects: m.objects, start: m.start, arena: m.arena ?? null, ...extra,
  };
}

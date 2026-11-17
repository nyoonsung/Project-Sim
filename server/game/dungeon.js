// 층 생성: 웨이브 투기장(일반층), 보스 투기장(5·10의 배수층), 안전 구역(전직소), 마을
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

/** 일반층: 큰 투기장 하나. 몬스터는 가장자리 소환 지점에서 웨이브로 몰려온다.
 *  배치 8가지: 탁 트인 곳·기둥 숲·네 웅덩이·십자 벽·고리 기둥·잔해·강과 다리·모서리 구덩이 */
const ARENA_STYLES = ["open", "pillars", "pools", "cross", "ring", "rubble", "river", "pits"];
function normalFloor(floor, seed, party) {
  const R = rng(seed);
  const zone = zoneOf(floor);
  const iw = Math.min(40, 30 + Math.floor(floor / 10)), ih = Math.min(28, 20 + Math.floor(floor / 14));
  const W = iw + 6, H = ih + 7;
  const m = grid(W, H);
  const ax = 3, ay = 4; // 투기장 왼쪽 위
  carveRect(m, ax, ay, iw, ih);
  // 모서리를 깎아 팔각형 느낌
  const cut = 3;
  for (let j = 0; j < cut; j++) for (let i = 0; i < cut - j; i++) for (const [x, y] of [[ax + i, ay + j], [ax + iw - 1 - i, ay + j], [ax + i, ay + ih - 1 - j], [ax + iw - 1 - i, ay + ih - 1 - j]]) set(m, x, y, T.VOID);
  const cx = ax + Math.floor(iw / 2), cy = ay + Math.floor(ih / 2);
  const startX = cx, startY = ay + ih - 3;
  const keepClear = (x, y) => Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2 || Math.abs(x - startX) <= 2 && Math.abs(y - startY) <= 2 || Math.abs(x - cx) <= 1 && y <= ay + 3;
  const put = (x, y, t) => { if (x > ax && y > ay && x < ax + iw - 1 && y < ay + ih - 1 && !keepClear(x, y)) set(m, x, y, t); };
  const style = R.pick(ARENA_STYLES);
  const liq = R.chance(0.6) ? T.WATER : T.PIT;
  switch (style) {
    case "pillars":
      for (let y = ay + 3; y < ay + ih - 3; y += 4) for (let x = ax + 3 + ((y / 4) % 2 ? 2 : 0); x < ax + iw - 3; x += 5) { put(x, y, T.WALL); if (R.chance(0.4)) put(x + 1, y, T.WALL); }
      break;
    case "pools":
      for (const [px, py] of [[0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]]) {
        const ox = ax + Math.round(iw * px), oy = ay + Math.round(ih * py), rw = R.int(2, 3), rh = R.int(1, 2);
        for (let y = -rh; y <= rh; y++) for (let x = -rw; x <= rw; x++) if ((x * x) / (rw * rw + 1) + (y * y) / (rh * rh + 1) < 1) put(ox + x, oy + y, liq);
      }
      break;
    case "cross":
      for (let k = 4; k < Math.min(iw, ih) / 2 - 1; k++) { if (k % 5 === 0) continue; put(cx - k, cy, T.WALL); put(cx + k, cy, T.WALL); put(cx, cy - k, T.WALL); put(cx, cy + k, T.WALL); }
      break;
    case "ring": {
      const rx = iw * 0.3, ry = ih * 0.3;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; put(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), T.WALL); }
      break;
    }
    case "rubble":
      for (let i = 0; i < Math.round((iw * ih) / 22); i++) put(R.int(ax + 2, ax + iw - 3), R.int(ay + 2, ay + ih - 3), R.chance(0.7) ? T.WALL : liq);
      break;
    case "river": {
      const horiz = R.chance(0.5);
      const n = horiz ? iw : ih;
      for (let k = 0; k < n; k++) {
        const w = Math.round(Math.sin(k * 0.5) * 1.2);
        for (let t = 0; t < 2; t++) {
          const x = horiz ? ax + k : cx + 4 + w + t, y = horiz ? cy - 4 + w + t : ay + k;
          const bridge = horiz ? k % Math.floor(iw / 3) < 2 : k % Math.floor(ih / 3) < 2;
          if (!bridge) put(x, y, liq);
        }
      }
      break;
    }
    case "pits":
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const ox = sx > 0 ? ax + 5 : ax + iw - 6, oy = sy > 0 ? ay + 5 : ay + ih - 6;
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3 - j; i++) put(ox + i * sx, oy + j * sy, liq);
      }
      break;
  }
  wallUp(m);
  // 갈 수 없는 바닥은 벽으로 (모든 곳이 이어지게)
  const reach = reachable(m, startX, startY);
  for (let i = 0; i < m.tiles.length; i++) if ((m.tiles[i] === T.FLOOR || m.tiles[i] === T.DECO) && !reach[i]) m.tiles[i] = T.WALL;
  m.start = [px(startX), px(startY)];
  m.exit = [px(cx), px(ay + 1)];
  m.objects.push({ kind: "portal", id: "exit", x: m.exit[0], y: m.exit[1], locked: true });
  // 소환 지점: 가장자리 근처, 시작점에서 먼 곳
  const pts = [];
  for (let y = ay + 1; y < ay + ih - 1; y++) for (let x = ax + 1; x < ax + iw - 1; x++) {
    if (get(m, x, y) !== T.FLOOR || !reach[y * W + x]) continue;
    const edge = Math.min(x - ax, ax + iw - 1 - x, y - ay, ay + ih - 1 - y);
    if (edge <= 3 && Math.hypot(x - startX, y - startY) > 8 && (x + y * 3) % 3 === 0) pts.push([px(x), px(y)]);
  }
  const total = Math.min(60, Math.round((24 + floor * 0.3) * (party > 1 ? 1 + (party - 1) * 0.35 : 1)));
  m.waves = { total, waves: Math.max(3, Math.min(6, 3 + Math.floor(floor / 20))), points: pts, pool: zone.monsters, elite: 0.06 + floor * 0.0015 };
  m.style = style;
  m.spawns = [];
  addTorches(m, R, zone, 5);
  addDeco(m, R, zone, Math.round(W * H / 45));
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

// 층 생성: 웨이브 투기장(일반층), 보스 투기장(5·10의 배수층), 안전 구역(전직소), 마을
import { T, TILE } from "../../shared/constants.js";
import { rng } from "../../shared/rng.js";
import { zoneOf, floorKind, effLevel } from "../../shared/zones.js";

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

// ── 던전 꾸미기 (지형지물): 기둥, 벽 분수, 빛나는 수정, 룬 마법진, 구역별 바닥(용암 균열·서리·산성 웅덩이·공허 안개),
//    벽가 상자·통·해골, 그리고 실제로 찌르는 가시 함정. 길을 막는 건 벽 옆 칸에만 놓아 이동 경로는 그대로.
const FLOOR_FX = { "화염 용광로": "lava", "혼돈의 왕좌": "lava", "얼어붙은 성채": "frost", "독버섯 늪": "acid", "이끼 낀 지하묘지": "moss", "그림자 심연": "void", "폭풍 첨탑": "spark", "타락한 성역": "holy", "태엽 공장": "gear", "고블린 굴": "moss" };
function decorate(m, R, zone, { cx, cy, traps = 0, start } = {}) {
  const O = m.objects;
  const isF = (x, y) => get(m, x, y) === T.FLOOR;
  const nearWall = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(m, x + dx, y + dy) === T.WALL);
  const busy = new Set();
  const take = (x, y) => { const k = x + "," + y; if (busy.has(k)) return false; busy.add(k); return true; };
  // 홀로 선 기둥(위·아래가 바닥인 벽칸) → 돌기둥 그림
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++)
    if (get(m, x, y) === T.WALL && isF(x, y + 1) && isF(x, y - 1)) O.push({ kind: "column", x: px(x), y: y * TILE + TILE });
  // 벽 분수 (위쪽 벽 앞면)
  const red = ["화염 용광로", "혼돈의 왕좌", "타락한 성역"].includes(zone.name);
  let fountains = 0;
  for (let y = 2; y < m.h - 2 && fountains < 3; y++) for (let x = 2; x < m.w - 2 && fountains < 3; x++) {
    if (get(m, x, y) === T.WALL && get(m, x, y - 1) === T.WALL && isF(x, y + 1) && isF(x - 1, y + 1) && isF(x + 1, y + 1) && (x * 7 + y) % 9 === 0 && R.chance(0.5) && take(x, y + 1)) {
      O.push({ kind: "wfount", x: px(x), y: y * TILE + TILE, c: red ? "red" : "blue" });
      fountains++;
    }
  }
  // 룬 마법진 (가운데)
  if (cx != null) O.push({ kind: "circle", x: cx, y: cy, c: zone.accent ?? "#8a6aff", flatY: -999 });
  // 빛나는 수정·벽가 소품
  const props = ["crate", "crate", "skull", "chest", "flask_big_red", "flask_big_blue", "flask_big_green", "skull", "crate"];
  let crystals = 0, nprops = 0;
  for (let i = 0; i < 900 && (crystals < 8 || nprops < 14); i++) {
    const x = R.int(2, m.w - 3), y = R.int(2, m.h - 3);
    if (!isF(x, y) || !nearWall(x, y) || (start && Math.hypot(px(x) - start[0], px(y) - start[1]) < 140) || !take(x, y)) continue;
    if (crystals < 8 && R.chance(0.45)) { O.push({ kind: "crystal", x: px(x) + R.int(-6, 6), y: px(y) + 10, c: zone.accent ?? "#7ae0ff", v: R.int(0, 3), flip: R.chance(0.5) }); crystals++; }
    else if (nprops < 14) { O.push({ kind: "dprop", s: R.pick(props), x: px(x) + R.int(-6, 6), y: px(y) + 12 }); nprops++; }
  }
  // 구역별 바닥 무늬
  const fx = FLOOR_FX[zone.name];
  if (fx) for (let i = 0, n = 0; i < 400 && n < 18; i++) {
    const x = R.int(2, m.w - 3), y = R.int(2, m.h - 3);
    if (!isF(x, y) || !take(x, y)) continue;
    O.push({ kind: "floorfx", t: fx, x: px(x) + R.int(-8, 8), y: px(y) + R.int(-8, 8), v: R.int(0, 999), c: zone.accent, flatY: -990 });
    n++;
  }
  // 가시 함정 (2~3칸짜리 무리, 시작점·출구에서 멀리)
  m.traps = [];
  for (let i = 0, g = 0; i < 600 && g < traps; i++) {
    const x = R.int(3, m.w - 4), y = R.int(3, m.h - 4);
    if (!isF(x, y) || nearWall(x, y) || (start && Math.hypot(px(x) - start[0], px(y) - start[1]) < 160)) continue;
    if (m.exit && Math.hypot(px(x) - m.exit[0], px(y) - m.exit[1]) < 120) continue;
    const horiz = R.chance(0.5), len = R.int(2, 3), cells = [];
    for (let k = 0; k < len; k++) { const tx = x + (horiz ? k : 0), ty = y + (horiz ? 0 : k); if (isF(tx, ty) && !busy.has(tx + "," + ty)) cells.push([tx, ty]); }
    if (cells.length < 2) continue;
    for (const [tx, ty] of cells) busy.add(tx + "," + ty);
    m.traps.push({ cells, phase: g % 2 });
    g++;
  }
  for (const tr of m.traps) for (const [tx, ty] of tr.cells) O.push({ kind: "spikes", x: px(tx), y: px(ty) + 16, phase: tr.phase, flatY: -995 });
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
const ARENA_STYLES = ["open", "open", "open", "open", "pillars", "pools", "cross", "ring", "rubble", "river", "pits"]; // 벽 줄이기: 빈 투기장 비중 ↑
function normalFloor(floor, seed, party, dungeon = 1) {
  const R = rng(seed);
  const zone = zoneOf(floor, dungeon);
  // 제2 던전은 층 번호(1~30)가 아니라 실제 레벨(102~150)로 크기·몬스터 수·정예 비율을 정함 (예전엔 1~30층처럼 몬스터가 적었음)
  const lv = effLevel(floor, dungeon), d2 = dungeon === 2;
  const iw = Math.min(40, 30 + Math.floor(lv / 10)), ih = Math.min(28, 20 + Math.floor(lv / 14));
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
      for (let y = ay + 4; y < ay + ih - 4; y += 7) for (let x = ax + 4 + ((y / 7) % 2 ? 4 : 0); x < ax + iw - 4; x += 8) put(x, y, T.WALL);
      break;
    case "pools":
      for (const [px, py] of [[0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]]) {
        const ox = ax + Math.round(iw * px), oy = ay + Math.round(ih * py), rw = R.int(2, 3), rh = R.int(1, 2);
        for (let y = -rh; y <= rh; y++) for (let x = -rw; x <= rw; x++) if ((x * x) / (rw * rw + 1) + (y * y) / (rh * rh + 1) < 1) put(ox + x, oy + y, liq);
      }
      break;
    case "cross":
      for (let k = 5; k < Math.min(iw, ih) / 2 - 1; k++) { if (k % 2 === 0) continue; put(cx - k, cy, T.WALL); put(cx + k, cy, T.WALL); put(cx, cy - k, T.WALL); put(cx, cy + k, T.WALL); }
      break;
    case "ring": {
      const rx = iw * 0.3, ry = ih * 0.3;
      for (let k = 0; k < 16; k += 2) { const a = (k / 16) * Math.PI * 2; put(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), T.WALL); }
      break;
    }
    case "rubble":
      for (let i = 0; i < Math.round((iw * ih) / 90); i++) put(R.int(ax + 2, ax + iw - 3), R.int(ay + 2, ay + ih - 3), R.chance(0.7) ? T.WALL : liq);
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
  m.objects.push({ kind: "portal", id: "exit", x: m.exit[0], y: m.exit[1], locked: true, label: "출구 (몬스터를 모두 처치하면 열림)" });
  // 마을로 돌아가는 길 (시작 지점 옆, 1.5초 서 있으면 귀환)
  m.objects.push({ kind: "portal", id: "town", x: px(startX - 3), y: px(startY + 1), label: "마을로", color: "town" });
  for (const [x, y] of [[startX - 3, startY + 1], [startX - 4, startY + 1], [startX - 3, startY]]) m.tiles[y * m.w + x] = T.FLOOR;
  // 소환 지점: 가장자리 근처, 시작점에서 먼 곳
  const pts = [];
  for (let y = ay + 1; y < ay + ih - 1; y++) for (let x = ax + 1; x < ax + iw - 1; x++) {
    if (get(m, x, y) !== T.FLOOR || !reach[y * W + x]) continue;
    const edge = Math.min(x - ax, ax + iw - 1 - x, y - ay, ay + ih - 1 - y);
    if (edge <= 3 && Math.hypot(x - startX, y - startY) > 8 && (x + y * 3) % 3 === 0) pts.push([px(x), px(y)]);
  }
  // 층마다 몬스터 수 1.5배 (최대 90)
  const total = Math.min(d2 ? 110 : 90, Math.round((30 + lv * 0.45 + (d2 ? 15 : 0)) * (party > 1 ? 1 + (party - 1) * 0.35 : 1)));
  m.waves = { total, waves: Math.max(3, Math.min(d2 ? 7 : 6, 3 + Math.floor(lv / 20))), points: pts, pool: zone.monsters, elite: d2 ? Math.min(0.45, 0.32 + floor * 0.004) : Math.min(0.3, 0.07 + floor * 0.0025) };
  m.style = style;
  m.spawns = [];
  addTorches(m, R, zone, 5);
  addDeco(m, R, zone, Math.round(W * H / 45));
  m.objects = m.objects.filter((o) => o.kind !== "deco" || reach[Math.floor(o.y / TILE) * W + Math.floor(o.x / TILE)]);
  decorate(m, R, zone, { cx: px(cx), cy: px(cy), traps: lv < 3 ? 0 : Math.min(d2 ? 8 : 6, 2 + Math.floor(lv / 15)), start: m.start });
  m.kind = "normal";
  return m;
}

/** 보스층: 입구 방 → 통로 → 투기장 (투기장 진입 시 문이 닫힘) */
function bossFloor(floor, seed, dungeon = 1) {
  const R = rng(seed);
  const zone = zoneOf(floor, dungeon);
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
  decorate(m, R, zone, { cx: px(mid), cy: px(ay + Math.floor(AH / 2)), traps: 0, start: m.start });
  m.objects.push({ kind: "sign", x: px(mid + 3), y: px(ry + 1), text: kind === "boss" ? "주요 보스의 방" : "중간보스의 방" });
  m.objects.push({ kind: "portal", id: "town", x: px(mid - 3), y: px(ry + 6), label: "마을로", color: "town" });
  m.kind = kind;
  return m;
}

/** 안전 구역: 10층 보스 처치 후. 전직소 + 다음 층/마을 포탈 */
export function safeZone(floor, dungeon = 1) {
  const R = rng(floor * 977 + dungeon * 7919);
  const zone = zoneOf(floor, dungeon);
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

export function makeFloor(floor, seed, party = 1, dungeon = 1) {
  const kind = floorKind(floor);
  return kind === "normal" ? normalFloor(floor, seed, party, dungeon) : bossFloor(floor, seed, dungeon);
}

/** 마을: 아담한 저녁 마을. 가운데 분수 광장, 위쪽 던전 관문, 둘레에 상점·대장간·여관·훈련장·집·풍차·연못.
 *  건물은 그림(prop)으로 그리고, 아래쪽 2줄만 벽으로 막아 뒤로 지나가면 지붕에 가려진다. */
export function makeTown() {
  const W = 40, H = 30;
  const m = grid(W, H, T.GRASS);
  const R = rng(4242);
  const P = (tx) => tx * TILE; // 칸 → px (칸 왼쪽 위)
  // 둘레(숲으로 그림)
  for (let x = 0; x < W; x++) { set(m, x, 0, T.WALL); set(m, x, 1, T.WALL); set(m, x, H - 1, T.WALL); }
  for (let y = 0; y < H; y++) { set(m, 0, y, T.WALL); set(m, W - 1, y, T.WALL); }
  // 광장·길
  carveRect(m, 13, 12, 14, 9, T.PLAZA);
  carveRect(m, 15, 2, 10, 5, T.PLAZA);
  carveRect(m, 18, 7, 4, 5, T.PATH);
  carveRect(m, 18, 22, 4, 7, T.PATH);
  carveRect(m, 1, 15, 12, 3, T.PATH);
  carveRect(m, 27, 15, 12, 3, T.PATH);
  carveRect(m, 18, 21, 4, 1, T.PATH);
  // 연못 (왼쪽 아래)
  carveRect(m, 2, 25, 6, 3, T.WATER); carveRect(m, 3, 24, 4, 1, T.WATER);
  const objs = m.objects;
  // 건물: s=그림, tx·ty=왼쪽 위 칸, w·h=칸 수 → 아래 2줄 막음
  const bld = (s, tx, ty, w, h, extra = {}) => {
    for (let y = ty + h - 2; y < ty + h; y++) for (let x = tx; x < tx + w; x++) set(m, x, y, T.WALL);
    objs.push({ kind: "prop", s, x: P(tx) + (w * TILE) / 2, y: P(ty + h), ...extra });
  };
  bld("h_food", 6, 8, 3, 3, { sign: { text: "잡화점", color: "#ffd35a" }, win: "#ffcf7a" });
  bld("h_red", 30, 8, 4, 3, { sign: { text: "대장간", color: "#ff7a4a" }, win: "#ff9a5a" });
  bld("lodge", 31, 20, 4, 7, { sign: { text: "여관", color: "#ff8ad8" }, win: "#ffd08a" });
  bld("h_green", 4, 20, 4, 3, { sign: { text: "훈련장", color: "#7af0a0" }, win: "#c8ffb0" });
  bld("h_orange", 10, 4, 4, 3, { win: "#ffcf7a" });
  bld("h_beige", 26, 4, 4, 3, { sign: { text: "마법부여", color: "#c8a0ff" }, win: "#e0c8ff" });
  bld("h_round", 2, 4, 3, 3, { mill: true, win: "#ffcf7a" });
  bld("h_tall", 35, 4, 3, 3, { win: "#ffd8a0" });
  bld("h_orange2", 12, 24, 4, 3, { win: "#ffcf7a" });
  bld("lodge2", 24, 23, 4, 5, { win: "#ffd08a" });
  // 던전 관문: 돌 아치 + 양쪽 수호상 + 깃발
  set(m, 18, 3, T.WALL); set(m, 18, 4, T.WALL); set(m, 21, 3, T.WALL); set(m, 21, 4, T.WALL);
  objs.push({ kind: "prop", s: "arch", x: P(20) + 16, y: P(5), glow: "#b07aff" }); // 아치 그림이 왼쪽으로 16px 치우쳐 그려져서 보정 → 포탈이 아치 한가운데
  objs.push({ kind: "portal", id: "dungeon", x: P(20), y: P(4) + 12, label: "던전 입구", color: "dungeon" });
  for (const tx of [15, 23]) { bld("statue", tx, 2, 2, 2); objs[objs.length - 1].glow = "#9a7aff"; }
  for (const tx of [17, 22]) objs.push({ kind: "flag", c: tx === 17 ? "flag_red" : "flag_blue", x: P(tx) + 16, y: P(7) });
  objs.push({ kind: "npc", id: "gate", name: "던전 관문지기", x: P(17) + 16, y: P(6) + 8 });
  // 마을 오른쪽 길 끝: 제1 던전과 색·실루엣이 다른 심연의 균열 관문
  // (예전엔 아치가 길 한가운데 가로등·상자 위에 겹쳐 있었음 → 길 끝에 작은 광장을 만들고 그 안에 세움)
  carveRect(m, 33, 11, 6, 7, T.PLAZA);
  set(m, 34, 11, T.WALL); set(m, 34, 12, T.WALL); set(m, 37, 11, T.WALL); set(m, 37, 12, T.WALL);
  objs.push({ kind: "prop", s: "arch", x: P(36) + 16, y: P(13), glow: "#a45cff", tint: "d2" });
  objs.push({ kind: "portal", id: "dungeon2", x: P(36), y: P(12) + 12, label: "심연의 균열", color: "dungeon2" });
  for (const ty of [14, 17]) objs.push({ kind: "flag", c: "flag_red", x: P(38) + 4, y: P(ty) });
  objs.push({ kind: "npc", id: "gate2", name: "심연의 관문지기", x: P(33) + 16, y: P(13) + 20 });
  // 보관고 NPC를 광장 안쪽 타일 중앙으로 옮겨 벽·화면 가장자리와 겹치지 않게 한다.
  objs.push({ kind: "npc", id: "vault", name: "심연 보관고", x: P(37) + 16, y: P(15) + 16 });
  // 분수 (광장 가운데, 둘레 돌)
  set(m, 19, 16, T.WALL); set(m, 20, 16, T.WALL);
  objs.push({ kind: "fountain", fx: "water/fountain", x: P(20), y: P(17) - 4 });
  // NPC
  objs.push({ kind: "npc", id: "shop", name: "잡화 상인 미라", x: P(7) + 16, y: P(12) + 4 });
  objs.push({ kind: "npc", id: "smithy", name: "대장장이 브론", x: P(31) + 16, y: P(12) + 4 });
  objs.push({ kind: "campfire", fx: "fire/campfire", x: P(29) + 16, y: P(12) + 4 });
  objs.push({ kind: "npc", id: "trainer", name: "훈련 교관", x: P(8) + 16, y: P(23) + 16 });
  objs.push({ kind: "dummy", id: "dummy", x: P(10) + 16, y: P(22) + 8 });
  objs.push({ kind: "npc", id: "board", name: "모험가 게시판", x: P(25) + 16, y: P(14) });
  objs.push({ kind: "npc", id: "enchanter", name: "마법부여사 엘라", x: P(28) + 16, y: P(8) + 8 });
  // 시장 노점 (광장 아래쪽)
  for (const [tx, goods, win] of [[14, ["bread", "jars", "redjar"], "#ff6ac8"], [23, ["crates", "box", "pack"], "#6ad8ff"]]) {
    set(m, tx, 19, T.WALL); set(m, tx + 1, 19, T.WALL); set(m, tx + 2, 19, T.WALL);
    objs.push({ kind: "stall", x: P(tx) + 48, y: P(20), goods, win });
  }
  // 광장 꾸미기: 분수 둘레 모자이크, 벤치, 꽃 화분
  objs.push({ kind: "mosaic", x: P(20), y: P(16) + 8, flatY: -999 });
  for (const [tx, ty] of [[16, 13], [23, 13]]) objs.push({ kind: "bench", x: P(tx) + 16, y: P(ty) + 26 });
  for (const [tx, ty] of [[14, 13], [25, 17], [14, 17]]) { set(m, tx, ty, T.WALL); objs.push({ kind: "planter", s: R.pick(["bush0", "bush1", "bush4"]), f: R.pick(["flower0", "flower1", "flower2", "flower3"]), x: P(tx) + 16, y: P(ty) + 28 }); }
  // 소품
  for (const [s, tx, ty] of [["crate", 9, 10], ["jars", 9, 11], ["crate", 29, 10], ["box", 34, 9], ["chest", 36, 19], ["cauldron", 38, 19], ["scarecrow", 11, 21], ["redjar", 30, 26], ["bucket", 8, 25], ["crates", 32, 19], ["jar", 11, 13], ["box", 28, 19], ["jars", 12, 19], ["crate", 29, 21]]) {
    if (get(m, tx, ty) === T.WALL) continue;
    objs.push({ kind: "prop", s, x: P(tx) + 16, y: P(ty) + 24, small: true });
  }
  objs.push({ kind: "watermill", x: P(8) + 8, y: P(27) + 8 });
  // 연못: 물결·연잎
  for (const [tx, ty] of [[3, 25], [5, 26], [6, 25], [4, 27]]) objs.push({ kind: "ripple", x: P(tx) + 16, y: P(ty) + 20, flatY: -998 });
  // 줄 전구 (기둥 꼭대기 좌표들을 차례로 잇는다)
  const pole = (tx, ty) => [P(tx) + 16, P(ty) + 16];
  objs.push({ kind: "lights", pts: [pole(13, 12), pole(17, 12)] });
  objs.push({ kind: "lights", pts: [pole(22, 12), pole(26, 12)] });
  objs.push({ kind: "lights", pts: [pole(13, 20), pole(13, 15)] });
  objs.push({ kind: "lights", pts: [pole(26, 20), pole(26, 15)] });
  objs.push({ kind: "lights", pts: [pole(17, 7), pole(17, 11)] });
  objs.push({ kind: "lights", pts: [pole(22, 7), pole(22, 11)] });
  objs.push({ kind: "lights", pts: [pole(2, 14), pole(6, 14), pole(10, 14)] });
  objs.push({ kind: "lights", pts: [pole(29, 14), pole(32, 14)] });
  for (const [tx, ty] of [[13, 12], [17, 12], [22, 12], [26, 12], [13, 20], [26, 20], [13, 15], [26, 15], [17, 7], [17, 11], [22, 7], [22, 11], [2, 14], [6, 14], [10, 14], [29, 14], [32, 14]])
    objs.push({ kind: "lamp", x: P(tx) + 16, y: P(ty) + 30, post: true });
  // 숲 테두리 + 나무·꽃 (빈 풀밭에만)
  const free = (tx, ty, r = 0) => { for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (get(m, x, y) !== T.GRASS) return false; return true; };
  const groves = ["grove_green", "grove_pine", "grove_lime", "grove_pink"];
  for (let x = 1; x < W - 1; x += 3) objs.push({ kind: "prop", s: R.pick(groves), x: P(x) + 16, y: P(2) - 4, border: true });
  for (let x = 1; x < W - 1; x += 3) objs.push({ kind: "prop", s: R.pick(groves), x: P(x) + 16, y: P(H) + 12, border: true });
  for (let y = 3; y < H - 1; y += 2) { objs.push({ kind: "prop", s: R.pick(["tree_pine", "tree_round", "tree_green_s"]), x: 14, y: P(y) + 24, border: true }); objs.push({ kind: "prop", s: R.pick(["tree_pine", "tree_round", "tree_pink_s"]), x: P(W) - 14, y: P(y) + 24, border: true }); }
  const trees = ["tree_pink", "tree_green", "tree_orange", "tree_pink", "tree_white"];
  let n = 0;
  for (let i = 0; i < 400 && n < 14; i++) {
    const tx = R.int(2, W - 3), ty = R.int(3, H - 3);
    if (!free(tx, ty, 1) || !free(tx, ty + 1, 0)) continue;
    if (objs.some((o) => Math.hypot(o.x - P(tx), o.y - P(ty)) < 70)) continue;
    objs.push({ kind: "prop", s: R.pick(trees), x: P(tx) + 16, y: P(ty) + 30 });
    set(m, tx, ty, T.WALL); // 나무 밑동은 못 지나감
    n++;
  }
  for (let i = 0; i < 90; i++) {
    const tx = R.int(1, W - 2), ty = R.int(2, H - 2);
    if (get(m, tx, ty) !== T.GRASS) continue;
    objs.push({ kind: "prop", s: R.pick(["bush0", "bush1", "bush2", "bush3", "bush4", "bush5", "flower0", "flower1", "flower2", "flower3", "flower0", "flower2"]), x: P(tx) + R.int(4, 28), y: P(ty) + R.int(16, 30), small: true, flat: true });
  }
  m.start = [P(20) + 16, P(19) + 16];
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

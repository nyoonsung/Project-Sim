// 갇힘 방지: 벽·닫힌 문과 겹친 플레이어는 가장 가까운 빈 곳으로 꺼내지고, 보스방 문이 닫힐 때 문턱에 선 사람도 안으로 옮겨짐
import assert from "node:assert/strict";
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats } from "../server/game/player.js";
import { circleHitsWall, applyInput } from "../shared/move.js";
import { TILE } from "../shared/constants.js";

const world = { clock: 0, pickup: () => true, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {}, offerBossRetry() {} };
const mk = (room, at) => {
  const c = newCharacter("st"); c.level = 50;
  const sent = [];
  const s = { userId: 1, char: c, send: (p) => sent.push(p), notice() {}, sendMe() {}, sent };
  const u = makePlayerUnit(s); s.unit = u; refreshStats(u);
  room.addPlayer(u, at);
  return { u, sent };
};
const tick = (room, n) => { for (let i = 0; i < n; i++) { world.clock += 0.05; room.tick(); room.events.length = 0; } };

// 1) 벽 속에 끼인 플레이어 → 빈 곳으로
{
  const map = makeFloor(1, 99, 1, 1); map.spawns = []; map.waves = null;
  const room = new Room(world, { id: "st1", kind: "dungeon", floor: 1, map });
  const { u, sent } = mk(room, map.start);
  // 시작점에서 가장 가까운 벽 칸 한가운데로 밀어 넣기
  let wx = null, wy = null;
  for (let r = 1; r < 20 && wx == null; r++) for (let dx = -r; dx <= r && wx == null; dx++) for (const dy of [-r, r]) {
    const x = u.x + dx * TILE, y = u.y + dy * TILE;
    if (circleHitsWall(map, x, y, 1)) { wx = x; wy = y; break; }
  }
  u.x = wx; u.y = wy;
  assert.ok(circleHitsWall(map, u.x, u.y, u.r), "벽 속");
  const [mx0, my0] = applyInput(map, u.x, u.y, 1, 0, 120, 0.05, u.r);
  assert.ok(mx0 === u.x && my0 === u.y, "끼이면 어느 쪽으로도 못 움직임 (고치기 전 증상)");
  tick(room, 6);
  assert.ok(!circleHitsWall(map, u.x, u.y, u.r), "빈 곳으로 꺼내짐");
  assert.ok(sent.some((p) => p.t === "tp"), "화면 위치도 맞춤");
  const [mx1] = applyInput(map, u.x, u.y, 1, 0, 120, 0.05, u.r), [, my1] = applyInput(map, u.x, u.y, 0, 1, 120, 0.05, u.r);
  assert.ok(mx1 !== u.x || my1 !== u.y, "다시 움직일 수 있음");
}
console.log("✓ 벽·소품에 끼인 플레이어를 자동으로 빈 곳으로 꺼냄");

// 2) 보스방 문이 닫힐 때 문턱(문 칸과 몸이 겹친 위치)에 선 사람도 안으로
{
  const map = makeFloor(10, 7, 1, 1); map.waves = null; map.spawns = [];
  const room = new Room(world, { id: "st2", kind: "dungeon", floor: 10, map });
  const a = map.arena;
  const p1 = mk(room, [(a.x0 + a.x1) / 2, a.y1 - 40]).u; // 보스방 안
  const p2 = mk(room, [(a.x0 + a.x1) / 2, a.y1 - 6]).u; // 문턱: 몸 일부가 문 칸
  p1.x = (a.x0 + a.x1) / 2; p1.y = a.y1 - 40; p2.x = (a.x0 + a.x1) / 2 + 4; p2.y = a.y1 - 6;
  tick(room, 2);
  assert.equal(map.doorsOpen, false, "문 닫힘");
  for (const p of [p1, p2]) assert.ok(!circleHitsWall(map, p.x, p.y, p.r) && p.y < a.y1, "모두 방 안 빈 곳");
}
console.log("✓ 보스방 문이 닫힐 때 문턱에 선 사람도 안으로 옮김");
console.log("STUCK TESTS: ALL PASS");
process.exit(0);

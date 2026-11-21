import assert from "node:assert/strict";
import { TILE, T } from "../shared/constants.js";
import { Room } from "../server/game/room.js";

const map = {
  w: 100,
  h: 100,
  tiles: new Uint8Array(100 * 100).fill(T.FLOOR),
  objects: [],
  spawns: [],
  start: [TILE * 10, TILE * 10],
  doorsOpen: true,
};

// 흐름장은 플레이어가 같은 타일에 있는 동안 재계산하지 않아야 한다.
{
  const room = new Room({ clock: 0 }, { id: "flow-cache-test", kind: "dungeon", floor: 1, map });
  const player = { id: 5001, x: TILE * 10 + 4, y: TILE * 10 + 4, dead: false, type: "p" };
  room.players.set(player.id, player);
  room.updateFlow();
  const firstMeta = room.flowMeta.get(player.id);
  const dist = room.flow.get(player.id);
  assert.ok(firstMeta && dist instanceof Int16Array);

  // 같은 타일에서 위치만 조금 달라진 호출은 기존 길찾기 결과를 그대로 재사용한다.
  const probe = (15 * map.w) + 15;
  dist[probe] = 1234;
  player.x += TILE * 0.25;
  room.updateFlow();
  assert.equal(room.flowMeta.get(player.id), firstMeta);
  assert.equal(room.flow.get(player.id)[probe], 1234);

  // 타일이 바뀌면 새 출발점으로 다시 계산하고 메타데이터도 갱신한다.
  player.x = TILE * 12 + 4;
  room.updateFlow();
  const movedMeta = room.flowMeta.get(player.id);
  assert.notEqual(movedMeta, firstMeta);
  assert.equal(movedMeta.x, 12);
  assert.notEqual(room.flow.get(player.id)[probe], 1234);

  // 보스방 문 개폐는 같은 타일이어도 길찾기 장애물이 바뀌므로 갱신한다.
  room.map.doorsOpen = false;
  room.updateFlow();
  assert.notEqual(room.flowMeta.get(player.id), movedMeta);
}

// 투사체 broad-phase는 전 유닛을 훑지 않으면서 실제 충돌 거리 안의 후보를 빠뜨리면 안 된다.
{
  const room = new Room({ clock: 0 }, { id: "projectile-grid-test", kind: "dungeon", floor: 1, map });
  let id = 1;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      room.units.set(id, {
        id,
        team: id % 2 ? "m" : "p",
        type: id % 2 ? "m" : "p",
        x: 50 + x * 62,
        y: 50 + y * 62,
        r: 10 + (id % 4),
        dead: false,
      });
      id++;
    }
  }
  // 셀 경계 주변에도 후보가 걸리는지 확인한다.
  const centerX = 96, centerY = 96, projectileRadius = 6, queryRadius = projectileRadius + 40;
  room.units.set(id++, { id, team: "m", type: "m", x: 96, y: 96, r: 12, dead: false });
  room.units.set(id++, { id, team: "p", type: "p", x: 141, y: 96, r: 12, dead: false });
  room.units.set(id++, { id, team: "m", type: "b", x: 96, y: 140, r: 30, dead: false });

  room.rebuildProjectileGrid();
  const candidates = room.nearbyUnits(centerX, centerY, queryRadius);
  const candidateIds = new Set(candidates.map((u) => u.id));
  for (const u of room.units.values()) {
    const hitRadius = projectileRadius + (u.type === "p" ? u.r * 0.6 : u.r);
    if (Math.hypot(u.x - centerX, u.y - centerY) <= hitRadius) {
      assert.ok(candidateIds.has(u.id), `nearby collision candidate ${u.id} was omitted`);
    }
  }
  assert.ok(candidates.length < room.units.size / 10, "spatial query should avoid scanning the entire room");
  const firstArray = candidates;
  const next = room.nearbyUnits(centerX + 2, centerY, queryRadius);
  assert.equal(next, firstArray, "candidate array should be reused instead of allocated per step");
}

console.log("PERFORMANCE SPATIAL / FLOW CACHE TESTS: ALL PASS");

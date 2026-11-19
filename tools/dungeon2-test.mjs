import assert from "node:assert/strict";
import {
  BOSSES, DUNGEON2_MAX_FLOOR, DUNGEON2_ZONES, MONSTERS,
  bossStats, floorKind, floorScale, monsterStats, zoneOf, effLevel,
} from "../shared/zones.js";
import { Room } from "../server/game/room.js";
import { rollAbyssRelic } from "../shared/items.js";
import { makeFloor, mapPayload, makeTown, safeZone } from "../server/game/dungeon.js";
import { levelGapXpMultiplier } from "../server/game/room.js";

const ok = (condition, label) => {
  assert.ok(condition, label);
  console.log("✓", label);
};

// 제2 던전 난이도: 제1 던전 100층 기준 1층부터 체력 ×2.5 · 공격력 ×1.8, 층이 오를수록 더 강해짐. 실제 레벨 102~150
{
  const top = floorScale(100, 1);
  const d1 = floorScale(1, 2), d30 = floorScale(30, 2);
  assert.ok(Math.abs(d1.hp / top.hp - 2.5) < 1e-9 && Math.abs(d1.dmg / top.dmg - 1.8) < 1e-9);
  assert.ok(d30.hp > d1.hp * 1.8 && d30.dmg > d1.dmg * 1.4);
  assert.ok(d1.speed > top.speed);
  assert.equal(effLevel(1, 2), 102); assert.equal(effLevel(30, 2), 150); assert.equal(effLevel(45, 1), 45);
  for (const f of [1, 15, 30]) for (const id of zoneOf(f, 2).monsters) assert.equal(monsterStats(id, f, 1, 2).level, effLevel(f, 2));
  const top1 = monsterStats(zoneOf(100).monsters[0], 100, 1, 1);
  assert.ok(monsterStats(zoneOf(1, 2).monsters[0], 1, 1, 2).hp > top1.hp, "제2 던전 1층 몬스터가 제1 던전 100층보다 단단함");
}
ok(true, "제2 던전 난이도: 1층부터 제1 던전 100층보다 훨씬 강함, 실제 레벨 102~150");

// 구역마다 몬스터 구성이 서로 다름 (예전엔 1구역과 3구역이 똑같았음)
assert.notDeepEqual([...DUNGEON2_ZONES[0].monsters].sort(), [...DUNGEON2_ZONES[2].monsters].sort());
ok(true, "제2 던전 1·3구역 몬스터 구성이 다름");

// 제2 던전에서는 캐릭터 레벨이 층보다 아무리 높아도 레벨 차이 경험치 페널티가 없다.
// 제1 던전은 기존 감소 규칙을 그대로 유지한다.
for (const floor of [1, 10, 30]) {
  assert.equal(levelGapXpMultiplier(250, floor, 2), 1);
  assert.equal(levelGapXpMultiplier(floor + 5, floor, 1), 1);
  assert.ok(levelGapXpMultiplier(floor + 6, floor, 1) < 1);
}
assert.equal(levelGapXpMultiplier(250, 30, 2), 1);
ok(true, "제2 던전 레벨 차이 경험치 감소 없음 / 제1 던전 기존 규칙 유지");

// 세 구역, 층별 몬스터 정의, 보스 정의 확인.
assert.equal(DUNGEON2_MAX_FLOOR, 30);
assert.equal(DUNGEON2_ZONES.length, 3);
for (let i = 0; i < DUNGEON2_ZONES.length; i++) {
  const z = DUNGEON2_ZONES[i];
  for (const id of z.monsters) assert.ok(MONSTERS[id], `missing monster ${id}`);
  assert.ok(BOSSES[z.mid], `missing midboss ${z.mid}`);
  assert.ok(BOSSES[z.boss], `missing boss ${z.boss}`);
  assert.equal(zoneOf(i * 10 + 1, 2), z);
}
ok(true, "제2 던전 3개 구역의 몬스터·중간보스·보스 정의");

// 각 난이도 층의 생성물이 정상인지 확인.
for (const floor of [1, 5, 10, 15, 20, 25, 30]) {
  const map = makeFloor(floor, 123456 + floor, 1, 2);
  assert.ok(map && map.tiles instanceof Uint8Array);
  assert.ok(map.objects?.length);
  assert.ok(map.start?.length === 2);
  if (floorKind(floor) === "normal") {
    // 일반층은 초기 고정 스폰이 아니라 웨이브 지점에서 순차 소환된다.
    assert.ok(map.waves && map.waves.total > 0, `floor ${floor} has no waves`);
    assert.ok(map.waves.points.length > 0, `floor ${floor} has no wave spawn points`);
    assert.ok(map.waves.pool.length > 0, `floor ${floor} has no monster pool`);
    for (const id of map.waves.pool) assert.ok(MONSTERS[id], `unknown wave monster ${id}`);
  } else {
    assert.ok(BOSSES[map.boss], `unknown boss ${map.boss}`);
  }
  mapPayload(map);
}
ok(true, "제2 던전 일반층·중간보스층·보스층 생성 및 전송");

// 스탯 산출이 정상이고 5배가 적용되는지 확인.
for (const id of DUNGEON2_ZONES[0].monsters) {
  const s = monsterStats(id, 1, 1, 2);
  assert.ok(Number.isFinite(s.hp) && s.hp > 0);
  assert.ok(Number.isFinite(s.dmg) && s.dmg > 0);
}
for (const id of [DUNGEON2_ZONES[0].mid, DUNGEON2_ZONES[0].boss, DUNGEON2_ZONES[2].boss]) {
  const s = bossStats(id, id === DUNGEON2_ZONES[2].boss ? 30 : 10, 1, 2);
  assert.ok(Number.isFinite(s.hp) && s.hp > 0);
  assert.ok(Number.isFinite(s.dmg) && s.dmg > 0);
}
ok(true, "제2 던전 몬스터·보스 능력치 산출");

// 드롭: 제2 던전 장비는 아이템 레벨 100, 소환된 몬스터는 아이템·결정 없음, 보관고 유물도 레벨 100
{
  const stub = { pickup: () => true, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {}, sendChar() {}, save() {} };
  const room = new Room(stub, { id: "t", kind: "dungeon", floor: 3, dungeon: 2, map: makeFloor(3, 7, 1, 2), partySize: 1 });
  assert.equal(room.lvl, effLevel(3, 2));
  for (let k = 0; k < 20; k++) assert.equal(room.rollGear("sword", "normal").ilvl, 100);
  const m = room.spawnMonster("rift_wraith", 300, 300, false, { summoned: true });
  assert.ok(m.summoned);
  let drops = 0; const orig = room.rollDrops; room.rollDrops = () => drops++;
  room.kill(m, null, 1);
  assert.equal(drops, 0);
  room.rollDrops = orig;
  const relic = rollAbyssRelic(Math.random, { ilvl: 100, cls: "sword" });
  assert.equal(relic.ilvl, 100);
}
ok(true, "제2 던전 드롭 레벨 100 · 소환물 드롭 없음 · 유물 레벨 100");

// 기존 마을·안전 구역 생성 경로 회귀 확인.
const town = makeTown();
const safe = safeZone(10, 2);
assert.equal(town.kind, "town");
assert.equal(safe.kind, "safe");
ok(true, "기존 마을 및 제2 던전 안전 구역 회귀 확인");

console.log("DUNGEON2 TESTS: ALL PASS");

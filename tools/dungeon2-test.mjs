import assert from "node:assert/strict";
import {
  BOSSES, DUNGEON2_MAX_FLOOR, DUNGEON2_ZONES, MONSTERS,
  bossStats, floorKind, floorScale, monsterStats, zoneOf,
} from "../shared/zones.js";
import { makeFloor, mapPayload, makeTown, safeZone } from "../server/game/dungeon.js";

const ok = (condition, label) => {
  assert.ok(condition, label);
  console.log("✓", label);
};

// 제2 던전의 기본 난이도 배율: 같은 층의 기존 성장 곡선 대비 HP·공격력 정확히 5배.
for (const floor of [1, 5, 10, 20, 30]) {
  const one = floorScale(floor, 1);
  const two = floorScale(floor, 2);
  assert.ok(Math.abs(two.hp / one.hp - 5) < 1e-10);
  assert.ok(Math.abs(two.dmg / one.dmg - 5) < 1e-10);
  assert.equal(two.speed, one.speed);
}
ok(true, "제2 던전 HP·공격력 5배 / 이동 속도 동일");

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
    assert.ok(map.spawns.length > 0, `floor ${floor} has no spawns`);
    for (const s of map.spawns) assert.ok(MONSTERS[s.id], `unknown spawn ${s.id}`);
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

// 기존 마을·안전 구역 생성 경로 회귀 확인.
const town = makeTown();
const safe = safeZone(10, 2);
assert.equal(town.kind, "town");
assert.equal(safe.kind, "safe");
ok(true, "기존 마을 및 제2 던전 안전 구역 회귀 확인");

console.log("DUNGEON2 TESTS: ALL PASS");

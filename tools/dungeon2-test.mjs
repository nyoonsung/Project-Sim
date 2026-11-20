import assert from "node:assert/strict";
import {
  BOSSES, D1_BOSS_DAMAGE_MULTIPLIER, D1_BOSS_HP_MULTIPLIER,
  D2_EXTREME_MULTIPLIER, DUNGEON2_MAX_FLOOR, DUNGEON2_ZONES, MONSTERS, ZONES,
  bossStats, floorKind, floorScale, monsterStats, zoneOf, effLevel,
} from "../shared/zones.js";
import { CLASS_DMG } from "../shared/stats.js";
import { SKILLS } from "../shared/skills.js";
import { Room } from "../server/game/room.js";
import { rollAbyssRelic } from "../shared/items.js";
import { makeFloor, mapPayload, makeTown, safeZone } from "../server/game/dungeon.js";
import { levelGapXpMultiplier } from "../server/game/room.js";

const ok = (condition, label) => {
  assert.ok(condition, label);
  console.log("✓", label);
};

// 제2 던전 난이도 100배: 기존 제2 던전 배율에 HP·공격력 각각 정확히 ×100 추가.
{
  assert.equal(D2_EXTREME_MULTIPLIER, 100);
  const top = floorScale(100, 1);
  const d1 = floorScale(1, 2), d30 = floorScale(30, 2);
  assert.ok(Math.abs(d1.hp / top.hp - 2.5 * 100) < 1e-7);
  assert.ok(Math.abs(d1.dmg / top.dmg - 1.8 * 100) < 1e-7);
  assert.ok(d30.hp > d1.hp * 1.8 && d30.dmg > d1.dmg * 1.4);
  assert.ok(d1.speed > top.speed);
  assert.equal(effLevel(1, 2), 102); assert.equal(effLevel(30, 2), 150); assert.equal(effLevel(45, 1), 45);
  for (const f of [1, 15, 30]) for (const id of zoneOf(f, 2).monsters) assert.equal(monsterStats(id, f, 1, 2).level, effLevel(f, 2));
  const top1 = monsterStats(zoneOf(100).monsters[0], 100, 1, 1);
  assert.ok(monsterStats(zoneOf(1, 2).monsters[0], 1, 1, 2).hp > top1.hp * 100, "제2 던전 1층 몬스터가 제1 던전 100층보다 극단적으로 단단함");
}
ok(true, "제2 던전 체력·공격력 기존 수치 대비 각각 정확히 100배 / 실제 레벨 102~150");

// 제1 던전의 중간보스·주요 보스만 체력 11배·공격력 10배. 제2 던전에는 이 보정이 섞이지 않는다.
{
  assert.equal(D1_BOSS_HP_MULTIPLIER, 11);
  assert.equal(D1_BOSS_DAMAGE_MULTIPLIER, 10);
  const avgHp = ZONES[0].monsters.reduce((sum, id) => sum + MONSTERS[id].hp, 0) / ZONES[0].monsters.length;
  const avgDmg = ZONES[0].monsters.reduce((sum, id) => sum + MONSTERS[id].dmg, 0) / ZONES[0].monsters.length;
  const scale = floorScale(10, 1);
  const d1Boss = bossStats("skeleton_lord", 10, 1, 1);
  assert.equal(d1Boss.hp, Math.round(avgHp * scale.hp * 64 * 3.5 * 11));
  assert.ok(Math.abs(d1Boss.dmg - avgDmg * scale.dmg * 1.7 * 10) < 1e-7);
  const d2Boss = bossStats("scarlet_regent", 10, 1, 2);
  const d2Scale = floorScale(10, 2);
  assert.equal(d2Boss.hp, Math.round(avgHp * d2Scale.hp * 64 * 3.5));
  assert.ok(Math.abs(d2Boss.dmg - avgDmg * d2Scale.dmg * 1.7) < 1e-7);
}
ok(true, "제1 던전 보스 ×11 HP·×10 공격력 / 제2 던전 보스에는 D1 보정 미적용");

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

// 스탯 산출이 유한한 양수인지 확인.
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

// 직업 피해 배율: 대장장이는 일반 공격·장치 공격의 최종 피해가 0.7배가 된다.
assert.equal(CLASS_DMG.smith, 0.7);
assert.equal(CLASS_DMG.archer, 1.8);
ok(true, "대장장이 피해량 30% 감소");

// 성직자 신규 광역기 4종이 실제 서버 판정용 area 단계·큰 반경·강한 계수를 가진다.
for (const id of ["pr_halo", "pr_sanctum", "pr_radiance", "pr_apocalypse"]) {
  const sk = SKILLS[id];
  assert.ok(sk && sk.cls === "priest", `missing Priest skill ${id}`);
  const area = sk.steps.find((step) => step.do === "area");
  assert.ok(area, `${id} must use server area damage step`);
  assert.ok(area.radius >= 110, `${id} must have large radius`);
  assert.ok(area.pow >= 2.3 && area.max >= 12, `${id} must hit hard and affect multiple targets`);
}
ok(true, "성직자 대형 범위 공격 4종의 스킬 데이터 확인");

// 빈 소환 좌표가 들어와도 대체 지점을 찾아 웨이브가 예약되고, 타이머가 alive count에 반영된다.
{
  const map = makeFloor(1, 13579, 1, 2);
  map.waves.points = [];
  const room = new Room({ clock: 0 }, { id: "empty-points", kind: "dungeon", floor: 1, dungeon: 2, map, partySize: 1 });
  room.players.set(1, { id: 1, dead: false, x: map.start[0], y: map.start[1] });
  assert.doesNotThrow(() => room.tickWaves(3));
  assert.ok(room.wave.spawned > 0, "empty wave points should fall back to safe positions");
  assert.ok(room.timers.some((timer) => timer.spawn), "pending wave spawns should be tracked");
}
ok(true, "빈 웨이브 좌표 대체 및 소환 예약 처리");

// 5마리 이상 멀리 떨어진 몬스터도 모두 구조한다.
{
  const map = makeFloor(1, 24680, 1, 2);
  map.waves.points = [];
  const player = { id: 1, dead: false, ghost: false, x: map.start[0], y: map.start[1] };
  const room = new Room({ clock: 0 }, { id: "stragglers", kind: "dungeon", floor: 1, dungeon: 2, map, partySize: 1 });
  room.players.set(1, player);
  const mobs = [];
  for (let i = 0; i < 6; i++) {
    const m = room.spawnMonster("rift_guard", player.x + 600 + i * 20, player.y + 500, false, { aggro: true });
    mobs.push(m);
  }
  room.rescueStragglers();
  assert.ok(mobs.every((m) => Math.hypot(m.x - player.x, m.y - player.y) < 330), "all six stranded monsters must be moved near the player");
}
ok(true, "6마리 고립 몬스터 구조 처리");

// 제2 던전 적 투사체·구형 공허 탄환에는 상한이 있어 객체가 끝없이 쌓이지 않는다.
{
  const map = makeFloor(10, 112233, 1, 2);
  const room = new Room({ clock: 0 }, { id: "projectile-cap", kind: "dungeon", floor: 10, dungeon: 2, map, partySize: 1 });
  const projectile = (fx) => ({ team: "m", x: 100, y: 100, vx: 100, vy: 0, range: 300, r: 8, fx });
  for (let i = 0; i < 20; i++) room.addProjectile(projectile("shadow/void-orb"));
  assert.equal(room.projectiles.length, 8, "void orb projectiles must cap at eight");
  for (let i = 0; i < 60; i++) room.addProjectile(projectile("projectiles/laser-bolt"));
  assert.equal(room.projectiles.length, 48, "all enemy projectiles must cap at 48");
  assert.equal(room.addProjectile(projectile("shadow/void-orb")), null);
  assert.equal(room.allowAbyssOrbFx(0), true);
  assert.equal(room.allowAbyssOrbFx(0), true);
  assert.equal(room.allowAbyssOrbFx(0), true);
  assert.equal(room.allowAbyssOrbFx(0), false, "ambient void-orb effect must cap at three per second");
  assert.equal(room.allowAbyssOrbFx(1.1), true, "ambient effect budget should reset each second");
}
ok(true, "제2 던전 구형 투사체·순간이동 이펙트 및 적 투사체 상한");

// 기존 마을·안전 구역 생성 경로 회귀 확인.
const town = makeTown();
const safe = safeZone(10, 2);
assert.equal(town.kind, "town");
assert.equal(safe.kind, "safe");
ok(true, "기존 마을 및 제2 던전 안전 구역 회귀 확인");

console.log("DUNGEON2 TESTS: ALL PASS");

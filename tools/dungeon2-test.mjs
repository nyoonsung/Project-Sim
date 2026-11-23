import assert from "node:assert/strict";
import {
  BOSSES, BOSS_DAMAGE_INCREASE_MULTIPLIER, D2_HARD, D1_BOSS_DAMAGE_MULTIPLIER, D1_BOSS_HP_MULTIPLIER, D1_BOSS_HP_REDUCTION,
  D1_FINAL_BOSS_DAMAGE_MULTIPLIER, D2_EXTREME_MULTIPLIER, D2_MONSTER_DAMAGE_MULTIPLIER, D2_MONSTER_STAT_MULTIPLIER, D2_BOSS_STAT_MULTIPLIER, D2_BOSS_HP_REDUCTION, D2_BOSS_SPEED_MULTIPLIER,
  DUNGEON2_MAX_FLOOR, DUNGEON2_ZONES, MONSTERS, ZONES,
  bossStats, floorKind, floorScale, monsterStats, zoneOf, effLevel,
  erdenBossScale,
} from "../shared/zones.js";
import { CLASS_DMG } from "../shared/stats.js";
import { SKILLS } from "../shared/skills.js";
import { Room } from "../server/game/room.js";
import { newCharacter, makePlayerUnit } from "../server/game/player.js";
import { dealDamage } from "../server/game/combat.js";
import { rollAbyssRelic } from "../shared/items.js";
import { makeFloor, mapPayload, makeTown, makeVerdanTown, safeZone } from "../server/game/dungeon.js";
import { levelGapXpMultiplier, unitXpMultiplier } from "../server/game/room.js";
import { World } from "../server/game/world.js";
import { D2_MOB_PATTERN, D2_BOSS_PATTERN, D2_BOSS_SIGNATURES } from "../server/game/ai.js";
import { TILE } from "../shared/constants.js";
import { circleHitsWall } from "../shared/move.js";

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
  assert.ok(d1.speed < top.speed);
  assert.equal(effLevel(1, 2), 102); assert.equal(effLevel(30, 2), 150); assert.equal(effLevel(45, 1), 45);
  for (const f of [1, 15, 30]) for (const id of zoneOf(f, 2).monsters) assert.equal(monsterStats(id, f, 1, 2).level, effLevel(f, 2));
  const top1 = monsterStats(zoneOf(100).monsters[0], 100, 1, 1);
  assert.ok(monsterStats(zoneOf(1, 2).monsters[0], 1, 1, 2).hp > top1.hp * 0.7, "제2 던전 성장 구간은 유지하면서 몬스터 기본 능력치만 완화");
}
ok(true, "제2 던전 체력·공격력 기존 수치 대비 각각 정확히 100배 / 실제 레벨 102~150");

// 제1 던전은 20층 이상 보스 피해량 ×5, 제2 던전은 모든 보스 피해량 ×5. HP 배율은 기존 규칙 유지.
{
  assert.equal(D1_BOSS_HP_MULTIPLIER, 11);
  assert.equal(D1_BOSS_HP_REDUCTION, 0.9);
  assert.equal(D1_BOSS_DAMAGE_MULTIPLIER, 10);
  assert.equal(D1_FINAL_BOSS_DAMAGE_MULTIPLIER, 1.2);
  assert.equal(BOSS_DAMAGE_INCREASE_MULTIPLIER, 5);
  const avgHp = ZONES[0].monsters.reduce((sum, id) => sum + MONSTERS[id].hp, 0) / ZONES[0].monsters.length;
  const avgDmg = ZONES[0].monsters.reduce((sum, id) => sum + MONSTERS[id].dmg, 0) / ZONES[0].monsters.length;
  const soloHpBoost = (floor) => 1 + 2.5 * Math.min(1, Math.max(0, (floor - 1) / 9));
  const E = erdenBossScale;
  // 에르덴 보스 완화: 15층 이하는 그대로, 이후 층·제2 던전은 피해·체력이 줄고, 베르단에는 적용되지 않는다
  assert.deepEqual(E(10, 1), { hp: 1, dmg: 1 });
  assert.ok(E(20, 1).dmg < 0.6 && E(100, 1).dmg < E(50, 1).dmg && E(30, 2).dmg < E(1, 2).dmg);
  assert.equal(E(50, 3).hp, 1); assert.ok(E(50, 3).dmg < 1); assert.deepEqual(E(20, 4), { hp: 1, dmg: 1 }); // 베르단 제1 던전은 피해만 별도 보정, 왕릉은 TOMB_BALANCE
  const d1Boss = bossStats("skeleton_lord", 10, 1, 1);
  assert.equal(d1Boss.hp, Math.round(E(10, 1).hp * avgHp * floorScale(10, 1).hp * 64 * soloHpBoost(10) * 11 * 0.9));
  assert.ok(Math.abs(d1Boss.dmg - E(10, 1).dmg * avgDmg * floorScale(10, 1).dmg * 1.7 * 10) < 1e-7);
  const midBoss = bossStats(zoneOf(5).mid, 5, 1, 1);
  assert.equal(midBoss.hp, Math.round(E(5, 1).hp * avgHp * floorScale(5, 1).hp * 36 * soloHpBoost(5) * 11 * 0.9));
  const finalBoss = bossStats(zoneOf(100).boss, 100, 1, 1);
  assert.equal(finalBoss.hp, Math.round(E(100, 1).hp * avgHp * floorScale(100, 1).hp * 64 * soloHpBoost(100) * 1.5 * 11 * 0.9));
  assert.ok(Math.abs(finalBoss.dmg - E(100, 1).dmg * avgDmg * floorScale(100, 1).dmg * 1.7 * 10 * 1.2 * 5) < 1e-7);
  const d1LateBoss = bossStats(zoneOf(20).boss, 20, 1, 1);
  assert.ok(Math.abs(d1LateBoss.dmg - E(20, 1).dmg * avgDmg * floorScale(20, 1).dmg * 1.7 * 10 * 5) < 1e-7);
  const d1LateMid = bossStats(zoneOf(25).mid, 25, 1, 1);
  assert.ok(Math.abs(d1LateMid.dmg - E(25, 1).dmg * avgDmg * floorScale(25, 1).dmg * 1.5 * 10 * 5) < 1e-7);
  const d2Boss = bossStats("scarlet_regent", 10, 1, 2);
  const d2Scale = floorScale(10, 2);
  assert.equal(D2_BOSS_HP_REDUCTION, 0.5);
  assert.equal(d2Boss.hp, Math.round(E(10, 2).hp * avgHp * d2Scale.hp * 64 * 3.5 * D2_BOSS_STAT_MULTIPLIER * D2_BOSS_HP_REDUCTION));
  assert.ok(Math.abs(d2Boss.dmg - E(10, 2).dmg * avgDmg * d2Scale.dmg * 1.7 * D2_BOSS_STAT_MULTIPLIER * 5) < 1e-7);
  const d2Mid = bossStats(DUNGEON2_ZONES[0].mid, 5, 1, 2);
  const d2MidScale = floorScale(5, 2);
  assert.equal(d2Mid.hp, Math.round(E(5, 2).hp * avgHp * d2MidScale.hp * 36 * 3.5 * D2_BOSS_STAT_MULTIPLIER * D2_BOSS_HP_REDUCTION));
  assert.ok(Math.abs(d2Mid.dmg - E(5, 2).dmg * avgDmg * d2MidScale.dmg * 1.5 * D2_BOSS_STAT_MULTIPLIER * 5) < 1e-7);
  const d2Final = bossStats(DUNGEON2_ZONES[2].boss, 30, 1, 2);
  const d2FinalScale = floorScale(30, 2);
  assert.equal(d2Final.hp, Math.round(E(30, 2).hp * avgHp * d2FinalScale.hp * 64 * 3.5 * 1.5 * D2_BOSS_STAT_MULTIPLIER * D2_BOSS_HP_REDUCTION));
  assert.ok(Math.abs(d2Final.dmg - E(30, 2).dmg * avgDmg * d2FinalScale.dmg * 1.7 * D2_BOSS_STAT_MULTIPLIER * 5) < 1e-7);
}
ok(true, "에르덴 보스 기존 배율 × 에르덴 완화 배율 / 베르단 미적용");

// 구역마다 몬스터 구성이 서로 다름 (예전엔 1구역과 3구역이 똑같았음)
assert.notDeepEqual([...DUNGEON2_ZONES[0].monsters].sort(), [...DUNGEON2_ZONES[2].monsters].sort());
ok(true, "제2 던전 1·3구역 몬스터 구성이 다름");

// 제2 던전에서는 캐릭터 레벨이 층보다 아무리 높아도 레벨 차이 경험치 페널티가 없다.
// 제1 던전은 기존 감소 규칙을 그대로 유지한다.
// 2차 업데이트: 에르덴 제2 던전은 레벨 180부터 경험치 획득량이 줄어든다 (180 → 95%, 레벨당 -5%, 최저 10%).
for (const floor of [1, 10, 30]) {
  assert.equal(levelGapXpMultiplier(179, floor, 2), 1);
  assert.ok(levelGapXpMultiplier(180, floor, 2) < 1 && levelGapXpMultiplier(180, floor, 2) > 0.9);
  assert.equal(levelGapXpMultiplier(250, floor, 2), 0.1);
  assert.equal(levelGapXpMultiplier(floor + 5, floor, 1), 1);
  assert.ok(levelGapXpMultiplier(floor + 6, floor, 1) < 1);
}
// 베르단 던전: 실제 몬스터 레벨(150+층) 기준 6레벨 이상 높으면 감소
assert.equal(levelGapXpMultiplier(155, 1, 3), 1);
assert.ok(levelGapXpMultiplier(200, 1, 3) < 1);
assert.equal(levelGapXpMultiplier(250, 100, 3), 1);
assert.equal(unitXpMultiplier(250, 100, 1, { boss: true, mid: false }), 1, "D1 floor-100 final boss XP must ignore level-gap reduction");
assert.ok(unitXpMultiplier(250, 100, 1, { boss: false }) < 1, "D1 floor-100 normal mobs keep level-gap reduction");
assert.ok(unitXpMultiplier(250, 90, 1, { boss: true, mid: false }) < 1, "other D1 bosses keep level-gap reduction");
ok(true, "제2 던전 및 제1 던전 100층 최종 보스 경험치 레벨 차이 감소 없음");

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

// 제2 던전 일반·정예 몬스터와 보스의 HP·공격력·방어력은 각각 현재 실제 수치의 1/5. 이동속도·경험치는 유지.
{
  assert.equal(D2_MONSTER_DAMAGE_MULTIPLIER, 0.5);
  assert.equal(D2_MONSTER_STAT_MULTIPLIER, 1 / 150);
  assert.equal(D2_BOSS_STAT_MULTIPLIER, 0.2);
  assert.equal(D2_BOSS_SPEED_MULTIPLIER, 0.8);
  const id = DUNGEON2_ZONES[0].monsters[0];
  const def = MONSTERS[id];
  const d2AvgHp = DUNGEON2_ZONES[0].monsters.reduce((sum, mid) => sum + MONSTERS[mid].hp, 0) / DUNGEON2_ZONES[0].monsters.length;
  const d2AvgDmg = DUNGEON2_ZONES[0].monsters.reduce((sum, mid) => sum + MONSTERS[mid].dmg, 0) / DUNGEON2_ZONES[0].monsters.length;
  const d1AvgHp = ZONES[0].monsters.reduce((sum, mid) => sum + MONSTERS[mid].hp, 0) / ZONES[0].monsters.length;
  const d1AvgDmg = ZONES[0].monsters.reduce((sum, mid) => sum + MONSTERS[mid].dmg, 0) / ZONES[0].monsters.length;
  const s = floorScale(1, 2);
  const oldHp = def.hp * (d1AvgHp / d2AvgHp) * s.hp * 3.5;
  const oldDmg = def.dmg * (d1AvgDmg / d2AvgDmg) * s.dmg * D2_MONSTER_DAMAGE_MULTIPLIER;
  const st = monsterStats(id, 1, 1, 2);
  assert.equal(st.hp, Math.round(oldHp / 150));
  assert.ok(Math.abs(st.dmg / oldDmg - 1 / 150) < 1e-10);
  const d1Id = ZONES[0].monsters[0];
  const d1 = monsterStats(d1Id, 1, 1, 1);
  assert.ok(Math.abs(d1.dmg - MONSTERS[d1Id].dmg * floorScale(1, 1).dmg) < 1e-10);
  const room = new Room({ clock: 0 }, { id: "d2-def-scale", kind: "dungeon", floor: 1, dungeon: 2, map: makeFloor(1, 777, 1, 2) });
  const mob = room.spawnMonster(id, room.map.start[0] + 100, room.map.start[1]);
  const oldDef = 2 + room.lvl * 1.6;
  assert.ok(Math.abs(mob.def / oldDef - 1 / 150) < 1e-10);
  assert.equal(mob.speed, def.speed * floorScale(1, 2).speed);
  const d2Boss = bossStats(DUNGEON2_ZONES[0].boss, 10, 1, 2);
  assert.ok(Math.abs(d2Boss.dmg - erdenBossScale(10, 2).dmg * d1AvgDmg * floorScale(10, 2).dmg * 1.7 * 0.2 * 5) < 1e-7);
  assert.ok(d2Boss.hp > 0 && d2Boss.dmg > 0);
  const bossRoom = new Room({ clock: 0 }, { id: "d2-boss-def-scale", kind: "dungeon", floor: 10, dungeon: 2, map: makeFloor(10, 778, 1, 2) });
  const bossUnit = bossRoom.spawnBoss(DUNGEON2_ZONES[0].boss, bossRoom.map.bossAt[0], bossRoom.map.bossAt[1]);
  assert.equal(bossUnit.hp, d2Boss.hp);
  assert.equal(bossUnit.atk, d2Boss.dmg);
  assert.ok(Math.abs(bossUnit.def / (6 + bossRoom.lvl * 2.2) - 0.2) < 1e-10);
  assert.equal(bossUnit.speed, BOSSES[DUNGEON2_ZONES[0].boss].speed * D2_BOSS_SPEED_MULTIPLIER);
}
assert.equal(D2_HARD.speed, 0.88);
ok(true, "제2 던전 몬스터·보스 능력치 1/5 완화와 이동속도 조정 복구");

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
  assert.equal(relic.rarity, "심연");
  assert.equal(relic.abyssEffects?.length, 2);
}
ok(true, "제2 던전 드롭 레벨 100 · 소환물 드롭 없음 · 심연 유물 레벨·효과 100");


// 심연 보관고: 마을 접근, 전용 유물 지급, 재료 차감, 실패 시 명시적 응답.
{
  const town = makeTown();
  const vault = town.objects.find((o) => o.kind === "npc" && o.id === "vault");
  const gate = town.objects.find((o) => o.kind === "npc" && o.id === "gate2");
  assert.ok(vault && gate, "town must contain the Abyss Vault and second-dungeon gate NPCs");

  const canStand = (x, y) => !circleHitsWall(town, x * TILE + TILE / 2, y * TILE + TILE / 2, 9);
  const sx = Math.floor(town.start[0] / TILE), sy = Math.floor(town.start[1] / TILE);
  const tx = Math.floor(vault.x / TILE), ty = Math.floor(vault.y / TILE);
  const queue = [[sx, sy]], visited = new Set([sy * town.w + sx]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy, key = ny * town.w + nx;
      if (nx < 0 || ny < 0 || nx >= town.w || ny >= town.h || visited.has(key) || !canStand(nx, ny)) continue;
      visited.add(key); queue.push([nx, ny]);
    }
  }
  assert.ok(visited.has(ty * town.w + tx), "vault NPC tile must be reachable on foot from town spawn");

  const world = Object.create(World.prototype);
  world.town = { map: town };
  const received = [], packets = [];
  world.pickup = (_unit, item) => { received.push(item); return true; };
  world.save = () => {};
  world.sendChar = () => {};
  const session = {
    char: { cls: "sword", abyssKeys: 1, riftCrystals: 5, inv: [] },
    send: (packet) => packets.push(packet),
    notice: () => {},
  };
  session.unit = { room: world.town, x: town.start[0], y: town.start[1] };
  world.openAbyssVault(session);
  assert.equal(received.length, 1, "one relic should be awarded anywhere in town");
  assert.ok(["일반", "희귀", "영웅", "전설", "심연"].includes(received[0].rarity), "vault reward must be a valid normal-to-abyss item");
  if (received[0].rarity === "심연") {
    assert.ok(received[0].relic != null, "Abyss-rarity vault reward must be a dedicated relic");
    assert.equal(received[0].abyssEffects?.length, 2, "Abyss relic must carry exactly two special effects");
  }
  assert.equal(received[0].ilvl, 100, "vault reward should use item level 100");
  assert.equal(session.char.abyssKeys, 0, "one abyss key should be consumed");
  assert.equal(session.char.riftCrystals, 0, "five rift crystals should be consumed");
  assert.ok(packets.some((p) => p.t === "vaultResult" && p.ok && p.item?.rarity === received[0].rarity), "successful opening must return the awarded item's rarity");

  const failed = {
    char: { cls: "sword", abyssKeys: 1, riftCrystals: 5, inv: [] },
    send: (packet) => packets.push(packet),
    notice: () => {},
  };
  failed.unit = { room: world.town, x: town.start[0], y: town.start[1] };
  world.pickup = () => false;
  world.openAbyssVault(failed);
  assert.equal(failed.char.abyssKeys, 1, "failed pickup must not consume the key");
  assert.equal(failed.char.riftCrystals, 5, "failed pickup must not consume crystals");
  assert.ok(packets.some((p) => p.t === "vaultResult" && !p.ok && p.text.includes("가방")), "failed pickup must return a visible failure result");

  const noKey = {
    char: { cls: "sword", abyssKeys: 0, riftCrystals: 5, inv: [] },
    send: (packet) => packets.push(packet),
    notice: () => {},
  };
  noKey.unit = { room: world.town };
  world.openAbyssVault(noKey);
  assert.ok(packets.some((p) => p.t === "vaultResult" && !p.ok && p.text.includes("열쇠")), "missing key must return a visible failure result");

  const outside = {
    char: { cls: "sword", abyssKeys: 1, riftCrystals: 5, inv: [] },
    send: (packet) => packets.push(packet),
    notice: () => {},
  };
  outside.unit = { room: { map: town }, x: town.start[0], y: town.start[1] };
  world.openAbyssVault(outside);
  assert.equal(received.length, 1, "vault must reject requests outside the town room");
  assert.equal(outside.char.abyssKeys, 1, "out-of-town requests must not consume keys");
  assert.ok(packets.some((p) => p.t === "vaultResult" && !p.ok && p.text.includes("마을")), "out-of-town requests must return a visible failure result");
}

// 현재 직업 피해 배율: 탱커 화력 보강 및 궁수 피해량 20% 상향 반영.
assert.equal(CLASS_DMG.smith, 6.909);
assert.equal(CLASS_DMG.fist, 10.53);
assert.equal(CLASS_DMG.priest, 2.2275);
assert.equal(CLASS_DMG.archer, 0.5985);
assert.equal(CLASS_DMG.rogue, 1.30);
ok(true, "현재 직업 피해 배율 회귀 확인");

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

// 제2 던전 일반 몬스터는 공격 간격·예고 시간을 늘리고 연사·후속 장판을 제거해 쉽게 조정.
assert.ok(D2_MOB_PATTERN.attackRate > 1);
assert.ok(D2_MOB_PATTERN.meleeWindup > 1);
assert.ok(D2_MOB_PATTERN.chargerTelegraph >= 1);
assert.equal(D2_MOB_PATTERN.volleyShots, 1);
assert.equal(D2_MOB_PATTERN.casterFollowPow, 0);
// 제2 던전 보스는 빠른 패턴 교대와 높은 연계 확률을 사용하되, 최소 예고 시간을 보장한다.
assert.ok(D2_BOSS_PATTERN.power > 0.9 && D2_BOSS_PATTERN.telegraph < 1);
assert.ok(D2_BOSS_PATTERN.telegraphMin >= 0.75 && D2_BOSS_PATTERN.countScale >= 0.85);
assert.ok(D2_BOSS_PATTERN.comboPhase2 >= 0.5 && D2_BOSS_PATTERN.comboPhase3 >= 0.75);
assert.ok(D2_BOSS_PATTERN.comboDelay < 0.8);
assert.ok(D2_BOSS_PATTERN.intervalPhase1 < 3.5 && D2_BOSS_PATTERN.intervalPhase3 < 2);
const signatureIds = ["rift_harbinger", "scarlet_regent", "null_archivist", "paradox_engine", "eclipse_warden", "abyss_watcher"];
for (const id of signatureIds) {
  const phases = D2_BOSS_SIGNATURES[id];
  assert.ok(phases?.phase2?.length && phases?.phase3?.length, `${id} must have phase 2 and phase 3 signature patterns`);
  for (const p of [...phases.phase2, ...phases.phase3]) assert.ok(["grid", "nova", "multicharge", "safespot", "chase"].includes(p.type), `unsupported signature pattern ${p.type}`);
}
assert.equal(D2_BOSS_SIGNATURES.rift_harbinger.phase2[0].type, "grid");
assert.equal(D2_BOSS_SIGNATURES.scarlet_regent.phase3[0].type, "safespot");
assert.equal(D2_BOSS_SIGNATURES.null_archivist.phase3[0].type, "chase");
assert.equal(D2_BOSS_SIGNATURES.paradox_engine.phase2[0].type, "multicharge");
assert.equal(D2_BOSS_SIGNATURES.eclipse_warden.phase2[0].type, "nova");
assert.equal(D2_BOSS_SIGNATURES.abyss_watcher.phase3[0].type, "safespot");
ok(true, "제2 던전 보스별 전용 2·3페이즈 패턴 / 공격 연계 강화 값");

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

// 에르덴 훈련 허수아비: 전용 바닥·도보 접근·소품과 겹치지 않는 배치.
const town = makeTown();
const trainingDummy = town.objects.find((o) => o.kind === "dummy");
assert.ok(trainingDummy, "Erden town must contain a training dummy");
assert.deepEqual(
  [Math.floor(trainingDummy.x / TILE), Math.floor(trainingDummy.y / TILE)],
  [10, 22],
  "training dummy must sit on the dedicated training pad",
);
assert.ok(!circleHitsWall(town, trainingDummy.x, trainingDummy.y, 9), "training dummy tile must be walkable");
for (let y = 21; y <= 23; y++) for (let x = 9; x <= 11; x++) {
  assert.equal(town.tiles[y * town.w + x], 9, "training pad must stay clear of random foliage and trees");
}
assert.ok(
  !town.objects.some((o) => o.kind === "prop" && Math.hypot(o.x - trainingDummy.x, o.y - trainingDummy.y) < 48),
  "training dummy must not overlap a decorative prop",
);
{
  const canStand = (x, y) => !circleHitsWall(town, x * TILE + TILE / 2, y * TILE + TILE / 2, 9);
  const sx = Math.floor(town.start[0] / TILE), sy = Math.floor(town.start[1] / TILE);
  const tx = Math.floor(trainingDummy.x / TILE), ty = Math.floor(trainingDummy.y / TILE);
  const queue = [[sx, sy]], visited = new Set([sy * town.w + sx]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy, key = ny * town.w + nx;
      if (nx < 0 || ny < 0 || nx >= town.w || ny >= town.h || visited.has(key) || !canStand(nx, ny)) continue;
      visited.add(key); queue.push([nx, ny]);
    }
  }
  assert.ok(visited.has(ty * town.w + tx), "training dummy must be reachable from the town spawn");
}

// 베르단 섬 훈련 허수아비: 에르덴과 동일하게 전용 돌바닥·도보 접근·장식물 간격 확인.
const verdanTown = makeVerdanTown();
const verdanDummy = verdanTown.objects.find((o) => o.kind === "dummy");
assert.ok(verdanDummy, "Verdan town must contain a training dummy");
assert.deepEqual(
  [Math.floor(verdanDummy.x / TILE), Math.floor(verdanDummy.y / TILE)],
  [10, 12],
  "Verdan training dummy must use the dedicated western training pad",
);
assert.ok(!circleHitsWall(verdanTown, verdanDummy.x, verdanDummy.y, 9), "Verdan training dummy tile must be walkable");
for (let y = 11; y <= 13; y++) for (let x = 9; x <= 11; x++) {
  assert.equal(verdanTown.tiles[y * verdanTown.w + x], 9, "Verdan training pad must stay clear of random foliage and trees");
}
assert.ok(
  !verdanTown.objects.some((o) => o.kind === "prop" && Math.hypot(o.x - verdanDummy.x, o.y - verdanDummy.y) < 48),
  "Verdan training dummy must not overlap a decorative prop",
);
{
  const canStand = (x, y) => !circleHitsWall(verdanTown, x * TILE + TILE / 2, y * TILE + TILE / 2, 9);
  const sx = Math.floor(verdanTown.start[0] / TILE), sy = Math.floor(verdanTown.start[1] / TILE);
  const tx = Math.floor(verdanDummy.x / TILE), ty = Math.floor(verdanDummy.y / TILE);
  const queue = [[sx, sy]], visited = new Set([sy * verdanTown.w + sx]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy, key = ny * verdanTown.w + nx;
      if (nx < 0 || ny < 0 || nx >= verdanTown.w || ny >= verdanTown.h || visited.has(key) || !canStand(nx, ny)) continue;
      visited.add(key); queue.push([nx, ny]);
    }
  }
  assert.ok(visited.has(ty * verdanTown.w + tx), "Verdan training dummy must be reachable from the town spawn");
}
ok(true, "베르단 훈련 허수아비 위치·접근성·장식물 간섭 회귀 확인");

// 공유 마을에서도 훈련 허수아비의 DPS 기록은 플레이어별로 분리되고, G 키 초기화도 본인 기록만 지운다.
{
  const notices = new Map();
  const sessions = new Map();
  const worldStub = { clock: 0, sessions };
  const room = new Room(worldStub, { id: "training-dummy", kind: "town", floor: 0, dungeon: 1, map: town });
  const makeTestPlayer = (userId) => {
    const noteList = [];
    notices.set(userId, noteList);
    const session = {
      userId, name: `tester${userId}`, char: newCharacter(`tester${userId}`),
      send() {}, notice: (message) => noteList.push(message), sendMe() {},
    };
    sessions.set(userId, session);
    const unit = makePlayerUnit(session);
    session.unit = unit;
    room.addPlayer(unit);
    unit.x = trainingDummy.x + (userId === 101 ? -42 : 42);
    unit.y = trainingDummy.y;
    return { session, unit };
  };
  const a = makeTestPlayer(101), b = makeTestPlayer(202);
  const dummy = [...room.units.values()].find((u) => u.dummy);
  assert.ok(dummy?.dpsByPlayer instanceof Map, "dummy must hold per-player DPS records");
  dealDamage(room, a.unit, dummy, { fixed: 100, crit: "none" }, 1);
  dealDamage(room, b.unit, dummy, { fixed: 80, crit: "none" }, 1);
  assert.equal(dummy.dpsByPlayer.get(101)?.total, 100);
  assert.equal(dummy.dpsByPlayer.get(202)?.total, 80);
  const resetWorld = { isTown: (r) => r?.kind === "town" };
  World.prototype.resetDummy.call(resetWorld, a.session);
  assert.equal(dummy.dpsByPlayer.has(101), false, "reset should clear only the requesting player's record");
  assert.equal(dummy.dpsByPlayer.get(202)?.total, 80, "other players' records must remain intact");
  room.tickDummy(dummy, 7);
  assert.ok(!notices.get(101).some((m) => m.startsWith("허수아비 측정:")), "reset player must not receive stale results");
  assert.ok(notices.get(202).some((m) => m.startsWith("허수아비 측정:")), "other player should receive their own DPS result");
  assert.equal(dummy.dpsByPlayer.size, 0);
}
ok(true, "훈련 허수아비 위치·접근성·개인별 DPS·초기화 회귀 확인");

const safe = safeZone(10, 2);
assert.equal(town.kind, "town");
assert.equal(safe.kind, "safe");
ok(true, "기존 마을 및 제2 던전 안전 구역 회귀 확인");

console.log("DUNGEON2 TESTS: ALL PASS");
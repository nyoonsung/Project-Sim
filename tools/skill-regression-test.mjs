import assert from "node:assert/strict";
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats, defaultLoadout, defaultLoadout2, sanitizeChar } from "../server/game/player.js";
import { SKILL_LIST, SKILLS, skillReach, passivesOf } from "../shared/skills.js";
import { CLASS_INFO } from "../shared/classes.js";
import { CLASS_DMG, deriveStats } from "../shared/stats.js";
import { TICK_DT, SKILL_SLOTS } from "../shared/constants.js";
import { moveCircle } from "../shared/move.js";
import { dealDamage } from "../server/game/combat.js";
import { validateClientMessage } from "../server/net.js";

// 12칸 스킬바·기존 세이브 이전·패시브 자동 적용을 검증한다.
assert.equal(SKILL_SLOTS, 12, "스킬바는 12칸이어야 한다.");
assert.equal(validateClientMessage({ t: "cast", slot: 11, ax: 0, ay: 0 }), true, "12번 스킬칸 입력을 허용해야 한다.");
assert.equal(validateClientMessage({ t: "cast", slot: 12, ax: 0, ay: 0 }), false, "13번 스킬칸 입력은 거부해야 한다.");
assert.equal(validateClientMessage({ t: "skills", list: Array(SKILL_SLOTS).fill(null) }), true, "12칸 스킬 설정을 허용해야 한다.");
assert.equal(validateClientMessage({ t: "skills", list: Array(8).fill(null) }), false, "구형 8칸 스킬 설정은 서버 입력으로 받지 않는다.");
for (const cls of ["sword", "fist", "archer", "rogue", "mage", "priest", "smith"]) {
  const ch = newCharacter("LoadoutTest");
  ch.cls = cls;
  ch.level = 250;
  const loadout = defaultLoadout(ch);
  assert.equal(loadout.length, SKILL_SLOTS, `${cls}: 기본 스킬 세트는 12칸이어야 한다.`);
  for (const id of loadout.filter(Boolean)) assert.notEqual(SKILLS[id]?.kind, "passive", `${cls}: 패시브는 장착 칸을 차지하지 않는다.`);
}
{
  const legacy = newCharacter("LegacySkillSave");
  legacy.cls = "sword";
  legacy.level = 120;
  legacy.skills = ["sw_gale", "sw_thrust", "sw_fiveslash", "sw_thunder", "sw_eo_vortex", "sw_eo_bolt", "c_dash", "c_firstaid"];
  const migrated = sanitizeChar(legacy, "LegacySkillSave");
  assert.equal(migrated.skills.length, SKILL_SLOTS, "8칸 저장 데이터는 12칸으로 변환되어야 한다.");
  assert.equal(migrated.skills[0], "sw_gale", "기존 전투 스킬을 보존해야 한다.");
  assert.ok(migrated.skills.includes("c_dash") && migrated.skills.includes("c_firstaid"), "대시와 응급처치를 보존해야 한다.");
}
{
  const smith = newCharacter("PassiveSmith");
  smith.cls = "smith";
  smith.level = 10;
  assert.ok(passivesOf(smith).some((sk) => sk.id === "sm_armor"), "대장장이 중장갑 설계는 해금되면 자동 적용되어야 한다.");
  const stats = deriveStats({ cls: "smith", level: 10, stats: {}, equip: {}, skills: [] });
  assert.equal(stats.maxHp, 701, "중장갑 설계의 HP +10%가 장착 없이 적용되어야 한다.");
  assert.equal(stats.def, 59, "중장갑 설계의 방어 +10%가 장착 없이 적용되어야 한다.");
}
{
  const master = newCharacter("PassiveSwordmaster");
  master.cls = "sword";
  master.cls2 = "swordmaster";
  master.level = 188;
  const passives = passivesOf(master);
  for (const id of ["sg_orthodox", "sg_parryflow"]) assert.ok(passives.some((sk) => sk.id === id), `소드마스터 ${id} 패시브는 등급 레벨 도달 시 자동 적용되어야 한다.`);
  const loadout = defaultLoadout2(master);
  assert.equal(loadout.length, SKILL_SLOTS);
  assert.ok(!loadout.includes("sg_orthodox") && !loadout.includes("sg_parryflow"), "소드마스터 패시브는 스킬칸을 차지하지 않는다.");
}

for (const sk of SKILL_LIST.filter((s) => s.kind === "ultimate")) {
  assert.ok(Number.isFinite(skillReach(sk)) && skillReach(sk) > 0, `${sk.id}: 유효한 자동 사용 사거리가 있어야 한다.`);
}

// 모든 직업의 전설 스킬이 그대로 남아 있고 실제 실행 단계와 쿨타임이 유효한지 확인.
const legendary = SKILL_LIST.filter((s) => s.grade === "전설" && !s.path); // 1차 직업 전설 궁극기 (2차 전직 스킬은 등급제 따로)
const legendaryClasses = new Set(legendary.map((s) => s.cls));
for (const cls of ["sword", "fist", "archer", "rogue", "mage", "priest", "smith"]) {
  assert.ok(legendaryClasses.has(cls), `${cls}: 전설 스킬이 존재해야 한다.`);
}
assert.ok(legendary.length >= 17);
for (const sk of legendary) {
  assert.ok(sk.kind === "ultimate" && sk.cd <= 40, `${sk.id}: 전설 궁극기 쿨타임이 개선되어야 한다.`);
  assert.ok(sk.steps?.length, `${sk.id}: 서버에서 실행할 단계가 있어야 한다.`);
}
assert.equal(SKILLS.sm_fortress.steps.filter((st) => st.do === "buff").length, 1);
assert.equal(SKILLS.ma_resonance.steps[0].copyMul, 0.7);
assert.ok(SKILLS.ro_cut.steps[0].pow >= 1.02);
assert.ok(SKILLS.ro_shadowstep.steps[0].pow >= 2.4);
assert.ok(SKILLS.ro_track.passive.trigger.stack.per >= 0.15);
assert.ok(SKILLS.ro_final.steps.find((st) => st.do === "melee").hits >= 10);
assert.ok(SKILLS.ma_arcane.steps[0].pow >= 1.3);
assert.ok(SKILLS.ma_chain.steps[0].pow >= 2.7);
assert.ok(SKILLS.ma_blizzard.steps[0].ticks >= 8);
assert.equal(SKILLS.ar_rain.fx.area, "arcane/star-fall", "애로우 레인은 화면 전체 날씨 FX를 쓰지 않는다.");
assert.equal(SKILLS.ar_bombard.fx.area, "arcane/star-fall", "화살 폭격도 지정 영역 FX만 사용한다.");
assert.equal(SKILLS.ma_blizzard.fx.area, "ice/blizzard-vortex", "눈보라는 지정 영역 눈보라만 표시한다.");
assert.ok(SKILLS.ar_rain.fx.tickCount >= 4 && SKILLS.ma_blizzard.fx.tickCount >= 3, "광역 스킬은 한 번의 판정 틱마다 다수 낙하 FX를 만든다.");
assert.ok(SKILLS.ma_final.steps.find((st) => st.do === "area").ticks >= 6);
assert.ok(SKILLS.ma_blink.steps.some((st) => st.do === "buff" && st.mods?.dr >= 0.25));
assert.equal(SKILLS.ro_hunt.steps[0].fn, "huntmark");
assert.ok(SKILLS.sm_golem.steps[0].dur >= 16);

// 직업 밸런스 패치 수치와 궁수 광역 스킬 등록을 고정 검증한다.
assert.equal(CLASS_DMG.sword, 1.80, "검사 피해 배율 1.5배 상향");
assert.equal(CLASS_DMG.archer, 0.57, "궁수 현재 피해량에서 20% 상향");
assert.equal(CLASS_INFO.archer.defFinal, 0.5, "궁수 방어력 50% (2차 업데이트 전 조정)");
assert.ok(CLASS_INFO.fist.hpMul >= 1.7 && CLASS_INFO.fist.defMul >= 1.65, "권투사 체력·방어 상향 (2차 업데이트 전 조정)");
assert.equal(CLASS_INFO.archer.hpMul, 0.96);
assert.equal(CLASS_DMG.rogue, 1.30, "도적 피해량 약 20% 하향");
assert.equal(CLASS_DMG.mage, 1.08864, "마법사 피해 배율 1.5배 상향");
assert.equal(CLASS_DMG.priest, 2.025, "성직자 피해 배율 1.5배 상향");
assert.equal(CLASS_INFO.rogue.hpMul, 1.08);
assert.equal(CLASS_INFO.rogue.defMul, 1.0);
assert.equal(CLASS_INFO.rogue.evadeBase, 0.08);
assert.equal(CLASS_INFO.mage.hpMul, 1.18);
assert.equal(CLASS_INFO.mage.defMul, 1.05);
assert.equal(CLASS_INFO.mage.castMul, 1.18);
assert.equal(CLASS_INFO.mage.mpRegenMul, 1.4);
assert.equal(CLASS_INFO.priest.hpMul, 1.24);
assert.equal(CLASS_INFO.priest.defMul, 1.10);
assert.ok(SKILLS.pr_bolt.steps[0].pow >= 0.95);
assert.ok(SKILLS.pr_halo.steps[0].pow >= 3.25);
assert.equal(CLASS_DMG.fist, 8.10, "권투사 탱커 피해량 35% 추가 상향");
assert.equal(CLASS_DMG.smith, 7.35, "대장장이 탱커 피해량 40% 추가 상향");
assert.equal(SKILLS.ar_volley.cls, "archer");
assert.equal(SKILLS.ar_bombard.cls, "archer");
assert.equal(SKILLS.ar_volley.steps[0].count, 9);
assert.equal(SKILLS.ar_bombard.steps[0].ticks, 4);

// 신화 스킬은 7개 직업 모두 전용 역할과 충분한 효과를 갖춰야 한다.
const mythic = SKILL_LIST.filter((s) => s.grade === "신화");
assert.equal(mythic.length, 7, "7개 직업에 신화 궁극기가 하나씩 있어야 한다.");
for (const cls of ["sword", "fist", "archer", "rogue", "mage", "priest", "smith"]) {
  const skill = mythic.find((s) => s.cls === cls);
  assert.ok(skill && skill.kind === "ultimate" && skill.steps?.length >= 2, `${cls}: 강화된 신화 궁극기가 있어야 한다.`);
  assert.ok(skill.cd <= 42, `${skill.id}: 신화 스킬 쿨타임이 개선되어야 한다.`);
}
assert.ok(SKILLS.sw_final.steps[0].length >= 420 && SKILLS.sw_final.steps[0].pow >= 11);
assert.ok(SKILLS.fi_final.steps.find((st) => st.do === "circle").pow >= 8);
assert.ok(SKILLS.ar_final.steps.find((st) => st.do === "area").ticks >= 14);
assert.ok(SKILLS.ro_final.steps.find((st) => st.do === "melee").hits >= 8);
assert.ok(SKILLS.ma_final.steps.find((st) => st.do === "area").ticks >= 5);
assert.ok(SKILLS.pr_final.steps.some((st) => st.do === "heal") && SKILLS.pr_final.steps.some((st) => st.do === "shield"));
assert.ok(SKILLS.sm_final.steps.find((st) => st.do === "shield").pow >= 4);

const expectedRanges = [
  ["sw_flash", 194],
  ["sw_eo_vortex", 96],
  ["sw_final", 420],
  ["fi_final", 295],
  ["ar_final", 550],
  ["ar_volley", 300],
  ["ar_bombard", 406],
  ["ma_final", 550],
  ["pr_final", 455],
  ["sm_final", 430],
];
for (const [id, min] of expectedRanges) {
  assert.ok(skillReach(SKILLS[id]) >= min, `${id}: 실제 광역·돌진 범위가 자동 사용 사거리에 반영돼야 한다.`);
}

// 일섬처럼 빠른 돌진이 한 틱에 적을 지나칠 때도 경로상 적중해야 한다.
const world = {
  pickup: () => true,
  onBossCleared() {},
  usePortal() {},
  partyFailed() {},
  toTown() {},
};
const map = makeFloor(20, 7, 1);
const room = new Room(world, { id: "skill-regression", kind: "dungeon", floor: 20, map });
const ch = newCharacter("SkillTest");
ch.level = 120;
ch.cls = "sword";
ch.skills = ["sw_flash", null, null, null, null, null, null, null];
const session = { userId: 1, role: "player", char: ch, send() {}, notice() {}, sendMe() {} };
const u = makePlayerUnit(session);
session.unit = u;
refreshStats(u);
room.addPlayer(u, map.start);
u.x = map.start[0];
u.y = map.start[1];
u.ki = 100;

const frameDistance = 1400 * TICK_DT;
const hitRadius = 12 + u.r + 6;
assert.ok(frameDistance > hitRadius * 2, "고속 돌진 테스트가 적을 건너뛸 만큼 충분히 빨라야 한다.");
let direction = null;
for (let i = 0; i < 48; i++) {
  const a = (i / 48) * Math.PI * 2;
  const [x, y] = moveCircle(map, u.x, u.y, Math.cos(a) * frameDistance, Math.sin(a) * frameDistance, u.r);
  if (Math.hypot(x - u.x, y - u.y) >= frameDistance - 1) { direction = a; break; }
}
assert.notEqual(direction, null, "테스트용으로 벽에 막히지 않는 돌진 방향을 찾아야 한다.");
const targetDistance = frameDistance / 2;
const target = room.spawnDummy(u.x + Math.cos(direction) * targetDistance, u.y + Math.sin(direction) * targetDistance);
const before = target.hp;
room.cast(u, { slot: 0, ax: u.x + Math.cos(direction) * 240, ay: u.y + Math.sin(direction) * 240 });
assert.ok(u.dash, "전설 스킬 일섬의 돌진이 시작되어야 한다.");
room.tick();
assert.ok(target.hp < before, "고속 돌진 경로에 있는 적에게 피해가 적용되어야 한다.");

// 대장장이는 기본 망치 공격이 아닌 다른 직접 공격으로도 부품을 충전해야 한다.
{
  const smithMap = makeFloor(20, 98765, 1);
  const smithRoom = new Room(world, { id: "smith-parts-regression", kind: "dungeon", floor: 20, map: smithMap });
  const smithCh = newCharacter("SmithTest");
  smithCh.level = 120;
  smithCh.cls = "smith";
  smithCh.skills = ["sm_taunt", null, null, null, null, null, null, null];
  const smithSession = { userId: 2, role: "player", char: smithCh, send() {}, notice() {}, sendMe() {} };
  const smith = makePlayerUnit(smithSession);
  smithSession.unit = smith;
  refreshStats(smith);
  smithRoom.addPlayer(smith, smithMap.start);
  smith.x = smithMap.start[0];
  smith.y = smithMap.start[1];
  smith.parts = 0;
  const nearby = smithRoom.spawnDummy(smith.x + 35, smith.y);
  smithRoom.cast(smith, { slot: 0, ax: nearby.x, ay: nearby.y });
  assert.equal(smith.parts, 1, "모든 대장장이 직접 공격 적중은 부품 1개를 충전해야 한다.");
  assert.ok(smith.session.meDirty, "부품 충전은 HUD 동기화를 예약해야 한다.");
}


 // 파티 레이드: 서로 다른 파티원의 공격이 공유 대상 HP와 모든 파티원의 피해 이벤트에 반영된다.
{
  const partyMap = makeFloor(20, 54321, 3);
  const partyRoom = new Room(world, { id: "party-damage-regression", kind: "dungeon", floor: 20, map: partyMap, partyId: "party-regression", partySize: 3 });
  const makeMember = (id, name) => {
    const char = newCharacter(name);
    char.level = 120;
    char.cls = "archer";
    const outbox = [];
    const session = { userId: id, role: "player", char, outbox, send: (m) => outbox.push(m), notice() {}, sendMe() {} };
    const unit = makePlayerUnit(session);
    session.unit = unit;
    return { session, unit };
  };
  const one = makeMember(9001, "RaidOne");
  const two = makeMember(9002, "RaidTwo");
  const three = makeMember(9003, "RaidThree");
  partyRoom.addPlayer(one.unit, partyMap.start);
  partyRoom.addPlayer(two.unit, [partyMap.start[0] + 20, partyMap.start[1]]);
  // 이전 방 데이터의 중복 ID/잘못된 팀 값도 입장 시 복구한다.
  three.unit.id = one.unit.id;
  three.unit.team = "m";
  three.unit.type = "m";
  partyRoom.addPlayer(three.unit, [partyMap.start[0] + 40, partyMap.start[1]]);
  assert.notEqual(three.unit.id, one.unit.id, "중복 유닛 ID는 파티원을 덮어쓰면 안 된다.");
  assert.equal(three.unit.team, "p");
  assert.equal(three.unit.type, "p");
  assert.equal(partyRoom.players.size, 3);
  assert.ok(partyRoom.units.has(one.unit.id) && partyRoom.units.has(two.unit.id) && partyRoom.units.has(three.unit.id));

  const target = partyRoom.spawnDummy(partyMap.start[0] + 60, partyMap.start[1]);
  const hpBefore = target.hp;
  dealDamage(partyRoom, one.unit, target, { fixed: 125, dot: true }, partyRoom.now);
  dealDamage(partyRoom, two.unit, target, { fixed: 275, dot: true }, partyRoom.now);
  assert.equal(target.hp, hpBefore - 400, "파티원 두 명의 공격이 같은 대상 HP를 각각 감소시켜야 한다.");
  const sourceIds = new Set(partyRoom.events.filter((e) => e.e === "dmg" && e.id === target.id).map((e) => e.b));
  assert.ok(sourceIds.has(one.unit.id) && sourceIds.has(two.unit.id), "피해 이벤트는 공격한 파티원 ID를 보존해야 한다.");

  // 세 번째 파티원은 피해 위치에서 멀어도 레이드 피해 수치를 수신해야 한다.
  three.unit.x = target.x + 1500;
  partyRoom.flush();
  for (const member of [one, two, three]) {
    const snapshot = member.session.outbox.filter((m) => typeof m === "string" && m.startsWith('{"t":"s"')).map((m) => JSON.parse(m)).at(-1);
    assert.ok(snapshot?.v?.some((e) => e.e === "dmg" && e.b === one.unit.id), "모든 파티원에게 첫 번째 공격의 피해 이벤트가 전송되어야 한다.");
    assert.ok(snapshot?.v?.some((e) => e.e === "dmg" && e.b === two.unit.id), "모든 파티원에게 두 번째 공격의 피해 이벤트가 전송되어야 한다.");
  }
}

console.log("직업별 전설·신화 스킬·대장장이 부품 충전·파티 피해 동기화·돌진 판정 테스트 통과");
import assert from "node:assert/strict";
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats } from "../server/game/player.js";
import { SKILL_LIST, SKILLS, skillReach } from "../shared/skills.js";
import { TICK_DT } from "../shared/constants.js";
import { moveCircle } from "../shared/move.js";

for (const sk of SKILL_LIST.filter((s) => s.kind === "ultimate")) {
  assert.ok(Number.isFinite(skillReach(sk)) && skillReach(sk) > 0, `${sk.id}: 유효한 자동 사용 사거리가 있어야 한다.`);
}

// 모든 직업의 전설 스킬이 그대로 남아 있고 실제 실행 단계와 쿨타임이 유효한지 확인.
const legendary = SKILL_LIST.filter((s) => s.grade === "전설");
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
assert.equal(SKILLS.ma_resonance.steps[0].copyMul, 0.55);
assert.equal(SKILLS.ro_hunt.steps[0].fn, "huntmark");
assert.ok(SKILLS.sm_golem.steps[0].dur >= 16);

const expectedRanges = [
  ["sw_flash", 194],
  ["sw_eo_vortex", 96],
  ["sw_final", 340],
  ["fi_final", 250],
  ["ar_final", 460],
  ["pr_final", 400],
  ["sm_final", 345],
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

console.log("직업별 전설 스킬·대장장이 부품 충전·돌진 판정 테스트 통과");
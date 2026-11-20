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
const expectedRanges = [
  ["sw_flash", 194],
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

console.log("직업별 궁극기 자동 사거리 및 고속 돌진 판정 테스트 통과");

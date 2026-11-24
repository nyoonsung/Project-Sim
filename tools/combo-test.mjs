// 검사 연계 회귀: 소드마스터 검식(일섬 → 회전연참 → 쇄도검)이 사이에 다른 스킬(대시·검보·1차 연계기)을 써도 완성되는지
import assert from "node:assert/strict";
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats } from "../server/game/player.js";
import { castSkill } from "../server/game/skills.js";
import { SKILL_SLOTS } from "../shared/constants.js";

function setup() {
  const c = newCharacter("sm"); c.cls = "sword"; c.cls2 = "swordmaster"; c.level = 220;
  c.skills = ["sw_gale", "sg_ilseom", "sg_whirl", "sg_rush", "sg_step", "sw_thrust", "sw_moon", null, null, null, "c_dash", "c_firstaid"];
  const s = { userId: 1, char: c, send() {}, notice() {}, sendMe() {} };
  const u = makePlayerUnit(s); s.unit = u; refreshStats(u);
  const map = makeFloor(1, 7, 1, 1); map.spawns = []; map.waves = null;
  const world = { clock: 0 };
  const room = new Room(world, { id: "combo", kind: "dungeon", floor: 1, map });
  room.addPlayer(u, map.start);
  const d = room.spawnDummy(u.x + 40, u.y); d.hp = d.maxHp = 1e12;
  const msgs = [];
  const cast = (slot) => {
    u.lockUntil = 0; u.ki = 100; u.mp = u.maxMp; u.moveLock = 0; u.casting = null;
    castSkill(room, u, slot, d.x, d.y, null, room.now, room.now + 0.5);
    for (let i = 0; i < 16; i++) { world.clock += 0.05; room.tick(); for (const e of room.events) if (e.e === "msg") msgs.push(e.text); room.events.length = 0; u.x = d.x - 40; u.y = d.y; }
  };
  return { u, cast, msgs, room };
}
{
  const { u, cast, msgs } = setup();
  cast(1); assert.equal(u.seq?.n, 1, "일섬 = 1형");
  cast(10); cast(4); cast(5); cast(0); // 대시 · 검보 · 1차 찌르기 · 평타
  assert.equal(u.seq?.n, 1, "다른 스킬을 써도 검식 흐름 유지");
  cast(2); assert.equal(u.seq?.n, 2, "회전연참 = 2형");
  cast(6); // 1차 연계기
  cast(3);
  assert.ok(msgs.includes("검식 완성!"), "검식 완성");
  assert.ok(u.buffs.has("sg_complete"), "검식 완성 버프");
}
{
  const { u, cast, msgs } = setup();
  cast(1); cast(3); assert.equal(u.seq?.n, 1, "순서가 아닌 형식은 진행시키지 않지만 흐름은 유지");
  u.cds.clear(); cast(2); u.cds.clear(); cast(3); assert.ok(msgs.includes("검식 완성!"), "그대로 이어서 완성");
}
{
  const { u, cast, room } = setup();
  cast(1);
  u.seq.at -= 9; // 형식 사이 8초 초과
  cast(2); assert.equal(u.seq?.n, 0, "8초가 지나면 처음부터");
}
console.log("✓ 소드마스터 검식: 다른 스킬·헛친 형식 사이에도 유지 · 8초 넘으면 초기화");
console.log("COMBO TESTS: ALL PASS");
process.exit(0);

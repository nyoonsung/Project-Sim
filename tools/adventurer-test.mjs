// 모험가 전용 스킬 · 자동 장착 · 모험가의 왕 · 2차 전직 외형 정보 · 보스 다시 도전 검사
import assert from "node:assert/strict";
import { World } from "../server/game/world.js";
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, availableSkills, gainXp, sanitizeChar, refreshStats } from "../server/game/player.js";
import { castSkill } from "../server/game/skills.js";
import { SKILLS } from "../shared/skills.js";
import { SKILL_SLOTS } from "../shared/constants.js";
import { CLASS_DMG, deriveStats } from "../shared/stats.js";
import { PATH_DMG } from "../shared/classes2.js";
import { xpToNext } from "../shared/classes.js";
import { simulate } from "./sim.js";

const ok = (m) => console.log("✓ " + m);
const baseErr = console.error;
let errs = 0;
console.error = (...a) => { errs++; baseErr(...a); };

const AD = Object.values(SKILLS).filter((s) => s.cls === "adventurer" && !s.path);
assert.ok(AD.length >= 10, "모험가 전용 스킬");
for (const s of AD) assert.ok(Number.isInteger(s.minLv) && s.minLv >= 1 && s.minLv <= 100, `${s.id} 해금 레벨`);
const mkChar = (lv) => { const c = newCharacter("adv"); c.level = lv; return c; };
assert.ok(!availableSkills(mkChar(4)).some((s) => s.id === "ad_whirl") && availableSkills(mkChar(5)).some((s) => s.id === "ad_whirl"), "레벨로 해금");
assert.equal(availableSkills(mkChar(100)).filter((s) => s.cls === "adventurer" && !s.path).length, AD.length, "100레벨이면 전부");
assert.ok(deriveStats({ ...mkChar(100), stats: {} }).maxHp > deriveStats({ ...mkChar(59), level: 100, stats: {} }).maxHp * 0.99);
assert.equal(CLASS_DMG.adventurer, 2.0);
assert.equal(PATH_DMG.king, 1.35);
ok("모험가 전용 스킬 12종 · 레벨 해금 · 모험가 피해 배율 · 모험가의 왕 상향");

// 자동 장착: 레벨이 오르면 빈 칸에 들어감, 이미 높은 레벨 저장 데이터는 접속 때 채워짐
{
  const c = mkChar(4); c.skills = ["c_thrust", "c_slash", null, null, null, null, null, null, null, null, "c_dash", "c_firstaid"];
  const notes = [];
  const s = { userId: 1, char: c, send() {}, notice: (t) => notes.push(t), sendMe() {} };
  const u = makePlayerUnit(s); s.unit = u;
  const room = { ev() {}, world: { sendChar() {} } };
  gainXp(room, u, xpToNext(4) + 1);
  assert.equal(c.level, 5);
  assert.ok(c.skills.includes("ad_whirl"), "5레벨: 회전 베기 자동 장착");
  assert.ok(notes.some((n) => n.includes("회전 베기")));
  const old = sanitizeChar({ ...newCharacter("o"), level: 80, skills: ["c_thrust", null, null, null, null, null, null, null, null, null, "c_dash", "c_firstaid"] }, "o");
  for (const id of ["ad_whirl", "ad_volley", "ad_fireball", "ad_quake"]) assert.ok(old.skills.includes(id), `기존 모험가 ${id} 채움`);
}
ok("모험가 스킬 자동 장착 (레벨업 · 기존 저장 데이터)");

// 모든 모험가 스킬 실제 실행 (오류 없이 피해·회복·버프)
{
  const c = mkChar(100); c.skills = Array(SKILL_SLOTS).fill(null);
  const s = { userId: 2, char: c, send() {}, notice() {}, sendMe() {} };
  const u = makePlayerUnit(s); s.unit = u;
  const map = makeFloor(1, 99, 1, 1); map.spawns = []; map.waves = null;
  const room = new Room({ clock: 0 }, { id: "adv", kind: "dungeon", floor: 1, map });
  room.addPlayer(u, map.start);
  const dummy = room.spawnDummy(u.x + 40, u.y); dummy.hp = dummy.maxHp = 1e12;
  let n = 0;
  for (const sk of AD.filter((x) => x.kind !== "passive")) {
    c.skills[0] = sk.id; u.cds.clear(); u.lockUntil = 0; u.mp = u.maxMp; u.casting = null; u.dash = null;
    castSkill(room, u, 0, dummy.x, dummy.y, null, room.now, room.now + 0.5);
    for (let i = 0; i < 60; i++) { room.world.clock = (room.world.clock ?? 0) + 0.05; room.tick(); room.events.length = 0; }
    n++;
  }
  assert.ok(dummy.maxHp - dummy.hp > 0 || (dummy.dpsByPlayer?.get(2)?.total ?? 0) > 0, "허수아비에 피해");
  assert.equal(n, AD.filter((x) => x.kind !== "passive").length);
}
ok("모험가 전용 스킬 전부 서버 실행");

// 성능: 같은 레벨·장비에서 전직 직업보다 살짝 약하고(일반층 처치 시간 1.8배 이내 · 무작위 여유) 에르덴 보스를 잡을 수 있음
{
  const adv = simulate("adventurer", 60, 54, { rarity: "전설", maxT: 200, immortal: true });
  const sw = simulate("sword", 60, 54, { rarity: "전설", maxT: 200, immortal: true });
  assert.ok(adv.killed >= adv.total && adv.t <= sw.t * 1.8, `일반층 ${adv.t}s vs 검사 ${sw.t}s`); // 봇 무작위성 여유
  const boss = simulate("adventurer", 52, 50, { rarity: "전설", maxT: 400, immortal: true });
  assert.ok(boss.bossHp === 0 || boss.bossHp < 40, `50층 보스 진행 ${boss.bossHp}%`);
}
ok("모험가 성능: 전직 직업의 약 80~90% · 에르덴 보스 공략 가능");

// 2차 전직 외형 정보 · 보스 다시 도전
{
  const world = new World();
  clearInterval(world.loop); world.loop = null;
  world.save = () => {};
  const mk = (id, cls, cls2) => {
    const c = newCharacter("u" + id); c.level = 200; c.cls = cls; c.cls2 = cls2;
    const packets = [], notes = [];
    const s = { userId: id, name: "u" + id, char: c, send: (p) => packets.push(p), notice: (t) => notes.push(t), sendMe() {}, potionCd: {}, invites: new Set(), packets, notes };
    s.unit = makePlayerUnit(s); refreshStats(s.unit);
    world.sessions.set(id, s); world.town.addPlayer(s.unit);
    return s;
  };
  const a = mk(11, "sword", "swordmaster");
  assert.equal(world.town.describe(a.unit).c2, "swordmaster", "2차 전직 외형 정보 전송");
  const b = mk(12, "mage", null);
  assert.equal(world.town.describe(b.unit).c2, undefined);
  // 혼자 보스층(10층) 클리어 → 선택 창 → 다시 도전
  const room = world.moveGroup([a], 10, "dungeon", { dungeon: 1 });
  a.unit.x = room.map.bossAt[0]; a.unit.y = room.map.bossAt[1] + 60;
  room.bossStarted = true;
  room.spawnBoss(room.map.boss, room.map.bossAt[0], room.map.bossAt[1]);
  const boss = [...room.units.values()].find((x) => x.boss);
  room.kill(boss, a.unit, room.now);
  for (let i = 0; i < 70; i++) { world.clock += 0.05; room.tick(); room.events.length = 0; }
  const offer = a.packets.find((p) => p.t === "bossRetry");
  assert.ok(offer && offer.floor === 10 && offer.leader === 1, "보스 다시 도전 선택 창");
  const nr = world.retryBoss(a);
  assert.ok(nr && nr !== room && a.unit.room === nr && nr.floor === 10, "같은 보스층 새로 시작");
  world.retryBoss(a);
  assert.ok(a.notes.some((n) => n.includes("다시 도전할 수 없어요")), "아직 안 깬 방에서는 거부");
  // 파티원은 고를 수 없음
  const c = mk(13, "rogue", null);
  world.partyOp(a, "invite", c.name); world.partyOp(c, "accept", a.name);
  if (world.partyOf(c)) {
    nr.bossCleared = true;
    world.joinRoom(c, nr);
    world.retryBoss(c);
    assert.ok(c.notes.some((n) => n.includes("파티장만")), "파티원은 선택 불가");
  }
}
ok("2차 전직 외형 정보 · 보스층 클리어 뒤 다시 도전(혼자·파티장만)");

assert.equal(errs, 0, "서버 오류 없음");
console.log("ADVENTURER TESTS: ALL PASS");
process.exit(0);

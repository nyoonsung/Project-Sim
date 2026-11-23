// 2차 업데이트 검사: 레벨 250·경험치 곡선, 2차 전직 17경로 × 9스킬 실제 실행, 베르단 던전 생성·보스 패턴,
// 드롭 확률, 베르단 수식어, 섬 이동·2차 전직·제작·250 보상 흐름
import assert from "node:assert/strict";
import { Room } from "../server/game/room.js";
import { makeFloor, makeVerdanTown, makeTown } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats, availableSkills, sanitizeChar, gainXp } from "../server/game/player.js";
import { SKILL_LIST, SKILLS } from "../shared/skills.js";
import { PATHS, TIER_LEVEL, CLASS2_LEVEL, pathsFor } from "../shared/classes2.js";
import { CLASS_INFO, xpToNext } from "../shared/classes.js";
import { MAX_LEVEL, SKILL_SLOTS } from "../shared/constants.js";
import { deriveStats, CLASS_DMG } from "../shared/stats.js";
import { MONSTERS, BOSSES, zoneOf, floorKind, monsterStats, bossStats, DUNGEONS, VERDAN_ZONES, TOMB_ZONES, effLevel, TOMB_BALANCE, erdenBossScale } from "../shared/zones.js";
import { TOMB_BOSS_PATTERN } from "../server/game/ai.js";
import { rollVerdanItem, VMODS, gearTotals, makeClassRelic, canEquip, craftVerdanItem, VMATS, RARITIES } from "../shared/items.js";
import { simulate } from "./sim.js";

const ok = (msg) => console.log("✓ " + msg);
// 방 틱 안의 예외는 console.error로만 찍히므로 전체 테스트 동안 세어서 0이어야 통과
const baseErr = console.error;
let allErrs = 0;
console.error = (...a) => { allErrs++; baseErr(...a); };
let seed = 12345;
const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ── 레벨·경험치
assert.equal(MAX_LEVEL, 250);
assert.ok(xpToNext(210) / xpToNext(209) > 1.09, "210레벨부터 필요 경험치가 더 가파르게");
assert.ok(xpToNext(249) / ((130 + 12 * 249) * Math.pow(1.045, 248)) > 6.5, "249레벨은 기본 곡선의 약 7배");
assert.equal(sanitizeChar({ ...newCharacter("a"), level: 300 }, "a").level, 250);
ok("레벨 상한 250 · 210부터 레벨업 둔화");

// ── 사전 밸런스
assert.equal(CLASS_DMG.archer, 0.57);
{
  const a = deriveStats({ cls: "archer", level: 100, stats: {}, equip: {}, skills: [] });
  const b = Math.round(((5 + 2.2 * 100) * 0.9) * 1.2 * 0.5);
  assert.ok(Math.abs(a.def - b) <= 2, `궁수 방어 50%: ${a.def} ≈ ${b}`);
  const f = deriveStats({ cls: "fist", level: 100, stats: {}, equip: {}, skills: [] });
  const s = deriveStats({ cls: "sword", level: 100, stats: {}, equip: {}, skills: [] });
  assert.ok(f.maxHp > s.maxHp * 1.25 && f.def > s.def * 1.2, "권투사 체력·방어가 검사보다 유의미하게 높음");
}
ok("궁수 방어·딜 50%, 권투사 체력·방어 상향");

// ── 2차 전직 데이터
assert.equal(Object.keys(PATHS).length, 17);
for (const cls of ["sword", "fist", "archer", "rogue", "mage", "priest", "smith", "adventurer"]) assert.ok(pathsFor(cls).length >= 1, cls);
const pathSkills = SKILL_LIST.filter((s) => s.path);
assert.equal(pathSkills.length, 17 * 9);
for (const p of Object.keys(PATHS)) {
  const list = pathSkills.filter((s) => s.path === p).sort((a, b) => b.tier - a.tier);
  assert.deepEqual(list.map((s) => s.tier), [9, 8, 7, 6, 5, 4, 3, 2, 1], p);
  for (const s of list) { assert.equal(s.cls, PATHS[p].base, s.id); assert.ok(s.desc && s.name, s.id); }
}
{
  const ch = newCharacter("x"); ch.cls = "sword"; ch.cls2 = "darkknight";
  ch.level = 169; assert.equal(availableSkills(ch).filter((s) => s.path).length, 0);
  ch.level = 170; assert.deepEqual(availableSkills(ch).filter((s) => s.path).map((s) => s.tier), [9]);
  ch.level = 200; assert.equal(availableSkills(ch).filter((s) => s.path).length, 6);
  ch.level = 218; assert.equal(availableSkills(ch).filter((s) => s.path).length, 9);
  const base = deriveStats({ ...ch, cls2: null }), two = deriveStats(ch);
  assert.ok(Math.abs(two.atk / base.atk - 2) < 0.01 && Math.abs(two.maxHp / base.maxHp - 2) < 0.01, "2차 전직 공격력·HP 2배");
}
ok("2차 전직 17경로 × 9등급(170~218) · 2배 강화");

// ── 2차 전직 스킬 실제 실행 (모든 경로·모든 스킬)
const stub = { pickup: () => true, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {}, sendChar() {}, save() {} };
let used = 0;
for (const [path, P] of Object.entries(PATHS)) {
  const list = pathSkills.filter((s) => s.path === path);
  const map = makeFloor(20, 7, 1, 3);
  const room = new Room(stub, { id: "u2", kind: "dungeon", floor: 20, dungeon: 3, map });
  const ch = newCharacter("t"); ch.level = 250; ch.cls = P.base; ch.cls2 = path; ch.cleared = true;
  const sess = { userId: 1, role: "player", char: ch, send() {}, notice() {}, sendMe() {} };
  const u = makePlayerUnit(sess); sess.unit = u; refreshStats(u); u.hp = u.maxHp;
  room.addPlayer(u);
  for (let k = 0; k < 8; k++) room.spawnMonster(zoneOf(20, 3).monsters[k % 5], u.x + 50 + k * 8, u.y - 20 + (k % 3) * 18, false, { aggro: true });
  room.spawnBoss(zoneOf(20, 3).boss, u.x + 90, u.y);
  for (let i = 0; i < list.length; i += SKILL_SLOTS) {
    ch.skills = list.slice(i, i + SKILL_SLOTS).filter((s) => s.kind !== "passive").map((s) => s.id);
    while (ch.skills.length < SKILL_SLOTS) ch.skills.push(null);
    refreshStats(u);
    for (let s = 0; s < SKILL_SLOTS; s++) {
      const sk = SKILLS[ch.skills[s]];
      if (!sk || sk.kind === "passive") continue;
      u.mp = u.maxMp; u.ki = 100; u.holy = 100; u.parts = 3; u.gap = 3; u.r2 = 100; u.lockUntil = 0; u.cds.clear(); u.casting = null; u.dash = null; u.channel = null; u.moveLock = 0;
      u.status.clear(); u.hp = u.maxHp;
      const foes = [...room.units.values()].filter((m) => m.team === "m" && !m.dead);
      for (const m of foes) { m.hp = m.maxHp; m.x = u.x + 60 + (m.id % 5) * 6; m.y = u.y + ((m.id % 3) - 1) * 14; m.status.set("curse", { until: room.now + 30, v: 0, pow: 0, next: room.now + 99 }); m.status.set("poison", { until: room.now + 30, v: 0, pow: 0.3, src: u.id, srcAtk: u.stats.atk, next: room.now + 1 }); }
      const before = foes.reduce((a, m) => a + m.hp, 0);
      const t = foes[0];
      room.cast(u, { slot: s, ax: t.x, ay: t.y, tx: u.id });
      for (let k = 0; k < 120; k++) { room.pushInput(u, { s: k, mx: 0, my: 0, ax: t.x, ay: t.y }); room.tick(); }
      const after = [...room.units.values()].filter((m) => m.team === "m").reduce((a, m) => a + Math.max(0, m.hp), 0);
      const dealsDamage = JSON.stringify(sk.steps).includes('"pow"') && !["vj_guardtaunt", "dk_duskveil", "ht_doom", "kg_aid", "as_shroud", "me_barricade"].includes(sk.id);
      if (dealsDamage) assert.ok(after < before, `${sk.id}: 실제로 피해를 줘야 함`);
      if (u.dead) { u.dead = false; u.hp = u.maxHp; }
      used++;
    }
  }
}
ok(`2차 전직 액티브 스킬 ${used}개 실제 실행·피해 확인`);

// ── 베르단 던전 데이터·생성
assert.equal(DUNGEONS[3].max, 100); assert.equal(DUNGEONS[4].max, 30);
assert.equal(VERDAN_ZONES.length, 10); assert.equal(TOMB_ZONES.length, 3);
for (const z of [...VERDAN_ZONES, ...TOMB_ZONES]) {
  for (const id of z.monsters) assert.ok(MONSTERS[id], `${z.name}: ${id}`);
  assert.ok(BOSSES[z.mid]?.mid, `${z.name} 중간보스`); assert.ok(BOSSES[z.boss] && !BOSSES[z.boss].mid, `${z.name} 주요 보스`);
}
for (const [d, max] of [[3, 100], [4, 30]]) for (let f = 1; f <= max; f++) {
  const m = makeFloor(f, 99 + f, 1, d);
  const k = floorKind(f);
  if (k === "normal") {
    if (d === 4) assert.ok(m.waves.total >= 60 && m.waves.total <= 92, `D${d} ${f}층 완화 웨이브`);
    else assert.ok(m.waves.total >= 90, `D${d} ${f}층 웨이브`);
  } else assert.ok(BOSSES[m.boss], `D${d} ${f}층 보스`);
  if (d === 4 && f <= 10 && k === "normal") assert.ok(m.objects.some((o) => o.kind === "sarco"), "지하왕릉 석관");
}
// 난이도: 베르단 제1 던전 성장과 에르덴 제2 던전 기준, 왕릉은 220레벨 풀세팅 목표
const avgMob = (d, f) => { const z = zoneOf(f, d); return z.monsters.reduce((a, id) => a + monsterStats(id, f, 1, d).hp, 0) / z.monsters.length; };
assert.ok(avgMob(3, 1) > avgMob(2, 29) * 1.15);
assert.ok(avgMob(4, 30) < avgMob(3, 99) * 0.4, "왕릉 일반 몬스터 HP는 베르단 제1 던전 후반보다 낮음");
assert.ok(bossStats("vb_rust_hunter", 5, 1, 3).hp > bossStats("rift_harbinger", 5, 1, 2).hp);
assert.ok(bossStats("tb_memory_king", 30, 1, 4).hp < bossStats("vb_island_heart", 100, 1, 3).hp * 0.15, "왕릉 최종 보스 HP 대폭 하향");
// 베르단 제1 던전 보스 피해 보정(VERDAN_BOSS_DMG) 이전 기준값과 비교
assert.ok(bossStats("tb_memory_king", 30, 1, 4).dmg < (bossStats("vb_island_heart", 100, 1, 3).dmg / erdenBossScale(100, 3).dmg) * 0.05, "왕릉 최종 보스 공격력 대폭 하향");
assert.ok(erdenBossScale(10, 3).dmg < 0.25 && erdenBossScale(100, 3).dmg < erdenBossScale(10, 3).dmg && erdenBossScale(50, 3).hp === 1, "베르단 제1 던전 보스 피해 보정");
assert.equal(effLevel(1, 3), 151); assert.equal(effLevel(100, 3), 250);
assert.equal(effLevel(1, 4), 191); assert.equal(effLevel(30, 4), 220);
assert.equal(TOMB_BALANCE.monsterHp, 0.28);
assert.equal(TOMB_BALANCE.monsterDamage, 0.60);
assert.equal(TOMB_BALANCE.bossHp, 0.04);
assert.equal(TOMB_BALANCE.bossDamage, 0.02);
assert.equal(TOMB_BOSS_PATTERN.power, 0.68);
assert.equal(TOMB_BOSS_PATTERN.telegraph, 1.2);
assert.equal(TOMB_BOSS_PATTERN.countScale, 0.72);
assert.equal(TOMB_BOSS_PATTERN.comboPhase2, 0.18);
assert.equal(TOMB_BOSS_PATTERN.comboPhase3, 0.28);
assert.deepEqual(
  [TOMB_BOSS_PATTERN.intervalPhase1, TOMB_BOSS_PATTERN.intervalPhase2, TOMB_BOSS_PATTERN.intervalPhase3],
  [4.4, 3.7, 3.0],
);
ok("베르단 제1 던전 100층 · 왕릉 30층 · Lv.191~220 완화 난이도 검증");

// ── 보스 패턴: 26 보스 모두 실제로 패턴을 쓰고 오류 없음
const used2 = new Set();
const origErr = console.error;
let errs = 0;
console.error = (...a) => { errs++; origErr(...a); };
for (const [d, max] of [[3, 100], [4, 30]]) for (let f = 5; f <= max; f += 5) {
  const r = simulate("sword", d === 3 ? 160 + f : 220, f, { dungeon: d, rarity: "전설", maxT: 50, immortal: true, cls2: "swordmaster" });
  assert.ok(r.bossHp != null, `D${d} ${f}층 보스와 전투`);
  assert.ok(r.dmgTaken > 0, `D${d} ${f}층 보스가 공격함`);
}
console.error = origErr;
assert.equal(errs, 0, "보스 전투 중 서버 오류 없음");
assert.equal(allErrs, 0, "스킬·보스 실행 중 서버 오류 없음");
for (const id of Object.keys(BOSSES).filter((k) => k.startsWith("vb_") || k.startsWith("tb_"))) for (const p of BOSSES[id].patterns) used2.add(p.type);
for (const t of ["trackbomb", "fakesafe", "seq", "flood", "cracks", "roots", "pylons", "replay", "darkness", "safemove"]) assert.ok(used2.has(t), t);
ok("베르단 보스 26종 전투 실행 (추적 폭발·가짜 안전지대·회전광선+낙하·수위·균열·뿌리·전류·잔상·암흑·이동 안전지대)");

// ── 드롭 확률 (전설 3.5 · 신화 1.5 · 심연 0.5)
{
  const N = 200_000, cnt = {};
  for (let i = 0; i < N; i++) { const it = rollVerdanItem(R, { ilvl: 200, cls: "sword", tier: "normal" }); cnt[it.rarity] = (cnt[it.rarity] ?? 0) + 1; }
  const p = (r) => ((cnt[r] ?? 0) / N) * 100;
  assert.ok(Math.abs(p("전설") - 3.5) < 0.2, `전설 ${p("전설")}`);
  assert.ok(Math.abs(p("신화") - 1.5) < 0.15, `신화 ${p("신화")}`);
  assert.ok(Math.abs(p("심연") - 0.5) < 0.08, `심연 ${p("심연")}`);
}
ok("베르단 등급 확률 전설 3.5% · 신화 1.5% · 심연 0.5%");

// ── 수식어·제작·250 보상
{
  const it = craftVerdanItem(R, { slot: "weapon", vmod: "vm_glassblade", tier: 4, cls: "mage", level: 250 });
  assert.ok(it && it.slot === "weapon" && it.type === "staff" && it.rarity === "전설" && it.ilvl === 250 && it.opts.some((o) => o.k === "vm_glassblade"));
  const t = gearTotals({ weapon: it });
  assert.ok(t.vmods.vm_glassblade > 0 && t.critDmg > 0 && t.defPct < 0);
  const m = craftVerdanItem(R, { slot: "armor", vmod: "vm_trench", tier: 0, cls: "smith", level: 250, heart: true });
  assert.ok(m.rarity === "신화" && m.mythic && m.ilvl === 170);
  for (const k of Object.keys(VMODS)) assert.ok(VMODS[k].zone >= 1 && VMODS[k].zone <= 10 && VMODS[k].desc(VMODS[k].roll(R)));
  for (const cls of Object.keys(CLASS_INFO)) { const r = makeClassRelic(cls, 250); assert.ok(r && r.rarity === "심연" && canEquip(r, cls), cls); }
}
ok("베르단 수식어 10종 · 공방 제작(전설/신화) · 레벨 250 직업 전용 아이템");

// ── 마을·섬 이동·2차 전직·제작·250 보상 흐름 (월드)
{
  const { World } = await import("../server/game/world.js");
  const world = new World();
  clearInterval(world.loop); world.loop = null;
  world.save = () => {}; world.saveSoon = () => {};
  const mk = (id, lv) => {
    const c = newCharacter("u" + id); c.level = lv; c.cls = "sword";
    const notes = [], packets = [];
    const s = { userId: id, name: "u" + id, char: c, send: (p) => packets.push(p), notice: (t) => notes.push(t), sendMe() {}, potionCd: {}, invites: new Set(), notes, packets };
    s.unit = makePlayerUnit(s);
    world.sessions.set(id, s);
    world.town.addPlayer(s.unit);
    return s;
  };
  const npcAt = (room, id) => room.map.objects.find((o) => o.kind === "npc" && o.id === id);
  const s = mk(9001, 160);
  const boat = npcAt(world.town, "boatman");
  assert.ok(boat, "에르덴 선착장 뱃사공");
  s.unit.x = boat.x; s.unit.y = boat.y + 10;
  world.travelBoat(s);
  assert.equal(s.unit.room, world.town, "공물 없으면 못 건넘");
  const abyss = rollVerdanItem(() => 0.9999, { ilvl: 150, cls: "sword" });
  assert.equal(abyss.rarity, "심연");
  abyss.uid = s.char.nextUid++; s.char.inv.push(abyss);
  world.travelBoat(s);
  assert.ok(s.packets.some((p) => p.t === "boatAsk"), "공물 확인 요청");
  world.travelBoat(s, "pay");
  assert.equal(s.unit.room, world.town2, "베르단 마을 도착");
  assert.ok(s.char.verdanPass && s.char.island === "verdan" && !s.char.inv.includes(abyss), "공물 소모·입도 기록");
  // 2차 전직: 170 미만 거부 → 170에서 성공
  const hall = npcAt(world.town2, "class2_master");
  s.unit.x = hall.x; s.unit.y = hall.y + 10;
  world.changeClass2(s, "darkknight");
  assert.equal(s.char.cls2, null);
  s.char.level = 170; world.changeClass2(s, "darkknight");
  assert.equal(s.char.cls2, "darkknight");
  assert.ok(s.char.skills.includes("dk_darkslash"));
  // 제작
  const forge = npcAt(world.town2, "vforge");
  s.unit.x = forge.x; s.unit.y = forge.y + 10;
  s.char.mats.m_erosion = 30; s.char.sigils[1] = 1; s.char.gold = 1e6;
  const n0 = s.char.inv.length;
  world.craft(s, { slot: "helmet", vmod: "vm_erosion", tier: 0 });
  assert.equal(s.char.inv.length, n0 + 1, "제작 성공");
  assert.equal(s.char.mats.m_erosion, 0); assert.equal(s.char.sigils[1], 0);
  // 마을 귀환은 베르단 마을로, 베르단 제1 던전 입장
  world.enterDungeon(s, 1, 3);
  assert.equal(s.unit.room.dungeon, 3);
  world.toTown(s);
  assert.equal(s.unit.room, world.town2);
  world.enterDungeon(s, 1, 4);
  assert.equal(s.unit.room, world.town2, "지하왕릉은 베르단 100층 돌파 후");
  world.enterDungeon(s, 1, 1);
  assert.equal(s.unit.room, world.town2, "에르덴 던전은 에르덴 섬에서만");
  // 250 보상
  s.char.level = 249; s.char.xp = xpToNext(249) - 1;
  gainXp(s.unit.room ?? world.town2, s.unit, 10);
  assert.equal(s.char.level, 250);
  assert.ok(s.char.reward250 && s.char.inv.some((it) => it.relic === "class250"), "레벨 250 직업 전용 아이템");
  // 돌아가는 배
  const b2 = npcAt(world.town2, "boatman2");
  s.unit.x = b2.x; s.unit.y = b2.y + 10;
  world.travelBoat(s);
  assert.equal(s.unit.room, world.town);
  assert.equal(s.char.island, "erden");
  for (const r of world.rooms.values()) r.timers = [];
}
ok("선착장 → 베르단 입도(Lv.150+심연 공물 1회) · 2차 전직소 · 공방 제작 · 던전 입장 조건 · 250 보상 · 귀환");

// 세이브 호환: 옛 캐릭터도 새 필드가 채워지고, 잘못된 2차 전직은 지워짐
{
  const old = { name: "o", level: 120, cls: "mage", cls2: "darkknight", island: "verdan" };
  const c = sanitizeChar(old, "o");
  assert.equal(c.cls2, null); assert.equal(c.island, "erden"); assert.equal(c.best3, 0); assert.ok(c.mats && c.sigils);
}
ok("세이브 호환");

console.log("UPDATE 2 TESTS: ALL PASS");
process.exit(0);

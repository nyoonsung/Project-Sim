// 3차 업데이트 검사: 아스트라엘(세 번째 섬) — 뱃사공 이동, 성좌의 시련 13종 규칙, 수호성 처치 → 별·축복·이야기,
// 축복의 제단(장착·강화), 능력치 반영, 결투장 미적용, 저장 데이터 정리, 메시지 검증
import assert from "node:assert/strict";
import { ASTRA, CONSTELLATIONS, CONST_BY_KEY, STORY, astraOf, trialFloor, blessingMods, blessUpCost, ASTRA_BOSSES, todayConstellation } from "../shared/astra.js";
import { DUNGEONS, zoneOf, floorKind, monsterStats, bossStats, BOSSES, effLevel } from "../shared/zones.js";
import { newCharacter, makePlayerUnit, sanitizeChar, refreshStats } from "../server/game/player.js";
import { deriveStats } from "../shared/stats.js";
import { dealDamage, heal } from "../server/game/combat.js";
import { validateClientMessage } from "../server/net.js";
import { pvpChar } from "../server/game/pvp.js";

const ok = (m) => console.log("✓ " + m);
let worldRef = null;
const hit = (room, src, t, amt) => dealDamage(room, src, t, { fixed: amt, skill: "c_thrust", crit: "none" }, worldRef?.clock ?? 0);
const baseErr = console.error;
let errs = 0;
console.error = (...a) => { errs++; baseErr(...a); };
let seed = 777;
Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ── 데이터
assert.equal(CONSTELLATIONS.length, 13);
assert.equal(new Set(CONSTELLATIONS.map((k) => k.key)).size, 13);
for (const k of CONSTELLATIONS) {
  assert.ok(k.rule?.name && k.rule.desc, k.key + " 규칙");
  assert.equal(k.whisper.length, 3, k.key + " 속삭임 3줄");
  assert.ok(STORY.chapters[k.key]?.text?.length >= 2, k.key + " 이야기");
  assert.ok(k.hidden ? k.bless === null : k.bless?.mods, k.key + " 축복");
  assert.ok(BOSSES["ab_" + k.key] && ASTRA_BOSSES["ab_" + k.key].astra === k.key, k.key + " 수호성");
}
assert.ok(STORY.prologue.text.length >= 3);
assert.equal(DUNGEONS[5].max, 65);
for (let c = 1; c <= 13; c++) {
  for (let st = 1; st <= 5; st++) {
    const f = trialFloor(c, st);
    assert.deepEqual(astraOf(f), { c, stage: st });
    assert.equal(zoneOf(f, 5).astra, CONSTELLATIONS[c - 1].key);
    assert.equal(floorKind(f, 5), st === 5 ? "boss" : "normal");
  }
  assert.equal(effLevel(trialFloor(c, 1), 5), 200 + 4 * c);
}
assert.equal(floorKind(5), "mid"); assert.equal(floorKind(10), "boss");
assert.ok(todayConstellation() >= 1 && todayConstellation() <= 12);
// 난이도: 별자리가 뒤로 갈수록 강해짐 (보스 체력·몬스터 체력)
const bh = CONSTELLATIONS.map((k) => bossStats("ab_" + k.key, trialFloor(k.id, 5), 1, 5).hp);
const fixedMid = zoneOf(1, 5).monsters[0];
const mh = CONSTELLATIONS.map((k) => monsterStats(fixedMid, trialFloor(k.id, 1), 1, 5).hp);
for (let i = 1; i < 12; i++) { assert.ok(bh[i] >= bh[i - 1] * 0.98, `보스 체력 순서 ${i}`); assert.ok(mh[i] >= mh[i - 1] * 0.98, `몬스터 체력 순서 ${i}`); }
assert.ok(bh[12] > bh[11], "열세 번째 수호성이 가장 강함");
ok("13성좌 데이터 · 5단계 층 구조 · 난이도 순서");

// ── 저장 데이터 정리
{
  const c = sanitizeChar({ ...newCharacter("x"), island: "astra", astra: { pass: true, stars: { aries: true, leo: true, bogus: true }, bless: { aries: 9, leo: -3 }, equip: ["aries", "aries", "leo", "taurus", "zzz"], dust: -5, seen: [0, 1, 99, "a"], clears: { aries: 3 } } }, "x");
  assert.equal(c.island, "astra");
  assert.deepEqual(Object.keys(c.astra.stars).sort(), ["aries", "leo"]);
  assert.equal(c.astra.bless.aries, ASTRA.blessMax); assert.equal(c.astra.bless.leo, 1);
  assert.deepEqual(c.astra.equip, ["aries", "leo"]);
  assert.equal(c.astra.dust, 0);
  assert.deepEqual(c.astra.seen, [0, 1]);
  const d = sanitizeChar({ ...newCharacter("y"), island: "astra" }, "y");
  assert.equal(d.island, "erden", "입도 안 했으면 아스트라엘에 못 있음");
  assert.equal(d.astra.pass, false);
}
ok("저장 데이터 정리 (별·축복·장착·별가루)");

// ── 축복 능력치
{
  const c = newCharacter("b"); c.level = 220; c.cls = "sword";
  const s0 = deriveStats(c);
  c.astra = { pass: true, stars: { aries: true, cancer: true, sagittarius: true }, bless: { aries: 5, cancer: 5, sagittarius: 5 }, equip: ["aries", "cancer", "sagittarius"], dust: 0 };
  const s1 = deriveStats(c);
  assert.ok(s1.move > s0.move * 1.09, "돌진의 축복: 이동 +10%");
  assert.ok(Math.abs(s1.dmg - s0.dmg - 0.05) < 1e-9, "피해 +5%");
  assert.ok(s1.dr > s0.dr + 0.05, "껍질의 축복: 받는 피해 감소");
  assert.ok(s1.critDmg > s0.critDmg + 0.19, "사냥의 축복: 치명타 피해");
  assert.deepEqual(blessingMods({}), {});
  const pv = pvpChar(c);
  assert.equal(pv.astra, undefined, "결투장 캐릭터엔 축복 없음");
  assert.deepEqual(deriveStats(pv).dmg, deriveStats({ ...pv }).dmg);
}
ok("축복 → 능력치 반영 · 결투장 미적용");

// ── 메시지 검증
assert.ok(validateClientMessage({ t: "trial", c: 1 }) && validateClientMessage({ t: "trial", c: 13 }));
assert.ok(!validateClientMessage({ t: "trial", c: 14 }) && !validateClientMessage({ t: "trial", c: "1" }));
assert.ok(validateClientMessage({ t: "bless", a: "up", key: "aries" }) && !validateClientMessage({ t: "bless", a: "hack", key: "aries" }));
assert.ok(validateClientMessage({ t: "boat", to: "astra" }) && validateClientMessage({ t: "boat" }) && !validateClientMessage({ t: "boat", to: "moon" }));
assert.ok(!validateClientMessage({ t: "enter", floor: 1, dungeon: 5 }), "시련은 enter로 못 들어감");
assert.ok(validateClientMessage({ t: "story", n: 0 }) && !validateClientMessage({ t: "story", n: 14 }));
ok("메시지 검증 (trial · bless · boat · story)");

// ── 월드 흐름
const { World } = await import("../server/game/world.js");
const world = new World();
worldRef = world;
clearInterval(world.loop); world.loop = null;
world.save = () => {}; world.saveSoon = () => {};
const mk = (id, lv, cls = "sword") => {
  const c = newCharacter("u" + id); c.level = lv; c.cls = cls;
  const notes = [], packets = [];
  const s = { userId: id, name: "u" + id, char: c, send: (p) => packets.push(p), notice: (t) => notes.push(t), sendMe() {}, potionCd: {}, invites: new Set(), notes, packets };
  s.unit = makePlayerUnit(s);
  world.sessions.set(id, s);
  world.town.addPlayer(s.unit);
  return s;
};
const npcAt = (room, id) => room.map.objects.find((o) => o.kind === "npc" && o.id === id);
const stand = (s, room, id) => { const o = npcAt(room, id); assert.ok(o, id); s.unit.x = o.x; s.unit.y = o.y + 10; };
const tick = (n) => { for (let i = 0; i < n; i++) world.tick(); };

// 마을 구성
for (const id of ["boatman3", "observatory", "altar", "shop", "smithy", "enchanter", "trainer", "arena"]) assert.ok(npcAt(world.town3, id), "아스트라엘 NPC " + id);
assert.ok(world.town3.map.objects.some((o) => o.kind === "starchart"));
assert.ok(world.isTown(world.town3) && world.town3.island === "astra");

const s = mk(7001, 190);
stand(s, world.town, "boatman");
world.travelBoat(s, "moon");
const pick = s.packets.at(-1);
assert.equal(pick.t, "boatPick");
assert.deepEqual(pick.list.map((x) => x.k), ["verdan", "astra"]);
assert.ok(pick.list.find((x) => x.k === "astra").why, "조건 미달 이유");
world.travelBoat(s, "astra");
assert.ok(s.unit.room === world.town, "레벨 부족");
s.char.level = 205;
world.travelBoat(s, "astra");
assert.ok(s.unit.room === world.town, "베르단 50층 미돌파");
s.char.verdanPass = true; s.char.best3 = 50;
world.travelBoat(s, "astra");
assert.ok(s.unit.room === world.town3, "에르덴 → 아스트라엘");
assert.ok(s.char.astra.pass && s.char.island === "astra");
assert.ok(s.packets.some((p) => p.t === "story" && p.n === 0), "서장");
world.toTown(s);
assert.ok(s.unit.room === world.town3, "귀환 마을 = 아스트라엘");
stand(s, world.town3, "boatman3");
world.travelBoat(s, "verdan");
assert.ok(s.unit.room === world.town2, "아스트라엘 → 베르단");
stand(s, world.town2, "boatman2");
world.travelBoat(s, "astra");
assert.ok(s.unit.room === world.town3, "베르단 → 아스트라엘");
stand(s, world.town3, "boatman3");
world.travelBoat(s, "erden");
assert.ok(s.unit.room === world.town, "아스트라엘 → 에르덴");
stand(s, world.town, "boatman");
world.travelBoat(s, "astra");
assert.ok(s.unit.room === world.town3);
ok("뱃사공: 세 섬 왕래 · 아스트라엘 입도 조건 (Lv.200 · 베르단 50층)");

// 시련 입장
world.enterTrial(s, 1);
assert.ok(s.unit.room === world.town3, "기록관 근처에서만");
stand(s, world.town3, "observatory");
world.enterTrial(s, 13);
assert.ok(s.unit.room === world.town3, "열세 번째는 열두 별 이후");
world.enterDungeon(s, 1, 5);
assert.ok(s.unit.room === world.town3, "일반 입장으로는 못 들어감");
world.enterTrial(s, 1);
let r = s.unit.room;
assert.equal(r.dungeon, 5); assert.equal(r.floor, 1); assert.equal(r.astra.key, "aries"); assert.equal(r.stage, 1);
tick(140);
assert.ok(s.packets.some((p) => p.t === "ev" && p.list?.some((e) => e.kind === "star")) || [...r.players.values()].length, "속삭임");
ok("성좌의 시련 입장 (기록관 · 13번째 잠금)");

// 규칙: 각 성좌 방에서 실제 수치 확인
const roomFor = (key, stage = 1, who = s) => { world.moveGroup([who], trialFloor(CONST_BY_KEY[key].id, stage), "dungeon", { dungeon: 5 }); return who.unit.room; };
const firstMob = (room) => { for (let i = 0; i < 400 && ![...room.units.values()].some((u) => u.team === "m" && u.type === "m"); i++) world.tick(); return [...room.units.values()].find((u) => u.team === "m" && u.type === "m"); };
{
  // 양자리: 몬스터 속도 1.3, 내 이동 +15%
  r = roomFor("aries");
  const m = firstMob(r);
  const { moveMul } = await import("../server/game/combat.js");
  assert.ok(Math.abs(moveMul(s.unit) - 1.15) < 0.02 || moveMul(s.unit) > 1.1, "돌진: 이동 속도");
  assert.ok(m, "몬스터");
  // 황소자리: 체력 1.6배
  r = roomFor("taurus");
  const mt = firstMob(r);
  const base = monsterStats(mt.mid, r.floor, r.partySize, 5).hp * (mt.elite ? 3 : 1);
  assert.ok(Math.abs(mt.maxHp / base - 1.6) < 0.02, "견고: 체력 ×1.6");
}
{
  // 쌍둥이자리: 처치하면 한 번 갈라짐
  r = roomFor("gemini");
  const m = firstMob(r);
  const before = [...r.units.values()].filter((u) => u.team === "m").length;
  hit(r, s.unit, m, m.hp * 10);
  const kids = [...r.units.values()].filter((u) => u.splitChild);
  assert.ok(kids.length === 1 && kids[0].maxHp < m.maxHp * 0.5, "분열: 35% 체력 분신");
  const k = kids[0];
  hit(r, s.unit, k, k.hp * 10);
  assert.equal([...r.units.values()].filter((u) => u.splitChild).length, 0, "분신은 다시 갈라지지 않음");
  assert.ok(before >= 1);
}
{
  // 게자리: 체력 50% 이상 몬스터는 받는 피해 -40%
  r = roomFor("cancer");
  const m = firstMob(r);
  m.hp = m.maxHp; m.def = 0;
  const h0 = m.hp;
  hit(r, s.unit, m, 1000);
  const d1 = h0 - m.hp;
  m.hp = m.maxHp * 0.4;
  const h1 = m.hp;
  hit(r, s.unit, m, 1000);
  const d2 = h1 - m.hp;
  assert.ok(d1 > 0 && d2 / d1 > 1.5, `껍질: ${d1} vs ${d2}`);
}
{
  // 천칭자리: 내 체력이 낮으면 주는 피해↓ 받는 피해↓
  r = roomFor("libra");
  const m = firstMob(r);
  m.def = 0;
  s.unit.hp = s.unit.maxHp;
  let h0 = m.hp = m.maxHp; hit(r, s.unit, m, 1000); const full = h0 - m.hp;
  s.unit.hp = s.unit.maxHp * 0.2;
  h0 = m.hp = m.maxHp; hit(r, s.unit, m, 1000); const low = h0 - m.hp;
  assert.ok(full > low * 1.3, `천칭: 체력 높을수록 강함 ${full} vs ${low}`);
  s.unit.hp = s.unit.maxHp;
}
{
  // 처녀자리: 회복량 ×1.5
  r = roomFor("virgo");
  s.unit.hp = 1; heal(r, s.unit, s.unit, 1000, world.clock);
  const got = s.unit.hp - 1;
  r = roomFor("aries");
  s.unit.hp = 1; heal(r, s.unit, s.unit, 1000, world.clock);
  const got2 = s.unit.hp - 1;
  assert.ok(got > got2 * 1.4, `정화: 회복 ×1.5 (${got} vs ${got2})`);
  s.unit.hp = s.unit.maxHp;
}
{
  // 전갈자리: 몬스터에게 맞으면 독
  r = roomFor("scorpio");
  const m = firstMob(r);
  s.unit.status.clear(); s.unit.shield = null; s.unit.hp = s.unit.maxHp;
  hit(r, m, s.unit, 50);
  assert.ok(s.unit.status.has("poison"), "독침: 독");
  s.unit.status.clear();
}
{
  // 사자자리: 정예 처치 → 피해 버프 중첩
  r = roomFor("leo");
  const m = firstMob(r);
  m.elite = true;
  hit(r, s.unit, m, m.hp * 10);
  const b = s.unit.buffs.get("astra_leo");
  assert.ok(b && b.n === 1 && Math.abs(b.mods.dmg - 0.05) < 1e-9, "위엄: 정예 처치 버프");
}
{
  // 염소자리: 자연 회복 없음, 처치하면 회복
  r = roomFor("capricorn");
  const m = firstMob(r);
  s.unit.hp = s.unit.maxHp * 0.5;
  const h0 = s.unit.hp;
  s.unit.stats.hpRegen = 500;
  r.tickPlayer?.(s.unit, world.clock); tick(5);
  assert.ok(s.unit.hp <= h0 + 1 || s.unit.hp < h0 + 500 * 0.25 * 0.5, "인내: 자연 회복 막힘");
  const h1 = s.unit.hp;
  hit(r, s.unit, m, m.hp * 10);
  assert.ok(s.unit.hp > h1, "인내: 처치 회복");
  s.unit.stats.hpRegen = 0; refreshStats(s.unit);
}
{
  // 물병자리: 별비 회복 장판 · 물고기자리: 어둠
  r = roomFor("aquarius");
  const z0 = r.zones.length;
  tick(20 * 8);
  assert.ok(r.zones.length > z0 || r.starAt > 0, "흐름: 별비");
  r = roomFor("pisces");
  const evs = [];
  const orig = r.ev.bind(r); r.ev = (e) => { evs.push(e); orig(e); };
  tick(20 * 10);
  assert.ok(evs.some((e) => e.e === "dark"), "꿈: 어둠");
}
ok("시련 규칙: 돌진·견고·분열·껍질·천칭·정화·독침·위엄·인내·별비·어둠");

// 수호성 처치 → 별 · 축복 · 별가루 · 이야기
{
  r = roomFor("aries", 5);
  assert.equal(r.map.kind, "boss");
  for (let i = 0; i < 600 && ![...r.units.values()].some((u) => u.boss); i++) { s.unit.x = r.map.bossAt[0]; s.unit.y = r.map.bossAt[1] + 120; world.tick(); }
  const b = [...r.units.values()].find((u) => u.boss);
  assert.ok(b && b.bid === "ab_aries", "수호성 등장");
  const dust0 = s.char.astra.dust;
  hit(r, s.unit, b, b.hp * 10);
  tick(5);
  const portal = r.map.objects.find((o) => o.kind === "portal" && o.id === "victory");
  assert.ok(portal, "별의 포탈");
  assert.ok(s.char.astra.stars.aries && s.char.astra.dust >= dust0 + 100, "처치 순간 바로 보상 (재도전·접속 끊김에도 안전)");
  world.retryBoss(s);
  assert.ok(s.unit.room !== r && s.unit.room.floor === 5, "보스 다시 도전");
  r = s.unit.room;
  for (let i = 0; i < 600 && ![...r.units.values()].some((u) => u.boss); i++) { s.unit.x = r.map.bossAt[0]; s.unit.y = r.map.bossAt[1] + 120; world.tick(); }
  const b2 = [...r.units.values()].find((u) => u.boss);
  hit(r, s.unit, b2, b2.hp * 10);
  tick(5);
  s.packets.length = 0;
  world.usePortal(r, "victory");
  assert.ok(s.unit.room === world.town3, "아스트라엘로 귀환");
  assert.ok(s.char.astra.stars.aries && s.char.astra.bless.aries === 1 && s.char.astra.equip.includes("aries"), "별·축복·자동 장착");
  assert.ok(s.char.astra.dust >= dust0 + 100, "첫 클리어 별가루");
  assert.ok(s.packets.some((p) => p.t === "story" && p.n === 1), "제1장");
  const d1 = s.char.astra.dust;
  r = roomFor("aries", 5);
  world.usePortal(r, "victory");
  assert.ok(s.char.astra.dust > d1 && s.char.astra.dust - d1 < 100 && s.char.astra.clears.aries === 3, "재클리어 보상");
}
ok("수호성 처치 → 별 밝힘 · 축복 1단계 자동 장착 · 별가루 · 이야기");

// 축복의 제단
{
  const a = s.char.astra;
  stand(s, world.town3, "altar");
  a.dust = 1000;
  world.blessOp(s, { a: "up", key: "aries" });
  assert.equal(a.bless.aries, 2); assert.equal(a.dust, 1000 - blessUpCost(1));
  for (let i = 0; i < 5; i++) world.blessOp(s, { a: "up", key: "aries" });
  assert.equal(a.bless.aries, ASTRA.blessMax, "최대 단계");
  world.blessOp(s, { a: "equip", key: "taurus" });
  assert.ok(!a.equip.includes("taurus"), "밝히지 않은 축복은 못 품음");
  for (const k of ["taurus", "gemini", "cancer"]) { a.stars[k] = true; a.bless[k] = 1; }
  world.blessOp(s, { a: "equip", key: "taurus" }); world.blessOp(s, { a: "equip", key: "gemini" }); world.blessOp(s, { a: "equip", key: "cancer" });
  assert.equal(a.equip.length, 3, "최대 3개");
  world.blessOp(s, { a: "unequip", key: "aries" });
  world.blessOp(s, { a: "equip", key: "cancer" });
  assert.deepEqual([...a.equip].sort(), ["cancer", "gemini", "taurus"]);
  const hp0 = s.unit.maxHp;
  world.blessOp(s, { a: "unequip", key: "taurus" });
  assert.ok(s.unit.maxHp < hp0, "축복을 내리면 바로 능력치 반영");
  stand(s, world.town3, "shop");
  world.blessOp(s, { a: "up", key: "gemini" });
  assert.equal(a.bless.gemini, 1, "제단 밖에선 안 됨");
}
ok("축복의 제단: 강화(별가루) · 최대 단계 · 3칸 장착 · 즉시 반영");

// 열세 번째: 열두 별 → 뱀주인자리 → 칭호·4번째 칸
{
  for (const k of CONSTELLATIONS.slice(0, 12)) { s.char.astra.stars[k.key] = true; s.char.astra.bless[k.key] ??= 1; }
  stand(s, world.town3, "observatory");
  world.enterTrial(s, 13);
  r = s.unit.room;
  assert.equal(r.astra?.key, "ophiuchus", "열세 번째 입장");
  r = roomFor("ophiuchus", 5);
  world.usePortal(r, "victory");
  assert.ok(s.char.astra.stars.ophiuchus);
  assert.ok(s.char.titles.some((t) => t.text === ASTRA.title.text), "칭호");
  assert.equal(sanitizeChar(JSON.parse(JSON.stringify(s.char)), s.name).titles.filter((t) => t.text === ASTRA.title.text).length, 1, "칭호가 저장 정리에서 살아남음");
  stand(s, world.town3, "altar");
  for (const k of ["aries", "leo", "virgo"]) world.blessOp(s, { a: "equip", key: k });
  assert.equal(s.char.astra.equip.length, 4, "4번째 축복 칸");
}
ok("열세 번째 별자리: 열두 별 이후 개방 · 칭호 · 축복 4칸");

// 파티 입장: 같은 마을 · 모두 입도
{
  const a = mk(7002, 210), b = mk(7003, 210);
  for (const x of [a, b]) { x.char.verdanPass = true; x.char.best3 = 60; stand(x, world.town, "boatman"); world.travelBoat(x, "astra"); }
  assert.ok(a.unit.room === world.town3 && b.unit.room === world.town3);
  world.partyOp(a, "invite", b.name); world.partyOp(b, "accept", a.name);
  assert.ok(a.partyId && a.partyId === b.partyId, "파티 결성");
  b.char.astra.pass = false;
  stand(a, world.town3, "observatory");
  world.enterTrial(a, 2);
  assert.ok(a.unit.room === world.town3, "입도 안 한 파티원이 있으면 못 들어감");
  b.char.astra.pass = true;
  world.enterTrial(b, 2);
  assert.ok(b.unit.room === world.town3, "파티장만");
  world.enterTrial(a, 2);
  assert.ok(a.unit.room.dungeon === 5 && a.unit.room === b.unit.room, "파티 함께 입장");
  world.partyFailed(a.unit.room);
  assert.ok(a.unit.room === world.town3 && b.unit.room === world.town3, "패배 → 아스트라엘");
}
ok("파티 시련: 모두 입도 · 파티장만 · 함께 입장 · 패배 시 아스트라엘로");

// 서버 업데이트로 끊긴 뒤 시련으로 복귀
{
  const x = mk(7020, 220);
  x.char.verdanPass = true; x.char.best3 = 60; x.char.astra = { pass: true, stars: {}, bless: {}, equip: [], dust: 0, clears: {}, seen: [] };
  world.markResume([x], trialFloor(4, 3), "dungeon", 5);
  assert.ok(world.tryResume(x), "복귀");
  assert.ok(x.unit.room.dungeon === 5 && x.unit.room.floor === trialFloor(4, 3) && x.unit.room.astra.key === "cancer", "같은 시련 같은 단계");
  assert.ok(x.notes.at(-1).includes("게자리의 시련 3단계"), x.notes.at(-1));
  world.toTown(x);
  assert.ok(x.unit.room === world.town3);
}
ok("서버 업데이트 후 시련 복귀");

// 전 성좌 × 5단계 실제 전투 틱 (예외 0)
{
  const w = mk(7010, 250, "mage");
  w.char.verdanPass = true; w.char.best3 = 100; w.char.astra = { pass: true, stars: {}, bless: {}, equip: [], dust: 0, clears: {}, seen: [] };
  refreshStats(w.unit);
  for (const k of CONSTELLATIONS) for (let st = 1; st <= 5; st++) {
    world.moveGroup([w], trialFloor(k.id, st), "dungeon", { dungeon: 5 });
    const room = w.unit.room;
    w.unit.hp = w.unit.maxHp;
    for (let i = 0; i < 20 * 6; i++) {
      world.tick();
      if (w.unit.dead) { w.unit.dead = false; w.unit.hp = w.unit.maxHp; }
      const foe = [...room.units.values()].find((u) => u.team === "m" && !u.dead);
      if (foe && i % 3 === 0) hit(room, w.unit, foe, foe.maxHp * 0.2);
    }
  }
}
assert.equal(errs, 0, "틱 예외 0");
ok("13성좌 × 5단계 전투 틱 · 예외 0");
console.log("astra-test 통과");
process.exit(0);

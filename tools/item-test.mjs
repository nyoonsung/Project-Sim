// 내구도·수선 비용·전직 기본 스킬 세트 검사
import { ENH_PCT, rollItem, sellPrice, gearTotals, ensureDur, repairCost, maxDurability, DUR_PER_CAST } from "../shared/items.js";
import { newCharacter, defaultLoadout, sanitizeChar } from "../server/game/player.js";
import { SKILLS } from "../shared/skills.js";
import { CLASS_INFO } from "../shared/classes.js";
const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) process.exitCode = 1; };
// 1) 새 무기는 내구도 가득, 등급이 높을수록 최대 내구도 큼
let w; for (let i = 0; i < 50 && !(w?.slot === "weapon"); i++) w = rollItem(Math.random, { ilvl: 20, rarity: "전설" });
ok(w.dur === w.maxDur && w.maxDur === maxDurability(w) && w.maxDur === 160, `새 전설 무기 내구도 ${w.dur}/${w.maxDur}`);
// 2) 부서지면 무기 공격력 30%
const wb = { ...w, opts: [] };
const atkFull = gearTotals({ weapon: wb }).atk;
const broken = { ...wb, dur: 0 };
const atkBroken = gearTotals({ weapon: broken }).atk;
ok(Math.abs(atkBroken / atkFull - 0.3) < 0.03, `부서진 무기 공격력 ${atkFull} → ${atkBroken}`);
// 3) 수선 비용: 닳은 만큼 비례, 가득이면 0
ok(repairCost(w) === 0 && repairCost({ ...w, dur: w.maxDur / 2 }) > 0 && repairCost({ ...w, dur: 0 }) > repairCost({ ...w, dur: w.maxDur / 2 }), `수선비: 반 닳음 ${repairCost({ ...w, dur: w.maxDur / 2 })}G, 다 닳음 ${repairCost({ ...w, dur: 0 })}G`);
// 4) 옛 무기(내구도 없음)는 가득으로 맞춰짐
const old = sanitizeChar({ ...newCharacter("x"), inv: [{ ...w, dur: undefined, maxDur: undefined }] }, "x");
ok(old.equip.weapon.dur === old.equip.weapon.maxDur && old.inv[0].dur === old.inv[0].maxDur, "예전 무기도 내구도 가득으로");
ok(Math.round(100 / DUR_PER_CAST) === 1000, `일반 무기는 스킬 약 ${Math.round(100 / DUR_PER_CAST)}번 쓰면 부서짐 (층당 약 60~100번)`);
// 5) 전직 기본 스킬 세트
for (const cls of Object.keys(CLASS_INFO).filter((c) => c !== "adventurer")) {
  const ch = { ...newCharacter("t"), cls, level: 10 };
  const L = defaultLoadout(ch);
  const ok1 = L.length === 8 && SKILLS[L[0]]?.cls === cls && SKILLS[L[0]].kind === "basic" && L[6] === "c_dash" && L[7] === "c_firstaid";
  const cnt = L.slice(1, 6).filter((id) => id && SKILLS[id].cls === cls).length;
  ok(ok1 && cnt >= 1 && new Set(L.filter(Boolean)).size === L.filter(Boolean).length, `${CLASS_INFO[cls].name}: ${L.map((id) => id ? SKILLS[id].name : "-").join(" / ")}`);
}

// 6) 서버: 일괄 판매·수선·전직 (World 메서드를 가짜 this로 호출)
const { World } = await import("../server/game/world.js");
const { makePlayerUnit, refreshStats } = await import("../server/game/player.js");
const notes = [];
const fake = (near) => ({ nearNpc: (s, k) => k === near, sendChar() {} });
const mk = () => { const s = { userId: 9, char: { ...newCharacter("판매"), gold: 0 }, notice: (t) => notes.push(t), send() {} }; s.unit = makePlayerUnit(s); refreshStats(s.unit); return s; };
const s1 = mk();
const items = [];
for (let i = 0; i < 5; i++) { const it = rollItem(Math.random, { ilvl: 5, rarity: "일반" }); it.uid = 100 + i; items.push(it); }
items[4].locked = true;
s1.char.inv = items.slice();
World.prototype.sellMany.call(fake(null), s1, [100, 101, 102, 104, 999]); // 상인과 멀리 떨어진 던전에서도 판매
const exp = [0, 1, 2].reduce((a, i) => a + sellPrice(items[i]), 0);
ok(s1.char.inv.length === 2 && s1.char.gold === exp && s1.char.inv.some((x) => x.uid === 104), `3개 판매 ${exp}G, 던전에서도 판매, 잠긴 아이템 남음 — "${notes.at(-1)}"`);
// 수선
const s2 = mk();
const wpn = s2.char.equip.weapon; ensureDur(wpn); wpn.dur = 0; refreshStats(s2.unit);
const atkB2 = s2.unit.atk ?? s2.unit.stats?.atk;
const cost = repairCost(wpn);
s2.char.gold = cost - 1;
World.prototype.repair.call(fake("smithy"), s2);
ok(wpn.dur === 0 && s2.char.gold === cost - 1, `골드 모자라면 수선 안 됨 (비용 ${cost}G)`);
s2.char.gold = cost + 5;
World.prototype.repair.call(fake("smithy"), s2);
ok(wpn.dur === wpn.maxDur && s2.char.gold === 5, `수선 완료 — "${notes.at(-1)}"`);
ok((s2.unit.atk ?? s2.unit.stats?.atk) >= atkB2, "수선 후 공격력 회복");

// 7) 모든 장비 내구도, 강화 1단계당 부위별 +1%, 궁수 1.8배
for (const slot of ["weapon", "offhand", "helmet", "armor", "trinket"]) {
  let it; for (let i = 0; i < 80 && it?.slot !== slot; i++) it = rollItem(Math.random, { ilvl: 10, rarity: "영웅" });
  ok(it.dur === it.maxDur && it.maxDur === 140, `${slot} 새 장비 내구도 ${it.dur}/${it.maxDur}`);
  const k = ENH_PCT[slot].k;
  const a = gearTotals({ [slot]: { ...it, opts: [], enh: 0 } })[k], b = gearTotals({ [slot]: { ...it, opts: [], enh: 10 } })[k], c = gearTotals({ [slot]: { ...it, opts: [], enh: 10, dur: 0 } })[k];
  ok(Math.abs(b - a - 0.1) < 1e-9 && c <= a, `${slot} +10강 → ${ENH_PCT[slot].name} +10%, 부서지면 꺼짐`);
}
const { deriveStats } = await import("../shared/stats.js");
const arch = deriveStats({ ...newCharacter("궁"), cls: "archer", level: 10 }), swd = deriveStats({ ...newCharacter("검"), cls: "sword", level: 10 });
ok(arch.classDmg === 1.8 && swd.classDmg === 1, "궁수 피해 배율 ×1.8");
const hpA = deriveStats({ ...newCharacter("h"), equip: { helmet: { slot: "helmet", variant: 1, rarity: "일반", ilvl: 1, enh: 0, base: { def: 2, hp: 10 }, opts: [] } } }).maxHp;
const hpB = deriveStats({ ...newCharacter("h"), equip: { helmet: { slot: "helmet", variant: 1, rarity: "일반", ilvl: 1, enh: 20, base: { def: 2, hp: 10 }, opts: [] } } }).maxHp;
ok(hpB / hpA > 1.19, `투구 +20강 최대 HP ${hpA} → ${hpB}`);

// 8) 신화 장비는 캐릭터 레벨을 따라 성장
const { syncMythic } = await import("../shared/items.js");
let my; for (let i = 0; i < 60 && my?.slot !== "weapon"; i++) my = rollItem(Math.random, { ilvl: 5, rarity: "신화" });
const chM = { ...newCharacter("신"), level: 40, equip: { weapon: my }, inv: [] };
const atk5 = my.base.atk;
ok(syncMythic(chM) && my.ilvl === 40 && my.base.atk > atk5 * 3 && my.base.dmg === 0.12, `신화 무기 Lv5 → 캐릭터 Lv40 따라 성장 (공격력 ${atk5} → ${my.base.atk})`);
ok(!syncMythic(chM), "레벨이 같으면 다시 계산 안 함");

// 9) 근접 판정: 조준이 살짝(50°) 빗나가도 가까운 적을 맞힘
const { Room } = await import("../server/game/room.js");
const { safeZone } = await import("../server/game/dungeon.js");
const W9 = { clock: 0 }; const R9 = new Room(W9, { id: "m9", kind: "dungeon", floor: 1, map: safeZone(1) });
const evs9 = [];
const s9 = { userId: 99, char: { ...newCharacter("근") }, send: (o) => { if (typeof o === "string") o = JSON.parse(o); if (o.v) evs9.push(...o.v); }, notice() {}, sendMe() {} };
const u9 = makePlayerUnit(s9); s9.unit = u9; refreshStats(u9); R9.addPlayer(u9);
const m9 = R9.spawnMonster("slime", u9.x + 40, u9.y + 10, false, {});
m9.hp = m9.maxHp = 9999;
const aimAng = Math.atan2(10, 40) + (50 * Math.PI) / 180;
W9.clock += 1; R9.tick();
R9.cast(u9, { slot: 0, ax: u9.x + Math.cos(aimAng) * 60, ay: u9.y + Math.sin(aimAng) * 60 });
W9.clock += 0.05; R9.tick(); R9.flush();
ok(evs9.some((e) => e.e === "dmg" && e.id === m9.id), "찌르기 조준이 50° 빗나가도 근처 적에 맞음 (조준 보정)");

// 10) 강화 실패 → 단계 유지
{
  const se = mk(); se.char.gold = 1e12;
  let it; for (let i = 0; i < 60 && it?.slot !== "armor"; i++) it = rollItem(Math.random, { ilvl: 5, rarity: "일반" });
  it.uid = 777; it.enh = 98; se.char.inv = [it];
  const fakeW = { nearNpc: () => true, sendChar() {}, broadcastSys() {}, save() {} };
  let seen = null;
  se.send = (m) => { if (m.t === "enh") seen = m; };
  for (let k = 0; k < 40 && seen?.result !== "fail"; k++) { it.enh = 98; World.prototype.enhance.call(fakeW, se, 777); }
  ok(seen?.result === "fail" && it.enh === 98, `강화 실패 시 +98 → +${it.enh} (단계 유지)`);
}

// 11) 인챈트: 확률·능력치·수선(안 닳음)
{
  const { ENCHANTS, rollEnchant, enchantOdds } = await import("../shared/items.js");
  const cnt = {}; for (let i = 0; i < 200000; i++) { const k = rollEnchant(Math.random()); cnt[k] = (cnt[k] ?? 0) + 1; }
  const mendP = (cnt.mend ?? 0) / 200000, other = ["dmg", "move", "crit", "critDmg", "hp"].map((k) => cnt[k] / 200000);
  ok(Math.abs(enchantOdds().reduce((a, [, p]) => a + p, 0) - 1) < 1e-9 && mendP < 0.002 && other.every((p) => Math.abs(p - 0.1998) < 0.006), `인챈트 확률: 수선 ${(mendP * 100).toFixed(2)}%, 나머지 ${other.map((p) => (p * 100).toFixed(1)).join("/")}%`);
  let ar; for (let i = 0; i < 60 && ar?.slot !== "armor"; i++) ar = rollItem(Math.random, { ilvl: 5, rarity: "일반" });
  const t0 = gearTotals({ armor: { ...ar, opts: [] } }), t1 = gearTotals({ armor: { ...ar, opts: [], ench: "move" } });
  ok(Math.abs(t1.move - t0.move - 0.15) < 1e-9 && gearTotals({ armor: { ...ar, opts: [], ench: "hp" } }).hpPct === 0.1, "인챈트 이동 속도 +15%, 체력 +10%");
  const { wearOnHit } = await import("../server/game/wear.js");
  const sw = mk(); sw.char.equip.armor = { ...ar, uid: 5555, dur: 100, maxDur: 100, ench: "mend" };
  const roomW = { kind: "dungeon", map: { safe: false }, world: {} };
  for (let i = 0; i < 50; i++) wearOnHit(roomW, sw.unit);
  ok(sw.char.equip.armor.dur === 100, "수선 인챈트 장비는 맞아도 내구도가 안 닳음");
}

// 12) 신화는 강화 폭발 시 사라지지 않고 +0
{
  const se = mk(); se.char.gold = 1e15;
  let it; for (let i = 0; i < 60 && it?.slot !== "armor"; i++) it = rollItem(Math.random, { ilvl: 5, rarity: "신화" });
  it.uid = 888; se.char.inv = [it];
  const fakeW = { nearNpc: () => true, sendChar() {}, broadcastSys() {}, save() {} };
  let res = null; se.send = (m) => { if (m.t === "enh") res = m; };
  for (let k = 0; k < 3000 && res?.result !== "reset"; k++) { it.enh = 98; World.prototype.enhance.call(fakeW, se, 888); }
  ok(res?.result === "reset" && se.char.inv.includes(it) && it.enh === 0, `신화 강화 폭발 → 아이템 유지, +${it.enh}`);
}

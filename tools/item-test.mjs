// 내구도·수선 비용·전직 기본 스킬 세트 검사
import { rollItem, sellPrice, gearTotals, ensureDur, repairCost, maxDurability, DUR_PER_CAST } from "../shared/items.js";
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

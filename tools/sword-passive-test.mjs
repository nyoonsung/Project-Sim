// 검사 2차 전직 패시브 회귀: 소드마스터 4종 · 다크나이트 2종이 해금 레벨부터 실제로 발동하는지
import assert from "node:assert/strict";
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats } from "../server/game/player.js";
import { castSkill, p2of } from "../server/game/skills.js";
import { dealDamage } from "../server/game/combat.js";
import { MONSTERS } from "../shared/zones.js";

let rs = 12345;
Math.random = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 2 ** 32); // 결과 재현 가능하게
function setup(cls2, level, skills) {
  const c = newCharacter("sp"); c.cls = "sword"; c.cls2 = cls2; c.level = level;
  c.skills = [...skills, ...Array(12).fill(null)].slice(0, 12);
  const s = { userId: 1, char: c, send() {}, notice() {}, sendMe() {} };
  const u = makePlayerUnit(s); s.unit = u; refreshStats(u);
  const map = makeFloor(1, 7, 1, 1); map.spawns = []; map.waves = null;
  const world = { clock: 0, pickup: () => true, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {} };
  const room = new Room(world, { id: "sp", kind: "dungeon", floor: 1, map });
  room.addPlayer(u, map.start);
  const d = room.spawnDummy(u.x + 40, u.y); d.hp = d.maxHp = 1e12;
  const msgs = [];
  const tick = (n = 16) => { for (let i = 0; i < n; i++) { world.clock += 0.05; room.tick(); for (const e of room.events) if (e.e === "msg") msgs.push(e.text); room.events.length = 0; u.x = d.x - 40; u.y = d.y; } };
  const cast = (slot) => { u.lockUntil = 0; u.ki = 100; u.mp = u.maxMp; u.moveLock = 0; u.casting = null; u.cds.clear(); castSkill(room, u, slot, d.x, d.y, null, room.now, room.now + 0.5); };
  const mob = () => room.spawnMonster(Object.keys(MONSTERS)[0], u.x + 20, u.y);
  return { u, d, room, cast, tick, msgs, mob };
}

// 해금 레벨 전에는 발동하지 않음 (Lv.175: 아무 패시브 없음)
assert.deepEqual(p2of(setup("swordmaster", 175, []).u), {});
assert.deepEqual(p2of(setup("darkknight", 175, []).u), {});

// 소드마스터: 정통 검식 · 검식 완성 · 무극발도 · 검격 받아치기
{
  const { u, d, cast, tick, msgs, mob, room } = setup("swordmaster", 250, ["sg_ilseom", "sg_whirl", "sg_rush"]);
  const P = p2of(u);
  assert.ok(P.swordSeq && P.parryHeal && P.seqFinish && P.seqFinisher, "Lv.250 패시브 4종");
  cast(0); tick();
  assert.ok(u.buffs.get("sg_flow")?.n === 1, "정통 검식 1단계 버프");
  cast(1); tick();
  assert.ok(u.buffs.get("sg_flow")?.n === 2, "정통 검식 2단계 버프");
  const h0 = d.hp;
  cast(2); tick(20);
  assert.ok(msgs.includes("검식 완성!") && u.buffs.has("sg_complete"), "검식 완성 버프");
  assert.ok(h0 - d.hp > u.stats.atk * 8, "무극발도 발도 피해");
  // 받아치기: 소드마스터 스킬 직후 0.6초 안의 공격을 흘림
  const m = mob();
  u.hp = u.maxHp * 0.5;
  cast(1); tick(6); // 0.3초 뒤
  const hp1 = u.hp;
  dealDamage(room, m, u, { fixed: 1000 }, room.now);
  assert.ok(u.hp > hp1, "검격 받아치기: 피해를 흘리고 회복");
  tick(1); assert.ok(msgs.includes("검격 받아치기!"));
}

// 다크나이트: 검은 심장 · 잔혈의 갑주
{
  const { u, d, cast, tick } = setup("darkknight", 250, ["dk_darkslash"]);
  // 치명타·피해 편차를 없애려고 치명타 0으로 놓고 5번 평균
  const hit = (pct) => { let sum = 0; for (let k = 0; k < 5; k++) { u.hp = u.maxHp * pct; u.stats.crit = 0; const h0 = d.hp; cast(0); tick(10); sum += h0 - d.hp; } return sum / 5; };
  const full = hit(1), low = hit(0.1);
  if (process.env.V) console.log("  검은 심장", Math.round(full), Math.round(low));
  assert.ok(low > full * 1.25, `검은 심장: 생명력이 낮을수록 강함 (${full} → ${low})`);
  // 체력이 가득 찬 채 흡혈해도 대기가 소모되지 않음 → 바로 다쳤을 때 보호막
  tick(30); // 앞선 흡혈의 대기(1.2초)가 끝나게
  u.hp = u.maxHp; u.shield = null; u.stealWin = null; cast(0); tick(4);
  u.hp = u.maxHp * 0.3; u.shield = null; u.stealWin = null; cast(0); tick(4);
  assert.ok(u.shield?.amt > 0, "잔혈의 갑주: 흡혈 → 검은 보호막");
}
console.log("✓ 검사 2차 전직 패시브 6종 발동 (소드마스터 정통 검식·검식 완성·무극발도·받아치기, 다크나이트 검은 심장·잔혈의 갑주)");
console.log("SWORD PASSIVE TESTS: ALL PASS");
process.exit(0);

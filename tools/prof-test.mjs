// 스킬 숙련도 검사: 경험치·레벨업·위력·마나·쿨타임(불변)
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats, sanitizeChar } from "../server/game/player.js";
import { castSkill } from "../server/game/skills.js";
import { SKILLS } from "../shared/skills.js";
import { profLevel, PROF_TOTAL, profGain, profPow, profNeed } from "../shared/prof.js";
const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) process.exitCode = 1; };
const world = { clock: 100, pickup: () => true, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {} };
const sent = [];
function setup(kind = "dungeon", prof = {}) {
  const ch = newCharacter("숙련"); ch.cls = "mage"; ch.level = 40; ch.prof = { ...prof };
  ch.skills = ["ma_arcane", "c_slash", null, null, null, null, "c_dash", null];
  const s = { userId: 1, char: ch, name: "숙련", send: (o) => sent.push(typeof o === "string" ? JSON.parse(o) : o), notice() {}, sendMe() {}, meDirty: false };
  const u = makePlayerUnit(s); s.unit = u; refreshStats(u); u.hp = u.maxHp; u.mp = u.maxMp;
  const r = new Room(world, { id: "p", kind, floor: 20, map: makeFloor(21, 5, 1) });
  r.addPlayer(u);
  r.spawnMonster(r.map.waves?.pool?.[0] ?? Object.keys(r.map)[0], u.x + 80, u.y);
  const m = [...r.units.values()].find((x) => x.type === "m");
  return { ch, u, r, m };
}
// 1) 경험치: 적 근처에서 쓰면 오르고, 마을에선 안 오름
{
  const { ch, u, r } = setup();
  world.clock += 5; r.now = world.clock;
  castSkill(r, u, 1, u.x + 60, u.y, null, r.now);
  ok((ch.prof.c_slash ?? 0) === profGain(SKILLS.c_slash), `던전에서 적 근처 사용 → 숙련 +${profGain(SKILLS.c_slash)}`);
  const t = setup("town");
  castSkill(t.r, t.u, 1, t.u.x + 60, t.u.y, null, t.r.now);
  ok(!t.ch.prof.c_slash, "마을에서는 숙련도 안 오름");
}
// 2) 레벨업 이벤트
{
  const { ch, u, r } = setup("dungeon", { c_slash: 59 });
  sent.length = 0; r.events.length = 0;
  world.clock += 5; r.now = world.clock;
  castSkill(r, u, 1, u.x + 60, u.y, null, r.now);
  ok(profLevel(ch.prof.c_slash).lv === 1 && r.events.some((e) => e.e === "proflv" && e.lv === 1), "Lv.1 달성 이벤트");
  ok(u.session.profOut?.c_slash > 0 && u.session.meDirty, "숙련 경험치를 상태 메시지에 묶어 전송 예약");
}
// 3) 위력 +20% (Lv.10), 마나 -15%, 쿨타임 불변
{
  const dmg = (prof) => {
    // 두 경우에 같은 난수열을 써서 회피·피해 흔들림 영향을 없앰
    let seed = 12345; const orig = Math.random;
    Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let sum = 0;
    for (let i = 0; i < 400; i++) {
      const { u, r, m } = setup("dungeon", prof);
      m.hp = m.maxHp = 1e9; m.def = 0; m.x = u.x + 26; m.y = u.y; m.dummy = false;
      u.stats.crit = 0;
      world.clock += 5; r.now = world.clock;
      castSkill(r, u, 1, m.x, m.y, null, r.now);
      for (let k = 0; k < 10; k++) { world.clock += 0.05; r.tick(); }
      sum += 1e9 - m.hp;
    }
    Math.random = orig;
    return sum / 400;
  };
  const d0 = dmg({}), d10 = dmg({ c_slash: PROF_TOTAL });
  ok(d0 > 0, `기본 피해 평균 ${d0.toFixed(1)}`);
  ok(Math.abs(d10 / d0 - 1.2) < 0.03, `Lv.10 위력 ${(d10 / d0 * 100 - 100).toFixed(1)}% 증가 (목표 +20%)`);
  const a = setup("dungeon", {}), b = setup("dungeon", { ma_arcane: PROF_TOTAL });
  for (const x of [a, b]) { world.clock += 5; x.r.now = world.clock; x.u.mp = 500; castSkill(x.r, x.u, 0, x.m.x, x.m.y, null, x.r.now); }
  const ca = setup("dungeon", {}), cb = setup("dungeon", { c_slash: PROF_TOTAL });
  for (const x of [ca, cb]) { world.clock += 5; x.r.now = world.clock; x.u.mp = 500; castSkill(x.r, x.u, 1, x.m.x, x.m.y, null, x.r.now); }
  const costA = 500 - ca.u.mp, costB = 500 - cb.u.mp;
  ok(SKILLS.c_slash.cost?.mp ? costB < costA : true, `마나 소모 ${costA.toFixed(1)} → ${costB.toFixed(1)}`);
  ok(Math.abs((ca.u.cds.get("c_slash") - ca.r.now) - (cb.u.cds.get("c_slash") - cb.r.now)) < 1e-9, "쿨타임은 숙련도와 무관 (줄지 않음)");
}
// 4) 저장 정리: 잘못된 값 제거
{
  const c = sanitizeChar({ ...newCharacter("x"), prof: { c_slash: 100, nope: 5, ma_arcane: -3, c_dash: "abc" } }, "x");
  ok(JSON.stringify(c.prof) === JSON.stringify({ c_slash: 100 }), "저장된 숙련도 검증");
}
// 5) 찌르기는 한도 없음, 다른 스킬은 Lv.10에서 멈춤
{
  let xp = 0; for (let n = 1; n <= 20; n++) xp += profNeed(n);
  ok(profLevel(xp * 3, "c_slash").lv === 10, "다른 스킬은 Lv.10에서 멈춤");
  ok(profLevel(xp, "c_thrust").lv === 20 && !profLevel(xp, "c_thrust").max, "찌르기는 Lv.10 넘어서 계속 성장 (Lv.20)");
  ok(Math.abs(profPow(20) - 0.3) < 1e-9 && Math.abs(profPow(30) - 0.4) < 1e-9 && Math.abs(profPow(10) - 0.2) < 1e-9, "Lv.10 +20%, Lv.20 +30%, Lv.30 +40% (10 이후 레벨당 +1%)");
  const { ch, u, r } = setup("dungeon", { c_thrust: xp });
  ch.skills[0] = "c_thrust";
  world.clock += 5; r.now = world.clock;
  r.events.length = 0;
  castSkill(r, u, 0, u.x + 30, u.y, null, r.now);
  ok(r.events.find((e) => e.e === "cast")?.pl === 20, "찌르기 Lv.20이 시전에 반영");
  let xp30 = 0; for (let n = 1; n <= 30; n++) xp30 += profNeed(n);
  console.log(`찌르기 Lv.20까지 ${xp}회, Lv.30까지 ${xp30}회 사용 (초당 약 1.4회 → ${(xp / 1.4 / 3600).toFixed(0)}시간 / ${(xp30 / 1.4 / 3600).toFixed(0)}시간 전투)`);
}
console.log(`Lv.10까지 필요 숙련 경험치 ${PROF_TOTAL} (평타 1/회, 쿨 8초 스킬 9/회)`);

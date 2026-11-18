import { Room } from "../server/game/room.js";
import { makeFloor, safeZone } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats } from "../server/game/player.js";
const ok = (c, m) => console.log((c ? "✓ " : "✗ ") + m);
const log = [];
const world = { clock: 0, pickup: () => true, onBossCleared() {}, used: null, usePortal(r, id) { this.used = id; }, partyFailed() {}, toTown(s) { this.town = (this.town ?? 0) + 1; s.unit.room.removePlayer(s.unit); } };
function player(id, name) {
  const s = { userId: id, char: newCharacter(name), name, send: (o) => { if (typeof o === "string") o = JSON.parse(o); if (o.t === "ev") log.push(...o.list); }, notice() {}, sendMe() {}, meDirty: false };
  const u = makePlayerUnit(s); s.unit = u; refreshStats(u); u.hp = u.maxHp; return u;
}
const tick = (r, n = 1) => { for (let i = 0; i < n; i++) { world.clock += 0.05; r.tick(); r.flush(); } };

// 1) 공유 시계: 마을에서 쓴 쿨타임이 새 방에서도 같은 '남은 시간'
world.clock = 500;
const town = new Room(world, { id: "t", kind: "town", floor: 0, map: safeZone(10) });
const a = player(1, "가"), b = player(2, "나");
town.addPlayer(a); tick(town, 2);
a.cds.set("c_slash", town.now + 2); a.lockUntil = town.now + 0.2;
town.removePlayer(a);
const r = new Room(world, { id: "r", kind: "dungeon", floor: 3, map: makeFloor(3, 7, 2), partySize: 2 });
ok(Math.abs(r.now - town.now) < 0.06, `새 방 시계 = 월드 시계 (${r.now.toFixed(2)} vs 마을 ${town.now.toFixed(2)})`);
ok(a.cds.get("c_slash") - r.now <= 2.01 && a.lockUntil - r.now < 0.3, "방을 옮겨도 쿨타임 남은 시간 그대로 (예전엔 수백 초)");

// 2) 몬스터가 남아 있으면 출구 닫힘
r.addPlayer(a); r.addPlayer(b); tick(r, 5);
ok(!r.exitOpen, "몬스터 남아 있으면 출구 닫힘");
// 웨이브 끝까지 소환 후 1마리만 남기고 처치
r.wave.spawned = r.total; r.timers = r.timers.filter((t) => !t.spawn);
const mons = () => [...r.units.values()].filter((u) => u.type === "m" && !u.dead && u.team === "m");
for (let k = 0; k < 6; k++) { r.wave.spawned = 0; r.wave.nextAt = 0; r.wave.forceAt = 0; tick(r, 1); }
r.wave.spawned = r.total; tick(r, 30);
const all = mons();
ok(all.length > 1, `몬스터 ${all.length}마리 생성`);
for (const m of all.slice(1)) r.kill(m, a, r.now);
tick(r, 2);
ok(!r.exitOpen && mons().length === 1, "1마리라도 남으면 출구 닫힘");
// 끼인 몬스터 구제: 멀리 보내 두면 근처로 옮겨짐
const last = mons()[0]; last.x = 99999; last.y = 99999; r.rescueAt = 0; tick(r, 1);
ok(Math.hypot(last.x - a.x, last.y - a.y) < 400 || Math.hypot(last.x - b.x, last.y - b.y) < 400, "멀리 끼인 마지막 몬스터를 플레이어 근처로 옮김");
r.kill(last, a, r.now); tick(r, 1);
ok(r.exitOpen, "모두 처치하면 출구 열림");

// 3) 파티 투표: 한 명이 출구에 서면 투표, 두 명 다 동의해야 이동
const exit = r.map.objects.find((o) => o.id === "exit");
log.length = 0; world.used = null;
a.x = exit.x; a.y = exit.y; tick(r, 1);
ok(r.vote && log.some((e) => e.e === "vote" && e.need === 2), "출구에 서면 이동 투표 시작 (2명 필요)");
tick(r, 60);
ok(!world.used && !r.transition, "한 명만 동의하면 이동 안 함");
r.voteCast(b, false); tick(r, 1);
ok(!r.vote && log.some((e) => e.e === "vote" && e.end && /거절/.test(e.why ?? "")), "거절하면 투표 취소");
tick(r, 70); // 쿨다운 뒤 다시 제안
ok(!!r.vote, "다시 서 있으면 재투표");
r.voteCast(b, true); tick(r, 1);
ok(!!r.transition, "전원 동의하면 2초 뒤 이동 예약");
tick(r, 45);
ok(world.used === "exit", "파티 전체 다음 층으로 이동");

// 4) 마을 귀환 포탈: 1.5초 서 있어야 귀환, 혼자만
const r2 = new Room(world, { id: "r2", kind: "dungeon", floor: 4, map: makeFloor(4, 9, 2), partySize: 2 });
const c = player(3, "다"), d = player(4, "라");
r2.addPlayer(c); r2.addPlayer(d);
const tp = r2.map.objects.find((o) => o.id === "town");
ok(!!tp, "일반 층에 마을 귀환 포탈 있음");
world.town = 0; c.x = tp.x; c.y = tp.y; tick(r2, 10);
ok(!world.town, "0.5초 만에는 귀환 안 함 (실수로 밟아도 괜찮게)");
tick(r2, 25);
ok(world.town === 1 && r2.players.has(d.id) && !r2.players.has(c.id), "1.5초 서 있으면 그 사람만 마을로");
const bf = makeFloor(10, 3, 1);
ok(bf.objects.some((o) => o.id === "town"), "보스 층에도 마을 귀환 포탈 있음");

// ───────── 추가 규칙 (2026-11 개선 목록) ─────────
{
  const { rollItem, baseStats, VARIANT_TRAITS } = await import("../shared/items.js");
  const { adventurerBasic, SKILLS } = await import("../shared/skills.js");
  // 층 클리어: 바닥 아이템 자동 획득 + 보상 상자
  const picked = [];
  const w2 = { ...world, pickup: (p, it) => { picked.push([p.id, it]); return true; } };
  const r3 = new Room(w2, { id: "r3", kind: "dungeon", floor: 6, map: makeFloor(6, 11, 1), partySize: 1 });
  const e = player(9, "마"); r3.addPlayer(e);
  r3.dropLoot(e.session.userId, rollItem(Math.random, { ilvl: 5 }), e.x + 200, e.y);
  r3.dropLoot(e.session.userId, rollItem(Math.random, { ilvl: 5 }), e.x - 200, e.y);
  r3.wave.spawned = r3.total; r3.timers = r3.timers.filter((t) => !t.spawn);
  for (const m of [...r3.units.values()].filter((u) => u.type === "m")) r3.kill(m, e, r3.now);
  for (let k = 0; k < 4; k++) { w2.clock += 0.05; r3.tick(); }
  // 아무 몬스터도 없으면 kill이 호출되지 않으므로, 직접 클리어 경로 확인용 처치 1마리
  if (!r3.exitOpen) { r3.spawnMonster(r3.map.waves.pool[0], e.x + 300, e.y); const m = [...r3.units.values()].find((u) => u.type === "m"); r3.kill(m, e, r3.now); }
  for (let k = 0; k < 25; k++) { w2.clock += 0.05; r3.tick(); }
  ok(r3.exitOpen && r3.loot.size === 0 && picked.length >= 2, `층 클리어 시 바닥 아이템 자동 획득 (${picked.length}개)`);
  ok(!!r3.chest && r3.map.objects.some((o) => o.kind === "chest"), "층 클리어 시 보상 상자 등장");
  const g0 = e.session.char.gold, n0 = picked.length;
  e.x = r3.chest.x; e.y = r3.chest.y;
  for (let k = 0; k < 8; k++) { w2.clock += 0.05; r3.tick(); }
  ok(e.session.char.gold > g0 && picked.length > n0, `보상 상자: 골드 +${e.session.char.gold - g0}, 장비 ${picked.length - n0}개`);
  const g1 = e.session.char.gold;
  for (let k = 0; k < 8; k++) { w2.clock += 0.05; r3.tick(); }
  ok(e.session.char.gold === g1, "상자는 한 사람당 한 번만");
  // 전투 중 마을 귀환 막기
  const r4 = new Room(w2, { id: "r4", kind: "dungeon", floor: 4, map: makeFloor(4, 13, 1), partySize: 1 });
  const f = player(10, "바"); r4.addPlayer(f);
  const tp4 = r4.map.objects.find((o) => o.id === "town");
  r4.spawnMonster(r4.map.waves.pool[0], tp4.x + 60, tp4.y);
  w2.town = 0; f.x = tp4.x; f.y = tp4.y;
  for (let k = 0; k < 40; k++) { w2.clock += 0.05; r4.tick(); [...r4.units.values()].filter((u) => u.type === "m").forEach((m) => { m.x = tp4.x + 60; m.y = tp4.y; }); }
  ok(!w2.town && r4.players.has(f.id), "근처에 적이 있으면(전투 중) 마을 귀환 포탈이 안 탐");
  // 활 = 활쏘기, 지팡이 = 마력탄
  ok(adventurerBasic("bow") === "c_shot" && adventurerBasic("staff") === "c_bolt" && adventurerBasic("sword") === "c_thrust" && SKILLS.c_shot.steps[0].do === "proj", "모험가가 활을 들면 기본 공격이 활쏘기(원거리)");
  // 방어구 종류별 차이
  const a0 = baseStats("armor", null, 10, 0, 0), a2 = baseStats("armor", null, 10, 0, 2);
  ok(a2.def > a0.def && a0.move > 0 && a2.move < 0 && VARIANT_TRAITS.armor.length === 4, `가죽(방어 ${a0.def}, 이속 +4%) ≠ 판금(방어 ${a2.def}, 이속 -3%)`);
}

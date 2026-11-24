// PvP 결투장 검사: 평준화(레벨·스탯·장비), 세팅 저장, 대기열·친선전, 라운드·거점·결계, 기권, 레이팅·순위,
// 원래 캐릭터 복구(저장 안전), 적/아군 판정, 제어 점감·한 대 상한·치유 감소, 직업 밸런스(봇 모의전)
import assert from "node:assert/strict";
import { makeWorld, mkSession, duel } from "./pvp-sim.mjs";
import { PVP, PVP_CLASSES, PVP_PRESETS, presetStats, checkPvpStats, eloDelta, pvpTier, newPvpRecord } from "../shared/pvp.js";
import { CLASS_INFO } from "../shared/classes.js";
import { SKILLS } from "../shared/skills.js";
import { SKILL_SLOTS } from "../shared/constants.js";
import { makeItem, CLASS_GEAR } from "../shared/items.js";
import { sanitizeChar, refreshStats } from "../server/game/player.js";
import { dealDamage, applyStatus, heal, foe } from "../server/game/combat.js";
import { pvpChar } from "../server/game/pvp.js";
import { validateClientMessage } from "../server/net.js";
import { makeTown, makeVerdanTown, makeArena } from "../server/game/dungeon.js";

const ok = (m) => console.log("✓ " + m);
const baseErr = console.error;
let errs = 0;
console.error = (...a) => { errs++; baseErr(...a); };

// ── 규칙·프리셋
for (const cls of PVP_CLASSES) for (const p of Object.keys(PVP_PRESETS)) {
  const st = presetStats(cls, p);
  const sum = Object.values(st).reduce((a, b) => a + b, 0);
  assert.equal(sum, PVP.points, `${cls}/${p} 합계`);
  for (const [k, v] of Object.entries(st)) { assert.ok(CLASS_INFO[cls].stats.includes(k)); assert.ok(v <= PVP.statMax); }
  assert.equal(typeof checkPvpStats(cls, st), "object");
}
assert.equal(typeof checkPvpStats("sword", { str2: 300 }), "string", "한 스탯 상한");
assert.equal(typeof checkPvpStats("sword", { str2: 250, vit2: 250 }), "string", "합계 상한");
assert.equal(typeof checkPvpStats("sword", { int2: 10 }), "string", "다른 직업 스탯 금지");
assert.ok(eloDelta(1000, 1000, 1, 20) === 16 && eloDelta(1000, 1000, 0, 20) === -16 && eloDelta(1000, 1000, 1, 0) === 20);
assert.ok(eloDelta(1400, 1000, 1, 20) < 5 && eloDelta(1000, 1400, 1, 20) > 25, "강한 상대를 이기면 더 많이 오름");
assert.equal(pvpTier(1000).name, "실버"); assert.equal(pvpTier(1750).name, "마스터");
ok("프리셋·직접 배분 검사·레이팅(Elo)·등급");

// ── 저장 데이터 정리
{
  const c = sanitizeChar({ cls: "sword", pvp: { rating: 99999, w: -3, preset: "custom", stats: { str2: 999 }, skills: ["c_thrust", "ma_meteor", ...Array(SKILL_SLOTS - 2).fill(null)] } }, "a");
  assert.equal(c.pvp.rating, 5000); assert.equal(c.pvp.w, 0); assert.equal(c.pvp.preset, "bal", "잘못된 직접 배분 → 균형형");
  assert.equal(c.pvp.skills[1], null, "다른 직업 스킬 제거");
  const old = sanitizeChar({ cls: "mage" }, "b");
  assert.deepEqual(old.pvp, newPvpRecord(), "기존 저장 데이터 호환");
}
ok("PvP 기록 저장 정리 · 세이브 호환");

// ── 프로토콜
assert.ok(validateClientMessage({ t: "pvp", a: "queue" }));
assert.ok(validateClientMessage({ t: "pvp", a: "save", preset: "custom", stats: { str2: 200 }, skills: Array(SKILL_SLOTS).fill(null) }));
assert.ok(!validateClientMessage({ t: "pvp", a: "hack" }));
assert.ok(!validateClientMessage({ t: "pvp", a: "save", stats: { str2: 1e9 } }));
ok("PvP 메시지 검증");

// ── 지도: 결투장 · 두 마을의 명예의 전당 판자와 관리인
{
  const a = makeArena();
  assert.equal(a.kind, "pvp"); assert.equal(a.spawnsPvp.length, 2);
  assert.equal(Math.round(a.spawnsPvp[0][1]), Math.round(a.spawnsPvp[1][1]), "좌우 대칭 시작점");
  for (const t of [makeTown(), makeVerdanTown()]) {
    assert.ok(t.objects.some((o) => o.kind === "pvpboard"), "명예의 전당");
    assert.ok(t.objects.some((o) => o.kind === "npc" && o.id === "arena"), "결투장 관리인");
  }
}
ok("결투장 지도 · 마을 명예의 전당 판자 · 관리인");

const world = makeWorld();
let saved = [];
world.save = (s) => { saved.push({ id: s.userId, level: s.char.level, pvp: !!s.isPvpProxy }); };

// ── 평준화: 250레벨 심연 장비·2차 전직 vs 15레벨 → 결투장 능력치 동일
{
  const big = mkSession(world, "sword", { level: 250 });
  big.char.cls2 = "darkknight";
  for (const slot of ["weapon", "offhand", "helmet", "armor", "trinket"]) { const g = CLASS_GEAR.sword; big.char.equip[slot] = makeItem({ slot, type: slot === "weapon" ? g.w[0] : slot === "offhand" ? g.o[0] : undefined, variant: 0, rarity: "심연", ilvl: 250 }); }
  refreshStats(big.unit);
  const small = mkSession(world, "sword", { level: 15 });
  const realHp = big.unit.maxHp;
  const pa = pvpChar(big.char), pb = pvpChar(small.char);
  assert.equal(pa.level, PVP.level); assert.equal(pa.cls2, null); assert.deepEqual(pa.equip, {});
  const room = world.startPvp(big, small, false);
  assert.equal(big.unit.room, room); assert.equal(small.unit.room, room);
  assert.equal(big.unit.maxHp, small.unit.maxHp, "같은 직업·같은 세팅이면 체력 동일");
  assert.equal(big.unit.stats.atk, small.unit.stats.atk, "공격력 동일");
  assert.equal(big.unit.level, PVP.level);
  assert.ok(big.unit.session.isPvpProxy && big.unit.session.realChar === big.char, "대리 세션");
  // 저장 안전: 결투 중 저장해도 원래 캐릭터(250레벨)
  saved = []; world.save(big.unit.session);
  const pc = world.publicChar(big.unit.session);
  assert.equal(pc.level, 250, "대리 세션으로 보내도 원래 캐릭터 정보"); assert.deepEqual(pc.skills, big.pvpChar.skills, "화면 스킬칸은 결투 세팅");
  assert.ok(pc.pvpActive?.level === PVP.level);
  room.forfeit(small, "leave");
  for (let i = 0; i < 100; i++) { world.clock += 0.05; room.tick(); room.events.length = 0; }
  assert.equal(big.unit.room, world.town); assert.equal(small.unit.room, world.town);
  assert.equal(big.unit.session, big, "원래 세션 복구"); assert.equal(big.unit.pvp, undefined);
  assert.equal(big.unit.maxHp, realHp, "원래 능력치 복구");
  assert.equal(big.char.level, 250); assert.equal(big.char.cls2, "darkknight");
  assert.ok(big.packets.some((p) => p.t === "pvpEnd" && p.win === 1 && p.ranked === 0), "친선전 기권승");
  assert.equal(big.char.pvp?.games ?? 0, 0, "친선전은 기록 없음");
}
ok("레벨·스탯·장비·2차 전직 평준화 · 기권 · 원래 캐릭터 복구");

// ── 대기열 매칭 · 순위전 · 레이팅
{
  const a = mkSession(world, "mage"), b = mkSession(world, "archer"), c = mkSession(world, "rogue");
  c.char.pvp = { ...newPvpRecord(), rating: 2400 };
  world.pvpOp(a, { a: "queue" }); world.pvpOp(c, { a: "queue" });
  assert.ok(!a.pvpRoom && !c.pvpRoom, "레이팅 차이가 크면 바로 묶지 않음");
  world.pvpOp(b, { a: "queue" });
  assert.ok(a.pvpRoom && a.pvpRoom === b.pvpRoom, "비슷한 레이팅끼리 매칭");
  assert.ok(world.pvpQueue.has(c.userId));
  world.pvpOp(c, { a: "leave" });
  assert.ok(!world.pvpQueue.has(c.userId));
  // 결투장에서 물약 금지, 마을 귀환 요청 = 기권
  a.char.cons.hp_potion = 3;
  world.usePotion(a, "hp_potion");
  assert.equal(a.char.cons.hp_potion, 3, "물약 금지");
  const room = a.pvpRoom;
  const r = duel(world, a, b, { seed: 42 });
  void room;
  assert.ok(r.winner === 0 || r.winner === 1 || r.winner === -1);
  const winS = r.winner === 1 ? b : a, loseS = r.winner === 1 ? a : b;
  if (r.winner >= 0) {
    assert.ok(winS.char.pvp.rating > 1000 && loseS.char.pvp.rating < 1000, "레이팅 변동");
    assert.equal(winS.char.pvp.w, 1); assert.equal(loseS.char.pvp.l, 1);
  }
  assert.ok(r.log.length >= 2 && r.log.every((l) => l.t <= PVP.roundTime + 1), "라운드 기록·시간 제한");
  assert.equal(a.unit.room, world.town); assert.equal(b.unit.room, world.town);
  assert.ok(a.packets.some((p) => p.t === "pvpStart") && a.packets.some((p) => p.t === "pvpEnd" && p.ranked === 1));
}
ok("대기열 매칭(레이팅 범위) · 물약 금지 · 3판 2선승 · 레이팅 반영 · 마을 귀환");

// ── 승패 주고받기 방지: 같은 두 사람의 순위전은 1시간에 3판까지만 레이팅 반영, 방금 붙은 상대와 바로 재매칭 안 함
{
  const a = mkSession(world, "sword"), b = mkSession(world, "mage");
  for (let k = 0; k < 3; k++) duel(world, a, b, { seed: 300 + k });
  const ra = a.char.pvp.rating, rb = b.char.pvp.rating, ga = a.char.pvp.games;
  const r = duel(world, a, b, { seed: 400 });
  assert.equal(a.char.pvp.games, ga + 1, "판 수는 기록");
  assert.ok(a.char.pvp.rating === ra && b.char.pvp.rating === rb, "4번째 판은 레이팅 그대로");
  void r;
  world.pvpOp(a, { a: "queue" }); world.pvpOp(b, { a: "queue" });
  assert.ok(!a.pvpRoom && world.pvpQueue.has(a.userId), "방금 붙은 상대와 바로 재매칭 안 함");
  for (const x of [a, b]) world.pvpQueue.get(x.userId).at -= 61_000;
  world.pvpMatchmake();
  assert.ok(a.pvpRoom && a.pvpRoom === b.pvpRoom, "1분 넘게 기다리면 허용");
  a.pvpRoom.forfeit(a, "leave");
  for (let i = 0; i < 100; i++) { world.clock += 0.05; b.unit.room.tick?.(); }
}
ok("승패 주고받기 방지 (같은 상대 레이팅 동결 · 즉시 재매칭 금지)");

// ── 친선 결투 신청/수락
{
  const a = mkSession(world, "priest", { name: "Alpha" }), b = mkSession(world, "smith", { name: "Beta" });
  world.pvpOp(a, { a: "challenge", name: "beta" });
  assert.ok(b.packets.some((p) => p.t === "pvpInvite" && p.from === "Alpha"));
  world.pvpOp(b, { a: "accept" });
  assert.ok(a.pvpRoom && a.pvpRoom === b.pvpRoom && !a.pvpRoom.ranked, "친선전 시작");
  // 다른 사람이 신청을 대신 수락할 수 없음
  world.pvpOp(mkSession(world, "sword"), { a: "accept" });
  // 접속 끊김 → 기권 처리 후 정리
  world.finishClose(a);
  assert.ok(b.packets.some((p) => p.t === "pvpEnd" && p.win === 1), "끊긴 쪽 기권패");
  for (let i = 0; i < 100; i++) { world.clock += 0.05; for (const r of world.rooms.values()) { r.tick(); r.events.length = 0; } }
  assert.equal(b.unit.room, world.town);
}
ok("친선 결투 신청·수락 · 접속 끊김 기권");

// ── 세팅 저장
{
  const s = mkSession(world, "sword");
  world.pvpOp(s, { a: "save", preset: "custom", stats: { str2: 250, vit2: 197 } });
  assert.equal(s.char.pvp.preset, "custom"); assert.equal(s.char.pvp.stats.str2, 250);
  world.pvpOp(s, { a: "save", preset: "custom", stats: { str2: 251 } });
  assert.equal(s.char.pvp.stats.str2, 250, "잘못된 배분 거부");
  const list = Array(SKILL_SLOTS).fill(null); list[0] = "sw_thrust"; list[1] = "ma_meteor"; list[2] = "sw_thrust";
  world.pvpOp(s, { a: "save", skills: list });
  assert.equal(s.char.pvp.skills, null, "기본 공격 없는 스킬칸 거부");
  const basic = Object.values(SKILLS).find((k) => k.cls === "sword" && k.kind === "basic" && !k.path);
  list[0] = basic.id;
  world.pvpOp(s, { a: "save", skills: list });
  assert.equal(s.char.pvp.skills[0], basic.id); assert.equal(s.char.pvp.skills[1], null, "다른 직업 스킬 제외"); assert.ok(s.char.pvp.skills.filter((x) => x === "sw_thrust").length <= 1, "중복 제외");
  assert.deepEqual(pvpChar(s.char).skills, s.char.pvp.skills, "저장한 세팅으로 입장");
}
ok("결투 세팅 저장(직접 배분 검사 · 스킬칸 검사)");

// ── 전투 규칙: 적/아군 판정 · 제어 점감 · 한 대 상한 · 치유 감소
{
  const a = mkSession(world, "priest"), b = mkSession(world, "sword");
  const room = world.startPvp(a, b, false);
  const ua = a.unit, ub = b.unit;
  assert.ok(foe(ua, ub) && !foe(ua, ua), "결투장에서는 상대 플레이어가 적");
  const t0 = room.now;
  const durs = [];
  for (let k = 0; k < 4; k++) { ub.ccImmuneUntil = 0; ub.status.delete("stun"); const okk = applyStatus(room, ua, ub, { type: "stun", dur: 3 }, t0 + k); durs.push(okk ? ub.status.get("stun").until - (t0 + k) : 0); }
  assert.ok(durs[0] <= PVP.ccMax + 1e-9 && durs[1] < durs[0] && durs[2] < durs[1] && durs[3] === 0, `제어 점감 ${durs}`);
  ub.hp = ub.maxHp;
  room.phase = "fight";
  dealDamage(room, ua, ub, { pow: 1e6 }, room.now);
  assert.ok(ub.hp >= ub.maxHp * (1 - PVP.hitCap) - 1, "한 대 피해 상한");
  ub.hp = 1; const healed = heal(room, ua, ub, 1000, room.now);
  assert.ok(healed <= 1000 * PVP.heal + 1, "결투장 치유 감소");
  room.forfeit(a, "leave");
  for (let i = 0; i < 100; i++) { world.clock += 0.05; room.tick(); room.events.length = 0; }
}
ok("상대 판정 · 기절 점감(→면역) · 한 대 상한 · 치유 감소");

// ── 라운드 시작: 고유 자원(내력·성광·부품·틈)이 가득 찬 상태
{
  const full = { sword: ["ki", 100], fist: ["ki", 100], priest: ["holy", 100], smith: ["parts", 3], rogue: ["gap", 3] };
  for (const [A, B] of [["sword", "smith"], ["priest", "rogue"], ["fist", "mage"]]) {
    const sa = mkSession(world, A), sb = mkSession(world, B);
    const room = world.startPvp(sa, sb, false);
    for (const s of [sa, sb]) { const f = full[s.char.cls]; if (f) assert.equal(s.unit[f[0]], f[1], `${s.char.cls} 시작 ${f[0]}`); }
    room.forfeit(sa, "leave");
    for (let i = 0; i < 100; i++) { world.clock += 0.05; room.tick(); room.events.length = 0; }
    world.sessions.delete(sa.userId); world.sessions.delete(sb.userId);
  }
}
ok("라운드 시작 고유 자원 가득");

// ── 직업 밸런스: 7직업 봇 1대1 (각 조합 6판) — 극단적인 직업이 없어야 함
{
  const wins = {}, games = {};
  for (const c of PVP_CLASSES) { wins[c] = 0; games[c] = 0; }
  const T = [];
  let seed = 101, rs = 20261123;
  const oldRandom = Math.random;
  Math.random = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 2 ** 32); // 결과 재현 가능하게
  for (const A of PVP_CLASSES) for (const B of PVP_CLASSES) {
    if (A >= B) continue;
    for (let k = 0; k < 8; k++) {
      const sa = mkSession(world, A), sb = mkSession(world, B);
      const [p, q] = k % 2 ? [sb, sa] : [sa, sb];
      const r = duel(world, p, q, { ranked: false, seed: seed++ });
      for (const l of r.log) if (l.t) T.push(l.t);
      const w = r.winner < 0 ? null : r.winner === 0 ? p : q;
      const wa = w === sa ? 1 : !w ? 0.5 : 0;
      wins[A] += wa; wins[B] += 1 - wa; games[A]++; games[B]++;
      world.sessions.delete(sa.userId); world.sessions.delete(sb.userId);
    }
  }
  Math.random = oldRandom;
  T.sort((a, b) => a - b);
  const wr = Object.fromEntries(PVP_CLASSES.map((c) => [c, wins[c] / games[c]]));
  console.log("  직업별 승률", JSON.stringify(Object.fromEntries(Object.entries(wr).map(([k, v]) => [k, +v.toFixed(2)]))), "라운드 중앙값", T[T.length >> 1] + "초");
  for (const c of PVP_CLASSES) assert.ok(wr[c] >= 0.28 && wr[c] <= 0.72, `${c} 승률 ${wr[c]}`);
  assert.ok(T[T.length >> 1] >= 20 && T[T.length >> 1] <= 60, "한 판 20~60초");
}
ok("직업 밸런스(봇 모의전 승률 30~70%) · 한 판 길이");

assert.equal(errs, 0, "서버 오류 없음");
console.log("PVP TESTS: ALL PASS");
process.exit(0);

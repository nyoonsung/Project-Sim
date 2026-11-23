// PvP 1대1 모의전: 두 봇이 결투장 규칙 그대로 싸움 (밸런스 점검·회귀 테스트용)
//   node tools/pvp-sim.mjs            → 7직업 상성표(승률)·평균 라운드 시간
import { World } from "../server/game/world.js";
import { makePlayerUnit, newCharacter } from "../server/game/player.js";
import { SKILLS } from "../shared/skills.js";
import { SKILL_SLOTS } from "../shared/constants.js";
import { PVP_CLASSES } from "../shared/pvp.js";

const RANGE = { archer: 210, mage: 200, priest: 170, sword: 36, fist: 34, rogue: 34, smith: 50 };

export function makeWorld() {
  const world = new World();
  clearInterval(world.loop); world.loop = null;
  world.save = () => {}; world.saveSoon = () => {};
  world.broadcastSys = () => {};
  return world;
}
let uid = 70000;
export function mkSession(world, cls, { level = 30, name } = {}) {
  const id = ++uid;
  const c = newCharacter(name ?? "b" + id); c.cls = cls; c.level = level;
  const packets = [], notes = [];
  const s = { userId: id, name: c.name, char: c, send: (p) => packets.push(p), notice: (t) => notes.push(t), sendMe() {}, potionCd: {}, invites: new Set(), packets, notes };
  s.unit = makePlayerUnit(s);
  world.sessions.set(id, s);
  world.town.addPlayer(s.unit);
  return s;
}

/** 봇 한 틱: 상대에게 거리 맞추기 · 적 예고 피하기 · 스킬 전부 시도 */
function botStep(room, u, o, seq, rnd) {
  if (u.dead || !o || o.dead) return;
  const d = Math.hypot(o.x - u.x, o.y - u.y) || 1;
  const want = RANGE[u.cls] ?? 40;
  let mx = 0, my = 0;
  if (d > want) { mx = (o.x - u.x) / d; my = (o.y - u.y) / d; }
  else if (want > 100 && d < want * 0.6) { mx = -(o.x - u.x) / d; my = -(o.y - u.y) / d; }
  // 옆으로 조금씩 움직이기
  const side = Math.sin(room.now * 1.3 + u.id) * 0.5;
  mx += (-(o.y - u.y) / d) * side; my += ((o.x - u.x) / d) * side;
  // 상대 예고 장판 피하기
  for (const a of room.areas) if (a.pvp && a.pvp !== u.pvp && a.shape === "c" && Math.hypot(a.x - u.x, a.y - u.y) < (a.r ?? 40) + 12) { const k = Math.hypot(u.x - a.x, u.y - a.y) || 1; mx = (u.x - a.x) / k; my = (u.y - a.y) / k; }
  // 결계가 좁혀지면 거점으로
  if (room.stormOn && !room.inZone(u)) { const [zx, zy] = room.map.zoneAt; const k = Math.hypot(zx - u.x, zy - u.y) || 1; mx = (zx - u.x) / k; my = (zy - u.y) / k; }
  const n = Math.hypot(mx, my); if (n > 1) { mx /= n; my /= n; }
  room.pushInput(u, { s: seq, mx, my, ax: o.x, ay: o.y });
  const skills = u.session.char.skills;
  // 궁극기·액티브 먼저, 기본 공격 마지막 (회복은 체력 60% 아래에서)
  const order = [...Array(SKILL_SLOTS).keys()].sort((a, b) => (SKILLS[skills[b]]?.kind === "basic" ? -1 : 0) - (SKILLS[skills[a]]?.kind === "basic" ? -1 : 0));
  for (const slot of order) {
    const sk = SKILLS[skills[slot]];
    if (!sk) continue;
    if (sk.id === "c_dash" && rnd() > 0.02) continue;
    const self = sk.aim === "self" || sk.aim === "ally";
    if (self && (sk.steps ?? []).some((st) => st.do === "heal") && u.hp / u.maxHp > 0.6) continue;
    room.cast(u, { slot, ax: self ? u.x : o.x, ay: self ? u.y : o.y, tx: sk.aim === "ally" ? u.id : undefined });
  }
}

/** 한 경기 진행 → { winner(0|1|-1), score, rounds[{t, why, w}] } */
export function duel(world, a, b, { ranked = true, maxSec = 600, seed = 1 } = {}) {
  let x = seed >>> 0;
  const rnd = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const room = a.pvpRoom && a.pvpRoom === b.pvpRoom ? a.pvpRoom : world.startPvp(a, b, ranked);
  let result = null;
  const orig = world.pvpFinish.bind(world);
  world.pvpFinish = (r, w, why) => { if (r === room) result = { winner: w, score: r.score.slice(), log: r.log.slice(), why }; return orig(r, w, why); };
  let seq = 0;
  for (let i = 0; i < maxSec * 20 && !result; i++) {
    world.clock += 0.05;
    const ua = a.unit, ub = b.unit;
    seq++;
    if (room.phase === "fight") { botStep(room, ua, ub, seq, rnd); botStep(room, ub, ua, seq, rnd); }
    room.tick(); room.events.length = 0;
  }
  world.pvpFinish = orig;
  // 결과 뒤 마을 귀환 예약 실행
  for (let i = 0; i < 100; i++) { world.clock += 0.05; room.tick(); room.events.length = 0; }
  return result ?? { winner: -1, score: room.score.slice(), log: room.log.slice(), why: "timeout" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const world = makeWorld();
  const N = Number(process.env.N ?? 4);
  const cls = PVP_CLASSES;
  const wins = Object.fromEntries(cls.map((c) => [c, 0])), games = Object.fromEntries(cls.map((c) => [c, 0]));
  const roundT = [];
  const table = {};
  let seed = 7;
  for (const A of cls) for (const B of cls) {
    if (A >= B) continue;
    let wa = 0;
    for (let k = 0; k < N; k++) {
      const sa = mkSession(world, A), sb = mkSession(world, B);
      const [p, q] = k % 2 ? [sb, sa] : [sa, sb]; // 시작 위치 바꿔 가며
      const r = duel(world, p, q, { seed: seed++ });
      for (const l of r.log) if (l.t) roundT.push(l.t);
      const winS = r.winner < 0 ? null : r.winner === 0 ? p : q;
      if (winS === sa) wa += 1; else if (!winS) wa += 0.5;
      world.sessions.delete(sa.userId); world.sessions.delete(sb.userId);
      sa.unit.room?.removePlayer(sa.unit); sb.unit.room?.removePlayer(sb.unit);
    }
    table[A + ">" + B] = wa / N;
    wins[A] += wa; wins[B] += N - wa; games[A] += N; games[B] += N;
  }
  console.log("직업별 승률:", Object.fromEntries(cls.map((c) => [c, +(wins[c] / games[c]).toFixed(2)])));
  roundT.sort((a, b) => a - b);
  console.log("라운드 시간(초) 중앙값", roundT[roundT.length >> 1], "평균", +(roundT.reduce((a, b) => a + b, 0) / roundT.length).toFixed(1), "최소", roundT[0], "최대", roundT.at(-1));
  console.log("상성(행 vs 열 승률):");
  for (const A of cls) console.log(A.padEnd(7), cls.map((B) => (A === B ? "  -  " : (A < B ? table[A + ">" + B] : 1 - table[B + ">" + A]).toFixed(2).padStart(5))).join(" "));
}

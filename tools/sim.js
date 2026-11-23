// 밸런스 시뮬레이터: 실제 서버 코드로 "레벨 L 직업 C가 F층을 깨는가"를 빠르게 돌려 본다
//   node tools/sim.js [cls] [floors...]
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats, availableSkills } from "../server/game/player.js";
import { CLASS_INFO, xpToNext } from "../shared/classes.js";
import { TILE, SKILL_SLOTS } from "../shared/constants.js";
import { rollItem } from "../shared/items.js";
import { floorKind } from "../shared/zones.js";

const PRI = { sword: ["str2", "vit2"], fist: ["str2", "tough"], archer: ["agi2", "vit3"], rogue: ["agi3", "surv"], mage: ["int2", "spi2"], priest: ["faith", "vit2"], smith: ["str2", "dura"], adventurer: ["str", "vit"] };
const RANGE = { archer: 200, mage: 190, priest: 180 };

export function makeChar(cls, L, gearRarity = "희귀", cls2 = null) {
  const c = newCharacter("sim");
  c.level = L; c.cls = cls; c.cls2 = cls2;
  const pts = (L - 1) * 3;
  const [a, b] = PRI[cls];
  c.stats = { [a]: Math.ceil(pts * 0.6), [b]: Math.floor(pts * 0.4) };
  c.unspent = 0;
  let R = 0.5; const r = () => (R = (R * 9301 + 49297) % 233280) / 233280;
  for (const slot of ["weapon", "offhand", "helmet", "armor", "trinket"]) {
    let it;
    for (let k = 0; k < 60; k++) { it = rollItem(r, { ilvl: Math.max(1, L - 2), cls, rarity: gearRarity }); if (it.slot === slot) break; }
    if (it.slot === slot && (slot !== "weapon" || true)) c.equip[slot] = it;
  }
  if (cls === "adventurer") c.equip.weapon.type = "club";
  const av = availableSkills(c);
  const basic = av.find((s) => s.kind === "basic" && s.cls === cls) ?? av.find((s) => s.kind === "basic");
  const order = { 전설: 0, 영웅: 1, 희귀: 2, 일반: 3 };
  const act = av.filter((s) => s.cls === cls && !s.path && !["basic", "passive"].includes(s.kind) && !s.exclusive && !s.moveSkill && !["sw_block", "fi_counter", "fi_imun", "sm_rivet"].includes(s.id)).sort((x, y) => order[x.grade] - order[y.grade]);
  const baseSkills = [basic?.id ?? "c_thrust", ...act.slice(0, SKILL_SLOTS - 3).map((s) => s.id)];
  if (cls2) {
    // 2차 전직: 기본기 + 열린 2차 액티브 우선, 남은 칸은 1차 액티브로 채운다. 패시브는 자동 적용.
    const p2 = av.filter((s) => s.path === cls2).sort((a, b) => a.tier - b.tier);
    const b2 = p2.find((s) => s.kind === "basic") ?? basic;
    const a2 = p2.filter((s) => !["basic", "passive"].includes(s.kind) && !s.moveSkill && !["vj_guardtaunt", "ht_doom", "dk_duskveil"].includes(s.id));
    const chosen = [b2?.id ?? baseSkills[0], ...a2.slice(0, SKILL_SLOTS - 3).map((s) => s.id)];
    for (const id of act.map((s) => s.id)) {
      if (chosen.length >= SKILL_SLOTS - 2) break;
      if (!chosen.includes(id)) chosen.push(id);
    }
    c.skills = [...chosen, "c_dash", "c_firstaid"].slice(0, SKILL_SLOTS);
  } else {
    c.skills = [...baseSkills, "c_dash", "c_firstaid"].slice(0, SKILL_SLOTS);
  }
  while (c.skills.length < SKILL_SLOTS) c.skills.push(null);
  return c;
}

const stubWorld = { pickup: () => true, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {} };

export function simulate(cls, L, F, { maxT = 300, rarity = "희귀", log = false, dungeon = 1, immortal = false, cls2 = null } = {}) {
  const ch = makeChar(cls, L, rarity, cls2);
  const session = { userId: 1, role: "player", char: ch, send() {}, notice() {}, sendMe() {}, meDirty: false };
  const u = makePlayerUnit(session);
  session.unit = u;
  refreshStats(u);
  u.hp = u.maxHp;
  const map = makeFloor(F, 12345 + F, 1, dungeon);
  const room = new Room(stubWorld, { id: "sim", kind: "dungeon", floor: F, dungeon, map, partySize: 1 });
  room.addPlayer(u);
  let dmgTaken = 0, maxHit = 0, potions = 5, t = 0, xp0 = ch.xp + 0;
  const range = RANGE[cls] ?? 34;
  const kind = floorKind(F);
  let target = null;
  const M = map;
  const passable = (x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && [1, 6, 3].includes(M.tiles[y * M.w + x]) && !(M.tiles[y * M.w + x] === 3 && !M.doorsOpen);
  const stepTo = (tx, ty) => {
    const sx = Math.floor(u.x / TILE), sy = Math.floor(u.y / TILE), gx = Math.floor(tx / TILE), gy = Math.floor(ty / TILE);
    const prev = new Map([[sy * M.w + sx, -1]]); const q = [sy * M.w + sx]; let qi = 0;
    while (qi < q.length) { const i = q[qi++]; if (i === gy * M.w + gx) break; const x = i % M.w, y = (i / M.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * M.w + nx; if (!passable(nx, ny) || prev.has(j)) continue; prev.set(j, i); q.push(j); } }
    let i = gy * M.w + gx; if (!prev.has(i)) return [tx, ty];
    const path = []; while (i !== -1) { path.push(i); i = prev.get(i); } path.reverse();
    const n = path[Math.min(2, path.length - 1)]; return [(n % M.w) * TILE + 16, ((n / M.w) | 0) * TILE + 16];
  };
  let seq = 0, lastHp = u.hp, bossSeen = false;
  const total = room.wave ? room.total : [...room.units.values()].filter((x) => x.team === "m").length;
  while (t < maxT) {
    // 행동
    const enemies = [...room.units.values()].filter((m) => m.team === "m" && !m.dead && !m.dummy);
    if (!target || target.dead || !room.units.has(target.id) || room.tickN % 20 === 0) {
      target = enemies.sort((a, b) => (b.boss ? 1e9 : 0) - (a.boss ? 1e9 : 0) || Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0] ?? null;
    }
    let mx = 0, my = 0, ax = u.x + 1, ay = u.y;
    if (kind !== "normal" && !room.bossStarted) { my = -1; }
    else if (target) {
      ax = target.x; ay = target.y;
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      if (d > range) { const [wx, wy] = stepTo(target.x, target.y); const dd = Math.hypot(wx - u.x, wy - u.y) || 1; mx = (wx - u.x) / dd; my = (wy - u.y) / dd; }
      else if (range > 100 && d < range * 0.5) { mx = -(target.x - u.x) / d; my = -(target.y - u.y) / d; }
      // 예고 장판 피하기
      for (const a of room.areas) if (a.team === "m" && a.shape === "c" && Math.hypot(a.x - u.x, a.y - u.y) < a.r + 10) { const d2 = Math.hypot(u.x - a.x, u.y - a.y) || 1; mx = (u.x - a.x) / d2; my = (u.y - a.y) / d2; }
      for (let s = 0; s < SKILL_SLOTS; s++) if (d < range + 60 || RANGE[cls]) room.cast(u, { slot: s, ax, ay, tx: u.id });
    } else if (room.exitOpen && kind === "normal") break;
    room.pushInput(u, { s: ++seq, mx, my, ax, ay });
    if (process.env.SIMDBG && room.tickN % 20 === 0) console.log(t.toFixed(1), Math.round(u.x), Math.round(u.y), room.bossStarted, room.bossId, room.timers.length, mx, my);
    if (u.hp < u.maxHp * 0.35 && potions > 0 && t - (u.potAt ?? -99) > 15) { potions--; u.potAt = t; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.35); }
    room.tick();
    room.events.length = 0;
    if (u.hp < lastHp) { dmgTaken += lastHp - u.hp; maxHit = Math.max(maxHit, (lastHp - u.hp) / u.maxHp); }
    if (immortal) { u.hp = u.maxHp; u.dead = false; }
    lastHp = u.hp;
    t += 0.05;
    if (u.dead) break;
    if (room.bossId) bossSeen = true;
    if (kind !== "normal" && bossSeen && ![...room.units.values()].some((x) => x.boss)) break;
    if (kind === "normal" && (room.exitOpen || room.killed >= total)) break;
  }
  const boss = room.bossId ? room.units.get(room.bossId) : null;
  const bossDead = bossSeen && !boss;
  return {
    cls, L, F, kind, t: Math.round(t), dead: u.dead, hpLeft: Math.round((u.hp / u.maxHp) * 100), potionsUsed: 5 - potions,
    killed: room.killed, total, bossHp: boss ? Math.round((boss.hp / boss.maxHp) * 100) : bossDead ? 0 : null,
    xpGain: ch.xp - xp0 + (ch.level > L ? 999999 : 0), xpNeed: xpToNext(L), maxHp: u.maxHp, atk: Math.round(u.stats.atk),
    hpPerMin: Math.round((dmgTaken / u.maxHp / Math.max(1, t / 60)) * 100) / 100, dmgTaken: Math.round(dmgTaken), maxHit: Math.round(maxHit * 100),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cls = process.argv[2] ?? "sword";
  const floors = process.argv.slice(3).map(Number);
  for (const F of floors.length ? floors : [3, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    const L = Math.max(1, Math.round(F * Number(process.env.LV ?? 1)));
    const r = simulate(F <= 10 && cls !== "adventurer" ? "adventurer" : cls, L, F, { rarity: process.env.RARITY ?? "희귀" });
    console.log(JSON.stringify(r));
  }
}

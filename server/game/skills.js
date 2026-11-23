// 스킬 실행 엔진: shared/skills.js 의 steps 를 서버에서 판정
import { SKILLS, unlockStage } from "../../shared/skills.js";
import { wearOnCast } from "./wear.js";
import { profOf, profLevel, profGain, profPow, profCost, PROF_MAX, isUncapped } from "../../shared/prof.js";
import { CLASS_INFO, stageOf } from "../../shared/classes.js";
import { PATHS, TIER_LEVEL, PATH_DMG } from "../../shared/classes2.js";
import { moveCircle, circleHitsWall, lineOfSight } from "../../shared/move.js";
import { dealDamage, heal, giveShield, applyStatus, addGroggy, isHardCC, buffSum, angDiff } from "./combat.js";

import { BASIC_SPEED, PLAYER_HIT, CLASS_ASPD } from "../../shared/constants.js";
const RES_NAME = { mp: "MP", ki: "내력", holy: "성광", parts: "부품", gap: "틈", r2: "전직 자원" };
const RES_MAX = { ki: 100, holy: 100, parts: 3, gap: 3 };

const enemies = (room, u) => [...room.units.values()].filter((t) => !t.dead && t.team !== u.team && (t.type !== "d" || t.targetable));
const pointSegmentDistance = (px, py, x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - x0 - dx * t, py - y0 - dy * t);
};
const allies = (room, u) => [...room.players.values()].filter((p) => !p.dead);
const healPower = (u) => u.stats.atk * u.stats.heal * (u.stats.dmgType === "mag" ? u.stats.mag : u.stats.phys) * 0.85;
const msg = (u, text) => u.session.notice(text);

function gain(room, u, g, now) {
  if (!g) return;
  if (g.ki) {
    // 내력 수급 초당 상한 30 (무한 연계 방지), 점혈 4단계면 수급 감소
    if (now - u.kiWindow.t >= 1) u.kiWindow = { t: now, n: 0 };
    const want = g.ki * u.stats.kiGain * (u.acupoint >= 4 ? 0.6 : 1);
    const can = Math.max(0, 30 - u.kiWindow.n);
    const v = Math.min(want, can);
    u.kiWindow.n += v;
    u.ki = Math.min(RES_MAX.ki, u.ki + v);
  }
  if (g.holy) {
    if (now - (u.holyWin?.t ?? -9) >= 1) u.holyWin = { t: now, n: 0 };
    const v = Math.min(g.holy, Math.max(0, 20 - u.holyWin.n));
    u.holyWin.n += v;
    u.holy = Math.min(RES_MAX.holy, u.holy + v);
  }
  if (g.parts) u.parts = Math.min(RES_MAX.parts, u.parts + g.parts);
  if (g.mpPct) u.mp = Math.min(u.maxMp, u.mp + u.maxMp * g.mpPct);
  u.session.meDirty = true;
}

/** 대장장이 자원: 직접 공격 적중 또는 정면 방어 성공 시 1.5초마다 부품 1개 */
function gainPart(room, u, now) {
  if (u.cls !== "smith" || (u.parts ?? 0) >= RES_MAX.parts || now < (u.icd.get("parts") ?? 0)) return false;
  u.icd.set("parts", now + 1.5);
  gain(room, u, { parts: 1 }, now);
  return true;
}

export function cancelCast(room, u, why) {
  if (!u.casting) return;
  u.casting = null;
  room.ev({ e: "cx", id: u.id });
  if (why) msg(u, why);
}

/** 스킬 사용 요청 (서버 검증) */
/** 스킬 시전. 쿨타임·연속 시전 대기·짧은 이동기가 0.3초 안에 끝나면 입력을 기억해 뒀다가 끝나는 즉시 시전(선입력) */
export function castSkill(room, u, slot, ax, ay, tx, now, exp) {
  if (u.dead) return;
  const ch = u.session.char;
  const id = ch.skills[slot];
  const sk = id && SKILLS[id];
  if (!sk || sk.kind === "passive") return;
  if (sk.cls !== "common" && sk.cls !== ch.cls) return;
  if (sk.path) { if (ch.cls2 !== sk.path || ch.level < (TIER_LEVEL[sk.tier] ?? 999)) return; }
  else if (sk.cls !== "common" && stageOf(ch.cls, ch.level) < unlockStage(sk, CLASS_INFO[ch.cls].ranks.length)) return;
  if (isHardCC(u)) return;
  // 이동기는 시전 중이어도 바로 나감 (시전 취소)
  if (sk.moveSkill && u.casting && !u.channel && now >= (u.cds.get(id) ?? 0) && now >= (u.moveLock ?? 0)) cancelCast(room, u);
  const until = exp ?? now + 0.3;
  // 이동기끼리는 0.8초 안에 이어 쓸 수 없음 (대시 쿨타임을 줄인 대신 순간 연속 이동 제한)
  const readyAt = Math.max(sk.noGcd ? 0 : u.lockUntil, u.cds.get(id) ?? 0, sk.moveSkill ? u.moveLock ?? 0 : 0);
  if (u.casting || u.channel || u.dash || now < readyAt) {
    // 선입력: 곧 쓸 수 있으면 기억해 뒀다가 바로 시전 (마지막 입력이 우선)
    // 기다리는 스킬이 있으면 기본 공격이 덮어쓰지 못함 (누르고 있는 평타 때문에 스킬이 씹히던 문제)
    const q = u.queued, qBasic = q && SKILLS[ch.skills[q.slot]]?.kind === "basic";
    if (!u.casting && !u.channel && readyAt < until && (!q || sk.kind !== "basic" || qBasic)) u.queued = { slot, ax, ay, tx, at: Math.max(readyAt, now), exp: until };
    return;
  }
  // 기다리는 스킬이 있는데 기본 공격이 먼저 들어오면 스킬 차례를 지킴
  if (sk.kind === "basic" && u.queued && SKILLS[ch.skills[u.queued.slot]]?.kind !== "basic" && now <= u.queued.exp) return;
  u.queued = null;
  if (room.kind === "town" && sk.steps.some((s) => s.do === "device" || s.do === "zone")) return msg(u, "마을에서는 쓸 수 없는 스킬이에요.");
  // 숙련도: 위력 +2%/레벨, 마나 -1.5%/레벨 (쿨타임은 그대로)
  const plv = profOf(ch, id);
  // 자원
  const cost = { ...(sk.cost ?? {}) };
  if (cost.mp && plv) cost.mp = Math.round(cost.mp * (1 - profCost(plv)) * 10) / 10;
  for (const [k, v] of Object.entries(cost)) {
    const have = u[k] ?? 0;
    if (have < v - 1e-6) {
      if (now - (u.noResAt ?? -9) > 2) { u.noResAt = now; msg(u, `${k === "r2" ? PATHS[ch.cls2]?.res2?.name ?? RES_NAME.r2 : RES_NAME[k]}이(가) 부족해요.`); }
      return;
    }
  }
  if (sk.hpCost && u.hp <= u.maxHp * sk.hpCost + 1) { if (now - (u.noResAt ?? -9) > 2) { u.noResAt = now; msg(u, "생명력이 부족해요."); } return; }
  // 쿨타임 (쿨타임 감소 효과는 없음. 기본 공격만 공격 속도 적용)
  // 기본 공격 사이 딜레이 25% 단축 (BASIC_SPEED), 기본 공격 뒤 다른 스킬 잠금도 짧게
  const cd = sk.kind === "basic" ? (sk.aspd * BASIC_SPEED) / ((u.stats.aspd + buffSum(u, "aspd")) * (CLASS_ASPD[u.cls] ?? 1)) : sk.cd;
  u.cds.set(id, now + cd);
  u.lockUntil = now + (sk.kind === "basic" ? Math.min(0.12, cd * 0.4) : 0.18 + (sk.recover ?? 0));
  for (const [k, v] of Object.entries(cost)) if (k !== "gap") u[k] -= v;
  if (sk.hpCost) { const v = Math.round(u.maxHp * sk.hpCost); u.hp = Math.max(1, u.hp - v); room.ev({ e: "dmg", id: u.id, v, c: 0, a: 0, d: 1, p: 1 }); }
  if (sk.path) u.lastPathCast = now;
  u.lastAction = now;
  const aim = Math.atan2(ay - u.y, ax - u.x);
  const ctx = { sk, aim, ax, ay, tx, mul: 0, prof: plv, pf: 1 + profPow(plv), now };
  gainProf(room, u, sk, now);
  wearOnCast(room, u);
  // 검사 자세 전환: 다른 자세 스킬을 쓰면 그 스킬 피해 +15%, 내력 +10
  if (sk.stance && ch.cls === "sword") {
    if (sk.stance !== u.stance || u.stanceShift) {
      if (sk.stance !== u.stance) room.ev({ e: "stance", id: u.id, s: sk.stance });
      u.stance = sk.stance;
      if (u.stanceShift || sk.kind !== "basic") { ctx.mul += 0.15; gain(room, u, { ki: 10 }, now); }
      u.stanceShift = false;
    }
  }
  // 정밀 시전·잔향 룬 등 다음 공격 강화
  const precise = u.buffs.get("precise");
  if (precise && sk.steps.some((s) => s.pow && ["proj", "area", "line"].includes(s.do))) { ctx.mul += 0.25; u.buffs.delete("precise"); }
  if (hasPassive(ch, "ma_echo") && u.lastSkill && u.lastSkill !== id && sk.kind !== "basic") {
    if (now >= (u.icd.get("ma_echo") ?? 0)) {
      u.icd.set("ma_echo", now + 5);
      const b = u.buffs.get("echo") ?? { until: 0, n: 0, mods: {} };
      b.n = Math.min(2, b.n + 1);
      b.until = now + 12;
      u.buffs.set("echo", b);
    }
  }
  if (sk.steps.some((s) => s.do === "area" || s.do === "zone" || s.do === "line") && u.buffs.get("echo")?.n) {
    ctx.mul += 0.15 * u.buffs.get("echo").n;
    u.buffs.delete("echo");
  }
  ctx.combo = u.lastSkill && u.lastSkill !== id && now - u.lastSkillAt < 2.5;
  u.lastSkill = id;
  u.lastSkillAt = now;
  if (sk.moveSkill) { u.moveLock = now + 0.6; triggerPassive(room, u, "move_skill", now); onMoveSkill2(room, u, sk, now); }
  room.ev({ e: "cast", id: u.id, s: id, a: Math.round(aim * 1000), ct: sk.cast ? 1 : 0, pl: plv, x: u.x | 0, y: u.y | 0, ax: Math.round(ax), ay: Math.round(ay) });
  const go = (t) => {
    if (cost.gap) { ctx.gapSpent = u.gap; if (sk.steps.some((s) => s.consumeGap)) u.gap = 0; else u.gap -= cost.gap; }
    runSteps(room, u, ctx, sk.steps, 0, t);
    if (sk.cast && p2of(u).precast) u.precastElem = sk.elem ?? "arcane";
    // 차원 공명장 복제
    const rz = u.resonance && room.zones.find((z) => z.id === u.resonance && z.charges > 0);
    if (rz && sk.kind !== "ultimate" && !ctx.copy && sk.steps.some((s) => s.pow && ["proj", "area", "line"].includes(s.do))) {
      const px = s0(sk).do === "area" ? clampPoint(room, u, ax, ay, sk.range).x : u.x;
      const py = s0(sk).do === "area" ? clampPoint(room, u, ax, ay, sk.range).y : u.y;
      if (Math.hypot(px - rz.x, py - rz.y) <= rz.r) {
        rz.charges--;
        room.ev({ e: "fx", fx: "arcane/mana-burst", x: rz.x | 0, y: rz.y | 0, s: 0.6 });
        room.schedule(0.4, (t2) => runSteps(room, u, { ...ctx, mul: ctx.mul - (1 - (rz.copyMul ?? 0.4)), copy: true }, sk.steps.filter((s) => s.pow), 0, t2));
      }
    }
  };
  if (sk.cast) {
    const ct = sk.cast / (u.stats.cast ?? 1);
    u.casting = { skill: id, until: now + ct, fragile: !!sk.fragile || sk.cast >= 0.6, done: go };
    room.ev({ e: "casting", id: u.id, s: id, d: ct });
  } else go(now);
  u.session.meDirty = true;
}
const s0 = (sk) => sk.steps[0];
/** 숙련 경험치: 던전에서 근처(450px)에 적이 있을 때만 오름 */
function gainProf(room, u, sk, now) {
  if (room.kind !== "dungeon" || room.map.safe || sk.kind === "passive") return;
  let near = false;
  for (const t of room.units.values()) if (t.team === "m" && !t.dead && !t.dummy && Math.hypot(t.x - u.x, t.y - u.y) < 450) { near = true; break; }
  if (!near) return;
  const ch = u.session.char;
  ch.prof ??= {};
  const before = profLevel(ch.prof[sk.id] ?? 0, sk.id);
  if (before.max) return;
  ch.prof[sk.id] = (ch.prof[sk.id] ?? 0) + profGain(sk);
  const after = profLevel(ch.prof[sk.id], sk.id);
  u.session.dirty = true;
  (u.session.profOut ??= {})[sk.id] = ch.prof[sk.id]; // 다음 상태 메시지(me)에 묶어서 보냄
  u.session.meDirty = true;
  if (after.lv > before.lv) {
    room.ev({ e: "proflv", id: u.id, s: sk.id, lv: after.lv, x: u.x | 0, y: u.y | 0 });
    const unc = isUncapped(sk.id);
    if (after.lv === 5 || (after.lv === PROF_MAX) || (unc && after.lv > PROF_MAX && after.lv % 10 === 0))
      room.ev({ e: "msg", text: `${u.name}님의 [${sk.name}] 숙련도 Lv.${after.lv}! ${after.lv === 5 ? "이펙트가 강화됐어요!" : unc ? "끝없는 수련!" : "최고 숙련 달성!"}`, kind: after.lv >= PROF_MAX ? "legend" : "info" });
  }
}
const hasPassive = (ch, id) => ch.skills.includes(id);

function runSteps(room, u, ctx, steps, i, now) {
  for (; i < steps.length; i++) {
    if (u.dead) return;
    const st = steps[i];
    const fn = STEP[st.do];
    if (!fn) continue;
    const waits = fn(room, u, ctx, st, now, () => runSteps(room, u, ctx, steps, i + 1, room.now));
    if (waits === "wait") return; // 돌진 등: 끝나면 다음 단계
  }
}

function clampPoint(room, u, ax, ay, range = 200) {
  let dx = ax - u.x, dy = ay - u.y;
  const d = Math.hypot(dx, dy);
  if (d > range) { dx *= range / d; dy *= range / d; }
  let x = u.x + dx, y = u.y + dy;
  // 벽 속이면 시전자 쪽으로 당김
  for (let k = 0; k < 20 && circleHitsWall(room.map, x, y, 2); k++) { x -= dx / 20; y -= dy / 20; }
  return { x, y };
}

function pickAlly(room, u, ctx, range) {
  if (ctx.tx) {
    const t = room.players.get(ctx.tx);
    if (t && !t.dead && Math.hypot(t.x - u.x, t.y - u.y) <= range + 20) return t;
  }
  let best = u, bd = Math.hypot(ctx.ax - u.x, ctx.ay - u.y);
  for (const p of allies(room, u)) {
    if (Math.hypot(p.x - u.x, p.y - u.y) > range) continue;
    const d = Math.hypot(ctx.ax - p.x, ctx.ay - p.y);
    if (d < bd - 4) { bd = d; best = p; }
  }
  return best;
}

const isFlank = (u, t) => t.type !== "p" && angDiff(Math.atan2(u.y - t.y, u.x - t.x), t.facing ?? 0) > (100 * Math.PI) / 180;

/** 적 하나에게 한 번 타격 */
function strike(room, u, t, st, ctx, now, extra = {}) {
  if (t.dead) return null;
  let bonus = ctx.mul + (extra.bonus ?? 0);
  if (st.comboBonus && ctx.combo) bonus += st.comboBonus;
  if (st.afterParry && now - (u.lastParryAt ?? -9) < 2) bonus += st.afterParry;
  if (st.vsCC && (isHardCC(t) || t.status.has("root"))) bonus += st.vsCC;
  if (st.ifAcupoint4 && (u.acupoint >= 4 || now - (u.lastSuppress ?? -9) < 3)) { bonus += st.ifAcupoint4; u.acupoint = 0; u.buffs.delete("acupoint"); }
  if (st.execute) bonus += st.execute * (1 - t.hp / t.maxHp);
  let pow = (st.pow ?? (st.hit?.pow ?? 1)) * (ctx.pf ?? 1); // 숙련도: 위력 배율(다른 보너스와 따로 곱함)
  // ── 2차 전직 타격 옵션
  const P2 = p2of(u);
  const mk = markOf(t, u);
  const behind = isFlank(u, t) || u.buffs.has("as_behind");
  let pen2 = 0, critDmg2 = 0, forceCrit = false;
  if (st.lowHp) bonus += st.lowHp * (1 - u.hp / u.maxHp);
  if (P2.lowHpDmg) bonus += P2.lowHpDmg * (1 - u.hp / u.maxHp);
  if (st.perDef) bonus += st.perDef * Math.min(2, (u.def ?? 0) / (400 + 8 * (u.level ?? 1)));
  if (st.vsMark) bonus += st.vsMark * mk;
  if (st.vsMarkFlat && mk) bonus += st.vsMarkFlat;
  if (st.blinkAtk && P2.shadowMark) bonus += P2.shadowMark * mk;
  if (st.vsDot && hasDot(t)) bonus += st.vsDot;
  if (st.vsCurse && t.status.has("curse")) bonus += st.vsCurse;
  if (P2.curseAmp && t.status.has("curse")) bonus += P2.curseAmp;
  if (st.vsAir && (t.airUntil ?? 0) > now) bonus += st.vsAir;
  if (st.vsShred) bonus += st.vsShred * (t.shredN ?? 0);
  if (P2.riftChase && t.status.has("burn")) bonus += P2.riftChase;
  if (t.status.get("hawk")?.src === u.id) bonus += 0.2;
  if (st.backstab && behind) bonus += st.backstab;
  const stealthed = u.buffs.has("stealth");
  if (st.needBack && !behind && !stealthed) pow *= st.needBack;
  if (st.stealthHit && stealthed) bonus += st.stealthHit;
  if (stealthed && extra.melee) { if (behind) { forceCrit = true; bonus += 1.2; } u.buffs.delete("stealth"); room.ev({ e: "msg", text: "기습!", kind: "self", id: u.id }); }
  if (st.spendR2) {
    if (ctx.r2spent == null) { ctx.r2spent = Math.min(st.spendR2.max, Math.floor(u.r2 ?? 0)); u.r2 = Math.max(0, (u.r2 ?? 0) - ctx.r2spent); u.session.meDirty = true; u.lastSpent = ctx.r2spent; u.lastSpentAt = now; }
    bonus += st.spendR2.per * ctx.r2spent; pen2 += (st.spendR2.pen ?? 0) * ctx.r2spent;
  }
  if (st.spendKi) {
    if (ctx.kiSpent == null) { ctx.kiSpent = Math.min(st.spendKi.max, Math.floor(u.ki ?? 0)); u.ki -= ctx.kiSpent; }
    bonus += st.spendKi.per * ctx.kiSpent;
  }
  if (P2.passion && extra.melee && u.buffs.has("iq_passion")) { bonus += P2.passion; u.buffs.delete("iq_passion"); }
  if (P2.snipeMark && t.status.get("mark2")?.src === u.id && u.cls2 === "sentinel") critDmg2 += P2.snipeMark;
  bonus += vmodBonus(u, t, now);
  if (u.stats.vmods?.vm_constellation && (t.boss || t.elite) && (mk || t.status.has("huntmark") || t.status.has("vitalmark") || t.status.has("hawk"))) critDmg2 += u.stats.vmods.vm_constellation;
  if (st.perGap) pow += st.perGap * (ctx.gapSpent ?? 0);
  if (st.falloff && extra.travel != null) pow *= 1 - st.falloff * extra.travel;
  if (st.bossMul && t.boss) pow *= st.bossMul;
  // 다음 타격 강화 버프 (핏빛 독날·잔영 활주·사냥꾼의 발놀림)
  let nextStatus = null;
  for (const [bid, b] of u.buffs) {
    if (!b.nextHit) continue;
    if (b.nextHit.pow) bonus += b.nextHit.pow;
    if (b.nextHit.status) nextStatus = b.nextHit.status;
    u.buffs.delete(bid);
  }
  const fp = u.buffs.get("footwork");
  const flank = isFlank(u, t);
  const r = dealDamage(room, u, t, { pow, bonus, crit: forceCrit ? "force" : undefined, critBonus: (st.critBonus ?? 0) + (st.hit?.critBonus ?? 0), critDmg: critDmg2, pen: (st.pen ?? 0) + pen2, threat: st.threat ?? st.hit?.threat, flank, capPct: st.capPct, skill: ctx.sk.id, melee: extra.melee, path: ctx.sk.path, elem: ctx.sk.elem }, now);
  if (fp && extra.melee) u.buffs.delete("footwork");
  if (!r || r.dmg === 0) return r;
  strike2After(room, u, t, st, ctx, now, r, { mk, behind, extra });
  if (nextStatus) applyStatus(room, u, t, nextStatus, now);
  const cc = st.cc ?? st.hit?.cc;
  if (cc && (cc.chance == null || Math.random() < cc.chance)) applyStatus(room, u, t, { ...cc, groggy: st.groggy ?? st.hit?.groggy }, now);
  else if ((st.groggy ?? st.hit?.groggy) && t.boss) addGroggy(room, t, st.groggy ?? st.hit.groggy, now);
  if (st.ccIfCC && (isHardCC(t) || t.status.has("root"))) { applyStatus(room, u, t, st.ccIfCC, now); u.lastSuppress = now; }
  if (st.status) applyStatus(room, u, t, ctx.sk.path ? { ...st.status, pm: PATH_DMG[ctx.sk.path] ?? 1 } : st.status, now);
  if (st.freezeChance && Math.random() < st.freezeChance) applyStatus(room, u, t, { type: "freeze", dur: 1.5, groggy: 12 }, now);
  if (st.knock && !t.boss && t.type !== "p") {
    const a = Math.atan2(t.y - u.y, t.x - u.x);
    [t.x, t.y] = moveCircle(room.map, t.x, t.y, Math.cos(a) * st.knock, Math.sin(a) * st.knock, t.r);
  }
  if (st.interrupt && t.windup && t.windup.interruptible !== false) {
    t.windup = null;
    room.ev({ e: "fx", fx: "lightning/zap-hit", x: t.x | 0, y: t.y | 0 });
    room.ev({ e: "msg", text: "시전 차단!", kind: "info", id: t.id });
    if (!t.boss) applyStatus(room, u, t, { type: "stun", dur: 0.6 }, now);
  }
  if (st.gainOnHit) gain(room, u, st.gainOnHit, now);
  if (st.gainPerHit) {
    ctx.gained = ctx.gained ?? 0;
    const cap = st.gainCap?.ki ?? 999;
    const v = Math.min(st.gainPerHit.ki, cap - ctx.gained);
    if (v > 0) { gain(room, u, { ki: v }, now); ctx.gained += v; }
  }
  if (st.partsOnHit && now >= (u.icd.get("parts") ?? 0)) { u.icd.set("parts", now + 3); gain(room, u, { parts: 1 }, now); }
  if (st.gapOnFlank || u.cls === "rogue") {
    const marked = t.status.has("vitalmark") || t.status.get("huntmark")?.src === u.id;
    if (flank || marked && extra.melee) {
      const icd = t.status.get("huntmark")?.src === u.id ? 0.8 : 1.65;
      if (now >= (u.icd.get("gap") ?? 0) && (st.gapOnFlank || marked)) { u.icd.set("gap", now + icd); u.gap = Math.min(3, u.gap + 1); u.session.meDirty = true; room.ev({ e: "gap", id: u.id, n: u.gap }); }
    }
  }
  if (st.onCrit && r.crit && now >= (u.icd.get(ctx.sk.id + "_crit") ?? 0)) {
    u.icd.set(ctx.sk.id + "_crit", now + (st.onCrit.icd ?? 1));
    if (st.onCrit.pow) room.schedule(0.12, (t2) => !t.dead && dealDamage(room, u, t, { pow: st.onCrit.pow, crit: "none" }, t2) && room.ev({ e: "fx", fx: "impacts/hit-spark", x: t.x | 0, y: t.y | 0 }));
    if (st.onCrit.gain) gain(room, u, st.onCrit.gain, now);
  }
  if (st.lifeshareLowest) {
    let low = null;
    for (const p of allies(room, u)) if (!low || p.hp / p.maxHp < low.hp / low.maxHp) low = p;
    if (low) heal(room, u, low, Math.min(r.dmg * st.lifeshareLowest, low.maxHp * 0.2), now);
  }
  if (ctx.sk.fx?.hit) room.ev({ e: "fx", fx: ctx.sk.fx.hit, x: t.x | 0, y: (t.y - 10) | 0, s: ctx.sk.fx.hitScale ?? null, pal: ctx.sk.fx.palette ?? null });
  return r;
}

// 근접 판정 여유: 몬스터는 화면에서 약간 늦게 보이므로(보간) 사거리 +10px, 각도는 몸 두께만큼 넓게
const MELEE_REACH = PLAYER_HIT.meleeReach;
function inArc(u, t, range, arc, aim, extraDeg = 0) {
  const d = Math.hypot(t.x - u.x, t.y - u.y);
  if (d - t.r > range + MELEE_REACH) return false;
  if (d < t.r + 10) return true;
  const body = Math.asin(Math.min(1, (t.r + 6) / d)); // 몸의 가장자리만 걸려도 맞음
  return angDiff(Math.atan2(t.y - u.y, t.x - u.x), aim) <= ((arc + PLAYER_HIT.meleeArc) * Math.PI) / 360 + body + (extraDeg * Math.PI) / 180;
}

const STEP = {
  melee(room, u, ctx, st, now) {
    const range = st.range * PLAYER_HIT.melee * (1 + buffSum(u, "range") * 0.3); // 근접 사거리 대폭 상향
    const fire = (t0, hitIdx) => {
      const near = (a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y);
      const foes = enemies(room, u).filter((t) => lineOfSight(room.map, u.x, u.y, t.x, t.y));
      let list = foes.filter((t) => inArc(u, t, range, st.arc, ctx.aim)).sort(near).slice(0, st.max ?? 99);
      // 조준 보정: 부채꼴 안에 아무도 없으면 조금 옆(±35°)에 있는 가장 가까운 적을 맞힘
      if (!list.length) list = foes.filter((t) => inArc(u, t, range, st.arc, ctx.aim, 35)).sort(near).slice(0, 1);
      for (const t of list) {
        const r = strike(room, u, t, st, ctx, t0, { melee: true });
        if (st.chain && hitIdx === 0 && r?.dmg) chain(room, u, t, st, ctx, t0);
      }
    };
    if (ctx.sk.fx?.swing) room.ev({ e: "fx", fx: ctx.sk.fx.swing, x: u.x | 0, y: u.y | 0, a: Math.round(ctx.aim * 1000), at: u.id, pal: ctx.sk.fx.palette ?? null });
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim ?? "slash", n: st.hits ?? 1 });
    fire(now, 0);
    for (let h = 1; h < (st.hits ?? 1); h++) room.schedule(h * (st.gap ?? 0.1), (t) => { if (!u.dead && !isHardCC(u)) { fire(t, h); if (ctx.sk.fx?.swing && h % 2 === 0) room.ev({ e: "fx", fx: ctx.sk.fx.swing, x: u.x | 0, y: u.y | 0, a: Math.round(ctx.aim * 1000), at: u.id }); } });
    if (st.grantStanceShift) u.stanceShift = true;
  },
  circle(room, u, ctx, st, now) {
    const list = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.radius * PLAYER_HIT.area).slice(0, st.max ?? 99);
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim ?? "spin" });
    if (ctx.sk.fx?.swing) room.ev({ e: "fx", fx: ctx.sk.fx.swing, x: u.x | 0, y: u.y | 0, a: Math.round(ctx.aim * 1000), at: u.id });
    if (ctx.sk.fx?.area) room.ev({ e: "fx", fx: ctx.sk.fx.area, x: u.x | 0, y: u.y | 0, s: st.radius > 80 ? null : 0.7, pal: ctx.sk.fx.palette ?? null });
    for (const t of list) {
      if (st.pow > 0) strike(room, u, t, st, ctx, now);
      else if (st.status) applyStatus(room, u, t, st.status, now);
    }
    if (st.grantStanceShift) u.stanceShift = true;
    // 분화 강타: 주변의 내 용암 지대를 폭발
    if (st.eruptZones) for (const z of room.zones.filter((z) => z.owner === u.id && z.kind === "lava" && Math.hypot(z.x - u.x, z.y - u.y) < st.radius + z.r)) {
      room.ev({ e: "fx", fx: "explosions/big-explosion", x: z.x | 0, y: z.y | 0, s: 0.7 });
      for (const t of enemies(room, u)) if (Math.hypot(t.x - z.x, t.y - z.y) - t.r <= z.r) strike(room, u, t, { pow: 1.6, status: { type: "burn", dur: 4, pow: 0.4 } }, ctx, now);
      z.until = now;
    }
  },
  proj(room, u, ctx, st, now) {
    const n = st.count ?? 1;
    const range = st.range * (1 + buffSum(u, "range"));
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim ?? "shoot" });
    const fireOne = (k, t0) => {
      if (u.dead) return;
      const spread = st.spread ? ((st.spread * Math.PI) / 180) * (n > 1 ? k / (n - 1) - 0.5 : 0) : 0;
      const a = (st.burst ? Math.atan2(ctx.ay - u.y, ctx.ax - u.x) : ctx.aim) + spread + (st.burst && k ? (Math.random() - 0.5) * 0.06 : 0);
      room.addProjectile({
        team: u.team, src: u.id, x: u.x + Math.cos(a) * 10, y: u.y - 8 + Math.sin(a) * 10, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
        range, r: (st.radius ?? 5) + PLAYER_HIT.proj, pierce: st.pierce ?? 0, fx: ctx.sk.fx?.proj, pal: ctx.sk.fx?.palette ?? null, scale: ctx.sk.fx?.scale ?? null,
        onHit: (t, t1, p) => {
          strike(room, u, t, st, ctx, t1, { travel: p.travelled / p.range });
          if (st.explode) explode(room, u, ctx, st, p.x, p.y, t1, t.id);
        },
        onEnd: (t1, p) => { if (st.explode && !p.hit.size) explode(room, u, ctx, st, p.x, p.y, t1); },
      });
    };
    for (let k = 0; k < n; k++) {
      if (st.burst && k > 0) room.schedule(k * st.burst, (t) => fireOne(k, t));
      else fireOne(k, now);
    }
  },
  area(room, u, ctx, st, now) {
    const pt = st.at === "self" ? { x: u.x, y: u.y } : clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 200);
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim ?? "cast" });
    if (ctx.sk.fx?.pre) room.ev({ e: "fx", fx: ctx.sk.fx.pre, x: u.x | 0, y: u.y | 0, s: 0.6 });
    let first = true;
    room.addArea({
      team: u.team, shape: "c", x: pt.x, y: pt.y, r: st.radius, tel: st.telegraph ?? 0, ticks: st.ticks ?? 1, interval: st.interval,
      fire: (t0, a) => {
        let cx = a.x, cy = a.y;
        if (st.scatter) { cx += (Math.random() - 0.5) * 2 * st.scatter; cy += (Math.random() - 0.5) * 2 * st.scatter; }
        if (ctx.sk.fx?.area && (first || st.scatter || (ctx.sk.fx.tick == null))) {
          const life = ctx.sk.fx.areaLife ?? Math.max(0.55, ((a.ticksLeft ?? 1) - 1) * (a.interval ?? 0.25) + 0.55);
          room.ev({ e: "fx", fx: ctx.sk.fx.area, x: cx | 0, y: cy | 0, s: ctx.sk.fx.scale ?? null, pal: ctx.sk.fx.palette ?? null, life, src: u.id });
        }
        if (ctx.sk.fx?.tick) {
          const count = Math.max(1, Math.min(8, Math.floor(ctx.sk.fx.tickCount ?? 1)));
          for (let k = 0; k < count; k++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random()) * st.radius * 0.88;
            const fxX = cx + Math.cos(angle) * radius;
            const fxY = cy + Math.sin(angle) * radius;
            room.ev({
              e: "fx", fx: ctx.sk.fx.tick, x: fxX | 0, y: fxY | 0,
              a: Math.round((ctx.sk.fx.tickAngle ?? 0) * 1000),
              s: ctx.sk.fx.tickScale ?? null, pal: ctx.sk.fx.palette ?? null,
              life: ctx.sk.fx.tickLife ?? 0.8, src: u.id,
            });
          }
        }
        first = false;
        const list = enemies(room, u).filter((t) => Math.hypot(t.x - cx, t.y - cy) - t.r <= st.radius * PLAYER_HIT.area).slice(0, st.max ?? 99);
        const few = st.focusFew && list.length && list.length <= 2 ? st.focusFew : 0;
        for (const t of list) strike(room, u, t, st, ctx, t0, { bonus: few });
        if (st.healAllies) for (const p of allies(room, u)) if (Math.hypot(p.x - cx, p.y - cy) <= st.radius + 20) heal(room, u, p, healPower(u) * st.healAllies, t0);
      },
    });
  },
  line(room, u, ctx, st, now) {
    const ang = ctx.aim, len = st.length, w = st.width;
    const x0 = u.x, y0 = u.y;
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim ?? "cast" });
    room.addArea({
      team: u.team, shape: "r", x: x0, y: y0, ang, l: len, w, tel: st.telegraph ?? 0, ticks: 1,
      fire: (t0) => {
        const steps = 5;
        for (let i = 1; i <= steps; i++) if (ctx.sk.fx?.line) room.ev({ e: "fx", fx: ctx.sk.fx.line, x: (x0 + Math.cos(ang) * (len * i) / steps) | 0, y: (y0 + Math.sin(ang) * (len * i) / steps) | 0, s: 0.35 });
        for (const t of enemies(room, u)) {
          const dx = t.x - x0, dy = t.y - y0;
          const along = dx * Math.cos(ang) + dy * Math.sin(ang), across = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
          if (along >= -t.r && along <= len + t.r && across <= w / 2 + t.r) strike(room, u, t, st, ctx, t0);
        }
      },
    });
  },
  dash(room, u, ctx, st, now, next) {
    let dir = ctx.aim;
    if (st.side) {
      const i = u.lastInput;
      dir = Math.hypot(i.mx, i.my) > 0.2 ? Math.atan2(i.my, i.mx) : ctx.aim + Math.PI / 2;
    }
    const hitSet = new Set();
    room.ev({ e: "anim", id: u.id, a: "dash" });
    if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: u.x | 0, y: u.y | 0, a: Math.round(dir * 1000), s: 0.6, pal: ctx.sk.fx.palette ?? null, life: Math.max(0.4, (st.dist ?? 0) / Math.max(1, st.speed ?? 1) + 0.45), at: u.id });
    room.ev({ e: "dash", id: u.id, a: Math.round(dir * 1000), d: st.dist, v: st.speed });
    u.dash = {
      dir, left: st.dist, speed: st.speed,
      onStep: (t0, fromX = u.x, fromY = u.y) => {
        if (!st.hit) return;
        // 고속 돌진은 한 틱 이동량이 커서 도착점만 검사하면 적을 통과할 수 있다.
        // 직전 위치부터 현재 위치까지의 선분을 검사해 경로상 적중을 놓치지 않는다.
        for (const t of enemies(room, u)) {
          if (hitSet.has(t.id) || pointSegmentDistance(t.x, t.y, fromX, fromY, u.x, u.y) > t.r + u.r + 6) continue;
          hitSet.add(t.id);
          strike(room, u, t, { ...st.hit, cc: st.hit.cc, groggy: st.hit.groggy, threat: st.hit.threat }, ctx, t0, { melee: true });
          if (st.stopOnHit) { u.dash.stop = true; break; }
        }
      },
      onEnd: () => next(),
    };
    return "wait";
  },
  blink(room, u, ctx, st, now) {
    room.ev({ e: "fx", fx: ctx.sk.fx?.self ?? "arcane/blink-out", x: u.x | 0, y: u.y | 0 });
    const want = Math.min(st.dist, Math.hypot(ctx.ax - u.x, ctx.ay - u.y) || st.dist);
    let d = want;
    let nx = u.x, ny = u.y;
    for (; d > 0; d -= 8) {
      const x = u.x + Math.cos(ctx.aim) * d, y = u.y + Math.sin(ctx.aim) * d;
      if (!circleHitsWall(room.map, x, y, u.r) && lineOfSight(room.map, u.x, u.y, x, y)) { nx = x; ny = y; break; }
    }
    u.x = nx; u.y = ny;
    u.session.send({ t: "tp", x: nx, y: ny });
    room.ev({ e: "fx", fx: ctx.sk.fx?.end ?? "arcane/blink-in", x: nx | 0, y: ny | 0 });
  },
  buff(room, u, ctx, st, now) {
    const targets = st.target === "party" ? allies(room, u).filter((p) => Math.hypot(p.x - u.x, p.y - u.y) < (st.radius ?? 200)) : [u];
    for (const t of targets) {
      t.buffs.set(st.id, { until: now + st.dur, mods: st.mods ?? {}, nextHit: st.nextHit ?? null });
      room.ev({ e: "buff", id: t.id, b: st.id, d: st.dur });
    }
    if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: u.x | 0, y: u.y | 0, at: u.id, pal: ctx.sk.fx.palette ?? null, life: st.dur ?? 1 });
  },
  heal(room, u, ctx, st, now) {
    let targets;
    if (st.target === "self") targets = [u];
    else if (st.target === "party") targets = allies(room, u).filter((p) => Math.hypot(p.x - u.x, p.y - u.y) < (st.radius ?? 200));
    else targets = [pickAlly(room, u, ctx, ctx.sk.range ?? 240)];
    room.ev({ e: "anim", id: u.id, a: "cast" });
    for (const t of targets) {
      let amt = (st.pctMax ? t.maxHp * st.pctMax : healPower(u) * st.pow) * (1 + profPow(ctx.prof ?? 0));
      // 구휼의 증표: 체력 낮은 아군 직접 치유 +30% (대상별 12초)
      if (hasPassive(u.session.char, "pr_relief") && t.hp / t.maxHp <= 0.5 && now >= (u.icd.get("relief" + t.id) ?? 0)) { amt *= 1.3; u.icd.set("relief" + t.id, now + 12); }
      if (u.cls === "priest") { t.healedBy = { id: u.id, until: now + 10 }; }
      heal(room, u, t, amt, now);
      const hot = st.hot ?? (st.lowHot && t.hp / t.maxHp <= 0.4 ? st.lowHot : null);
      if (hot && !t.buffs.has("hot_" + ctx.sk.id)) {
        const per = healPower(u) * hot.pow;
        t.buffs.set("hot_" + ctx.sk.id, { until: now + hot.dur, mods: {} });
        for (let k = 1; k <= hot.dur / hot.interval; k++) room.schedule(k * hot.interval, (t1) => heal(room, u, t, per, t1));
      }
      if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: t.x | 0, y: t.y | 0, at: t.id, pal: ctx.sk.fx.palette ?? null, life: hot?.dur ?? st.dur ?? 1 });
    }
  },
  shield(room, u, ctx, st, now) {
    let targets;
    if (st.target === "self") targets = [u];
    else if (st.target === "party") targets = allies(room, u).filter((p) => Math.hypot(p.x - u.x, p.y - u.y) < (st.radius ?? 200));
    else targets = [pickAlly(room, u, ctx, ctx.sk.range ?? 240)];
    room.ev({ e: "anim", id: u.id, a: "cast" });
    for (const t of targets) {
      let amt = (st.pctMax ? t.maxHp * st.pctMax : healPower(u) * st.pow * u.stats.shield) * (1 + profPow(ctx.prof ?? 0));
      if (t === u && st.selfMul) amt *= st.selfMul;
      giveShield(room, t, amt, st.dur, now);
      if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: t.x | 0, y: t.y | 0, at: t.id, pal: ctx.sk.fx.palette ?? null, life: st.dur ?? 1 });
    }
    if (ctx.sk.fx?.area) room.ev({ e: "fx", fx: ctx.sk.fx.area, x: u.x | 0, y: u.y | 0, pal: ctx.sk.fx.palette ?? null, life: st.dur ?? 1, src: u.id });
  },
  zone(room, u, ctx, st, now) {
    const pt = st.at === "self" ? { x: u.x, y: u.y } : clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 200);
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim === "channel" ? "channel" : "cast" });
    const healed = new Map();
    const z = room.addZone({
      team: u.team, owner: u.id, x: pt.x, y: pt.y, r: st.radius, dur: st.dur, interval: st.interval ?? 1, fx: ctx.sk.fx?.area ?? null, pal: ctx.sk.fx?.palette ?? null,
      follow: st.follow ? u.id : 0, endOnMove: st.endOnMove, sx: u.x, sy: u.y, charges: st.charges ?? 0, copyMul: st.copyMul ?? 0.4, kind: st.kind,
      tick: (t0, zz) => {
        if (st.pow) for (const t of enemies(room, u).filter((t) => Math.hypot(t.x - zz.x, t.y - zz.y) - t.r <= zz.r).slice(0, st.max ?? 99)) {
          strike(room, u, t, st, ctx, t0);
          if (st.pull && !t.boss) {
            const a = Math.atan2(zz.y - t.y, zz.x - t.x), d = Math.min(st.pull * zz.interval, Math.hypot(zz.y - t.y, zz.x - t.x));
            [t.x, t.y] = moveCircle(room.map, t.x, t.y, Math.cos(a) * d * (t.elite ? 0.5 : 1), Math.sin(a) * d * (t.elite ? 0.5 : 1), t.r);
          }
        }
        for (const p of allies(room, u)) {
          if (Math.hypot(p.x - zz.x, p.y - zz.y) > zz.r + 10) continue;
          if (st.heal) {
            const n = healed.get(p.id) ?? 0;
            if (n < 6) { heal(room, u, p, healPower(u) * st.heal, t0); healed.set(p.id, n + 1); }
          }
          if (st.dr) p.buffs.set("zone_dr", { until: t0 + zz.interval + 0.2, mods: { dr: st.dr } });
        }
      },
    });
    if (st.kind === "resonance") { u.resonance = z.id; }
  },
  parry(room, u, ctx, st, now) {
    u.parry = { until: now + st.dur, arc: st.arc, dir: ctx.aim, counter: st.counter, skill: ctx.sk.id };
    room.ev({ e: "anim", id: u.id, a: "guard" });
    room.ev({ e: "parryup", id: u.id, d: st.dur });
  },
  taunt(room, u, ctx, st, now) {
    room.ev({ e: "fx", fx: "ui/exclamation", x: u.x | 0, y: (u.y - 30) | 0, s: 0.6 });
    for (const t of enemies(room, u)) {
      if (Math.hypot(t.x - u.x, t.y - u.y) > st.radius || t.type === "d") continue;
      if (t.boss) { const top = Math.max(0, ...t.threat.values()); t.threat.set(u.id, top * 1.3 + 50); }
      else { t.tauntBy = { id: u.id, until: now + st.dur }; t.aggro = true; }
    }
  },
  device(room, u, ctx, st, now) {
    const kind = st.kind;
    // 같은 장치가 이미 있으면 회수(자동 수리: 부품 환급)
    const same = u.devices.map((id) => room.units.get(id)).filter((d) => d && d.kind === kind);
    for (const d of same) {
      room.removeUnit(d);
      if (u.cls === "smith") triggerPassive(room, u, "device_recall", now);
    }
    // 대장장이 방어 장치 동시 최대 2개
    if (u.cls === "smith") {
      const list = u.devices.map((id) => room.units.get(id)).filter((d) => d && d.kind !== "circuit");
      while (list.length >= 2) room.removeUnit(list.shift());
    }
    let x, y;
    if (kind === "wall") { x = u.x + Math.cos(ctx.aim) * st.dist; y = u.y + Math.sin(ctx.aim) * st.dist; }
    else ({ x, y } = clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 160));
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim ?? "cast" });
    if (kind === "golem") room.ev({ e: "fx", fx: "spawn/summon-rise", x: x | 0, y: y | 0 });
    room.spawnDevice(u, kind, x, y, { ...st, dir: ctx.aim, hp: Math.round((st.hp ?? 1) * (kind === "wall" || kind === "golem" ? u.stats.device : 1)), pow: st.pow, radius: st.radius, p2: !!ctx.sk.path });
  },
  channel(room, u, ctx, st, now) {
    u.channel = { until: now + st.dur, mpPct: st.mpPct, interrupted: false };
    room.ev({ e: "anim", id: u.id, a: "channel" });
    if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: u.x | 0, y: u.y | 0, at: u.id, life: st.dur ?? 1 });
  },
  custom(room, u, ctx, st, now) {
    CUSTOM[st.fn]?.(room, u, ctx, st, now);
  },
};

function chain(room, u, first, st, ctx, now) {
  const hit = new Set([first.id]);
  let from = first;
  for (let k = 0; k < st.chain.n; k++) {
    const next = enemies(room, u).filter((t) => !hit.has(t.id) && Math.hypot(t.x - from.x, t.y - from.y) <= st.chain.range)
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    if (!next) break;
    hit.add(next.id);
    room.ev({ e: "beam", fx: "lightning", x0: from.x | 0, y0: from.y | 0, x1: next.x | 0, y1: next.y | 0 });
    dealDamage(room, u, next, { pow: st.chain.pow * (ctx.pf ?? 1), bonus: ctx.mul }, now);
    if (st.status) applyStatus(room, u, next, st.status, now);
    from = next;
  }
}

function explode(room, u, ctx, st, x, y, now, skipId) {
  if (ctx.sk.fx?.hit) room.ev({ e: "fx", fx: ctx.sk.fx.hit, x: x | 0, y: y | 0, s: 0.45 });
  const list = enemies(room, u).filter((t) => t.id !== skipId && Math.hypot(t.x - x, t.y - y) - t.r <= st.explode.radius).slice(0, st.explode.max ?? 99);
  for (const t of list) dealDamage(room, u, t, { pow: st.explode.pow * (ctx.pf ?? 1), bonus: ctx.mul }, now);
}

const CUSTOM = {
  acupoint(room, u, ctx, st, now) {
    u.acupoint = Math.min(4, (u.acupoint ?? 0) + 1);
    u.acuLastHit = now;
    u.buffs.set("acupoint", { until: now + 16, mods: { crit: 0.03 * u.acupoint, dmg: 0.04 * u.acupoint } });
    room.ev({ e: "fx", fx: "status/rage", x: u.x | 0, y: u.y | 0, at: u.id, life: 16 });
    room.ev({ e: "msg", text: `점혈 ${u.acupoint}단계`, kind: "self", id: u.id });
  },
  shadowstep(room, u, ctx, st, now) {
    const inRange = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.range && lineOfSight(room.map, u.x, u.y, t.x, t.y));
    const marked = st.markFirst ? inRange.filter((t) => markOf(t, u) > 0).sort((a, b) => markOf(b, u) - markOf(a, u))[0] : null;
    const t = marked ?? inRange.filter((t) => angDiff(Math.atan2(t.y - u.y, t.x - u.x), ctx.aim) < 0.6)
      .sort((a, b) => Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0];
    if (!t) { msg(u, "범위 안에 표적이 없어요."); u.cds.set(ctx.sk.id, now + 1); return; }
    room.ev({ e: "fx", fx: "arcane/blink-out", x: u.x | 0, y: u.y | 0, pal: ctx.sk.fx?.palette ?? null });
    // 표적의 등 뒤쪽 측면으로
    const back = (t.facing ?? 0) + Math.PI + (Math.random() < 0.5 ? 0.6 : -0.6);
    let nx = t.x + Math.cos(back) * (t.r + u.r + 6), ny = t.y + Math.sin(back) * (t.r + u.r + 6);
    if (circleHitsWall(room.map, nx, ny, u.r)) { nx = t.x - Math.cos(ctx.aim) * (t.r + u.r + 4); ny = t.y - Math.sin(ctx.aim) * (t.r + u.r + 4); }
    if (!circleHitsWall(room.map, nx, ny, u.r)) { u.x = nx; u.y = ny; u.session.send({ t: "tp", x: nx, y: ny }); }
    u.facing = Math.atan2(t.y - u.y, t.x - u.x);
    room.ev({ e: "fx", fx: "arcane/blink-in", x: u.x | 0, y: u.y | 0, pal: ctx.sk.fx?.palette ?? null });
    room.ev({ e: "anim", id: u.id, a: "stab" });
    strike(room, u, t, { pow: st.pow, gapOnFlank: true, blinkAtk: st.blinkAtk, mark: st.blinkAtk ? { n: 1, max: 5, dur: 8 } : null }, ctx, now, { melee: true });
    if (ctx.sk.path === "nightblade" && p2of(u).shadowLinger) { u.buffs.set("nb_linger", { until: now + 1.5, mods: { move: p2of(u).shadowLinger, dr: 0.15 } }); room.ev({ e: "buff", id: u.id, b: "nb_linger", d: 1.5 }); }
  },
  huntmark(room, u, ctx, st, now) {
    const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.range && t.type !== "d")
      .sort((a, b) => Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0];
    if (!t) { msg(u, "범위 안에 표적이 없어요."); u.cds.set(ctx.sk.id, now + 1); return; }
    if (t.status.has("huntmark")) return msg(u, "이미 표식이 있는 적이에요. (지속시간 갱신 불가)");
    t.status.set("huntmark", { until: now + st.dur, src: u.id, v: 0 });
    room.ev({ e: "st", id: t.id, s: "huntmark", d: st.dur });
    u.buffs.set("night_hunt", { until: now + st.dur, mods: { dmg: 0.4, crit: 0.22 } });
    room.ev({ e: "buff", id: u.id, b: "night_hunt", d: st.dur });
    room.ev({ e: "fx", fx: "shadow/hex-sigil", x: t.x | 0, y: t.y | 0, s: 0.6, pal: ctx.sk.fx?.palette ?? null, life: st.dur, src: u.id });
  },
  hymn(room, u, ctx, st, now) {
    u.hymnMode = u.hymnMode === "atk" ? "def" : "atk";
    const mods = u.hymnMode === "atk" ? { dmg: 0.04 } : { dr: 0.05 };
    for (const p of allies(room, u)) {
      if (Math.hypot(p.x - u.x, p.y - u.y) > 220) continue;
      p.buffs.delete("hymn_atk"); p.buffs.delete("hymn_def");
      p.buffs.set("hymn_" + u.hymnMode, { until: now + st.dur, mods });
      room.ev({ e: "buff", id: p.id, b: "hymn_" + u.hymnMode, d: st.dur });
      room.ev({ e: "fx", fx: "holy/blessing", x: p.x | 0, y: p.y | 0, at: p.id, life: st.dur });
    }
    msg(u, u.hymnMode === "atk" ? "성가의 축복: 공격 (+4%)" : "성가의 축복: 방어 (+5%)");
  },
  rivet(room, u, ctx, st, now) {
    u.frontGuard = { until: now + st.dur, dir: ctx.aim, arc: st.arc, dr: st.dr };
    u.guarding = now + st.dur;
    room.ev({ e: "anim", id: u.id, a: "guard" });
    room.ev({ e: "fx", fx: "impacts/shield-block", x: u.x | 0, y: u.y | 0, at: u.id, s: 0.6 });
  },
  circuit(room, u, ctx, st, now) {
    const devs = u.devices.map((id) => room.units.get(id)).filter((d) => d && d.kind !== "circuit");
    if (devs.length < 2) { msg(u, "설치한 장치가 2개 있어야 해요."); u.cds.set(ctx.sk.id, now + 1); return; }
    const [a, b] = devs.slice(-2);
    for (const id of u.devices) { const d = room.units.get(id); if (d?.kind === "circuit") room.removeUnit(d); }
    room.spawnDevice(u, "circuit", (a.x + b.x) / 2, (a.y + b.y) / 2, { dur: st.dur, ends: [[a.x, a.y], [b.x, b.y]] });
    room.ev({ e: "beam", fx: "circuit", x0: a.x | 0, y0: a.y | 0, x1: b.x | 0, y1: b.y | 0, d: st.dur });
  },
};

/** 막기·반격 성공 */
export function onParry(room, u, src, now) {
  const p = u.parry;
  if (!p || now - (u.icd.get("parry") ?? -9) < 0.3) return;
  u.icd.set("parry", now);
  u.lastParryAt = now;
  room.ev({ e: "fx", fx: "impacts/parry", x: u.x | 0, y: u.y | 0 });
  room.ev({ e: "msg", text: "막기 성공!", kind: "self", id: u.id });
  onGuard2(room, u, src, now, "parry");
  const c = p.counter ?? {};
  // 반격 내부 쿨타임 0.8초
  if (now >= (u.icd.get("counter") ?? 0)) {
    u.icd.set("counter", now + 0.8);
    let t = src && !src.dead && src.team === "m" && Math.hypot(src.x - u.x, src.y - u.y) < 90 ? src : null;
    if (!t) t = [...room.units.values()].filter((m) => m.team === "m" && !m.dead && Math.hypot(m.x - u.x, m.y - u.y) < 70).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    if (t && c.pow) {
      dealDamage(room, u, t, { pow: c.pow * u.stats.counter, threat: c.threat ?? 1 }, now);
      room.ev({ e: "anim", id: u.id, a: "slash" });
      if (t.boss) addGroggy(room, t, 12, now);
      else if (t.windup) t.windup = null;
    }
    if (c.gain) gain(room, u, c.gain, now);
    if (c.buff) u.buffs.set(c.buff.id, { until: now + c.buff.dur, mods: c.buff.mods });
  }
  // 연속 방어 시 자원 소모 증가 (권투사)
  if (u.cls === "fist") u.ki = Math.max(0, u.ki - 3);
}

/** 정면 방어(리벳 방패) — 피해 감소 처리 후 호출 */
export function onFrontGuard(room, u, now) {
  if (now >= (u.icd.get("rivet") ?? 0)) {
    u.icd.set("rivet", now + 2);
    if (gainPart(room, u, now)) room.ev({ e: "fx", fx: "impacts/shield-block", x: u.x | 0, y: u.y | 0, s: 0.5 });
  }
}

/** 패시브 발동 */
function triggerPassive(room, u, on, now) {
  const ch = u.session.char;
  for (const id of ch.skills) {
    const s = SKILLS[id];
    const tr = s?.kind === "passive" && s.passive?.trigger;
    if (!tr || tr.on !== on) continue;
    if (now < (u.icd.get(id) ?? 0)) continue;
    u.icd.set(id, now + (tr.icd ?? 0));
    if (tr.buff) u.buffs.set(tr.buff.id, { until: now + tr.buff.dur, mods: tr.buff.mods ?? {}, nextHit: tr.buff.nextHit ?? null });
    if (tr.gain) gain(room, u, tr.gain, now);
  }
}

/** 플레이어가 적을 때렸을 때 (패시브·신화 효과) */
export function onPlayerHit(room, u, t, dmg, crit, now, o) {
  if (u.type !== "p") return;
  const ch = u.session.char;
  // 훈련 허수아비도 실제 적중과 동일하게 2차 전직 적중 효과를 반영한다.
  hit2(room, u, t, dmg, crit, now, o);
  if (t.dummy) {
    const userId = u.userId ?? u.session?.userId ?? u.id;
    const byPlayer = t.dpsByPlayer ??= new Map();
    const dps = byPlayer.get(userId) ?? { total: 0, start: now, last: now };
    if (!dps.total) dps.start = now;
    dps.total += dmg;
    dps.last = now;
    byPlayer.set(userId, dps);
  }
  u.acuLastHit = now;
  for (const id of ch.skills) {
    const s = SKILLS[id];
    const tr = s?.kind === "passive" && s.passive?.trigger;
    if (!tr) continue;
    if (tr.on === "hit" && now >= (u.icd.get(id) ?? 0) && (tr.chance == null || Math.random() < tr.chance)) {
      u.icd.set(id, now + (tr.icd ?? 0));
      if (tr.gain) gain(room, u, tr.gain, now);
      if (tr.healMarked) for (const p of allies(room, u)) if (p.healedBy?.id === u.id && now < p.healedBy.until) heal(room, u, p, healPower(u) * tr.healMarked * 0.5, now);
    }
    if (tr.on === "hit_marked" && (t.status.has("vitalmark") || t.status.has("huntmark")) && now >= (u.icd.get(id + t.id) ?? 0)) {
      u.icd.set(id + t.id, now + tr.icd);
      const b = u.buffs.get("track") ?? { until: 0, n: 0, mods: { dmg: 0 } };
      b.n = Math.min(tr.stack.max, b.n + 1);
      b.mods = { dmg: tr.stack.per * b.n };
      b.until = t.status.get("vitalmark")?.until ?? t.status.get("huntmark")?.until ?? now + 6;
      u.buffs.set("track", b);
    }
  }
  if (o?.dot) return;
  if (u.abyss?.has("rift_surge") && now >= (u.icd.get("a_rift_surge") ?? 0) && Math.random() < 0.12) {
    u.icd.set("a_rift_surge", now + 1.2);
    room.ev({ e: "fx", fx: "shadow/void-orb", x: t.x | 0, y: t.y | 0, s: 0.38 });
    room.schedule(0.05, (t2) => dealDamage(room, u, t, { pow: 1.6, crit: "none", noProcs: true }, t2));
  }
  if (u.abyss?.has("eclipse_mark") && now >= (u.icd.get("a_eclipse_mark") ?? 0) && Math.random() < 0.20) {
    u.icd.set("a_eclipse_mark", now + 3);
    applyStatus(room, u, t, { type: "huntmark", dur: 4 }, now);
  }
  if (u.abyss?.has("star_siphon")) {
    if (now - (u.abyssSiphonWin?.t ?? -9) >= 1) u.abyssSiphonWin = { t: now, n: 0 };
    const v = Math.min(dmg * 0.07, u.maxHp * 0.10 - u.abyssSiphonWin.n);
    if (v > 0) { u.abyssSiphonWin.n += v; heal(room, u, u, v, now, { noEvent: true }); }
  }
  // 대장장이는 특정 기본 공격만이 아니라 모든 직접 공격으로 부품을 수급한다.
  gainPart(room, u, now);
  if (u.mythic?.has("thunder_echo") && crit && Math.random() < 0.25 && now >= (u.icd.get("m_thunder") ?? 0)) {
    u.icd.set("m_thunder", now + 0.8);
    room.ev({ e: "fx", fx: "lightning/zap-hit", x: t.x | 0, y: t.y | 0 });
    room.schedule(0.05, (t2) => dealDamage(room, u, t, { pow: 1.8, crit: "none" }, t2));
  }
  if (u.mythic?.has("vampiric")) {
    if (now - (u.vampWin?.t ?? -9) >= 1) u.vampWin = { t: now, n: 0 };
    const v = Math.min(dmg * 0.05, u.maxHp * 0.08 - u.vampWin.n);
    if (v > 0) { u.vampWin.n += v; heal(room, u, u, v, now, { noEvent: true }); }
  }
  if (u.mythic?.has("ember") && Math.random() < 0.15) applyStatus(room, u, t, { type: "burn", dur: 3, pow: 0.6 }, now);
}

/** 매 틱 플레이어 스킬 상태 (채널링, 정지 감지, 점혈 감소, 순교자의 각인) */
export function tickPlayerSkills(room, u, now, inp) {
  tick2(room, u, now);
  // 선입력된 스킬
  if (u.queued) {
    const q = u.queued;
    if (now > q.exp || u.dead) u.queued = null;
    else if (now >= q.at) { u.queued = null; castSkill(room, u, q.slot, q.ax, q.ay, q.tx, now, q.exp); }
  }
  if (u.parry && now > u.parry.until) u.parry = null;
  if (u.frontGuard && now > u.frontGuard.until) u.frontGuard = null;
  if (u.channel) {
    const c = u.channel;
    if (now >= c.until || c.interrupted) {
      u.mp = Math.min(u.maxMp, u.mp + u.maxMp * c.mpPct * (c.interrupted ? 0.5 : 1));
      if (c.interrupted) msg(u, "집중이 방해받아 회복량이 절반이 됐어요.");
      u.channel = null;
      u.session.meDirty = true;
    }
  }
  const ch = u.session.char;
  // 정밀 시전: 1.5초 정지
  if (hasPassive(ch, "ma_precise") && now - u.idleSince >= 1.5 && !u.buffs.has("precise") && now >= (u.icd.get("ma_precise") ?? 0)) {
    u.icd.set("ma_precise", now + 5);
    u.buffs.set("precise", { until: now + 6, mods: {} });
    room.ev({ e: "buff", id: u.id, b: "precise", d: 6 });
  }
  // 점혈: 공격 연계가 끊기면 5초마다 한 단계씩 감소
  if (u.acupoint > 0 && now - (u.acuLastHit ?? now) > 5) {
    u.acupoint--;
    u.acuLastHit = now;
    if (u.acupoint === 0) u.buffs.delete("acupoint");
    else u.buffs.set("acupoint", { until: u.buffs.get("acupoint")?.until ?? now + 5, mods: { crit: 0.03 * u.acupoint, dmg: 0.04 * u.acupoint } });
  }
  // 순교자의 각인: 아군이 위기면 자동 보호막 (대상별 20초)
  if (hasPassive(ch, "pr_martyr") && room.tickN % 2 === 0) {
    for (const p of allies(room, u)) {
      if (p.hp / p.maxHp > 0.3 || now < (u.icd.get("martyr" + p.id) ?? 0)) continue;
      u.icd.set("martyr" + p.id, now + 20);
      giveShield(room, p, p.maxHp * 0.12, 6, now);
      room.ev({ e: "fx", fx: "holy/divine-shield", x: p.x | 0, y: p.y | 0, at: p.id, s: 0.7 });
    }
  }
}
// ═══════════════════════════ 2차 전직 (2차 업데이트) ═══════════════════════════
const DOTS = ["burn", "poison", "bleed"];
const hasDot = (t) => DOTS.some((k) => t.status.has(k));
const p2Cache = new WeakMap();
/** 장착한 2차 전직 패시브 효과 모음 (스킬 구성이 바뀔 때만 다시 계산) */
export function p2of(u) {
  const ch = u?.session?.char;
  if (!ch?.cls2) return {};
  const key = ch.cls2 + "|" + ch.level + "|" + ch.skills.join(",");
  const c = p2Cache.get(u);
  if (c && c.key === key) return c.v;
  const v = {};
  for (const id of ch.skills) {
    const sk = SKILLS[id];
    if (sk?.kind !== "passive" || !sk.passive?.p2 || sk.path !== ch.cls2 || ch.level < (TIER_LEVEL[sk.tier] ?? 999)) continue;
    Object.assign(v, sk.passive.p2);
  }
  p2Cache.set(u, { key, v });
  return v;
}
const r2Max = (u) => PATHS[u.session?.char?.cls2]?.res2?.max ?? 0;
function gainR2(u, n) {
  const max = r2Max(u);
  if (!max || !n) return;
  const mul = u.buffs.has("kg_fervor") ? 2 : 1;
  u.r2 = Math.min(max, (u.r2 ?? 0) + n * mul);
  u.session.meDirty = true;
}
/** 대상에게 새긴 나의 표식(중첩) */
function markOf(t, u) {
  const m = t?.status?.get("mark2");
  return m && m.src === u.id ? m.n ?? 1 : 0;
}
function addMark(room, u, t, o, now) {
  if (!t || t.dead) return;
  const cur = t.status.get("mark2");
  const n = cur && cur.src === u.id ? Math.min(o.max ?? 5, (cur.n ?? 1) + (o.n ?? 1)) : Math.min(o.max ?? 5, o.n ?? 1);
  t.status.set("mark2", { until: now + (o.dur ?? 8), src: u.id, n, v: 0, pow: 0, next: now + 99 });
  room.ev({ e: "st", id: t.id, s: "mark2", d: o.dur ?? 8 });
}
/** 지속 피해를 즉시 터뜨림: 남은 지속 피해 × 배율 */
function detonateDots(room, u, t, mult, now, clear = false) {
  let total = 0;
  for (const k of DOTS) {
    const s = t.status.get(k);
    if (!s) continue;
    total += (s.srcAtk ?? u.stats.atk) * (s.pow ?? 0.3) * Math.max(1, s.until - now);
    if (clear) t.status.delete(k);
  }
  if (total <= 0) return 0;
  room.ev({ e: "fx", fx: "status/poisoned", x: t.x | 0, y: (t.y - 10) | 0, s: 0.9 });
  dealDamage(room, u, t, { fixed: Math.round(total * mult), crit: "none", noProcs: true }, now);
  return total;
}
/** 흡혈: 초당 최대 HP 12% 상한 */
function lifesteal(room, u, amount, now) {
  if (amount <= 0 || u.dead) return 0;
  if (now - (u.stealWin?.t ?? -9) >= 1) u.stealWin = { t: now, n: 0 };
  const v = Math.min(amount, u.maxHp * 0.12 - u.stealWin.n);
  if (v <= 0) return 0;
  u.stealWin.n += v;
  const before = u.hp;
  heal(room, u, u, v, now);
  const P2 = p2of(u);
  // 잔혈의 갑주: 채우지 못한 손실 일부를 검은 보호막으로
  if (P2.drainShield && now >= (u.icd.get("p2_drainShield") ?? 0)) {
    u.icd.set("p2_drainShield", now + 1.2);
    const miss = u.maxHp - u.hp;
    if (miss > 0) giveShield(room, u, Math.min(u.maxHp * 0.2, miss * P2.drainShield), 3, now);
  }
  // 황혼의 장막(워록): 흡혈하면 그림자 장막
  if (P2.drainVeil && now >= (u.icd.get("p2_drainVeil") ?? 0)) {
    u.icd.set("p2_drainVeil", now + 4);
    u.buffs.set("wl_veil", { until: now + 3, mods: { dr: P2.drainVeil, move: 0.2 } });
    room.ev({ e: "buff", id: u.id, b: "wl_veil", d: 3 });
  }
  return u.hp - before;
}
/** 베르단 수식어: 조건부 피해 (침식·망각·무광, 합산 상한) */
function vmodBonus(u, t, now) {
  const v = u.stats.vmods;
  if (!v) return 0;
  let b = 0;
  if (v.vm_erosion && hasDot(t)) b += t.boss ? Math.min(0.15, v.vm_erosion) : v.vm_erosion;
  if (v.vm_oblivion && (t.boss ? t.status.has("groggy") : isHardCC(t) || t.status.has("root") || t.status.has("slow"))) b += v.vm_oblivion;
  if (v.vm_lightless && (t.status.has("weaken") || t.status.has("mark2") || t.status.has("huntmark") || t.status.has("vitalmark") || t.status.has("curse") || (t.shredN ?? 0) > 0)) b += v.vm_lightless;
  return Math.min(0.35, b);
}

/** strike 뒤: 타격 옵션의 후속 효과 */
function strike2After(room, u, t, st, ctx, now, r, { mk, behind }) {
  const P2 = p2of(u);
  if (st.lifesteal) lifesteal(room, u, r.dmg * st.lifesteal * (u.buffs.has("dusk_veil_drain") ? 1.3 : 1), now);
  if (st.mark) addMark(room, u, t, st.mark, now);
  if (st.markBurst && mk >= (st.markBurst.min ?? 1) && !t.dead) {
    t.status.delete("mark2");
    room.ev({ e: "fx", fx: "shadow/dark-explosion", x: t.x | 0, y: (t.y - 8) | 0, s: 0.6 });
    const pw = st.markBurst.pow * mk * (ctx.pf ?? 1);
    if (st.markBurst.radius) { for (const o of enemies(room, u)) if (Math.hypot(o.x - t.x, o.y - t.y) - o.r <= st.markBurst.radius) dealDamage(room, u, o, { p2: true, pow: pw, bonus: ctx.mul, noProcs: o !== t }, now); }
    else dealDamage(room, u, t, { p2: true, pow: pw, bonus: ctx.mul }, now);
    if (st.lifesteal) lifesteal(room, u, u.stats.atk * pw * st.lifesteal * 0.5, now);
  }
  if (st.burstDot && !t.dead) detonateDots(room, u, t, st.burstDot, now);
  if (st.dotPop && !t.dead && hasDot(t) && Math.random() < st.dotPop) detonateDots(room, u, t, 0.4, now);
  if (st.curse && !t.dead) applyStatus(room, u, t, { type: "curse", dur: st.curse }, now);
  if (P2.curseAmp && t.status.has("curse") && !t.dead) { const c = t.status.get("curse"); c.until = Math.max(c.until, now + 6); }
  if (st.plague) t.plagueBy = u.id;
  if (st.pullIn && !t.boss && !t.dead) {
    const a = Math.atan2(u.y - t.y, u.x - t.x), d = Math.max(0, Math.min(st.pullIn, Math.hypot(u.x - t.x, u.y - t.y) - u.r - t.r - 6));
    [t.x, t.y] = moveCircle(room.map, t.x, t.y, Math.cos(a) * d * (t.elite ? 0.5 : 1), Math.sin(a) * d * (t.elite ? 0.5 : 1), t.r);
  }
  if (st.air && !t.boss) t.airUntil = now + st.air;
  if (st.r2OnHit) gainR2(u, st.r2OnHit);
  if (st.r2PerHit) { ctx.r2g = ctx.r2g ?? 0; const v = Math.min(st.r2PerHit, (st.r2Cap ?? 99) - ctx.r2g); if (v > 0) { ctx.r2g += v; gainR2(u, v); } }
  if (st.poisonBack && behind) applyStatus(room, u, t, st.poisonBack, now);
  if (st.huntMark && P2.arcHunt) {
    if (u.huntTarget && u.huntTarget !== t.id) { const o = room.units.get(u.huntTarget); if (o?.status.get("mark2")?.src === u.id) o.status.delete("mark2"); }
    u.huntTarget = t.id;
    addMark(room, u, t, { n: 1, max: 5, dur: 8 }, now);
  }
  if (st.markMp && P2.arcHunt && mk && now >= (u.icd.get("p2_markMp") ?? 0)) { u.icd.set("p2_markMp", now + 0.5); u.mp = Math.min(u.maxMp, u.mp + u.maxMp * st.markMp); }
  if (st.hawk && !t.dead) {
    for (const o of room.units.values()) if (o.status?.get("hawk")?.src === u.id) o.status.delete("hawk");
    t.status.set("hawk", { until: now + st.hawk, src: u.id, v: 0, pow: 0, next: now + 99 });
    room.ev({ e: "st", id: t.id, s: "hawk", d: st.hawk });
  }
  if (st.judge && !t.dead) { t.judge = { src: u.id, n: 0, until: now + st.judge.dur, need: st.judge.need, pow: st.judge.pow, radius: st.judge.radius }; t.status.set("judgebrand", { until: now + st.judge.dur, v: 0, pow: 0, next: now + 99, src: u.id }); room.ev({ e: "st", id: t.id, s: "judgebrand", d: st.judge.dur }); }
  if (st.judged && !t.dead) { t.status.set("judged", { until: now + st.judged, src: u.id, v: 0, pow: 0, next: now + 99 }); room.ev({ e: "st", id: t.id, s: "judged", d: st.judged }); }
  if (st.judgeBurst && t.status.has("judged")) {
    t.status.delete("judged");
    const v = u.stats.atk * st.judgeBurst.pow;
    dealDamage(room, u, t, { p2: true, pow: st.judgeBurst.pow, bonus: ctx.mul, noProcs: true }, now);
    for (const p of allies(room, u)) if (Math.hypot(p.x - u.x, p.y - u.y) < 300) heal(room, u, p, Math.min(p.maxHp * 0.1, v * st.judgeBurst.heal * 0.1), now);
  }
  if (st.ccIfShock && t.status.has("shock") && !t.dead) applyStatus(room, u, t, { ...st.ccIfShock, groggy: st.groggy }, now);
}

/** 모든 적중(장치·소환수 포함)에 대한 2차 전직 패시브 */
function hit2(room, u, t, dmg, crit, now, o = {}) {
  const ch = u.session.char;
  const P2 = p2of(u);
  const sk = o?.skill ? SKILLS[o.skill] : null;
  // 베르단 수식어: 원시림의(연속 타격 회복)
  const vm = u.stats.vmods;
  if (vm?.vm_primeval && !o.dot && now >= (u.icd.get("vm_primeval") ?? 0)) {
    u.icd.set("vm_primeval", now + 0.5);
    if (now - (u.primeWin?.t ?? -9) >= 1) u.primeWin = { t: now, n: 0 };
    const v = Math.min(u.maxHp * vm.vm_primeval, u.maxHp * 0.02 - u.primeWin.n);
    if (v > 0) { u.primeWin.n += v; heal(room, u, u, v, now, { noEvent: true }); }
  }
  if (!ch.cls2 || o.dot) return;
  // 기본: 1차 직업 자원·심판의 낙인(이단사제) 흡혈
  if (t.status?.get("judged") && !o.noProcs) lifesteal(room, u, dmg * 0.08, now);
  if (P2.venomMark && o.melee) applyStatus(room, u, t, { type: "poison", dur: 5, pow: P2.venomMark, pm: PATH_DMG[u.cls2] ?? 1 }, now);
  if (P2.bloodReturn && o.melee && t.status.has("poison") && (isFlank(u, t) || u.buffs.has("as_behind")) && now >= (u.icd.get("p2_blood") ?? 0)) { u.icd.set("p2_blood", now + 0.6); heal(room, u, u, u.maxHp * P2.bloodReturn, now); }
  if (P2.dotChaser && hasDot(t) && now >= (u.icd.get("p2_chaser") ?? 0)) { u.icd.set("p2_chaser", now + 3); u.buffs.set("tr_chase", { until: now + 1.5, mods: { move: P2.dotChaser } }); room.ev({ e: "buff", id: u.id, b: "tr_chase", d: 1.5 }); }
  if (P2.stepRush && o.melee) { u.buffs.set("st_rush", { until: now + 2.5, mods: { move: P2.stepRush } }); }
  if (P2.dodgeHeal && o.melee && now < (u.dodgeHealUntil ?? 0)) { u.dodgeHealUntil = 0; heal(room, u, u, u.maxHp * P2.dodgeHeal, now); }
  if (P2.chainHit && sk && !o.noProcs) {
    if (u.lastHitSkill && u.lastHitSkill !== sk.id && now - (u.lastHitAt ?? -9) < 2.5 && now >= (u.icd.get("p2_chain") ?? 0)) {
      u.icd.set("p2_chain", now + 0.35);
      room.schedule(0.06, (t2) => !t.dead && dealDamage(room, u, t, { p2: true, pow: P2.chainHit, crit: "none", noProcs: true }, t2) && room.ev({ e: "fx", fx: "impacts/hit-spark", x: t.x | 0, y: t.y | 0 }));
    }
  }
  if (sk) { u.lastHitSkill = sk.id; u.lastHitAt = now; }
  // 원소 순환 / 정밀 영창
  if (sk?.elem) {
    if (P2.elemCycle && u.lastElem && u.lastElem !== sk.elem && now >= (u.icd.get("p2_cycle") ?? 0)) {
      u.icd.set("p2_cycle", now + 2);
      u.mp = Math.min(u.maxMp, u.mp + u.maxMp * 0.05);
      giveShield(room, u, u.maxHp * P2.elemCycle, 4, now);
      room.ev({ e: "fx", fx: "arcane/rune-circle", x: u.x | 0, y: u.y | 0, at: u.id, s: 0.5 });
    }
    u.lastElem = sk.elem;
    if (P2.precast) {
      const em = t.status.get("elemmark");
      if (em && em.src === u.id && em.elem !== sk.elem && !o.noProcs) {
        t.status.delete("elemmark");
        room.schedule(0.05, (t2) => !t.dead && dealDamage(room, u, t, { p2: true, pow: P2.precast, crit: "none", noProcs: true }, t2));
        room.ev({ e: "fx", fx: "arcane/mana-burst", x: t.x | 0, y: t.y | 0, s: 0.6 });
      } else if (u.precastElem && !o.noProcs) {
        t.status.set("elemmark", { until: now + 6, src: u.id, elem: u.precastElem, v: 0, pow: 0, next: now + 99 });
        room.ev({ e: "st", id: t.id, s: "elemmark", d: 6 });
        u.precastElem = null;
      }
    }
  }
  // 전투 성찬(인퀴지터): 무기 적중 → 자신·주변 아군 회복
  if (P2.battleHeal && o.melee && now >= (u.icd.get("p2_comm") ?? 0)) {
    u.icd.set("p2_comm", now + 0.4);
    for (const p of allies(room, u)) if (Math.hypot(p.x - u.x, p.y - u.y) < 220) heal(room, u, p, p.maxHp * P2.battleHeal, now, { noEvent: p !== u });
  }
  // 심판의 낙인(인퀴지터): 무기 공격으로 표식 축적 → 폭발
  if (t.judge && t.judge.src === u.id && o.melee && now < t.judge.until && !o.noProcs) {
    t.judge.n++;
    if (t.judge.n >= t.judge.need) {
      const J = t.judge; t.judge = null; t.status.delete("judgebrand");
      room.ev({ e: "fx", fx: "holy/holy-pillar", x: t.x | 0, y: t.y | 0 });
      for (const m of enemies(room, u)) if (Math.hypot(m.x - t.x, m.y - t.y) - m.r <= J.radius) dealDamage(room, u, m, { p2: true, pow: J.pow, noProcs: true }, now);
    }
  }
  // 용광로 압박(볼케이노): 방어·공격 영구 파쇄
  if (P2.furnace && sk?.path === "volcano" && !t.dead && t.team === "m") shredHit(room, t);
  if (P2.crucible && o.melee && (t.shredN ?? 0) > 0 && now >= (u.icd.get("p2_cruc") ?? 0)) { u.icd.set("p2_cruc", now + 1.5); giveShield(room, u, u.maxHp * P2.crucible, 4, now); heal(room, u, u, u.maxHp * 0.015, now); }
  // 바람의 박자(윈드워커)
  if (P2.windBeat && now >= (u.icd.get("p2_beat") ?? 0) && (sk?.cls === "archer" || !sk)) {
    u.icd.set("p2_beat", now + 0.12);
    u.lastBeatHit = now;
    gainR2(u, P2.windBeat);
    if ((u.r2 ?? 0) >= 100) { u.r2 = 0; windBlade(room, u, t, now, 3.0); }
  }
  if (P2.steam && now >= (u.icd.get("p2_steam") ?? 0)) { u.icd.set("p2_steam", now + 0.15); gainR2(u, P2.steam); }
  if (P2.breath && sk?.cls === "fist" && now >= (u.icd.get("p2_breath") ?? 0)) { u.icd.set("p2_breath", now + 0.25); gainR2(u, 5); }
  if (P2.adapt && sk && (sk.cls === "common" || sk.path === "king") && sk.id !== u.adaptLast && now >= (u.icd.get("p2_adapt") ?? 0)) { u.icd.set("p2_adapt", now + 0.3); u.adaptLast = sk.id; gainR2(u, P2.adapt); }
  // 정통 검식(소드마스터): 일섬 → 회전연참 → 쇄도검
  if (u.cls2 === "swordmaster" && sk?.path === "swordmaster") swordSeq(room, u, t, sk, now);
  // 저격 표식·사냥꾼의 호흡(센티넬): 조준 에너지를 쓴 사격
  if (u.cls2 === "sentinel" && sk && (o.r2spent ?? u.lastSpent ?? 0) >= 30 && now - (u.lastSpentAt ?? -9) < 0.6) {
    if (P2.huntBreath && t.status.get("mark2")?.src === u.id && now >= (u.icd.get("p2_hb") ?? 0)) { u.icd.set("p2_hb", now + 1); heal(room, u, u, u.maxHp * P2.huntBreath, now); }
    if (P2.snipeMark) { for (const m of room.units.values()) if (m !== t && m.status?.get("mark2")?.src === u.id) m.status.delete("mark2"); addMark(room, u, t, { n: 1, max: 1, dur: 10 }, now); }
  }
}
function windBlade(room, u, t, now, pow) {
  let tgt = t;
  for (const m of room.units.values()) if (m.status?.get("hawk")?.src === u.id && !m.dead) { tgt = m; break; }
  if (!tgt || tgt.dead) return;
  room.ev({ e: "beam", fx: "wind", x0: u.x | 0, y0: (u.y - 10) | 0, x1: tgt.x | 0, y1: (tgt.y - 10) | 0 });
  room.ev({ e: "fx", fx: "nature/leaf-storm", x: tgt.x | 0, y: tgt.y | 0, s: 0.6 });
  room.schedule(0.08, (t2) => {
    if (tgt.dead) return;
    dealDamage(room, u, tgt, { p2: true, pow, crit: "roll", noProcs: true }, t2);
    const P2 = p2of(u);
    if (P2.spiritBreath) { const at = u.cds.get("ww_leap"); if (at) u.cds.set("ww_leap", Math.max(t2, at - P2.spiritBreath)); u.session.meDirty = true; }
  });
}
function shredHit(room, t) {
  const max = t.boss ? 5 : t.elite ? 6 : 10;
  if ((t.shredN ?? 0) >= max) return;
  t.shredN = (t.shredN ?? 0) + 1;
  t.atk *= 0.98;
  t.def = (t.def ?? 0) * 0.97;
  if (t.shredN === 1 || t.shredN === max) room.ev({ e: "st", id: t.id, s: "weaken", d: 30 });
}
const SEQ = ["sg_ilseom", "sg_whirl", "sg_rush"];
function swordSeq(room, u, t, sk, now) {
  const i = SEQ.indexOf(sk.id);
  if (i < 0) return;
  const P2 = p2of(u);
  const cur = u.seq ?? { n: 0, at: 0, last: null };
  if (sk.id === cur.last && now - cur.at < 0.6) return; // 같은 기술의 연타는 같은 형식
  if (i === cur.n && now - cur.at < 6) cur.n++;
  else if (i === 0) cur.n = 1;
  else cur.n = 0;
  cur.at = now; cur.last = sk.id;
  u.seq = cur;
  if (P2.swordSeq && cur.n > 0) { u.buffs.set("sg_flow", { until: now + 6, mods: { dmg: P2.swordSeq * cur.n }, n: cur.n }); room.ev({ e: "buff", id: u.id, b: "sg_flow", d: 6 }); }
  if (cur.n >= 3) {
    cur.n = 0;
    room.ev({ e: "msg", text: "검식 완성!", kind: "self", id: u.id });
    if (P2.seqFinish) { u.buffs.set("sg_complete", { until: now + 6, mods: { dmg: P2.seqFinish, crit: 0.1 } }); room.ev({ e: "buff", id: u.id, b: "sg_complete", d: 6 }); }
    if (P2.seqFinisher && now >= (u.icd.get("p2_mugeuk") ?? 0) && !t.dead) {
      u.icd.set("p2_mugeuk", now + 4);
      const F = P2.seqFinisher, a = Math.atan2(t.y - u.y, t.x - u.x);
      room.ev({ e: "fx", fx: "melee/heavy-cleave", x: t.x | 0, y: t.y | 0, a: Math.round(a * 1000), s: 1.2 });
      room.schedule(0.15, (t2) => {
        if (!t.dead) dealDamage(room, u, t, { p2: true, pow: F.pow, pen: F.pen, crit: "roll", noProcs: true }, t2);
        for (let k = 1; k <= 5; k++) room.ev({ e: "fx", fx: "arcane/arcane-missiles", x: (t.x + Math.cos(a) * 60 * k) | 0, y: (t.y + Math.sin(a) * 60 * k) | 0, s: 0.35 });
        for (const m of enemies(room, u)) {
          if (m === t) continue;
          const dx = m.x - t.x, dy = m.y - t.y, along = dx * Math.cos(a) + dy * Math.sin(a), across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
          if (along >= -m.r && along <= 320 + m.r && across <= 30 + m.r) dealDamage(room, u, m, { p2: true, pow: F.wave, noProcs: true }, t2);
        }
      });
    }
  }
}

/** 이동기 사용 직후 (회피 판정 창) */
function onMoveSkill2(room, u, sk, now) {
  const P2 = p2of(u);
  if (P2.dodgeHeal) u.dodgeHealUntil = now + 2.5;
  if (P2.passion) { u.buffs.set("iq_passion", { until: now + 3, mods: {} }); }
  if (P2.fieldSense && (u.r2 ?? 0) >= 10) u.buffs.set("kg_sense", { until: now + 2, mods: {} });
  if (P2.leapBeat && sk.id === "ww_leap") gainR2(u, P2.leapBeat);
  if (P2.foresight && now >= (u.icd.get("p2_fore") ?? 0)) {
    for (const m of room.units.values()) if (m.team === "m" && !m.dead && Math.hypot(m.x - u.x, m.y - u.y) < 250) { u.icd.set("p2_fore", now + 0.8); gainR2(u, P2.foresight); break; }
  }
  const vm = u.stats.vmods;
  if (vm?.vm_stormstep && now >= (u.icd.get("vm_storm") ?? 0)) {
    u.icd.set("vm_storm", now + 6);
    u.buffs.set("vm_storm", { until: now + 2.5, mods: { move: vm.vm_stormstep, aspd: vm.vm_stormstep / 2 } });
    room.ev({ e: "buff", id: u.id, b: "vm_storm", d: 2.5 });
  }
}
/** 회피·막기 성공 (막기·정면 방어·회피율 빗나감) */
function onGuard2(room, u, src, now, kind) {
  const P2 = p2of(u);
  if (P2.passion) u.buffs.set("iq_passion", { until: now + 3, mods: {} });
  if (P2.parryHeal && kind === "parry" && now >= (u.icd.get("p2_parryHeal") ?? 0)) { u.icd.set("p2_parryHeal", now + 3); heal(room, u, u, u.maxHp * P2.parryHeal, now); gain(room, u, { ki: 15 }, now); }
  if (P2.foresight && kind === "evade" && now >= (u.icd.get("p2_fore") ?? 0)) { u.icd.set("p2_fore", now + 0.8); gainR2(u, P2.foresight); }
  const vm = u.stats.vmods;
  if (vm?.vm_trench && now >= (u.icd.get("vm_trench") ?? 0)) { u.icd.set("vm_trench", now + 6); giveShield(room, u, u.maxHp * vm.vm_trench, 3, now); }
  if (vm?.vm_clockwork && now >= (u.icd.get("vm_clock") ?? 0)) {
    u.icd.set("vm_clock", now + 5);
    for (const [id, at] of u.cds) if (at > now) u.cds.set(id, Math.max(now, at - vm.vm_clockwork));
    u.session.meDirty = true;
  }
}
export function playerEvade(room, u, src, now) { onGuard2(room, u, src, now, "evade"); }

/** 플레이어가 피해를 받기 직전 (2차 전직 방어 효과). 반환: 최종 피해 */
export function playerHurt(room, t, src, dmg, o, now) {
  if (o.dot || dmg <= 0) return dmg;
  const P2 = p2of(t);
  if (t.buffs.has("st_rush")) t.buffs.delete("st_rush");
  if (t.veil && now < t.veil.until) { dmg *= 1 - t.veil.cut; t.veil = null; room.ev({ e: "fx", fx: "shadow/eclipse", x: t.x | 0, y: t.y | 0, s: 0.5 }); }
  if (t.buffs.has("kg_sense")) { t.buffs.delete("kg_sense"); dmg *= 1 - (P2.fieldSense ?? 0.4); }
  if (P2.breath && (t.r2 ?? 0) >= 25 && now >= (t.icd.get("p2_breathDr") ?? 0)) { t.icd.set("p2_breathDr", now + 1.2); t.r2 -= 25; dmg *= 1 - P2.breath; t.session.meDirty = true; }
  // 검격 받아치기: 공격이 닿기 직전(0.3초)에 소드마스터 기술을 썼다면 흘림
  if (P2.parryHeal && src?.team === "m" && now - (t.lastPathCast ?? -9) < 0.3 && now >= (t.icd.get("p2_parryHeal") ?? 0)) {
    t.icd.set("p2_parryHeal", now + 3);
    dmg *= 0.4;
    heal(room, t, t, t.maxHp * P2.parryHeal, now);
    gain(room, t, { ki: 15 }, now);
    room.ev({ e: "fx", fx: "impacts/parry", x: t.x | 0, y: t.y | 0 });
    room.ev({ e: "msg", text: "검격 받아치기!", kind: "self", id: t.id });
  }
  if (t.vajra && now < t.vajra.until) { t.vajra.store += dmg; dmg *= 1 - t.vajra.dr; }
  // 유예된 종말: 일부를 메아리로 미룸
  if (t.doom && now < t.doom.until && !o.echo) {
    const part = dmg * t.doom.pct;
    dmg -= part;
    const D = t.doom;
    room.schedule(D.delay, (t2) => {
      if (t.dead) return;
      room.ev({ e: "fx", fx: "arcane/time-stop", x: t.x | 0, y: t.y | 0, s: 0.5 });
      dealDamage(room, src && !src.dead ? src : { team: "m", id: 0, status: new Map(), buffs: new Map(), stats: {}, atk: 0 }, t, { fixed: Math.round(part), unblockable: true, echo: true, noProcs: true }, t2);
      const T = p2of(t).testimony;
      if (T) {
        room.ev({ e: "fx", fx: "shadow/dark-explosion", x: t.x | 0, y: t.y | 0, s: 0.7 });
        for (const m of enemies(room, t)) if (Math.hypot(m.x - t.x, m.y - t.y) - m.r <= 130) {
          const r = dealDamage(room, t, m, { p2: true, pow: T, noProcs: true }, t2);
          if (m.status.has("judged") && r?.dmg) heal(room, t, t, Math.min(t.maxHp * 0.05, r.dmg * 0.2), t2);
        }
      }
    });
  }
  // 호신도발·금강불괴: 근처 수호자가 피해 일부를 대신 받음
  for (const g of room.players.values()) {
    if (g === t || g.dead || !g.share || now >= g.share.until || Math.hypot(g.x - t.x, g.y - t.y) > 320) continue;
    const part = dmg * g.share.pct;
    dmg -= part;
    const taken = Math.round(part * (1 - g.share.dr));
    if (g.vajra && now < g.vajra.until) g.vajra.store += part;
    g.hp = Math.max(1, g.hp - taken);
    room.ev({ e: "dmg", id: g.id, v: taken, c: 0, a: 0, d: 1, p: 1 });
    break;
  }
  return dmg;
}

/** 적 처치 시 */
export function skillOnKill(room, u, t, now) {
  if (!u || u.type !== "p" || !u.session?.char?.cls2) return;
  const P2 = p2of(u);
  if (P2.dotKillHeal && hasDot(t)) heal(room, u, u, u.maxHp * P2.dotKillHeal, now);
  if (P2.afterimage && t.status?.get("mark2")?.src === u.id) { u.buffs.set("nb_smoke", { until: now + 3, mods: { evade: P2.afterimage, move: 0.2 } }); room.ev({ e: "buff", id: u.id, b: "nb_smoke", d: 3 }); room.ev({ e: "fx", fx: "explosions/smoke-bomb", x: u.x | 0, y: u.y | 0, s: 0.6 }); }
  if (t.plagueBy === u.id && t.status?.has("poison")) {
    const p = t.status.get("poison");
    const next = enemies(room, u).filter((m) => m !== t && Math.hypot(m.x - t.x, m.y - t.y) < 160).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    if (next) { applyStatus(room, u, next, { type: "poison", dur: Math.max(2, p.until - now), pow: p.pow }, now); next.plagueBy = u.id; room.ev({ e: "beam", fx: "curse", x0: t.x | 0, y0: t.y | 0, x1: next.x | 0, y1: next.y | 0 }); }
  }
  if (u.marchUntil && now < u.marchUntil) { u.buffs.set("kg_fervor", { until: now + 6, mods: {} }); room.ev({ e: "buff", id: u.id, b: "kg_fervor", d: 6 }); }
}

/** 매 틱: 정지 사격술·박자 소멸·자원 상한 */
function tick2(room, u, now) {
  const ch = u.session?.char;
  if (!ch?.cls2) { if (u.r2) u.r2 = 0; return; }
  const P2 = p2of(u);
  if (P2.stillAim && room.kind === "dungeon") {
    const moving = Math.hypot(u.lastInput?.mx ?? 0, u.lastInput?.my ?? 0) > 0.1 || u.dash;
    if (moving) u.stillSince = now;
    else if (now - (u.stillSince ?? now) >= 0.4) { u.r2 = Math.min(100, (u.r2 ?? 0) + P2.stillAim * 0.05); if (room.tickN % 4 === 0) u.session.meDirty = true; }
  }
  if (P2.windBeat && (u.r2 ?? 0) > 0 && now - (u.lastBeatHit ?? now) > 4) { u.r2 = 0; u.session.meDirty = true; }
  const max = r2Max(u);
  if ((u.r2 ?? 0) > max) u.r2 = max;
  if (u.share && now >= u.share.until) u.share = null;
}

// ── 2차 전직 전용 스텝
const CUSTOM2 = {
  veil(room, u, ctx, st, now) { u.veil = { until: now + st.dur, cut: st.cut }; room.ev({ e: "buff", id: u.id, b: "dk_veil", d: st.dur }); },
  delayCircle(room, u, ctx, st, now) {
    room.schedule(st.delay, (t0) => {
      if (u.dead) return;
      room.ev({ e: "fx", fx: ctx.sk.fx?.swing ?? "melee/spin-slash", x: u.x | 0, y: u.y | 0, at: u.id, pal: ctx.sk.fx?.palette ?? null });
      for (const t of enemies(room, u)) if (Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.radius * PLAYER_HIT.area) strike(room, u, t, st, ctx, t0);
    });
  },
  eclipse(room, u, ctx, st, now) {
    room.ev({ e: "buff", id: u.id, b: "dk_eclipse", d: st.ticks * st.interval });
    for (let k = 0; k < st.ticks; k++) room.schedule(k * st.interval, (t0) => {
      if (u.dead || !u.room) return;
      const list = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.radius).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y)).slice(0, 3);
      u.hp = Math.max(1, u.hp - u.maxHp * st.hpTick);
      room.ev({ e: "fx", fx: "shadow/shadow-flames", x: u.x | 0, y: u.y | 0, at: u.id, s: 0.8, pal: ctx.sk.fx?.palette ?? null });
      for (const t of list) { room.ev({ e: "beam", fx: "curse", x0: u.x | 0, y0: (u.y - 10) | 0, x1: t.x | 0, y1: (t.y - 10) | 0 }); strike(room, u, t, { pow: st.pow, lifesteal: st.lifesteal, lowHp: st.lowHp }, ctx, t0); }
    });
  },
  guardShare(room, u, ctx, st, now) { u.share = { until: now + st.dur, pct: st.pct, dr: st.dr }; },
  vajraForm(room, u, ctx, st, now) {
    u.vajra = { until: now + st.dur, dr: st.dr, store: 0 };
    u.share = { until: now + st.dur, pct: st.share, dr: 0.4 };
    u.buffs.set("vj_form", { until: now + st.dur, mods: { move: -0.4 } });
    room.ev({ e: "buff", id: u.id, b: "vj_form", d: st.dur });
    room.schedule(st.dur, (t0) => {
      if (u.dead || !u.vajra) return;
      const store = u.vajra.store; u.vajra = null;
      const pow = st.pow + Math.min(st.perStore, (store / Math.max(1, u.maxHp)) * st.perStore);
      room.ev({ e: "fx", fx: "impacts/ground-slam", x: u.x | 0, y: u.y | 0, s: 1.3 });
      room.ev({ e: "shake", v: 5 });
      for (const t of enemies(room, u)) if (Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.radius) strike(room, u, t, { pow, groggy: 50, perDef: 0.4 }, ctx, t0);
    });
  },
  gather(room, u, ctx, st, now) {
    for (const t of enemies(room, u)) {
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d - t.r > st.radius) continue;
      if (!t.boss && t.type === "m") { const a = Math.atan2(u.y - t.y, u.x - t.x), m = Math.max(0, Math.min(st.pull, d - u.r - t.r - 4)) * (t.elite ? 0.5 : 1); [t.x, t.y] = moveCircle(room.map, t.x, t.y, Math.cos(a) * m, Math.sin(a) * m, t.r); }
      if (st.pow) strike(room, u, t, { pow: st.pow }, ctx, now);
    }
    room.ev({ e: "fx", fx: "shadow/black-hole", x: u.x | 0, y: u.y | 0, s: 0.5 });
  },
  grabRush(room, u, ctx, st, now) {
    const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.dist && angDiff(Math.atan2(t.y - u.y, t.x - u.x), ctx.aim) < 0.5 && lineOfSight(room.map, u.x, u.y, t.x, t.y))
      .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    if (!t) { msg(u, "돌진할 표적이 없어요."); return; }
    const a = Math.atan2(t.y - u.y, t.x - u.x), d = Math.max(0, Math.hypot(t.x - u.x, t.y - u.y) - t.r - u.r - 4);
    [u.x, u.y] = moveCircle(room.map, u.x, u.y, Math.cos(a) * d, Math.sin(a) * d, u.r);
    u.session.send({ t: "tp", x: u.x, y: u.y });
    if (!t.boss) applyStatus(room, u, t, { type: "stun", dur: st.hits * st.gap + 0.6 }, now);
    u.lockUntil = Math.max(u.lockUntil, now + st.hits * st.gap + 0.3);
    for (let k = 0; k < st.hits; k++) room.schedule(k * st.gap, (t0) => { if (!u.dead && !t.dead) { room.ev({ e: "anim", id: u.id, a: "punch" }); strike(room, u, t, { pow: st.pow, pen: st.pen }, ctx, t0, { melee: true }); } });
    room.schedule(st.hits * st.gap + 0.1, (t0) => {
      if (u.dead) return;
      room.ev({ e: "fx", fx: "impacts/heavy-landing", x: t.x | 0, y: t.y | 0, s: 1.1 });
      room.ev({ e: "shake", v: 4 });
      for (const m of enemies(room, u)) if (Math.hypot(m.x - t.x, m.y - t.y) - m.r <= st.radius) strike(room, u, m, { pow: m === t ? st.finish : st.finish * 0.5, pen: st.pen, groggy: st.groggy }, ctx, t0, { melee: true });
    });
  },
  focusCenter(room, u, ctx, st, now) {
    const pt = clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 300);
    room.schedule(1.0, (t0) => {
      const t = enemies(room, u).filter((t) => Math.hypot(t.x - pt.x, t.y - pt.y) - t.r <= st.radius).sort((a, b) => b.maxHp - a.maxHp)[0];
      if (!t) return;
      room.ev({ e: "fx", fx: "lightning/lightning-strike", x: t.x | 0, y: t.y | 0, s: 1 });
      strike(room, u, t, { pow: st.pow, status: { type: "shock", dur: 3 } }, ctx, t0);
    });
  },
  drainTether(room, u, ctx, st, now) {
    const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.range && lineOfSight(room.map, u.x, u.y, t.x, t.y))
      .sort((a, b) => Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0];
    if (!t) { msg(u, "범위 안에 표적이 없어요."); u.cds.set(ctx.sk.id, now + 1); return; }
    if (st.root) u.buffs.set("tether_root", { until: now + st.ticks * st.interval, mods: { move: -0.7 } });
    for (let k = 0; k < st.ticks; k++) room.schedule(k * st.interval, (t0) => {
      if (u.dead || t.dead || Math.hypot(t.x - u.x, t.y - u.y) > st.range + 40) return;
      room.ev({ e: "beam", fx: "curse", x0: u.x | 0, y0: (u.y - 10) | 0, x1: t.x | 0, y1: (t.y - 10) | 0 });
      strike(room, u, t, { pow: st.pow, lifesteal: st.lifesteal, curse: ctx.sk.path === "warlock" ? 6 : 0 }, ctx, t0);
    });
  },
  pets(room, u, ctx, st, now) {
    for (const id of [...u.devices]) { const d = room.units.get(id); if (d?.kind === "pet" && d.o.skin === st.skin) room.removeUnit(d); }
    let focus = null;
    if (st.focus) focus = enemies(room, u).filter((t) => t.status.has("curse") && Math.hypot(t.x - u.x, t.y - u.y) < 420).sort((a, b) => Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0]
      ?? enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) < 420).sort((a, b) => Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0];
    for (let k = 0; k < st.n; k++) {
      const a = ctx.aim + (k - (st.n - 1) / 2) * 0.9;
      const x = u.x + Math.cos(a) * 40, y = u.y + Math.sin(a) * 40;
      room.ev({ e: "fx", fx: "spawn/summon-rise", x: x | 0, y: y | 0, s: 0.6 });
      room.spawnDevice(u, "pet", circleHitsWall(room.map, x, y, 10) ? u.x : x, circleHitsWall(room.map, x, y, 10) ? u.y : y, { ...st, dur: st.dur, focus: focus?.id ?? 0, dir: ctx.aim });
    }
    if (st.focus && focus) room.schedule(st.dur, (t0) => { if (!focus.dead) applyStatus(room, u, focus, { type: "curse", dur: 8 }, t0); });
  },
  turret(room, u, ctx, st, now) {
    const list = u.devices.map((id) => room.units.get(id)).filter((d) => d?.kind === "turret");
    while (list.length >= (st.max ?? 2)) room.removeUnit(list.shift());
    const { x, y } = clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 200);
    room.ev({ e: "fx", fx: "scifi/warp-in", x: x | 0, y: y | 0, s: 0.5 });
    room.spawnDevice(u, "turret", x, y, { dur: st.dur, pow: st.pow, interval: st.interval, range: st.range });
  },
  fortress(room, u, ctx, st, now) {
    const { x, y } = clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 200);
    for (const id of [...u.devices]) { const d = room.units.get(id); if (d && ["turret", "wall", "golem"].includes(d.kind)) room.removeUnit(d); }
    room.ev({ e: "fx", fx: "scifi/warp-in", x: x | 0, y: y | 0, s: 1 });
    for (const s of [-1, 1]) room.spawnDevice(u, "turret", x + s * 40, y, { dur: st.dur, pow: st.pow, interval: st.interval, range: st.range, big: true });
    for (const s of [-1, 1]) { const a = ctx.aim + s * 0.7; room.spawnDevice(u, "wall", x + Math.cos(a) * 70, y + Math.sin(a) * 70, { dur: st.dur, hp: 1, dir: ctx.aim }); }
    room.spawnDevice(u, "golem", x + Math.cos(ctx.aim) * 60, y + Math.sin(ctx.aim) * 60, { dur: st.dur, hp: 1, pow: 2.0, p2: true });
  },
  gateRain(room, u, ctx, st, now) {
    const pt = clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 300);
    room.ev({ e: "fx", fx: "arcane/portal", x: pt.x | 0, y: (pt.y - 40) | 0, s: 1, life: st.ticks * st.interval + 0.4 });
    u.lockUntil = Math.max(u.lockUntil, now + st.ticks * st.interval);
    u.buffs.set("aa_gate_root", { until: now + st.ticks * st.interval, mods: { move: -0.9 } });
    for (let k = 0; k < st.ticks; k++) room.schedule(k * st.interval, (t0) => {
      if (u.dead) return;
      const x = pt.x + (Math.random() - 0.5) * st.radius * 1.4, y = pt.y + (Math.random() - 0.5) * st.radius;
      room.ev({ e: "fx", fx: "projectiles/magic-missile", x: x | 0, y: y | 0, s: 0.5 });
      for (const t of enemies(room, u)) if (Math.hypot(t.x - pt.x, t.y - pt.y) - t.r <= st.radius) strike(room, u, t, { pow: st.pow }, ctx, t0);
    });
    room.schedule(st.ticks * st.interval + 0.1, (t0) => {
      room.ev({ e: "fx", fx: "explosions/plasma-explosion", x: pt.x | 0, y: pt.y | 0, s: 1.2 });
      for (const t of enemies(room, u)) {
        if (Math.hypot(t.x - pt.x, t.y - pt.y) - t.r > st.radius) continue;
        const mk = markOf(t, u);
        if (mk && !t.boss) { const a = Math.atan2(pt.y - t.y, pt.x - t.x), d = Math.hypot(pt.x - t.x, pt.y - t.y) * 0.8; [t.x, t.y] = moveCircle(room.map, t.x, t.y, Math.cos(a) * d, Math.sin(a) * d, t.r); }
        if (mk) t.status.delete("mark2");
        strike(room, u, t, { pow: st.final + mk * 0.6 }, ctx, t0);
      }
    });
  },
  iframe(room, u, ctx, st, now) { u.iframeUntil = now + st.dur; },
  volleyStream(room, u, ctx, st, now) {
    u.lockUntil = Math.max(u.lockUntil, now + st.shots * st.gap);
    const beats = Math.floor((u.r2 ?? 0) / 25);
    if (st.beatBlades) { u.r2 = 0; u.session.meDirty = true; }
    for (let k = 0; k < st.shots; k++) room.schedule(k * st.gap, (t0) => {
      if (u.dead) return;
      const a = Math.atan2(ctx.ay - u.y, ctx.ax - u.x) + (Math.random() - 0.5) * 0.08;
      room.addProjectile({ team: u.team, src: u.id, x: u.x + Math.cos(a) * 10, y: u.y - 8 + Math.sin(a) * 10, vx: Math.cos(a) * 680, vy: Math.sin(a) * 680, range: 360, r: 6 + PLAYER_HIT.proj, pierce: 2, fx: ctx.sk.fx?.proj, pal: ctx.sk.fx?.palette ?? null,
        onHit: (t, t1) => { strike(room, u, t, { pow: st.pow }, ctx, t1); if (k % 4 === 3) windBlade(room, u, t, t1, 1.6); } });
    });
    for (let k = 0; k < beats * 2; k++) room.schedule(0.2 + k * 0.18, (t0) => {
      const t = enemies(room, u).filter((m) => Math.hypot(m.x - u.x, m.y - u.y) < 380).sort((a, b) => Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0];
      if (t) windBlade(room, u, t, t0, 2.2);
    });
  },
  nearestShot(room, u, ctx, st, now) {
    const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.range && lineOfSight(room.map, u.x, u.y, t.x, t.y)).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    if (!t) return;
    const a = Math.atan2(t.y - u.y, t.x - u.x);
    room.addProjectile({ team: u.team, src: u.id, x: u.x, y: u.y - 8, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, range: st.range + 20, r: 6 + PLAYER_HIT.proj, pierce: 0, fx: "projectiles/bullet-tracer", onHit: (m, t1) => strike(room, u, m, { pow: st.pow }, ctx, t1) });
  },
  snipeShot(room, u, ctx, st, now) {
    const spent = Math.min(st.spendR2.max, Math.floor(u.r2 ?? 0));
    u.r2 = Math.max(0, (u.r2 ?? 0) - spent); u.session.meDirty = true;
    u.lastSpent = spent; u.lastSpentAt = now;
    const ang = ctx.aim;
    room.ev({ e: "beam", fx: "snipe", x0: u.x | 0, y0: (u.y - 10) | 0, x1: (u.x + Math.cos(ang) * st.range) | 0, y1: (u.y - 10 + Math.sin(ang) * st.range) | 0 });
    const t = enemies(room, u).filter((t) => {
      const dx = t.x - u.x, dy = t.y - u.y, along = dx * Math.cos(ang) + dy * Math.sin(ang), across = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
      return along > 0 && along <= st.range && across <= 24 + t.r;
    }).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    if (!t) return;
    const marked = t.status.get("mark2")?.src === u.id;
    room.ev({ e: "fx", fx: "explosions/big-explosion", x: t.x | 0, y: t.y | 0, s: 0.6 });
    strike(room, u, t, { pow: st.pow * (1 + spent * st.spendR2.per), pen: spent * st.spendR2.pen + (marked ? 0.25 : 0), critBonus: st.critBonus }, ctx, now);
  },
  multiCircle(room, u, ctx, st, now) {
    for (let k = 0; k < st.n; k++) room.schedule(k * st.gap, (t0) => {
      if (u.dead) return;
      room.ev({ e: "fx", fx: ctx.sk.fx?.swing ?? "melee/spin-slash", x: u.x | 0, y: u.y | 0, at: u.id, pal: ctx.sk.fx?.palette ?? null });
      const list = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.radius * PLAYER_HIT.area);
      if (k === st.n - 1) {
        const focus = list.sort((a, b) => markOf(b, u) - markOf(a, u))[0];
        if (focus && markOf(focus, u)) { strike(room, u, focus, { pow: st.lastFocus, blinkAtk: true }, ctx, t0, { melee: true }); return; }
      }
      for (const t of list) strike(room, u, t, { pow: st.pow, mark: { n: 1, max: 5, dur: 8 } }, ctx, t0, { melee: true });
    });
  },
  shadowExecute(room, u, ctx, st, now) {
    const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.range && lineOfSight(room.map, u.x, u.y, t.x, t.y))
      .sort((a, b) => (markOf(b, u) - markOf(a, u)) || Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0];
    if (!t) { msg(u, "범위 안에 표적이 없어요."); u.cds.set(ctx.sk.id, now + 1); return; }
    const mk = markOf(t, u);
    u.iframeUntil = now + st.n * st.gap;
    u.lockUntil = Math.max(u.lockUntil, now + st.n * st.gap + 0.2);
    room.ev({ e: "fx", fx: "arcane/blink-out", x: u.x | 0, y: u.y | 0, pal: ctx.sk.fx?.palette ?? null });
    for (let k = 0; k < st.n; k++) room.schedule(k * st.gap, (t0) => {
      if (u.dead || t.dead) return;
      const a = Math.random() * Math.PI * 2;
      const nx = t.x + Math.cos(a) * (t.r + u.r + 6), ny = t.y + Math.sin(a) * (t.r + u.r + 6);
      if (!circleHitsWall(room.map, nx, ny, u.r)) { u.x = nx; u.y = ny; u.session.send({ t: "tp", x: nx, y: ny }); }
      room.ev({ e: "fx", fx: "melee/dagger-flurry", x: t.x | 0, y: t.y | 0, pal: ctx.sk.fx?.palette ?? null });
      strike(room, u, t, { pow: st.pow, blinkAtk: true }, ctx, t0, { melee: true });
    });
    if (mk >= st.need) room.schedule(st.n * st.gap + 0.15, (t0) => {
      if (t.dead) return;
      room.ev({ e: "fx", fx: "shadow/dark-explosion", x: t.x | 0, y: t.y | 0, s: 1.2 });
      room.ev({ e: "shake", v: 4 });
      t.status.delete("mark2");
      strike(room, u, t, { pow: st.fall + mk * 0.5 }, ctx, t0);
    });
  },
  stealth(room, u, ctx, st, now) {
    u.buffs.set("stealth", { until: now + st.dur, mods: { move: 0.15 } });
    room.ev({ e: "buff", id: u.id, b: "stealth", d: st.dur });
    for (const m of room.units.values()) if (m.team === "m") { m.threat?.delete(u.id); if (m.tauntBy?.id === u.id) m.tauntBy = null; }
  },
  dotDetonate(room, u, ctx, st, now) {
    room.schedule(0.42, (t0) => {
      const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.range && hasDot(t)).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
      if (t) detonateDots(room, u, t, st.mult, t0);
    });
  },
  boomerang(room, u, ctx, st, now) {
    const a = ctx.aim, hit1 = new Set(), hit2s = new Set();
    const go = (from, ang, set, t0) => room.addProjectile({ team: u.team, src: u.id, x: from.x, y: from.y - 8, vx: Math.cos(ang) * st.speed, vy: Math.sin(ang) * st.speed, range: st.range, r: st.radius + PLAYER_HIT.proj, pierce: 9, fx: ctx.sk.fx?.proj, scale: ctx.sk.fx?.scale ?? null, pal: ctx.sk.fx?.palette ?? null,
      onHit: (t, t1) => { if (set.has(t.id)) return; set.add(t.id); strike(room, u, t, st, ctx, t1); } });
    go(u, a, hit1, now);
    const end = { x: u.x + Math.cos(a) * st.range, y: u.y + Math.sin(a) * st.range };
    room.schedule(st.range / st.speed + 0.05, (t0) => { if (!u.dead) go(end, Math.atan2(u.y - end.y, u.x - end.x), hit2s, t0); });
  },
  gospel(room, u, ctx, st, now) {
    u.lockUntil = Math.max(u.lockUntil, now + st.n * st.gap + 0.3);
    u.buffs.set("iq_gospel", { until: now + st.n * st.gap + 0.3, mods: { move: -0.9, dr: 0.15 } });
    const healHits = (t0, n) => { for (const p of allies(room, u)) if (Math.hypot(p.x - u.x, p.y - u.y) < 260) heal(room, u, p, p.maxHp * st.heal * Math.min(6, n), t0); };
    for (let k = 0; k < st.n; k++) room.schedule(k * st.gap, (t0) => {
      if (u.dead) return;
      room.ev({ e: "fx", fx: "holy/holy-pillar", x: u.x | 0, y: u.y | 0, s: 0.7 });
      let n = 0;
      for (const t of enemies(room, u)) if (Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.radius) { strike(room, u, t, { pow: st.pow }, ctx, t0); n++; }
      if (n) healHits(t0, n);
    });
    room.schedule(st.n * st.gap + 0.1, (t0) => {
      if (u.dead) return;
      room.ev({ e: "fx", fx: "holy/sunburst", x: u.x | 0, y: u.y | 0, s: 1.4 });
      room.ev({ e: "shake", v: 4 });
      let n = 0;
      for (const t of enemies(room, u)) if (Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.finalRadius) { strike(room, u, t, { pow: st.final, cc: { type: "stun", dur: 1.5 }, groggy: 40 }, ctx, t0); n++; }
      if (n) healHits(t0, n);
    });
  },
  doomDelay(room, u, ctx, st, now) { u.doom = { until: now + st.dur, pct: st.pct, delay: st.delay }; room.ev({ e: "buff", id: u.id, b: "ht_doom", d: st.dur }); },
  trailLeap(room, u, ctx, st, now) {
    const x0 = u.x, y0 = u.y, a = ctx.aim;
    STEP.dash(room, u, ctx, { dist: st.dist, speed: st.speed }, now, () => {});
    room.schedule(st.dist / st.speed + 0.05, (t0) => {
      const len = Math.hypot(u.x - x0, u.y - y0);
      room.addArea({ team: u.team, shape: "r", x: x0, y: y0, ang: a, l: len, w: st.width, tel: 0.2, ticks: 3, interval: 0.5, fire: (t1) => {
        room.ev({ e: "fx", fx: "shadow/shadow-flames", x: (x0 + Math.cos(a) * len / 2) | 0, y: (y0 + Math.sin(a) * len / 2) | 0, s: 0.5 });
        for (const t of enemies(room, u)) {
          const dx = t.x - x0, dy = t.y - y0, along = dx * Math.cos(a) + dy * Math.sin(a), across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
          if (along >= -t.r && along <= len + t.r && across <= st.width / 2 + t.r) strike(room, u, t, { pow: st.pow * 0.5 }, ctx, t1);
        }
      } });
    });
  },
  frontZone(room, u, ctx, st, now) {
    const x = u.x + Math.cos(ctx.aim) * st.dist, y = u.y + Math.sin(ctx.aim) * st.dist;
    room.addZone({ team: u.team, owner: u.id, x, y, r: st.radius, dur: st.dur, interval: st.interval, fx: "fire/campfire", pal: ctx.sk.fx?.palette ?? null, follow: 0, kind: "lava",
      tick: (t0, zz) => { for (const t of enemies(room, u)) if (Math.hypot(t.x - zz.x, t.y - zz.y) - t.r <= zz.r) strike(room, u, t, { pow: st.pow, status: st.burn ? { type: "burn", dur: 3, pow: p2of(u).riftChase ? 0.45 : 0.3 } : null }, ctx, t0); } });
  },
  leapTo(room, u, ctx, st, now) {
    const { x, y } = clampPoint(room, u, ctx.ax, ctx.ay, st.range);
    room.ev({ e: "fx", fx: "spawn/poof", x: u.x | 0, y: u.y | 0 });
    if (!circleHitsWall(room.map, x, y, u.r)) { u.x = x; u.y = y; u.session.send({ t: "tp", x, y }); }
    room.ev({ e: "shake", v: 3 });
  },
  captainFinish(room, u, ctx, st, now) {
    room.schedule(0.42, (t0) => {
      if (u.dead) return;
      const has = (u.r2 ?? 0) >= st.cost;
      if (has) { u.r2 -= st.cost; u.session.meDirty = true; }
      room.ev({ e: "fx", fx: has ? "melee/spin-slash" : "melee/sword-slash", x: u.x | 0, y: u.y | 0, at: u.id, pal: ctx.sk.fx?.palette ?? null });
      for (const t of enemies(room, u)) {
        const d = Math.hypot(t.x - u.x, t.y - u.y) - t.r;
        if (has ? d <= st.radius : d <= 70 && inArc(u, t, 70, 60, ctx.aim)) strike(room, u, t, { pow: st.pow }, ctx, t0, { melee: true });
      }
    });
  },
  kingMarch(room, u, ctx, st, now) {
    const spent = Math.floor(u.r2 ?? 0);
    u.r2 = 0; u.session.meDirty = true;
    u.marchUntil = now + 1.2;
    STEP.dash(room, u, ctx, { dist: st.dist, speed: st.speed, hit: { pow: st.pow } }, now, () => {
      const t0 = room.now;
      const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) - t.r <= 90).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
      if (!t) return;
      room.ev({ e: "fx", fx: "impacts/crit-hit", x: t.x | 0, y: t.y | 0, s: 1.3 });
      room.ev({ e: "shake", v: 4 });
      strike(room, u, t, { pow: st.final * (1 + spent * st.per), pen: 0.3 }, ctx, t0, { melee: true });
      u.marchUntil = t0 + 0.4;
    });
  },
};
Object.assign(CUSTOM, CUSTOM2);

// 스킬 실행 엔진: shared/skills.js 의 steps 를 서버에서 판정
import { SKILLS, unlockStage } from "../../shared/skills.js";
import { profOf, profLevel, profGain, profPow, profCost, PROF_MAX, isUncapped } from "../../shared/prof.js";
import { CLASS_INFO, stageOf } from "../../shared/classes.js";
import { moveCircle, circleHitsWall, lineOfSight } from "../../shared/move.js";
import { dealDamage, heal, giveShield, applyStatus, addGroggy, isHardCC, buffSum, angDiff } from "./combat.js";

const RES_NAME = { mp: "MP", ki: "내력", holy: "성광", parts: "부품", gap: "틈" };
const RES_MAX = { ki: 100, holy: 100, parts: 3, gap: 3 };

const enemies = (room, u) => [...room.units.values()].filter((t) => !t.dead && t.team !== u.team && (t.type !== "d" || t.targetable));
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
  if (sk.cls !== "common" && stageOf(ch.cls, ch.level) < unlockStage(sk, CLASS_INFO[ch.cls].ranks.length)) return;
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
      if (now - (u.noResAt ?? -9) > 2) { u.noResAt = now; msg(u, `${RES_NAME[k]}이(가) 부족해요.`); }
      return;
    }
  }
  // 쿨타임 (쿨타임 감소 효과는 없음. 기본 공격만 공격 속도 적용)
  const cd = sk.kind === "basic" ? sk.aspd / (u.stats.aspd + buffSum(u, "aspd")) : sk.cd;
  u.cds.set(id, now + cd);
  u.lockUntil = now + (sk.kind === "basic" ? Math.min(0.2, cd * 0.5) : 0.18 + (sk.recover ?? 0));
  for (const [k, v] of Object.entries(cost)) if (k !== "gap") u[k] -= v;
  u.lastAction = now;
  const aim = Math.atan2(ay - u.y, ax - u.x);
  const ctx = { sk, aim, ax, ay, tx, mul: 0, prof: plv, pf: 1 + profPow(plv), now };
  gainProf(room, u, sk, now);
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
  if (sk.moveSkill) { u.moveLock = now + 0.6; triggerPassive(room, u, "move_skill", now); }
  room.ev({ e: "cast", id: u.id, s: id, a: Math.round(aim * 1000), ct: sk.cast ? 1 : 0, pl: plv, x: u.x | 0, y: u.y | 0, ax: Math.round(ax), ay: Math.round(ay) });
  const go = (t) => {
    if (cost.gap) { ctx.gapSpent = u.gap; if (sk.steps.some((s) => s.consumeGap)) u.gap = 0; else u.gap -= cost.gap; }
    runSteps(room, u, ctx, sk.steps, 0, t);
    // 차원 공명장 복제
    const rz = u.resonance && room.zones.find((z) => z.id === u.resonance && z.charges > 0);
    if (rz && sk.kind !== "ultimate" && !ctx.copy && sk.steps.some((s) => s.pow && ["proj", "area", "line"].includes(s.do))) {
      const px = s0(sk).do === "area" ? clampPoint(room, u, ax, ay, sk.range).x : u.x;
      const py = s0(sk).do === "area" ? clampPoint(room, u, ax, ay, sk.range).y : u.y;
      if (Math.hypot(px - rz.x, py - rz.y) <= rz.r) {
        rz.charges--;
        room.ev({ e: "fx", fx: "arcane/mana-burst", x: rz.x | 0, y: rz.y | 0, s: 0.6 });
        room.schedule(0.4, (t2) => runSteps(room, u, { ...ctx, mul: ctx.mul - 0.6, copy: true }, sk.steps.filter((s) => s.pow), 0, t2));
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
  u.session.send({ t: "prof", s: sk.id, xp: ch.prof[sk.id] });
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
  const r = dealDamage(room, u, t, { pow, bonus, critBonus: (st.critBonus ?? 0) + (st.hit?.critBonus ?? 0), pen: st.pen, threat: st.threat ?? st.hit?.threat, flank, capPct: st.capPct, skill: ctx.sk.id, melee: extra.melee }, now);
  if (fp && extra.melee) u.buffs.delete("footwork");
  if (!r || r.dmg === 0) return r;
  if (nextStatus) applyStatus(room, u, t, nextStatus, now);
  const cc = st.cc ?? st.hit?.cc;
  if (cc && (cc.chance == null || Math.random() < cc.chance)) applyStatus(room, u, t, { ...cc, groggy: st.groggy ?? st.hit?.groggy }, now);
  else if ((st.groggy ?? st.hit?.groggy) && t.boss) addGroggy(room, t, st.groggy ?? st.hit.groggy, now);
  if (st.ccIfCC && (isHardCC(t) || t.status.has("root"))) { applyStatus(room, u, t, st.ccIfCC, now); u.lastSuppress = now; }
  if (st.status) applyStatus(room, u, t, st.status, now);
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
      const icd = t.status.get("huntmark")?.src === u.id ? 1.5 : 3;
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

function inArc(u, t, range, arc, aim) {
  const d = Math.hypot(t.x - u.x, t.y - u.y);
  if (d - t.r > range) return false;
  if (d < t.r + 6) return true;
  return angDiff(Math.atan2(t.y - u.y, t.x - u.x), aim) <= (arc * Math.PI) / 360;
}

const STEP = {
  melee(room, u, ctx, st, now) {
    const range = st.range * (1 + buffSum(u, "range") * 0.3);
    const fire = (t0, hitIdx) => {
      const list = enemies(room, u).filter((t) => inArc(u, t, range, st.arc, ctx.aim) && lineOfSight(room.map, u.x, u.y, t.x, t.y))
        .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y)).slice(0, st.max ?? 99);
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
    const list = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) - t.r <= st.radius).slice(0, st.max ?? 99);
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim ?? "spin" });
    if (ctx.sk.fx?.swing) room.ev({ e: "fx", fx: ctx.sk.fx.swing, x: u.x | 0, y: u.y | 0, a: Math.round(ctx.aim * 1000), at: u.id });
    if (ctx.sk.fx?.area) room.ev({ e: "fx", fx: ctx.sk.fx.area, x: u.x | 0, y: u.y | 0, s: st.radius > 80 ? null : 0.7, pal: ctx.sk.fx.palette ?? null });
    for (const t of list) {
      if (st.pow > 0) strike(room, u, t, st, ctx, now);
      else if (st.status) applyStatus(room, u, t, st.status, now);
    }
    if (st.grantStanceShift) u.stanceShift = true;
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
        range, r: st.radius ?? 5, pierce: st.pierce ?? 0, fx: ctx.sk.fx?.proj, pal: ctx.sk.fx?.palette ?? null, scale: ctx.sk.fx?.scale ?? null,
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
        if (ctx.sk.fx?.area && (first || st.scatter || (ctx.sk.fx.tick == null))) room.ev({ e: "fx", fx: ctx.sk.fx.area, x: cx | 0, y: cy | 0, s: ctx.sk.fx.scale ?? null, pal: ctx.sk.fx.palette ?? null });
        else if (ctx.sk.fx?.tick) room.ev({ e: "fx", fx: "impacts/hit-spark", x: (cx + (Math.random() - 0.5) * st.radius) | 0, y: (cy + (Math.random() - 0.5) * st.radius) | 0 });
        first = false;
        const list = enemies(room, u).filter((t) => Math.hypot(t.x - cx, t.y - cy) - t.r <= st.radius).slice(0, st.max ?? 99);
        for (const t of list) strike(room, u, t, st, ctx, t0);
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
    if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: u.x | 0, y: u.y | 0, a: Math.round(dir * 1000), s: 0.6, pal: ctx.sk.fx.palette ?? null });
    room.ev({ e: "dash", id: u.id, a: Math.round(dir * 1000), d: st.dist, v: st.speed });
    u.dash = {
      dir, left: st.dist, speed: st.speed,
      onStep: (t0) => {
        if (!st.hit) return;
        for (const t of enemies(room, u)) {
          if (hitSet.has(t.id) || Math.hypot(t.x - u.x, t.y - u.y) > t.r + u.r + 6) continue;
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
    if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: u.x | 0, y: u.y | 0, at: u.id, pal: ctx.sk.fx.palette ?? null });
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
      if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: t.x | 0, y: t.y | 0, at: t.id, pal: ctx.sk.fx.palette ?? null });
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
      if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: t.x | 0, y: t.y | 0, at: t.id, pal: ctx.sk.fx.palette ?? null });
    }
    if (ctx.sk.fx?.area) room.ev({ e: "fx", fx: ctx.sk.fx.area, x: u.x | 0, y: u.y | 0, pal: ctx.sk.fx.palette ?? null });
  },
  zone(room, u, ctx, st, now) {
    const pt = st.at === "self" ? { x: u.x, y: u.y } : clampPoint(room, u, ctx.ax, ctx.ay, ctx.sk.range ?? 200);
    room.ev({ e: "anim", id: u.id, a: ctx.sk.anim === "channel" ? "channel" : "cast" });
    const healed = new Map();
    const z = room.addZone({
      team: u.team, owner: u.id, x: pt.x, y: pt.y, r: st.radius, dur: st.dur, interval: st.interval ?? 1, fx: ctx.sk.fx?.area ?? null, pal: ctx.sk.fx?.palette ?? null,
      follow: st.follow ? u.id : 0, endOnMove: st.endOnMove, sx: u.x, sy: u.y, charges: st.charges ?? 0, kind: st.kind,
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
    room.spawnDevice(u, kind, x, y, { ...st, dir: ctx.aim, hp: Math.round((st.hp ?? 1) * (kind === "wall" || kind === "golem" ? u.stats.device : 1)), pow: st.pow, radius: st.radius });
  },
  channel(room, u, ctx, st, now) {
    u.channel = { until: now + st.dur, mpPct: st.mpPct, interrupted: false };
    room.ev({ e: "anim", id: u.id, a: "channel" });
    if (ctx.sk.fx?.self) room.ev({ e: "fx", fx: ctx.sk.fx.self, x: u.x | 0, y: u.y | 0, at: u.id });
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
    room.ev({ e: "fx", fx: "status/rage", x: u.x | 0, y: u.y | 0, at: u.id });
    room.ev({ e: "msg", text: `점혈 ${u.acupoint}단계`, kind: "self", id: u.id });
  },
  shadowstep(room, u, ctx, st, now) {
    const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.range && angDiff(Math.atan2(t.y - u.y, t.x - u.x), ctx.aim) < 0.6 && lineOfSight(room.map, u.x, u.y, t.x, t.y))
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
    strike(room, u, t, { pow: st.pow, gapOnFlank: true }, ctx, now, { melee: true });
  },
  huntmark(room, u, ctx, st, now) {
    const t = enemies(room, u).filter((t) => Math.hypot(t.x - u.x, t.y - u.y) <= st.range && t.type !== "d")
      .sort((a, b) => Math.hypot(a.x - ctx.ax, a.y - ctx.ay) - Math.hypot(b.x - ctx.ax, b.y - ctx.ay))[0];
    if (!t) { msg(u, "범위 안에 표적이 없어요."); u.cds.set(ctx.sk.id, now + 1); return; }
    if (t.status.has("huntmark")) return msg(u, "이미 표식이 있는 적이에요. (지속시간 갱신 불가)");
    t.status.set("huntmark", { until: now + st.dur, src: u.id, v: 0 });
    room.ev({ e: "st", id: t.id, s: "huntmark", d: st.dur });
    room.ev({ e: "fx", fx: "shadow/hex-sigil", x: t.x | 0, y: t.y | 0, s: 0.6, pal: ctx.sk.fx?.palette ?? null });
  },
  hymn(room, u, ctx, st, now) {
    u.hymnMode = u.hymnMode === "atk" ? "def" : "atk";
    const mods = u.hymnMode === "atk" ? { dmg: 0.04 } : { dr: 0.05 };
    for (const p of allies(room, u)) {
      if (Math.hypot(p.x - u.x, p.y - u.y) > 220) continue;
      p.buffs.delete("hymn_atk"); p.buffs.delete("hymn_def");
      p.buffs.set("hymn_" + u.hymnMode, { until: now + st.dur, mods });
      room.ev({ e: "buff", id: p.id, b: "hymn_" + u.hymnMode, d: st.dur });
      room.ev({ e: "fx", fx: "holy/blessing", x: p.x | 0, y: p.y | 0, at: p.id });
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
  if (now >= (u.icd.get("rivet") ?? 0)) { u.icd.set("rivet", now + 2); gain(room, u, { parts: 1 }, now); room.ev({ e: "fx", fx: "impacts/shield-block", x: u.x | 0, y: u.y | 0, s: 0.5 }); }
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
  if (t.dummy) {
    if (!t.dps.total) t.dps.start = now;
    t.dps.total += dmg;
    t.dps.last = now;
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
  if (u.mythic?.has("thunder_echo") && crit && Math.random() < 0.15 && now >= (u.icd.get("m_thunder") ?? 0)) {
    u.icd.set("m_thunder", now + 1);
    room.ev({ e: "fx", fx: "lightning/zap-hit", x: t.x | 0, y: t.y | 0 });
    room.schedule(0.05, (t2) => dealDamage(room, u, t, { pow: 0.6, crit: "none" }, t2));
  }
  if (u.mythic?.has("vampiric")) {
    if (now - (u.vampWin?.t ?? -9) >= 1) u.vampWin = { t: now, n: 0 };
    const v = Math.min(dmg * 0.015, u.maxHp * 0.03 - u.vampWin.n);
    if (v > 0) { u.vampWin.n += v; heal(room, u, u, v, now, { noEvent: true }); }
  }
  if (u.mythic?.has("ember") && Math.random() < 0.1) applyStatus(room, u, t, { type: "burn", dur: 3, pow: 0.2 }, now);
}

/** 매 틱 플레이어 스킬 상태 (채널링, 정지 감지, 점혈 감소, 순교자의 각인) */
export function tickPlayerSkills(room, u, now, inp) {
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

// 피해·치유·상태이상·위협 계산 (치명타 규칙은 기획서 4장 표 그대로)
import { CRIT } from "../../shared/constants.js";
import { defReduction } from "../../shared/stats.js";

const DOT_TYPES = new Set(["burn", "poison", "bleed"]);
const HARD_CC = new Set(["stun", "down", "freeze"]);
export const isHardCC = (u) => [...HARD_CC].some((t) => u.status.has(t)) || u.status.has("groggy");
export const hasCC = (u) => isHardCC(u) || u.status.has("root") || u.status.has("slow");

/** 버프 합산 값 */
export function buffSum(u, key) {
  let s = 0;
  for (const b of u.buffs.values()) if (b.mods?.[key]) s += b.mods[key];
  return s;
}

/** 상태이상 부여. 보스: 강제 제어 면역, 그로기 게이지만. 일반 적: 제어 후 짧은 면역(대상별 재사용 제한) */
export function applyStatus(room, src, t, st, now) {
  if (!t || t.dead) return false;
  const type = st.type;
  if (t.team === "p" && t.res && HARD_CC.has(type) && Math.random() < t.res) return false;
  if (t.boss && (HARD_CC.has(type) || type === "root" || type === "pull")) {
    addGroggy(room, t, st.groggy ?? 10, now);
    return false;
  }
  if (HARD_CC.has(type) || type === "root") {
    const imm = t.ccImmuneUntil ?? 0;
    if (now < imm) return false;
    if (t.elite && type !== "root") st = { ...st, dur: st.dur * 0.5 };
    t.ccImmuneUntil = now + st.dur + 3.5;
    // 제어되면 준비 중인 공격 취소
    if (t.windup && type !== "root") t.windup = null;
  }
  if (type === "slow" && t.boss) st = { ...st, dur: Math.min(st.dur, 1), v: Math.min(st.v ?? 0.3, 0.2) };
  if (type === "blind" && t.boss) return false;
  const cur = t.status.get(type);
  const until = now + st.dur;
  // 지속 피해는 중첩 불가(갱신만), 다른 상태도 더 긴 쪽 유지
  if (cur && cur.until > until && !DOT_TYPES.has(type)) return false;
  t.status.set(type, { until, v: st.v ?? 0, pow: st.pow ?? 0, src: src?.id ?? 0, srcAtk: src?.stats?.atk ?? src?.atk ?? 0, next: now + 1 });
  room.ev({ e: "st", id: t.id, s: type, d: st.dur });
  return true;
}

export function addGroggy(room, t, amount, now) {
  if (!t.boss || t.status.has("groggy") || now < (t.groggyImmune ?? 0)) return;
  t.groggyGauge = Math.min(100, (t.groggyGauge ?? 0) + amount);
  if (t.groggyGauge >= 100) {
    t.groggyGauge = 0;
    t.status.set("groggy", { until: now + 3, v: 0 });
    t.groggyImmune = now + 11;
    t.windup = null;
    room.ev({ e: "st", id: t.id, s: "groggy", d: 3 });
    room.ev({ e: "msg", text: `${t.name} 그로기!`, kind: "boss" });
  }
}

/**
 * 피해 처리. o: { pow, crit: 'roll'|'force'|'none', critBonus, pen, dot, skill, flank, bonus(배율 가산), fixed(고정 피해) }
 * 반환: { dmg, crit, blocked }
 */
export function dealDamage(room, src, t, o, now) {
  if (!t || t.dead || t.invuln) return { dmg: 0 };
  // 막기/반격 (플레이어가 정면 공격을 받을 때)
  if (t.team === "p" && t.parry && now <= t.parry.until && !o.dot && src && !o.unblockable) {
    const ang = Math.atan2(src.y - t.y, src.x - t.x);
    let d = Math.abs(((ang - t.parry.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d <= (t.parry.arc * Math.PI) / 360) {
      room.onParry(t, src, now);
      return { dmg: 0, blocked: true };
    }
  }
  // 정면 방어(리벳 방패): 정면 피해 감소
  let frontDr = 0;
  if (t.team === "p" && t.frontGuard && now <= t.frontGuard.until && !o.dot && src) {
    const ang = Math.atan2(src.y - t.y, src.x - t.x);
    if (angDiff(ang, t.frontGuard.dir) <= (t.frontGuard.arc * Math.PI) / 360) { frontDr = t.frontGuard.dr; room.onFrontGuard?.(t, now); }
  }
  // 회피
  if (!o.dot && t.team === "p") {
    const ev = (t.stats?.evade ?? 0) + buffSum(t, "evade");
    if (ev > 0 && Math.random() < Math.min(0.6, ev)) {
      room.ev({ e: "miss", id: t.id });
      return { dmg: 0, miss: true };
    }
  }
  // 몬스터 실명(연막): 공격 빗나감
  if (!o.dot && src?.team === "m" && src.status.has("blind") && Math.random() < src.status.get("blind").v) {
    room.ev({ e: "miss", id: t.id });
    return { dmg: 0, miss: true };
  }
  let dmg;
  let crit = false;
  if (o.fixed != null) dmg = o.fixed;
  else {
    const atk = src.team === "p" ? src.stats.atk : src.atk;
    const typeMul = src.team === "p" ? (src.stats.dmgType === "mag" ? src.stats.mag : src.stats.phys) : 1;
    let mul = 1 + (o.bonus ?? 0);
    if (src.team === "p") {
      mul += (src.stats.dmg ?? 0) + buffSum(src, "dmg");
      if (src.mythicBerserk && src.hp / src.maxHp <= 0.5) mul += 0.12;
      if (o.flank) mul += src.stats.vital ?? 0;
      if (t.status.has("vitalmark") || t.status.has("huntmark")) mul += (src.stats.vital ?? 0) * 0.5 + (src.stats.weak ?? 0);
      if (t.status.has("huntmark") && t.status.get("huntmark").src === src.id) mul += 0.15;
    }
    if (t.status.has("shock")) mul += 0.08;
    if (t.status.has("groggy")) mul += 0.25;
    dmg = atk * (o.pow ?? 1) * typeMul * mul;
    // 치명타: 직접 공격만 (지속 피해·독·화상 제외)
    if (!o.dot && src.team === "p" && o.crit !== "none") {
      if (o.crit === "force") { crit = true; dmg *= CRIT.BASE_DAMAGE; }
      else {
        const chance = Math.min(CRIT.CHANCE_CAP, src.stats.crit + buffSum(src, "crit") + (o.critBonus ?? 0));
        if (Math.random() < chance) {
          crit = true;
          dmg *= Math.min(CRIT.DAMAGE_CAP, src.stats.critDmg + buffSum(src, "critDmg"));
        }
      }
    }
    // 방어 (관통)
    const weaken = t.status.get("weaken")?.v ?? 0;
    const pen = Math.min(0.8, (o.pen ?? 0) + (src.team === "p" ? buffSum(src, "pen") : 0));
    const def = Math.max(0, (t.def ?? 0) * (1 - weaken) * (1 - pen));
    const lvl = src.team === "p" ? src.level : src.level ?? 1;
    dmg *= 1 - defReduction(def, lvl);
    dmg *= 0.9 + Math.random() * 0.2;
  }
  // 받는 피해 감소
  if (t.team === "p") {
    let dr = (t.stats?.dr ?? 0) + buffSum(t, "dr");
    if (t.mythicIron && t.hp / t.maxHp <= 0.4) dr += 0.15;
    dmg *= 1 - Math.min(0.6, dr);
    dmg *= 1 - frontDr;
  }
  if (o.capPct && t.boss) dmg = Math.min(dmg, t.maxHp * o.capPct * 0.1);
  if (o.capPct && !t.boss) dmg = Math.min(dmg, t.maxHp * o.capPct + 1);
  dmg = Math.max(1, Math.round(dmg));
  // 보호막
  let absorbed = 0;
  if (t.shield && t.shield.amt > 0 && now <= t.shield.until) {
    absorbed = Math.min(t.shield.amt, dmg);
    t.shield.amt -= absorbed;
    if (t.shield.amt <= 0) t.shield = null;
  }
  const real = dmg - absorbed;
  t.hp = Math.max(0, t.hp - real);
  t.lastHurt = now;
  const ev = { e: "dmg", id: t.id, v: dmg, c: crit ? 1 : 0, a: absorbed > 0 ? 1 : 0, d: o.dot ? 1 : 0, p: t.team === "p" ? 1 : 0 };
  if (o.skill && !o.dot && src?.type === "p") ev.sk = o.skill; // 스킬별 적중 연출용
  room.ev(ev);
  // 위협 (몬스터가 맞을 때)
  if (t.team === "m" && src?.team === "p") {
    const th = dmg * (o.threat ?? 1) * (src.stats.threat ?? 1);
    t.threat.set(src.id, (t.threat.get(src.id) ?? 0) + th);
    if (!t.aggro) t.aggro = true;
  }
  // 시전 중 피격 → 취소 (시전 안정 스탯으로 버팀)
  if (t.team === "p" && t.casting && t.casting.fragile && !o.dot && Math.random() > (t.stats.steady ?? 0)) room.cancelCast(t, "피격으로 시전이 취소됐어요.");
  if (t.team === "p" && t.channel && !o.dot) t.channel.interrupted = true;
  if (src?.team === "p" && !o.dot) room.onPlayerHit(src, t, dmg, crit, now, o);
  if (t.hp <= 0) room.kill(t, src, now);
  return { dmg, crit };
}

/** 치유 (치유 치명타 없음) */
export function heal(room, src, t, amount, now, { noEvent = false } = {}) {
  if (!t || t.dead) return 0;
  const before = t.hp;
  t.hp = Math.min(t.maxHp, t.hp + Math.round(amount));
  const v = t.hp - before;
  if (v > 0 && !noEvent) room.ev({ e: "heal", id: t.id, v });
  return v;
}

/** 보호막: 중첩 불가, 더 큰 쪽 유지 */
export function giveShield(room, t, amount, dur, now) {
  if (!t || t.dead) return;
  amount = Math.round(amount);
  if (t.shield && now <= t.shield.until && t.shield.amt >= amount) return;
  t.shield = { amt: amount, max: amount, until: now + dur };
  room.ev({ e: "shield", id: t.id, v: amount, d: dur });
}

/** 지속 피해·상태 만료 처리 (매 틱) */
export function tickStatuses(room, u, now) {
  for (const [type, s] of u.status) {
    if (now >= s.until) {
      u.status.delete(type);
      if (type === "groggy" || type === "stun" || type === "down" || type === "freeze") room.ev({ e: "stx", id: u.id, s: type });
      continue;
    }
    if (DOT_TYPES.has(type) && now >= s.next) {
      s.next += 1;
      const src = room.units.get(s.src);
      const amount = Math.max(1, s.srcAtk * s.pow * (u.team === "m" ? 1 - defReduction(u.def * 0.5, u.level ?? 1) : 1));
      dealDamage(room, src && !src.dead ? src : { team: src?.team ?? "m", id: 0, status: new Map(), buffs: new Map(), stats: {}, atk: 0 }, u, { fixed: amount, dot: true, crit: "none" }, now);
    }
  }
  for (const [id, b] of u.buffs) if (now >= b.until) u.buffs.delete(id);
  if (u.shield && now > u.shield.until) u.shield = null;
}

/** 이동 속도 배율 (감속·버프) */
export function moveMul(u) {
  let m = 1;
  if (u.status.has("slow")) m *= 1 - (u.status.get("slow").v || 0.3);
  if (u.status.has("root") || isHardCC(u)) return 0;
  m *= 1 + buffSum(u, "move");
  return Math.max(0.1, m);
}

/** 각도 차이(라디안, 0~π) */
export function angDiff(a, b) {
  return Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
}

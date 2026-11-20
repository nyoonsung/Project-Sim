// 몬스터·보스 AI (강한 공격은 바닥 예고 표시 후 발동)
import { moveCircle, lineOfSight, circleHitsWall } from "../../shared/move.js";
import { BOSS_HIT } from "../../shared/constants.js";
const SH = BOSS_HIT.shrink; // 보스 공격은 표시된 범위보다 살짝 안쪽까지만 맞음 (가장자리에 걸치면 안 맞음)
import { dealDamage, applyStatus, isHardCC, moveMul, angDiff } from "./combat.js";

const TAU = Math.PI * 2;

// 제2 던전의 일반·정예 몬스터는 낮아진 능력치에 맞춰 예고 시간을 늘리고 연계 빈도를 낮춘다.
export const D2_MOB_PATTERN = Object.freeze({
  attackRate: 1.25,
  meleeWindup: 1.25,
  stalkerTelegraph: 0.92,
  stalkerDash: 165,
  stalkerCooldown: 5.0,
  guardRadius: 92,
  guardTelegraph: 1.2,
  chargerDistance: 165,
  chargerWidth: 34,
  chargerTelegraph: 1.0,
  chargerCooldown: 5.2,
  volleyShots: 1,
  volleyGap: 0.2,
  volleyPow: 0.72,
  casterFollowDelay: 0.5,
  casterFollowRadius: 34,
  casterFollowTelegraph: 1.0,
  casterFollowPow: 0,
});

// 보스도 1/5 능력치에 맞춰 패턴을 덜 겹치게 하고 회피 시간을 늘린다.
export const D2_BOSS_PATTERN = Object.freeze({
  power: 0.75,
  telegraph: 1.25,
  telegraphMin: 1.0,
  comboPhase2: 0.25,
  comboPhase3: 0.32,
  comboDelay: 1.05,
  intervalPhase1: 4.0,
  intervalPhase2: 3.2,
  intervalPhase3: 2.6,
});

function pickTarget(room, m, now) {
  if (m.tauntBy && now < m.tauntBy.until) {
    const t = room.units.get(m.tauntBy.id);
    if (t && !t.dead) return t;
  }
  let best = null, bv = -1;
  for (const [id, v] of m.threat) {
    const p = room.units.get(id);
    if (!p || p.dead || p.ghost) { m.threat.delete(id); continue; }
    if (v > bv) { bv = v; best = p; }
  }
  if (best) return best;
  if (!m.aggro || !best) {
    for (const p of room.players.values()) {
      if (p.dead || p.ghost) continue;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < (m.aggro ? 900 : 250) && (m.aggro || lineOfSight(room.map, m.x, m.y, p.x, p.y))) {
        if (!best || d < Math.hypot(best.x - m.x, best.y - m.y)) best = p;
      }
    }
    if (best) {
      m.aggro = true;
      m.threat.set(best.id, 1);
      // 무리 어그로
      for (const o of room.units.values()) if (o.team === "m" && !o.aggro && !o.dummy && Math.hypot(o.x - m.x, o.y - m.y) < 140) { o.aggro = true; o.threat.set(best.id, 0.5); }
    }
  }
  return best;
}

function separate(room, m) {
  for (const o of room.nearbyMobs ? room.nearbyMobs(m.x, m.y, m.r + 72) : room.units.values()) {
    if (o === m || o.team !== "m" || o.dead || o.type === "d") continue;
    const dx = m.x - o.x, dy = m.y - o.y, d = Math.hypot(dx, dy), min = m.r + o.r - 2;
    if (d > 0 && d < min) {
      const push = (min - d) * 0.35;
      [m.x, m.y] = moveCircle(room.map, m.x, m.y, (dx / d) * push, (dy / d) * push, m.r * 0.8);
    }
  }
}

function moveToward(room, m, ang, speed, dt) {
  const r = m.fly ? m.r * 0.6 : m.r * 0.8;
  const x0 = m.x, y0 = m.y;
  [m.x, m.y] = moveCircle(room.map, m.x, m.y, Math.cos(ang) * speed * dt, Math.sin(ang) * speed * dt, r);
  // 끼임 감지: 가려던 거리의 30%도 못 갔으면 누적 → room.pathDir가 길찾기로 전환
  const moved = Math.hypot(m.x - x0, m.y - y0);
  m.stuckFor = moved < speed * dt * 0.3 ? (m.stuckFor ?? 0) + dt : Math.max(0, (m.stuckFor ?? 0) - dt * 0.5);
}

/** 몬스터가 대상(플레이어 또는 골렘)을 때림 */
function hitTarget(room, m, t, pow, now, extra = {}) {
  if (t.type === "d") {
    t.hp -= 1;
    room.ev({ e: "fx", fx: "impacts/blunt-hit", x: t.x | 0, y: t.y | 0, s: 0.6 });
    if (t.hp <= 0) room.removeUnit(t);
    return;
  }
  const r = dealDamage(room, m, t, { pow, ...extra }, now);
  if (r?.dmg && m.def_?.poison) applyStatus(room, m, t, { type: "poison", dur: 4, pow: 0.25 }, now);
  if (r?.dmg && extra.status) applyStatus(room, m, t, extra.status, now);
}

export function tickMonster(room, m, now) {
  const dt = 0.05;
  if (isHardCC(m)) return;
  const t = pickTarget(room, m, now);
  if (!t) {
    // 집 근처 배회
    if (Math.random() < 0.01) m.wander = Math.random() * TAU;
    if (m.wander != null && Math.hypot(m.x - m.home[0], m.y - m.home[1]) < 60) moveToward(room, m, m.wander, m.speed * 0.3, dt);
    return;
  }
  const dist = Math.hypot(t.x - m.x, t.y - m.y);
  const ang = Math.atan2(t.y - m.y, t.x - m.x);
  m.facing = ang;
  const spd = m.speed * moveMul(m);
  const def = m.def_;
  // 준비 중인 공격
  if (m.windup) {
    const w = m.windup;
    if (now >= w.at) {
      m.windup = null;
      w.fire(now);
      m.atkReady = now + def.atkCd * (room.dungeon === 2 ? D2_MOB_PATTERN.attackRate : 1) * (0.85 + Math.random() * 0.3);
    }
    return;
  }
  const ready = now >= (m.atkReady ?? 0);
  switch (m.ai) {
    case "stalker": {
      // 짧은 예고 후 빠르게 거리를 좁히는 추적 돌진
      if (ready && dist > 70 && dist < 245 && now >= (m.dashAt ?? 0) && lineOfSight(room.map, m.x, m.y, t.x, t.y)) {
        const a = ang, len = Math.min(room.dungeon === 2 ? D2_MOB_PATTERN.stalkerDash : 190, dist - 28);
        const tel = room.dungeon === 2 ? D2_MOB_PATTERN.stalkerTelegraph : 0.72;
        room.addArea({ team: "m", shape: "r", x: m.x, y: m.y, ang: a, l: len, w: 42, tel, fire: () => {} });
        m.windup = { at: now + tel, interruptible: true, fire: (t0) => {
          const hit = new Set(); let left = len;
          const step = () => {
            if (m.dead) return;
            const ox = m.x, oy = m.y; moveToward(room, m, a, Math.min(left, 34) / dt, dt); left -= Math.min(left, 34);
            for (const p of room.players.values()) if (!p.dead && !hit.has(p.id) && Math.hypot(p.x - m.x, p.y - m.y) < p.r + m.r + 14) { hit.add(p.id); hitTarget(room, m, p, 1.35, room.now); }
            if (left > 0 && Math.hypot(m.x - ox, m.y - oy) > 2) room.schedule(dt, step);
          };
          step(); m.dashAt = t0 + (room.dungeon === 2 ? D2_MOB_PATTERN.stalkerCooldown : 4.2);
        } };
        m.atkReady = now + (room.dungeon === 2 ? D2_MOB_PATTERN.stalkerCooldown : 4.2);
      } else if (dist <= def.range + t.r) {
        if (ready) m.windup = { at: now + 0.32, interruptible: true, fire: (t0) => { const tt = room.units.get(t.id); if (tt && !tt.dead && Math.hypot(tt.x - m.x, tt.y - m.y) <= def.range + tt.r + 12) hitTarget(room, m, tt, 1.1, t0); } };
      } else moveToward(room, m, room.pathDir(m, t), spd * 1.12, dt);
      break;
    }
    case "guard": {
      // 파편 골렘은 느리지만 단단하고 범위 강타로 공간을 압박한다.
      const radius = room.dungeon === 2 ? D2_MOB_PATTERN.guardRadius : 92;
      const tel = room.dungeon === 2 ? D2_MOB_PATTERN.guardTelegraph : 1.05;
      if (dist < radius + 13 && ready) {
        const x = m.x, y = m.y;
        room.addArea({ team: "m", shape: "c", x, y, r: radius, tel, fire: (t0) => {
          room.ev({ e: "fx", fx: "impacts/ground-slam", x: x | 0, y: y | 0, s: 0.85 });
          for (const p of room.players.values()) if (!p.dead && Math.hypot(p.x - x, p.y - y) <= radius + p.r) hitTarget(room, m, p, room.dungeon === 2 ? 1.65 : 1.55, t0);
        } });
        m.atkReady = now + def.atkCd * (room.dungeon === 2 ? D2_MOB_PATTERN.attackRate : 1);
      } else if (dist > def.range + t.r) moveToward(room, m, room.pathDir(m, t), spd, dt);
      break;
    }
    case "blink": {
      // 주기적으로 목표의 측후방으로 이동. 벽 안쪽 좌표는 피하고 즉시 공격하지 않는다.
      if (dist > 90 && dist < 240 && ready && now >= (m.blinkAt ?? 0)) {
        const a = ang + Math.PI + (m.id % 2 ? 0.5 : -0.5);
        const x = t.x + Math.cos(a) * 54, y = t.y + Math.sin(a) * 54;
        if (!circleHitsWall(room.map, x, y, m.r * 0.7)) {
          m.x = x; m.y = y; m.blinkAt = now + 4.8; m.atkReady = now + 0.8;
          if (room.allowAbyssOrbFx?.(now) ?? true) room.ev({ e: "fx", fx: "shadow/void-orb", x: x | 0, y: y | 0, s: 0.7 });
        } else moveToward(room, m, room.pathDir(m, t), spd, dt);
      } else if (dist <= def.range + t.r && ready) {
        m.windup = { at: now + 0.28, interruptible: true, fire: (t0) => { const tt = room.units.get(t.id); if (tt && !tt.dead && Math.hypot(tt.x - m.x, tt.y - m.y) <= def.range + tt.r + 10) hitTarget(room, m, tt, 1.25, t0); } };
      } else moveToward(room, m, room.pathDir(m, t), spd, dt);
      break;
    }
    case "chaser":
    case "swarm": {
      if (dist <= def.range + t.r) {
        if (ready) {
          const tel = (m.ai === "swarm" ? 0.25 : 0.4) * (room.dungeon === 2 ? D2_MOB_PATTERN.meleeWindup : 1);
          room.ev({ e: "anim", id: m.id, a: "slash" });
          m.windup = { at: now + tel, interruptible: true, fire: (t0) => {
            const tt = room.units.get(t.id);
            if (tt && !tt.dead && Math.hypot(tt.x - m.x, tt.y - m.y) <= def.range + tt.r + 12) hitTarget(room, m, tt, 1, t0);
            room.ev({ e: "fx", fx: "impacts/hit-flash", x: ((m.x + t.x) / 2) | 0, y: ((m.y + t.y) / 2) | 0, s: 0.5 });
          } };
        }
      } else moveToward(room, m, room.pathDir(m, t), spd, dt);
      break;
    }
    case "charger": {
      if (ready && dist < (room.dungeon === 2 ? 235 : 210) && lineOfSight(room.map, m.x, m.y, t.x, t.y)) {
        const a = ang, len = room.dungeon === 2 ? D2_MOB_PATTERN.chargerDistance : 170;
        const width = room.dungeon === 2 ? D2_MOB_PATTERN.chargerWidth : 34;
        const tel = room.dungeon === 2 ? D2_MOB_PATTERN.chargerTelegraph : 0.8;
        room.addArea({ team: "m", shape: "r", x: m.x, y: m.y, ang: a, l: len, w: width, tel, fire: () => {} });
        m.windup = { at: now + tel, interruptible: true, fire: (t0) => {
          const hit = new Set();
          let left = len;
          const step = () => {
            if (m.dead) return;
            const d = Math.min(left, 30);
            const ox = m.x, oy = m.y;
            moveToward(room, m, a, d / 0.05, 0.05);
            left -= d;
            for (const p of room.players.values()) {
              if (p.dead || hit.has(p.id)) continue;
              if (Math.hypot(p.x - m.x, p.y - m.y) < p.r + m.r + 8) { hit.add(p.id); hitTarget(room, m, p, 1.4, room.now); }
            }
            if (left > 0 && Math.hypot(m.x - ox, m.y - oy) > 2) room.schedule(0.05, step);
          };
          step();
        } };
        m.atkReady = now + (room.dungeon === 2 ? D2_MOB_PATTERN.chargerCooldown : 4); // 돌진이 끊겨도 재공격
      } else if (dist <= def.range + t.r) {
        if (ready) m.windup = { at: now + 0.45, interruptible: true, fire: (t0) => { if (Math.hypot(t.x - m.x, t.y - m.y) <= def.range + t.r + 12) hitTarget(room, m, t, 1, t0); } };
      } else moveToward(room, m, room.pathDir(m, t), spd, dt);
      break;
    }
    case "ranged":
    case "caster":
    case "summoner":
    case "spore": {
      if (m.ai === "summoner" && now >= (m.summonAt ?? 0) && room.aliveMonsters() < 22) {
        const count = room.dungeon === 2 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU, d = 50 + Math.random() * 35;
          const x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d;
          if (!circleHitsWall(room.map, x, y, 12)) room.spawnMonster(def.summon ?? "rift_wraith", x, y, false, { aggro: true, summoned: true });
        }
        m.summonAt = now + 9;
        room.ev({ e: "fx", fx: "spawn/spawn-portal", x: m.x | 0, y: m.y | 0, s: 0.55 });
      }
      const los = lineOfSight(room.map, m.x, m.y, t.x, t.y);
      const want = def.range * 0.7;
      if (!los || dist > def.range * 0.95) moveToward(room, m, room.pathDir(m, t), spd, dt);
      else if (dist < want * 0.55) moveToward(room, m, ang + Math.PI, spd * 0.8, dt);
      else if (Math.random() < 0.5) moveToward(room, m, ang + (m.id % 2 ? 1.57 : -1.57), spd * 0.35, dt);
      if (ready && los && dist <= def.range) {
        room.ev({ e: "anim", id: m.id, a: m.ai === "ranged" ? "shoot" : "cast" });
        if (m.ai === "ranged") {
          m.windup = { at: now + (room.dungeon === 2 ? 0.45 : 0.35), interruptible: true, fire: () => {
            const fireShot = (spread, pow) => {
              const tt = room.units.get(t.id) ?? t;
              const a = Math.atan2(tt.y - m.y, tt.x - m.x) + spread;
              room.addProjectile({ team: "m", src: m.id, x: m.x, y: m.y - 8, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, range: def.range + 60, r: 6, pierce: 0, fx: def.proj, scale: def.projSmall ? 0.45 : null,
                onHit: (p, t1) => hitTarget(room, m, p, pow, t1) });
            };
            if (room.dungeon === 2) {
              // 심연 원거리 몬스터는 짧은 좌우 연사를 사용해 이동 경로를 압박한다.
              const count = D2_MOB_PATTERN.volleyShots;
              for (let i = 0; i < count; i++) {
                const spread = count <= 1 ? 0 : (i / (count - 1) - 0.5) * 0.15;
                const fire = () => !m.dead && fireShot(spread, D2_MOB_PATTERN.volleyPow);
                if (i === 0) fire(); else room.schedule(i * D2_MOB_PATTERN.volleyGap, fire);
              }
            } else fireShot(0, 1);
          } };
        } else {
          const tx = t.x, ty = t.y, R = 46;
          const status = m.ai === "spore" ? { type: "slow", dur: 2.8, v: 0.42 } : def.aoe?.includes("ice") ? { type: "slow", dur: 2, v: 0.35 } : def.aoe?.includes("poison") || def.aoe?.includes("spore") ? { type: "poison", dur: 4, pow: 0.3 } : def.aoe?.includes("lightning") ? { type: "shock", dur: 3 } : null;
          m.windup = { at: now + (room.dungeon === 2 ? 0.5 : 0.3), interruptible: true, fire: () => {
            const burst = (cx, cy, radius, telegraph, power) => room.addArea({ team: "m", shape: "c", x: cx, y: cy, r: radius, tel: telegraph, fire: (t1) => {
              room.ev({ e: "fx", fx: def.aoe, x: cx | 0, y: cy | 0, s: 0.55 });
              for (const p of room.players.values()) if (!p.dead && Math.hypot(p.x - cx, p.y - cy) <= radius + p.r) hitTarget(room, m, p, power, t1, { unblockable: true, status });
            } });
            burst(tx, ty, R, room.dungeon === 2 ? 1.15 : 1.0, 1.3);
            if (room.dungeon === 2 && D2_MOB_PATTERN.casterFollowPow > 0) room.schedule(D2_MOB_PATTERN.casterFollowDelay, () => {
              if (m.dead) return;
              const target = room.units.get(t.id) ?? t;
              burst(target.x, target.y, D2_MOB_PATTERN.casterFollowRadius, D2_MOB_PATTERN.casterFollowTelegraph, D2_MOB_PATTERN.casterFollowPow);
            });
          } };
        }
      }
      break;
    }
    case "bomber": {
      if (dist <= 46) {
        if (ready) {
          const radius = room.dungeon === 2 ? 54 : 54, tel = room.dungeon === 2 ? 1.0 : 0.8;
          room.addArea({ team: "m", shape: "c", x: m.x, y: m.y, r: radius, tel, fire: () => {} });
          m.windup = { at: now + tel, interruptible: false, fire: (t0) => {
            room.ev({ e: "fx", fx: "explosions/small-explosion", x: m.x | 0, y: m.y | 0, s: 0.45 });
            for (const p of room.players.values()) if (!p.dead && Math.hypot(p.x - m.x, p.y - m.y) <= radius + p.r) hitTarget(room, m, p, room.dungeon === 2 ? 1.8 : 1.8, t0, { unblockable: true });
            room.kill(m, null, t0);
          } };
        }
      } else moveToward(room, m, room.pathDir(m, t), spd, dt);
      break;
    }
  }
  separate(room, m);
}

// ───────────────────────── 보스 ─────────────────────────
function bossTargets(room) {
  return [...room.players.values()].filter((p) => !p.dead);
}

export function tickBoss(room, b, now) {
  const dt = 0.05;
  if (isHardCC(b)) return;
  const def = b.def_;
  const phase2Threshold = 0.5;
  if (b.phase === 1 && b.hp < b.maxHp * phase2Threshold) {
    b.phase = 2;
    b.speed *= room.dungeon === 2 ? 1.05 : 1.15;
    room.ev({ e: "msg", text: `${b.name}이(가) 힘을 끌어올렸어요! (2페이즈)`, kind: "boss" });
    room.ev({ e: "fx", fx: "status/rage", x: b.x | 0, y: b.y | 0, s: 1.5, at: b.id });
    b.patternAt = now + 1;
  }
  // 심연 보스의 3페이즈: 20% 이하에서 분노. 기존 텔레그래프는 유지해 회피 여지를 남긴다.
  if (room.dungeon === 2 && b.phase === 2 && b.hp < b.maxHp * 0.2) {
    b.phase = 3;
    b.speed *= 1.08;
    room.ev({ e: "msg", text: `${b.name}이(가) 완전히 폭주합니다! (분노 상태)`, kind: "boss" });
    room.ev({ e: "fx", fx: "status/rage", x: b.x | 0, y: b.y | 0, s: 2.0, at: b.id });
    b.patternAt = now + 0.85;
  }
  // 장기전 방지용 분노는 4분 이후 공격력을 10%만 높인다.
  if (room.dungeon === 2 && !b.enraged && now - (b.bornAt ??= now) > 240) {
    b.enraged = true;
    b.atk *= 1.1;
    room.ev({ e: "msg", text: `${b.name}의 분노가 한계에 달했어요! (공격력 +10%)`, kind: "boss" });
  }
  const t = pickTarget(room, b, now) ?? bossTargets(room)[0];
  if (!t) return;
  const dist = Math.hypot(t.x - b.x, t.y - b.y);
  const ang = Math.atan2(t.y - b.y, t.x - b.x);
  if (b.pattern) {
    if (now >= b.pattern.end) b.pattern = null;
    else return;
  }
  b.facing = ang;
  // 패턴 시작
  if (now >= b.patternAt) {
    // 보스 고유 패턴 + 층에 따라 추가되는 공용 고급 패턴(추적 폭격·십자·안팎 폭발·나선 탄막·줄 공격)
    const extra = EXTRA_PATTERNS.filter((x) => room.floor >= x.from).map((x) => x.p);
    const native = def.patterns.filter((p) => !p.phase2 || b.phase >= 2);
    // 제2 던전은 어느 보스든 추적 폭격·십자 베기·잔류 장판을 추가로 사용한다.
    const abyssExtra = room.dungeon === 2 ? [
      { type: "chase", n: b.phase === 3 ? 5 : 4, gap: 0.4, radius: 46, tel: 0.82, pow: 1.0, fx: "impacts/ground-slam" },
      { type: "cross", len: 420, width: 40, tel: 0.86, pow: 1.2, fx: "shadow/dark-explosion" },
      { type: "pools", n: b.phase === 3 ? 8 : 6, radius: 40, dur: 6, pow: 0.55, fx: "shadow/shadow-flames" },
      // 행진 폭발(대상 쪽으로 줄지어 다가오는 폭발 2줄)
      { type: "walk", n: 10, gap: 0.08, step: 42, radius: 42, tel: 0.7, pow: 1.3, fx: "shadow/dark-explosion" },
      ...(room.floor >= 11 ? [
        // 파도 고리: 안쪽부터 차례로 터짐 → 터진 안쪽으로 파고들어야 안전
        { type: "nova", step: 90, n: 3, tel: 0.85, pow: 1.35, fx: "shadow/dark-explosion" },
        // 격자: 가로줄 → 반대 가로줄 → 세로줄
        { type: "grid", n: 6, tel: 0.95, pow: 1.4, fx: "lightning/lightning-strike" },
      ] : []),
      ...(room.floor >= 21 ? [
        // 연속 돌진: 매번 다시 조준해서 4번
        { type: "multicharge", n: 4, dist: 320, width: 50, tel: 0.6, pow: 1.6 },
        // 안전지대: 투기장 전체가 터지고 빛나는 원 하나만 안전
        { type: "safespot", safe: 52, tel: 1.55, pow: 2.2, fx: "shadow/dark-explosion" },
      ] : []),
    ] : [];
    const allPats = [...native, ...extra, ...abyssExtra];
    if (!allPats.length) return;
    const pickIndex = (b.patIdx++ * 7 + Math.floor(Math.random() * allPats.length)) % allPats.length;
    const chosen = allPats[pickIndex];
    const tune = (pat) => room.dungeon === 2
      ? { ...pat, ...(pat.tel == null ? {} : { tel: Math.max(D2_BOSS_PATTERN.telegraphMin, pat.tel * D2_BOSS_PATTERN.telegraph) }), ...(pat.n == null ? {} : { n: Math.max(1, Math.ceil(pat.n * 0.75)) }), pow: (pat.pow ?? 1) * D2_BOSS_PATTERN.power }
      : pat;
    startPattern(room, b, tune(chosen), t, now);
    // 심연 보스는 2·3페이즈에서 서로 다른 공격을 겹쳐 압박한다.
    const comboPool = room.dungeon === 2 ? allPats.filter((x) => x !== chosen) : extra;
    const comboChance = room.dungeon === 2 ? (b.phase === 3 ? D2_BOSS_PATTERN.comboPhase3 : D2_BOSS_PATTERN.comboPhase2) : 0.35;
    if (b.phase >= 2 && comboPool.length && Math.random() < comboChance) {
      const p2 = tune(comboPool[Math.floor(Math.random() * comboPool.length)]);
      room.schedule(room.dungeon === 2 ? D2_BOSS_PATTERN.comboDelay : 0.8, () => {
        if (!b.dead) {
          const keep = b.pattern;
          startPattern(room, b, p2, pickTarget(room, b, room.now) ?? t, room.now);
          if (keep && keep.end > (b.pattern?.end ?? 0)) b.pattern = keep;
        }
      });
    }
    b.patternAt = now + (room.dungeon === 2
      ? (b.phase === 3 ? D2_BOSS_PATTERN.intervalPhase3 : b.phase === 2 ? D2_BOSS_PATTERN.intervalPhase2 : D2_BOSS_PATTERN.intervalPhase1)
      : (b.phase === 2 ? 2.1 : 2.9)) + Math.random() * (room.dungeon === 2 ? 0.55 : 0.45);
    return;
  }
  // 평타 (가까우면)
  if (dist < 60 + t.r + b.r * 0.5 && now >= (b.atkReady ?? 0)) {
    b.atkReady = now + 1.8;
    const a = ang;
    room.addArea({ team: "m", shape: "cone", x: b.x, y: b.y, r: 70 + b.r * 0.5, ang: a, arc: 100, tel: 0.5, fire: (t0) => {
      room.ev({ e: "anim", id: b.id, a: "slash" });
      for (const p of bossTargets(room)) if (Math.hypot(p.x - b.x, p.y - b.y) <= 70 + b.r * 0.5 - SH && angDiff(Math.atan2(p.y - b.y, p.x - b.x), a) <= (46 * Math.PI) / 180) hitTarget(room, b, p, 1, t0);
    } });
    b.pattern = { end: now + 0.6 };
    return;
  }
  if (dist > 40 + b.r) moveToward(room, b, room.pathDir(b, t), b.speed * moveMul(b), dt);
}

// 층이 오르면 모든 보스에 추가되는 고급 패턴
const EXTRA_PATTERNS = [
  { from: 10, p: { type: "chase", n: 4, gap: 0.45, radius: 46, tel: 0.75, pow: 0.8, fx: "impacts/ground-slam" } },
  { from: 20, p: { type: "cross", len: 360, width: 36, tel: 1.0, pow: 1.0, fx: "melee/spear-sweep" } },
  { from: 30, p: { type: "donut", inner: 110, outer: 250, tel: 1.1, pow: 1.1, fx: "shadow/dark-explosion" } },
  { from: 50, p: { type: "spiral", arms: 3, dur: 2.2, speed: 170, pow: 0.7, fx: "arcane/arcane-orb" } },
  { from: 70, p: { type: "lanes", n: 5, width: 56, len: 460, tel: 1.1, pow: 1.0, fx: "lightning/zap-hit" } },
];
function startPattern(room, b, p, t, now) {
  // 제2 던전 보스는 탄막·조준 사격·나선 탄막을 겹쳐 발사하지 않는다.
  // 기존 탄이 화면에 남아 있는 동안 같은 보스가 새 투사체 패턴을 연속 예약하지 않도록 잠근다.
  if (room.dungeon === 2 && ["barrage", "aimed", "spiral"].includes(p.type)) {
    const lockedUntil = b.projectilePatternUntil ?? 0;
    if (now < lockedUntil) return;
    const hold = p.type === "spiral" ? (p.dur ?? 2.5) + 4 : p.type === "barrage" ? 5.5 : 3.5;
    b.projectilePatternUntil = now + hold;
  }
  const def = b.def_;
  const ply = bossTargets(room);
  const pw = p.pow ?? 1;
  const fxAt = (fx, x, y, s) => fx && room.ev({ e: "fx", fx, x: x | 0, y: y | 0, s: s ?? null });
  const hitIn = (test, pow, t0, extra) => { for (const q of bossTargets(room)) if (test(q)) hitTarget(room, b, q, pow, t0, extra); };
  room.ev({ e: "bpat", id: b.id, p: p.type });
  b.pattern = { end: now + (p.tel ?? 1) + 0.4, winding: true };
  switch (p.type) {
    case "cleave": {
      const a = Math.atan2(t.y - b.y, t.x - b.x);
      room.addArea({ team: "m", shape: "cone", x: b.x, y: b.y, r: p.range, ang: a, arc: p.arc, tel: p.tel, fire: (t0) => {
        room.ev({ e: "anim", id: b.id, a: "slash" });
        fxAt(p.fx ?? "melee/heavy-cleave", b.x + Math.cos(a) * 30, b.y + Math.sin(a) * 30);
        hitIn((q) => Math.hypot(q.x - b.x, q.y - b.y) <= p.range - SH && angDiff(Math.atan2(q.y - b.y, q.x - b.x), a) <= (p.arc * Math.PI) / 360 - 0.06, pw, t0);
      } });
      break;
    }
    case "slam": {
      room.addArea({ team: "m", shape: "c", x: b.x, y: b.y, r: p.radius, tel: p.tel, fire: (t0) => {
        room.ev({ e: "anim", id: b.id, a: "smash" });
        fxAt(p.fx ?? "impacts/ground-slam", b.x, b.y);
        room.ev({ e: "shake", v: 4 });
        hitIn((q) => Math.hypot(q.x - b.x, q.y - b.y) <= p.radius - SH, pw, t0, { unblockable: true, status: p.freeze ? { type: "freeze", dur: 0.8 } : null });
      } });
      break;
    }
    case "ring": {
      room.addArea({ team: "m", shape: "ring", x: b.x, y: b.y, r: p.inner, r2: p.outer, tel: p.tel, fire: (t0) => {
        fxAt(p.fx ?? "impacts/ground-slam", b.x, b.y, 1.2);
        room.ev({ e: "shake", v: 5 });
        hitIn((q) => { const d = Math.hypot(q.x - b.x, q.y - b.y); return d >= p.inner + SH && d <= p.outer - SH; }, pw, t0, { unblockable: true });
      } });
      break;
    }
    case "charge": {
      const a = Math.atan2(t.y - b.y, t.x - b.x);
      room.addArea({ team: "m", shape: "r", x: b.x, y: b.y, ang: a, l: p.dist, w: p.width, tel: p.tel, fire: (t0) => {
        const hit = new Set();
        let left = p.dist;
        room.ev({ e: "anim", id: b.id, a: "dash" });
        const step = () => {
          if (b.dead) return;
          const d = Math.min(left, 36);
          const ox = b.x, oy = b.y;
          moveToward(room, b, a, d / 0.05, 0.05);
          left -= d;
          for (const q of bossTargets(room)) if (!hit.has(q.id) && Math.hypot(q.x - b.x, q.y - b.y) < b.r * 0.8 + p.width / 4) { hit.add(q.id); hitTarget(room, b, q, pw, room.now); }
          if (left > 0 && Math.hypot(b.x - ox, b.y - oy) > 2) room.schedule(0.05, step);
          else { fxAt("impacts/heavy-landing", b.x, b.y); room.ev({ e: "shake", v: 3 }); }
        };
        step();
      } });
      b.pattern.end = now + p.tel + 0.9;
      break;
    }
    case "barrage": {
      const waves = b.phase === 2 ? 3 : 2;
      // 사전 경고: 100층 보스는 3초, 다른 보스는 1.5초 동안 탄이 날아갈 길을 크게 보여 준 뒤 발사 (근접 직업이 피할 시간)
      const delay = room.dungeon === 2 ? 0.95 : room.floor >= 100 ? 3 : 1.5;
      b.pattern.end = now + delay + 0.1 + waves * 0.5;
      room.ev({ e: "anim", id: b.id, a: "cast" });
      room.ev({ e: "warn", id: b.id, k: "barrage", d: delay, n: p.count, w: waves, x: b.x | 0, y: (b.y - 10) | 0 });
      for (let w = 0; w < waves; w++) {
        room.schedule(delay + w * 0.5, () => {
          if (b.dead) return;
          const off = (w * Math.PI) / p.count;
          for (let k = 0; k < p.count; k++) {
            const a = (k / p.count) * TAU + off;
            room.addProjectile({ team: "m", src: b.id, x: b.x, y: b.y - 10, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, range: 520, r: BOSS_HIT.proj, pierce: 0, fx: p.fx, scale: 0.45, onHit: (q, t1) => hitTarget(room, b, q, pw, t1) });
          }
        });
      }
      break;
    }
    case "aimed": {
      b.pattern.end = now + 1.2;
      room.ev({ e: "anim", id: b.id, a: "shoot" });
      room.schedule(0.5, () => {
        if (b.dead) return;
        for (const q of bossTargets(room)) {
          const base = Math.atan2(q.y - b.y, q.x - b.x);
          for (let k = 0; k < p.count; k++) {
            const a = base + ((p.spread * Math.PI) / 180) * (p.count > 1 ? k / (p.count - 1) - 0.5 : 0);
            room.addProjectile({ team: "m", src: b.id, x: b.x, y: b.y - 10, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, range: 560, r: BOSS_HIT.proj, pierce: 0, fx: p.fx, scale: 0.5, onHit: (q2, t1) => hitTarget(room, b, q2, pw, t1) });
          }
        }
      });
      break;
    }
    case "rain": {
      room.ev({ e: "anim", id: b.id, a: "cast" });
      const pts = [];
      for (const q of ply) pts.push([q.x, q.y]);
      while (pts.length < p.n) {
        const a = Math.random() * TAU, d = 40 + Math.random() * 220;
        const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
        if (!circleHitsWall(room.map, x, y, 4)) pts.push([x, y]);
        else if (Math.random() < 0.2) pts.push([b.x, b.y + 40]);
      }
      pts.forEach(([x, y], i) => {
        room.schedule(i * 0.12, () => !b.dead && room.addArea({ team: "m", shape: "c", x, y, r: p.radius, tel: p.tel, fire: (t0) => {
          fxAt(p.fx, x, y, 0.5);
          hitIn((q) => Math.hypot(q.x - x, q.y - y) <= p.radius - SH, pw, t0, { unblockable: true });
        } }));
      });
      b.pattern.end = now + 1.2;
      break;
    }
    case "summon": {
      const alive = [...room.units.values()].filter((u) => u.team === "m" && u.type === "m" && !u.dead).length;
      const n = Math.max(0, Math.min(p.n, 8 - alive));
      room.ev({ e: "anim", id: b.id, a: "cast" });
      for (let k = 0; k < n; k++) {
        const a = (k / Math.max(1, n)) * TAU;
        let x = b.x + Math.cos(a) * 60, y = b.y + Math.sin(a) * 60;
        if (circleHitsWall(room.map, x, y, 10)) { x = b.x; y = b.y + 30; }
        fxAt("spawn/summon-rise", x, y, 0.5);
        room.schedule(0.6, () => !b.dead && room.spawnMonster(p.monster, x, y, false, { aggro: true, summoned: room.dungeon === 2 }));
      }
      b.pattern.end = now + 1.0;
      break;
    }
    case "pools": {
      room.ev({ e: "anim", id: b.id, a: "cast" });
      for (let k = 0; k < p.n; k++) {
        const q = ply[k % Math.max(1, ply.length)];
        const x = (q?.x ?? b.x) + (Math.random() - 0.5) * 160, y = (q?.y ?? b.y) + (Math.random() - 0.5) * 160;
        if (circleHitsWall(room.map, x, y, 6)) continue;
        room.addArea({ team: "m", shape: "c", x, y, r: p.radius, tel: room.dungeon === 2 ? 0.72 : 0.9, fire: () => {
          room.addZone({ team: "m", owner: b.id, x, y, r: p.radius, dur: p.dur, interval: 0.5, fx: p.fx, tick: (t0, z) => {
            for (const q2 of bossTargets(room)) if (Math.hypot(q2.x - z.x, q2.y - z.y) <= z.r - SH) hitTarget(room, b, q2, p.pow, t0, { unblockable: true });
          } });
        } });
      }
      b.pattern.end = now + 1.0;
      break;
    }
    case "pull": {
      room.addArea({ team: "m", shape: "c", x: b.x, y: b.y, r: p.radius, tel: p.tel, fire: (t0) => {
        fxAt("explosions/implosion", b.x, b.y, 1);
        for (const q of bossTargets(room)) {
          const d = Math.hypot(q.x - b.x, q.y - b.y);
          if (d > p.radius) continue;
          const a = Math.atan2(b.y - q.y, b.x - q.x), pull = Math.max(0, d - b.r - 30);
          [q.x, q.y] = moveCircle(room.map, q.x, q.y, Math.cos(a) * pull, Math.sin(a) * pull, q.r);
          q.session.send({ t: "tp", x: q.x, y: q.y });
        }
        room.addArea({ team: "m", shape: "c", x: b.x, y: b.y, r: 90, tel: 0.7, fire: (t1) => {
          fxAt("shadow/dark-explosion", b.x, b.y, 0.6);
          hitIn((q) => Math.hypot(q.x - b.x, q.y - b.y) <= 90 - SH, pw, t1, { unblockable: true });
        } });
      } });
      b.pattern.end = now + p.tel + 1.0;
      break;
    }
    case "chase": {
      // 추적 폭격: 각 플레이어 발밑에 연속으로 폭발 → 계속 움직여야 함
      room.ev({ e: "anim", id: b.id, a: "cast" });
      for (let k = 0; k < p.n; k++) {
        room.schedule(k * p.gap, () => {
          if (b.dead) return;
          for (const q of bossTargets(room)) {
            const x = q.x, y = q.y;
            room.addArea({ team: "m", shape: "c", x, y, r: p.radius, tel: p.tel, fire: (t0) => {
              fxAt(p.fx, x, y, 0.55);
              hitIn((q2) => Math.hypot(q2.x - x, q2.y - y) <= p.radius - SH, pw, t0, { unblockable: true });
            } });
          }
        });
      }
      b.pattern.end = now + p.n * p.gap + 0.3;
      break;
    }
    case "cross": {
      // 십자 베기 → 곧이어 X자 베기 (안전한 곳이 바뀜)
      room.ev({ e: "anim", id: b.id, a: "cast" });
      const wave = (rot, delay) => room.schedule(delay, () => {
        if (b.dead) return;
        for (let k = 0; k < 4; k++) {
          const a = rot + (k * Math.PI) / 2;
          room.addArea({ team: "m", shape: "r", x: b.x, y: b.y, ang: a, l: p.len, w: p.width, tel: p.tel, fire: (t0) => {
            fxAt(p.fx, b.x + Math.cos(a) * p.len * 0.5, b.y + Math.sin(a) * p.len * 0.5, 0.7);
            hitIn((q) => { const dx = q.x - b.x, dy = q.y - b.y, al = dx * Math.cos(a) + dy * Math.sin(a), ac = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); return al > 0 && al < p.len && ac < p.width / 2 - 2; }, pw, t0, { unblockable: true });
          } });
        }
      });
      const r0 = Math.random() * Math.PI / 2;
      wave(r0, 0); wave(r0 + Math.PI / 4, 0.75);
      b.pattern.end = now + 0.75 + p.tel + 0.3;
      break;
    }
    case "donut": {
      // 안팎 폭발: 먼저 가운데 큰 원(밖으로) → 이어서 바깥 고리(다시 안으로)
      room.addArea({ team: "m", shape: "c", x: b.x, y: b.y, r: p.inner, tel: p.tel, fire: (t0) => {
        room.ev({ e: "anim", id: b.id, a: "smash" }); fxAt("impacts/ground-slam", b.x, b.y); room.ev({ e: "shake", v: 4 });
        hitIn((q) => Math.hypot(q.x - b.x, q.y - b.y) <= p.inner - SH, pw, t0, { unblockable: true });
      } });
      room.schedule(p.tel * 0.55, () => !b.dead && room.addArea({ team: "m", shape: "ring", x: b.x, y: b.y, r: p.inner, r2: p.outer, tel: p.tel, fire: (t0) => {
        fxAt(p.fx ?? "shadow/dark-explosion", b.x, b.y, 1.2); room.ev({ e: "shake", v: 5 });
        hitIn((q) => { const d = Math.hypot(q.x - b.x, q.y - b.y); return d >= p.inner + SH && d <= p.outer - SH; }, pw, t0, { unblockable: true });
      } }));
      b.pattern.end = now + p.tel * 1.55 + 0.3;
      break;
    }
    case "spiral": {
      // 나선 탄막: 경고 뒤 팔 3개로 도는 탄
      const delay = 1.0;
      room.ev({ e: "anim", id: b.id, a: "cast" });
      room.ev({ e: "warn", id: b.id, k: "spiral", d: delay, n: p.arms * 4, w: 1, x: b.x | 0, y: (b.y - 10) | 0 });
      const base = Math.random() * TAU, dir = Math.random() < 0.5 ? 1 : -1, n = Math.round(p.dur / 0.12);
      for (let k = 0; k < n; k++) room.schedule(delay + k * 0.12, () => {
        if (b.dead) return;
        for (let arm = 0; arm < p.arms; arm++) {
          const a = base + dir * k * 0.33 + (arm * TAU) / p.arms;
          room.addProjectile({ team: "m", src: b.id, x: b.x, y: b.y - 10, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, range: 480, r: BOSS_HIT.proj, pierce: 0, fx: p.fx, scale: 0.4, onHit: (q, t1) => hitTarget(room, b, q, pw, t1) });
        }
      });
      b.pattern.end = now + delay + p.dur + 0.2;
      break;
    }
    case "lanes": {
      // 줄 공격: 보스 앞쪽으로 평행한 줄 여러 개, 한 줄만 비어 있음
      const a = Math.atan2(t.y - b.y, t.x - b.x), nx = -Math.sin(a), ny = Math.cos(a);
      const safe = Math.floor(Math.random() * p.n);
      for (let k = 0; k < p.n; k++) {
        if (k === safe) continue;
        const off = (k - (p.n - 1) / 2) * p.width;
        const sx = b.x + nx * off - Math.cos(a) * 60, sy = b.y + ny * off - Math.sin(a) * 60;
        room.addArea({ team: "m", shape: "r", x: sx, y: sy, ang: a, l: p.len, w: p.width - 4, tel: p.tel, fire: (t0) => {
          fxAt(p.fx, sx + Math.cos(a) * p.len * 0.5, sy + Math.sin(a) * p.len * 0.5, 0.6);
          hitIn((q) => { const dx = q.x - sx, dy = q.y - sy, al = dx * Math.cos(a) + dy * Math.sin(a), ac = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); return al > 0 && al < p.len && ac < (p.width - 4) / 2 - 2; }, pw, t0, { unblockable: true });
        } });
      }
      b.pattern.end = now + p.tel + 0.3;
      break;
    }
    case "safespot": {
      // 안전지대: 투기장 전체가 터지고 빛나는 원 하나만 안전 → 그 원으로 달려가야 함
      const A = room.map.arena;
      let sx = b.x, sy = b.y;
      for (let k = 0; k < 20; k++) {
        const x = A ? A.x0 + 60 + Math.random() * (A.x1 - A.x0 - 120) : t.x + (Math.random() - 0.5) * 400;
        const y = A ? A.y0 + 60 + Math.random() * (A.y1 - A.y0 - 120) : t.y + (Math.random() - 0.5) * 300;
        const far = Math.hypot(x - t.x, y - t.y);
        if (!circleHitsWall(room.map, x, y, p.safe) && far > 120 && far < 330) { sx = x; sy = y; break; }
      }
      room.ev({ e: "anim", id: b.id, a: "cast" });
      room.ev({ e: "msg", text: "빛나는 원 안으로 피하세요!", kind: "warn" });
      room.addArea({ team: "m", shape: "ring", x: sx, y: sy, r: p.safe, r2: 1400, tel: p.tel, fire: (t0) => {
        fxAt(p.fx, b.x, b.y, 1.6);
        room.ev({ e: "shake", v: 8 });
        hitIn((q) => Math.hypot(q.x - sx, q.y - sy) > p.safe + q.r * 0.5, pw, t0, { unblockable: true });
      } });
      b.pattern.end = now + p.tel + 0.5;
      break;
    }
    case "grid": {
      // 격자: 가로줄(빈 줄 섞임) → 곧바로 세로줄. 안전한 칸이 계속 바뀜
      const A = room.map.arena ?? { x0: b.x - 300, y0: b.y - 220, x1: b.x + 300, y1: b.y + 220 };
      const W = A.x1 - A.x0, H = A.y1 - A.y0;
      const band = (horiz, k, n, delay) => room.schedule(delay, () => {
        if (b.dead) return;
        const w = (horiz ? H : W) / n;
        const c = (horiz ? A.y0 : A.x0) + w * (k + 0.5);
        const x = horiz ? A.x0 : c, y = horiz ? c : A.y0, ang = horiz ? 0 : Math.PI / 2, len = horiz ? W : H;
        room.addArea({ team: "m", shape: "r", x, y, ang, l: len, w: w - 2, tel: p.tel, fire: (t0) => {
          fxAt(p.fx, x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5, 0.6);
          hitIn((q) => (horiz ? Math.abs(q.y - c) < w / 2 - 3 : Math.abs(q.x - c) < w / 2 - 3), pw, t0, { unblockable: true });
        } });
      });
      const n = p.n, off = Math.random() < 0.5 ? 0 : 1;
      for (let k = 0; k < n; k++) if ((k + off) % 2 === 0) band(true, k, n, 0);
      for (let k = 0; k < n; k++) if ((k + off) % 2 === 1) band(true, k, n, p.tel + 0.1);
      const v0 = Math.random() < 0.5 ? 0 : 1;
      for (let k = 0; k < n; k++) if ((k + v0) % 2 === 0) band(false, k, n, (p.tel + 0.1) * 2);
      room.ev({ e: "anim", id: b.id, a: "cast" });
      b.pattern.end = now + (p.tel + 0.1) * 2 + 0.4;
      break;
    }
    case "multicharge": {
      // 연속 돌진: 매번 다시 조준해서 n번
      const go = (i) => {
        if (b.dead || i >= p.n) return;
        const tt = pickTarget(room, b, room.now) ?? t;
        const a = Math.atan2(tt.y - b.y, tt.x - b.x);
        room.addArea({ team: "m", shape: "r", x: b.x, y: b.y, ang: a, l: p.dist, w: p.width, tel: p.tel, fire: () => {
          const hit = new Set();
          let left = p.dist;
          room.ev({ e: "anim", id: b.id, a: "dash" });
          const step = () => {
            if (b.dead) return;
            const d = Math.min(left, 40), ox = b.x, oy = b.y;
            moveToward(room, b, a, d / 0.05, 0.05);
            left -= d;
            for (const q of bossTargets(room)) if (!hit.has(q.id) && Math.hypot(q.x - b.x, q.y - b.y) < b.r * 0.8 + p.width / 4) { hit.add(q.id); hitTarget(room, b, q, pw, room.now); }
            if (left > 0 && Math.hypot(b.x - ox, b.y - oy) > 2) room.schedule(0.05, step);
            else { fxAt("impacts/heavy-landing", b.x, b.y); room.ev({ e: "shake", v: 3 }); room.schedule(0.15, () => go(i + 1)); }
          };
          step();
        } });
      };
      go(0);
      b.pattern.end = now + p.n * (p.tel + 0.6) + 0.3;
      break;
    }
    case "walk": {
      // 행진 폭발: 보스에서 대상 쪽으로 폭발이 줄지어 다가옴 (2줄: 지금 위치, 잠시 뒤 바뀐 위치)
      const line = (delay) => room.schedule(delay, () => {
        if (b.dead) return;
        const tt = pickTarget(room, b, room.now) ?? t;
        const a = Math.atan2(tt.y - b.y, tt.x - b.x);
        for (let k = 1; k <= p.n; k++) {
          const x = b.x + Math.cos(a) * p.step * k, y = b.y + Math.sin(a) * p.step * k;
          if (circleHitsWall(room.map, x, y, 6)) break;
          room.schedule(k * p.gap, () => !b.dead && room.addArea({ team: "m", shape: "c", x, y, r: p.radius, tel: p.tel, fire: (t0) => {
            fxAt(p.fx, x, y, 0.55);
            hitIn((q) => Math.hypot(q.x - x, q.y - y) <= p.radius - SH, pw, t0, { unblockable: true });
          } }));
        }
      });
      room.ev({ e: "anim", id: b.id, a: "cast" });
      line(0); line(0.7);
      b.pattern.end = now + 0.7 + p.n * p.gap + p.tel + 0.2;
      break;
    }
    case "nova": {
      // 파도 고리: 안쪽부터 바깥으로 고리가 차례로 터짐 → 이미 터진 안쪽으로 파고들어야 안전
      room.ev({ e: "anim", id: b.id, a: "smash" });
      for (let k = 0; k < p.n; k++) {
        const r0 = k * p.step, r1 = (k + 1) * p.step;
        room.schedule(k * 0.45, () => !b.dead && room.addArea({ team: "m", shape: k === 0 ? "c" : "ring", x: b.x, y: b.y, r: k === 0 ? r1 : r0, r2: k === 0 ? 0 : r1, tel: p.tel, fire: (t0) => {
          fxAt(p.fx, b.x, b.y, 0.6 + k * 0.35);
          room.ev({ e: "shake", v: 3 });
          hitIn((q) => { const d = Math.hypot(q.x - b.x, q.y - b.y); return d >= (k === 0 ? 0 : r0 + SH) && d <= r1 - SH; }, pw, t0, { unblockable: true });
        } }));
      }
      b.pattern.end = now + (p.n - 1) * 0.45 + p.tel + 0.3;
      break;
    }
    case "beam": {
      const a0 = Math.atan2(t.y - b.y, t.x - b.x);
      const dir = Math.random() < 0.5 ? 1 : -1, rot = (70 * Math.PI) / 180 * dir, len = 420;
      room.addArea({ team: "m", shape: "r", x: b.x, y: b.y, ang: a0, l: len, w: p.width, tel: 0.9, fire: () => {} });
      room.ev({ e: "bbeam", id: b.id, a: Math.round(a0 * 1000), rot: Math.round(rot * 1000), d: p.dur, w: p.width, l: len, fx: p.fx, at: 0.9 });
      const t0 = now + 0.9;
      for (let k = 0; k < p.dur / 0.2; k++) {
        room.schedule(0.9 + k * 0.2, (tn) => {
          if (b.dead || isHardCC(b)) return;
          const a = a0 + rot * (tn - t0);
          hitIn((q) => {
            const dx = q.x - b.x, dy = q.y - b.y;
            const along = dx * Math.cos(a) + dy * Math.sin(a), across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
            return along > 0 && along < len && across < p.width / 2 - 2;
          }, pw, tn, { unblockable: true });
        });
      }
      b.pattern.end = now + 0.9 + p.dur;
      break;
    }
  }
}
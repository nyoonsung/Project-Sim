// 몬스터·보스 AI (강한 공격은 바닥 예고 표시 후 발동)
import { moveCircle, lineOfSight, circleHitsWall } from "../../shared/move.js";
import { dealDamage, applyStatus, isHardCC, moveMul, angDiff } from "./combat.js";

const TAU = Math.PI * 2;

function pickTarget(room, m, now) {
  if (m.tauntBy && now < m.tauntBy.until) {
    const t = room.units.get(m.tauntBy.id);
    if (t && !t.dead) return t;
  }
  let best = null, bv = -1;
  for (const [id, v] of m.threat) {
    const p = room.units.get(id);
    if (!p || p.dead) { m.threat.delete(id); continue; }
    if (v > bv) { bv = v; best = p; }
  }
  if (best) return best;
  if (!m.aggro || !best) {
    for (const p of room.players.values()) {
      if (p.dead) continue;
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
  for (const o of room.units.values()) {
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
      m.atkReady = now + def.atkCd * (0.85 + Math.random() * 0.3);
    }
    return;
  }
  const ready = now >= (m.atkReady ?? 0);
  switch (m.ai) {
    case "chaser":
    case "swarm": {
      if (dist <= def.range + t.r) {
        if (ready) {
          const tel = m.ai === "swarm" ? 0.25 : 0.4;
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
      if (ready && dist < 210 && lineOfSight(room.map, m.x, m.y, t.x, t.y)) {
        const a = ang, len = 170;
        room.addArea({ team: "m", shape: "r", x: m.x, y: m.y, ang: a, l: len, w: 34, tel: 0.8, fire: () => {} });
        m.windup = { at: now + 0.8, interruptible: true, fire: (t0) => {
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
        m.atkReady = now + 4; // 돌진이 끊겨도 4초 뒤엔 다시 공격 (예전엔 99초 동안 공격 안 함)
      } else if (dist <= def.range + t.r) {
        if (ready) m.windup = { at: now + 0.45, interruptible: true, fire: (t0) => { if (Math.hypot(t.x - m.x, t.y - m.y) <= def.range + t.r + 12) hitTarget(room, m, t, 1, t0); } };
      } else moveToward(room, m, room.pathDir(m, t), spd, dt);
      break;
    }
    case "ranged":
    case "caster": {
      const los = lineOfSight(room.map, m.x, m.y, t.x, t.y);
      const want = def.range * 0.7;
      if (!los || dist > def.range * 0.95) moveToward(room, m, room.pathDir(m, t), spd, dt);
      else if (dist < want * 0.55) moveToward(room, m, ang + Math.PI, spd * 0.8, dt);
      else if (Math.random() < 0.5) moveToward(room, m, ang + (m.id % 2 ? 1.57 : -1.57), spd * 0.35, dt);
      if (ready && los && dist <= def.range) {
        room.ev({ e: "anim", id: m.id, a: m.ai === "ranged" ? "shoot" : "cast" });
        if (m.ai === "ranged") {
          m.windup = { at: now + 0.35, interruptible: true, fire: () => {
            const tt = room.units.get(t.id) ?? t;
            const a = Math.atan2(tt.y - m.y, tt.x - m.x);
            room.addProjectile({ team: "m", src: m.id, x: m.x, y: m.y - 8, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, range: def.range + 60, r: 6, pierce: 0, fx: def.proj, scale: def.projSmall ? 0.45 : null,
              onHit: (p, t1) => hitTarget(room, m, p, 1, t1) });
          } };
        } else {
          const tx = t.x, ty = t.y, R = 46;
          const status = def.aoe?.includes("ice") ? { type: "slow", dur: 2, v: 0.35 } : def.aoe?.includes("poison") || def.aoe?.includes("spore") ? { type: "poison", dur: 4, pow: 0.3 } : def.aoe?.includes("lightning") ? { type: "shock", dur: 3 } : null;
          m.windup = { at: now + 0.3, interruptible: true, fire: () => {
            room.addArea({ team: "m", shape: "c", x: tx, y: ty, r: R, tel: 1.0, fire: (t1) => {
              room.ev({ e: "fx", fx: def.aoe, x: tx | 0, y: ty | 0, s: 0.55 });
              for (const p of room.players.values()) if (!p.dead && Math.hypot(p.x - tx, p.y - ty) <= R + p.r) hitTarget(room, m, p, 1.3, t1, { unblockable: true, status });
            } });
          } };
        }
      }
      break;
    }
    case "bomber": {
      if (dist <= 46) {
        if (ready) {
          room.addArea({ team: "m", shape: "c", x: m.x, y: m.y, r: 54, tel: 0.8, fire: () => {} });
          m.windup = { at: now + 0.8, interruptible: false, fire: (t0) => {
            room.ev({ e: "fx", fx: "explosions/small-explosion", x: m.x | 0, y: m.y | 0, s: 0.45 });
            for (const p of room.players.values()) if (!p.dead && Math.hypot(p.x - m.x, p.y - m.y) <= 54 + p.r) hitTarget(room, m, p, 1.8, t0, { unblockable: true });
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
  if (b.phase === 1 && b.hp < b.maxHp * 0.5) {
    b.phase = 2;
    b.speed *= 1.15;
    room.ev({ e: "msg", text: `${b.name}이(가) 격노했어요! (2페이즈)`, kind: "boss" });
    room.ev({ e: "fx", fx: "status/rage", x: b.x | 0, y: b.y | 0, s: 1.5, at: b.id });
    b.patternAt = now + 1;
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
    const pats = def.patterns.filter((p) => !p.phase2 || b.phase === 2);
    const p = pats[(b.patIdx++ + Math.floor(Math.random() * 2)) % pats.length];
    startPattern(room, b, p, t, now);
    b.patternAt = now + (b.phase === 2 ? 2.6 : 3.4) + Math.random() * 0.8;
    return;
  }
  // 평타 (가까우면)
  if (dist < 60 + t.r + b.r * 0.5 && now >= (b.atkReady ?? 0)) {
    b.atkReady = now + 1.8;
    const a = ang;
    room.addArea({ team: "m", shape: "cone", x: b.x, y: b.y, r: 70 + b.r * 0.5, ang: a, arc: 100, tel: 0.5, fire: (t0) => {
      room.ev({ e: "anim", id: b.id, a: "slash" });
      for (const p of bossTargets(room)) if (Math.hypot(p.x - b.x, p.y - b.y) <= 70 + b.r * 0.5 + p.r && angDiff(Math.atan2(p.y - b.y, p.x - b.x), a) <= (50 * Math.PI) / 180) hitTarget(room, b, p, 1, t0);
    } });
    b.pattern = { end: now + 0.6 };
    return;
  }
  if (dist > 40 + b.r) moveToward(room, b, room.pathDir(b, t), b.speed * moveMul(b), dt);
}

function startPattern(room, b, p, t, now) {
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
        hitIn((q) => Math.hypot(q.x - b.x, q.y - b.y) <= p.range + q.r && angDiff(Math.atan2(q.y - b.y, q.x - b.x), a) <= (p.arc * Math.PI) / 360, pw, t0);
      } });
      break;
    }
    case "slam": {
      room.addArea({ team: "m", shape: "c", x: b.x, y: b.y, r: p.radius, tel: p.tel, fire: (t0) => {
        room.ev({ e: "anim", id: b.id, a: "smash" });
        fxAt(p.fx ?? "impacts/ground-slam", b.x, b.y);
        room.ev({ e: "shake", v: 4 });
        hitIn((q) => Math.hypot(q.x - b.x, q.y - b.y) <= p.radius + q.r, pw, t0, { unblockable: true, status: p.freeze ? { type: "freeze", dur: 0.8 } : null });
      } });
      break;
    }
    case "ring": {
      room.addArea({ team: "m", shape: "ring", x: b.x, y: b.y, r: p.inner, r2: p.outer, tel: p.tel, fire: (t0) => {
        fxAt(p.fx ?? "impacts/ground-slam", b.x, b.y, 1.2);
        room.ev({ e: "shake", v: 5 });
        hitIn((q) => { const d = Math.hypot(q.x - b.x, q.y - b.y); return d >= p.inner - q.r && d <= p.outer + q.r; }, pw, t0, { unblockable: true });
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
          for (const q of bossTargets(room)) if (!hit.has(q.id) && Math.hypot(q.x - b.x, q.y - b.y) < q.r + b.r + p.width / 3) { hit.add(q.id); hitTarget(room, b, q, pw, room.now); }
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
      b.pattern.end = now + 0.6 + waves * 0.5;
      room.ev({ e: "anim", id: b.id, a: "cast" });
      for (let w = 0; w < waves; w++) {
        room.schedule(0.5 + w * 0.5, () => {
          if (b.dead) return;
          const off = (w * Math.PI) / p.count;
          for (let k = 0; k < p.count; k++) {
            const a = (k / p.count) * TAU + off;
            room.addProjectile({ team: "m", src: b.id, x: b.x, y: b.y - 10, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, range: 520, r: 7, pierce: 0, fx: p.fx, scale: 0.45, onHit: (q, t1) => hitTarget(room, b, q, pw, t1) });
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
            room.addProjectile({ team: "m", src: b.id, x: b.x, y: b.y - 10, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, range: 560, r: 7, pierce: 0, fx: p.fx, scale: 0.5, onHit: (q2, t1) => hitTarget(room, b, q2, pw, t1) });
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
          hitIn((q) => Math.hypot(q.x - x, q.y - y) <= p.radius + q.r, pw, t0, { unblockable: true });
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
        room.schedule(0.6, () => !b.dead && room.spawnMonster(p.monster, x, y, false, { aggro: true }));
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
        room.addArea({ team: "m", shape: "c", x, y, r: p.radius, tel: 0.9, fire: () => {
          room.addZone({ team: "m", owner: b.id, x, y, r: p.radius, dur: p.dur, interval: 0.5, fx: p.fx, tick: (t0, z) => {
            for (const q2 of bossTargets(room)) if (Math.hypot(q2.x - z.x, q2.y - z.y) <= z.r) hitTarget(room, b, q2, p.pow, t0, { unblockable: true });
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
          hitIn((q) => Math.hypot(q.x - b.x, q.y - b.y) <= 90 + q.r, pw, t1, { unblockable: true });
        } });
      } });
      b.pattern.end = now + p.tel + 1.0;
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
            return along > 0 && along < len && across < p.width / 2 + q.r;
          }, pw, tn, { unblockable: true });
        });
      }
      b.pattern.end = now + 0.9 + p.dur;
      break;
    }
  }
}

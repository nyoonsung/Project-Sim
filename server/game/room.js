// 방(마을·던전 한 층·안전 구역) 시뮬레이션: 서버가 모든 판정을 한다
import { TILE, TICK_DT, PLAYER_RADIUS } from "../../shared/constants.js";
import { applyInput, moveCircle, circleHitsWall, blocksShot, lineOfSight, tileAt } from "../../shared/move.js";
import { MONSTERS, BOSSES, monsterStats, bossStats, floorScale, zoneOf } from "../../shared/zones.js";
import { rollItem } from "../../shared/items.js";
import { tickStatuses, dealDamage, heal, moveMul, isHardCC, applyStatus, buffSum, giveShield } from "./combat.js";
import { newUnitId, gainXp, refreshStats } from "./player.js";
import { castSkill, onParry as skillOnParry, onPlayerHit as skillOnPlayerHit, tickPlayerSkills, cancelCast, onFrontGuard } from "./skills.js";
import { tickMonster, tickBoss } from "./ai.js";
import { mapPayload } from "./dungeon.js";
import { secureRandom } from "./secure.js";

const VIEW = 600;

export class Room {
  constructor(world, { id, kind, floor = 0, map, partyId = null, partySize = 1 }) {
    Object.assign(this, { world, id, kind, floor, map, partyId, partySize });
    this.units = new Map();
    this.players = new Map();
    this.projectiles = [];
    this.areas = [];
    this.zones = [];
    this.timers = [];
    this.loot = new Map();
    this.events = [];
    // 모든 방이 같은 월드 시계를 씀: 방을 옮겨도 쿨타임·공격 잠금 같은 '끝나는 시각'이 그대로 맞음
    this.now = world.clock ?? 0;
    this.tickN = 0;
    this.flow = new Map();
    this.flowAt = 0;
    this.total = 0;
    this.killed = 0;
    this.exitOpen = kind !== "dungeon";
    this.bossId = null;
    this.bossStarted = false;
    this.transition = null;
    this.failedAt = 0;
    this.createdAt = Date.now();
    if (map.spawns) for (const s of map.spawns) this.spawnMonster(s.id, s.x, s.y, s.elite);
    this.total = this.units.size;
    // 웨이브 층: 처음엔 비어 있고 몬스터가 가장자리에서 몰려옴
    if (map.waves) { this.total = map.waves.total; this.wave = { n: 0, spawned: 0, nextAt: this.now + 2.5, forceAt: 0 }; }
    if (map.kind === "normal" && this.total === 0) this.exitOpen = true;
    // 마을 훈련 허수아비
    for (const o of map.objects) if (o.kind === "dummy") this.spawnDummy(o.x, o.y);
  }

  // ── 이벤트
  ev(e) { this.events.push(e); }
  aliveMonsters() { let n = 0; for (const u of this.units.values()) if (u.type === "m" && !u.dead && !u.dummy && u.team === "m") n++; return n + this.timers.filter((t) => t.spawn).length; }
  schedule(delay, fn) { this.timers.push({ at: this.now + delay, fn }); }

  // ── 유닛 생성
  spawnMonster(mid, x, y, elite = false, opts = {}) {
    const def = MONSTERS[mid];
    if (!def) return null;
    const st = monsterStats(mid, Math.max(1, this.floor), this.partySize);
    const m = {
      id: newUnitId(), team: "m", type: "m", mid, name: (elite ? "정예 " : "") + def.name, x, y, r: 11 * (def.look.scale ?? 1) * (elite ? 1.2 : 1),
      hp: Math.round(st.hp * (elite ? 3 : 1)), maxHp: Math.round(st.hp * (elite ? 3 : 1)), atk: st.dmg * (elite ? 1.5 : 1), def: 2 + this.floor * 1.6 * (elite ? 1.5 : 1),
      level: st.level, xp: st.xp * (elite ? 3 : 1), speed: def.speed * (elite ? 1.08 : 1), elite, ai: def.ai, def_: def,
      status: new Map(), buffs: new Map(), threat: new Map(), facing: Math.PI / 2, aggro: !!opts.aggro, home: [x, y],
      atkReady: 0, windup: null, dead: false, fly: !!def.fly,
    };
    this.units.set(m.id, m);
    this.ev({ e: "add", ...this.describe(m) });
    return m;
  }
  spawnBoss(bid, x, y) {
    const def = BOSSES[bid];
    const st = bossStats(bid, this.floor, this.partySize);
    const b = {
      id: newUnitId(), team: "m", type: "b", bid, name: def.name, x, y, r: 14 * Math.min(2.2, def.look.scale ?? 1),
      hp: st.hp, maxHp: st.hp, atk: st.dmg, def: 6 + this.floor * 2.2, level: st.level, xp: st.xp, speed: def.speed,
      boss: true, mid: def.mid, def_: def, status: new Map(), buffs: new Map(), threat: new Map(), facing: Math.PI / 2,
      aggro: true, patternAt: 2, pattern: null, phase: 1, groggyGauge: 0, dead: false, fly: !!def.fly, patIdx: 0,
    };
    this.units.set(b.id, b);
    this.bossId = b.id;
    this.ev({ e: "add", ...this.describe(b) });
    this.ev({ e: "boss", id: b.id, name: b.name, mid: !!def.mid });
    return b;
  }
  spawnDummy(x, y) {
    const d = {
      id: newUnitId(), team: "m", type: "m", mid: "dummy", name: "훈련 허수아비", x, y, r: 12, hp: 1e9, maxHp: 1e9, atk: 0, def: 0, level: 1,
      xp: 0, speed: 0, ai: "dummy", def_: { name: "허수아비" }, status: new Map(), buffs: new Map(), threat: new Map(), facing: Math.PI / 2,
      dummy: true, dps: { total: 0, start: 0, last: 0 }, dead: false,
    };
    this.units.set(d.id, d);
    return d;
  }
  spawnDevice(owner, kind, x, y, o) {
    const d = {
      id: newUnitId(), team: owner.team, type: "d", kind, owner: owner.id, x, y, r: kind === "golem" ? 14 : 8,
      hp: o.hp ?? 1, maxHp: o.hp ?? 1, until: this.now + o.dur, o, status: new Map(), buffs: new Map(), dead: false, nextHit: 0,
      atk: owner.stats.atk, facing: o.dir ?? 0,
    };
    if (kind === "golem") d.targetable = true;
    this.units.set(d.id, d);
    owner.devices.push(d.id);
    this.ev({ e: "add", ...this.describe(d) });
    return d;
  }

  describe(u) {
    if (u.type === "p") {
      const ch = u.session.char;
      return { id: u.id, k: "p", n: u.name, c: ch.cls, mh: u.maxHp, lv: ch.level, w: ch.equip.weapon?.type ?? null, o: ch.equip.offhand?.type ?? null, party: this.partyId ? 1 : 0, x: u.x | 0, y: u.y | 0 };
    }
    if (u.type === "m") return { id: u.id, k: "m", n: u.name, m: u.mid, mh: u.maxHp, lv: u.level, el: u.elite ? 1 : 0, x: u.x | 0, y: u.y | 0 };
    if (u.type === "b") return { id: u.id, k: "b", n: u.name, b: u.bid, mh: u.maxHp, lv: u.level, x: u.x | 0, y: u.y | 0 };
    if (u.type === "d") return { id: u.id, k: "d", d: u.kind, own: u.owner, mh: u.maxHp, x: u.x | 0, y: u.y | 0, f: Math.round(u.facing * 100), dur: u.o.dur };
    return { id: u.id };
  }

  // ── 플레이어 입장/퇴장
  addPlayer(u, at) {
    const [x, y] = at ?? this.map.start;
    u.x = x + (Math.random() * 24 - 12);
    u.y = y + (Math.random() * 24 - 12);
    if (circleHitsWall(this.map, u.x, u.y, u.r)) { u.x = x; u.y = y; }
    u.room = this;
    u.inputs.length = 0; u.castQ = []; u.owed = 0;
    u.casting = null; u.channel = null; u.dash = null; u.parry = null;
    u.devices = [];
    this.units.set(u.id, u);
    this.players.set(u.id, u);
    const s = u.session;
    s.send({ t: "map", room: this.id, kind: this.kind, floor: this.floor, zone: this.floor ? zoneOf(this.floor).name : null, ...mapPayload(this.map), exitOpen: this.exitOpen, you: u.id });
    // 이미 있는 유닛 정보
    const list = [];
    for (const o of this.units.values()) if (o !== u) list.push(this.describe(o));
    s.send({ t: "ents", list });
    for (const l of this.loot.values()) if (l.owner === u.userId) s.send({ t: "ev", list: [{ e: "loot", ...this.lootDesc(l) }] });
    this.ev({ e: "add", ...this.describe(u) });
    if (this.bossId && this.units.get(this.bossId)) s.send({ t: "ev", list: [{ e: "boss", id: this.bossId, name: this.units.get(this.bossId).name, mid: !!this.units.get(this.bossId).mid }] });
  }
  removePlayer(u) {
    this.removeDevicesOf(u);
    this.units.delete(u.id);
    this.players.delete(u.id);
    this.flow.delete(u.id);
    for (const m of this.units.values()) m.threat?.delete(u.id);
    this.ev({ e: "del", id: u.id });
    u.room = null;
  }
  removeDevicesOf(u) {
    for (const id of u.devices ?? []) { const d = this.units.get(id); if (d) this.removeUnit(d); }
    u.devices = [];
  }
  removeUnit(u) {
    this.units.delete(u.id);
    this.ev({ e: "del", id: u.id });
    if (u.type === "d") {
      const o = this.units.get(u.owner);
      if (o?.devices) o.devices = o.devices.filter((x) => x !== u.id);
    }
  }

  // ── 입력·명령
  pushInput(u, m) {
    if (u.inputs.length >= 6) { u.inputs.shift(); u.session.inputOverflow = (u.session.inputOverflow ?? 0) + 1; }
    u.inputs.push(m);
  }
  cast(u, m) {
    if (m.s != null && u.lastSeq < m.s && u.inputs.some((i) => i.s <= m.s)) {
      (u.castQ ??= []).push({ slot: m.slot, ax: m.ax, ay: m.ay, tx: m.tx, s: m.s, exp: this.now + 0.5 });
      if (u.castQ.length > 4) u.castQ.shift();
      return;
    }
    castSkill(this, u, m.slot, m.ax, m.ay, m.tx, this.now);
  }
  cancelCast(u, why) { cancelCast(this, u, why); }
  onParry(u, src, now) { skillOnParry(this, u, src, now); }
  onFrontGuard(u, now) { onFrontGuard(this, u, now); }
  onPlayerHit(u, t, dmg, crit, now, o) { skillOnPlayerHit(this, u, t, dmg, crit, now, o); }

  // ── 웨이브: 남은 몬스터가 적어지거나 22초가 지나면 다음 무리가 가장자리 소환진에서 나타남
  tickWaves(now) {
    const W = this.map.waves, st = this.wave;
    if (!this.players.size || st.spawned >= W.total || now < st.nextAt) return;
    const per = Math.ceil(W.total / W.waves);
    let alive = 0;
    for (const u of this.units.values()) if (u.type === "m" && !u.dead) alive++;
    // 다음 웨이브: 남은 적이 35% 이하이거나, 22초가 지났고 70% 이하일 때 (웨이브가 겹겹이 쌓이지 않게)
    if (st.n > 0 && alive > Math.max(2, Math.floor(per * 0.35)) && (now < st.forceAt || alive > per * 0.7)) return;
    st.n++;
    const n = Math.min(per, W.total - st.spawned);
    st.spawned += n;
    st.nextAt = now + 3;
    st.forceAt = now + 22;
    this.ev({ e: "wave", n: st.n, of: W.waves });
    const players = [...this.players.values()].filter((p) => !p.dead);
    let pts = W.points.filter(([x, y]) => players.every((p) => Math.hypot(p.x - x, p.y - y) > 220));
    if (pts.length < 4) pts = W.points;
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    for (let i = 0; i < n; i++) {
      const [bx, by] = pts[i % pts.length];
      const x = bx + (Math.random() * 16 - 8), y = by + (Math.random() * 16 - 8);
      const mid = W.pool[Math.floor(Math.random() * W.pool.length)];
      const elite = Math.random() < W.elite;
      this.ev({ e: "fx", fx: "arcane/portal", x: x | 0, y: y | 0, s: 0.45 });
      this.schedule(0.9 + Math.random() * 0.4, () => this.spawnMonster(mid, x, y, elite, { aggro: true }));
      this.timers[this.timers.length - 1].spawn = true;
    }
  }

  rescueStragglers() {
    const ps = [...this.players.values()].filter((p) => !p.dead);
    if (!ps.length) return;
    const left = [...this.units.values()].filter((u) => u.type === "m" && !u.dead && !u.dummy && u.team === "m");
    if (left.length > 4) return;
    let moved = 0;
    for (const m of left) {
      if (ps.some((p) => Math.hypot(p.x - m.x, p.y - m.y) < 330)) continue;
      moved++;
      const p = ps[Math.floor(Math.random() * ps.length)];
      const pts = this.map.waves.points.filter(([x, y]) => { const d = Math.hypot(x - p.x, y - p.y); return d > 120 && d < 320; });
      const [x, y] = pts.length ? pts[Math.floor(Math.random() * pts.length)] : this.map.start;
      this.ev({ e: "fx", fx: "arcane/portal", x: x | 0, y: y | 0, s: 0.45 });
      m.x = x; m.y = y; m.aggro = true; m.threat?.set(p.id, (m.threat.get(p.id) ?? 0) + 1);
    }
    if (moved) this.ev({ e: "msg", text: `남은 몬스터 ${left.length}마리가 가까이 다가와요!`, kind: "info" });
  }

  // ── 파티 이동 투표: 파티원 전원이 동의해야 다음 층으로
  startVote(o, by, now) {
    if (this.vote || now < (this.voteCooldown ?? 0)) return;
    this.vote = { id: o.id, yes: new Set([by.id]), until: now + 30, label: o.label ?? "다음 층" };
    this.ev({ e: "vote", id: o.id, by: by.name, label: this.vote.label, yes: [...this.vote.yes], need: this.players.size });
    this.checkVote(now);
  }
  voteCast(u, ok) {
    const v = this.vote;
    if (!v || !this.players.has(u.id)) return;
    if (!ok) { this.endVote(`${u.name}님이 거절했어요.`); return; }
    v.yes.add(u.id);
    this.ev({ e: "vote", id: v.id, label: v.label, yes: [...v.yes], need: this.players.size });
    this.checkVote(this.now);
  }
  endVote(why) {
    this.vote = null;
    this.voteCooldown = this.now + 3;
    this.ev({ e: "vote", end: 1, why });
  }
  checkVote(now) {
    const v = this.vote;
    if (!v) return;
    for (const id of [...v.yes]) if (!this.players.has(id)) v.yes.delete(id);
    if (now > v.until) return this.endVote("시간이 지나 투표가 취소됐어요.");
    if ([...this.players.keys()].every((id) => v.yes.has(id))) {
      this.vote = null;
      this.ev({ e: "vote", end: 1, ok: 1 });
      this.transition = { at: now + 2, id: v.id };
      this.ev({ e: "msg", text: "모두 동의! 2초 뒤 파티 전체가 이동해요...", kind: "info" });
      this.ev({ e: "warp", d: 2 });
    }
  }

  // ── 가시 함정: 두 무리가 번갈아 2.8초마다 (0.6초 경고 → 0.5초 솟음). 솟을 때 위에 있으면 최대 체력 6% 피해(한 번)
  tickTraps(now) {
    const PERIOD = 2.8, WARN = 0.6, UP = 0.5;
    for (const ph of [0, 1]) {
      const c = (now + ph * PERIOD / 2) % PERIOD;
      const st = c < WARN ? 1 : c < WARN + UP ? 2 : 0;
      this.trapState ??= [0, 0];
      if (st !== this.trapState[ph]) { this.trapState[ph] = st; this.ev({ e: "spk", p: ph, s: st }); if (st === 2) this.trapHit = new Set(); }
      if (st !== 2) continue;
      for (const tr of this.map.traps) {
        if (tr.phase !== ph) continue;
        for (const u of this.players.values()) {
          if (u.dead || u.invuln || this.trapHit.has(u.id)) continue;
          const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE);
          if (!tr.cells.some(([x, y]) => x === tx && y === ty)) continue;
          this.trapHit.add(u.id);
          dealDamage(this, null, u, { fixed: Math.max(1, u.maxHp * 0.06), dot: true }, now);
          this.ev({ e: "trap", id: u.id });
        }
      }
    }
  }

  // ── 처치
  kill(t, src, now) {
    if (t.dead) return;
    if (t.dummy) { t.hp = t.maxHp; return; }
    t.dead = true;
    if (t.type === "p") {
      t.status.clear(); t.buffs.clear(); t.casting = null; t.channel = null; t.dash = null;
      t.session.char.deaths++;
      this.ev({ e: "die", id: t.id });
      this.ev({ e: "msg", text: `${t.name}님이 쓰러졌어요.`, kind: "death" });
      this.removeDevicesOf(t);
      return;
    }
    if (t.type === "d") { this.removeUnit(t); return; }
    this.ev({ e: "die", id: t.id });
    this.units.delete(t.id);
    this.killed++;
    // 보상: 파티원 각자(개인 드롭)
    const killer = src?.team === "p" ? (src.type === "d" ? this.units.get(src.owner) : src) : null;
    for (const p of this.players.values()) {
      if (p.dead || Math.hypot(p.x - t.x, p.y - t.y) > 700) continue;
      const ch = p.session.char;
      let xp = t.xp * (this.players.size > 1 ? 0.8 : 1);
      if (ch.level > this.floor + 10) xp *= Math.max(0.1, 1 - (ch.level - this.floor - 10) * 0.1);
      gainXp(this, p, xp);
      const gold = Math.round((2 + Math.random() * 3) * floorScale(this.floor).gold * (t.elite ? 3 : 1) * (t.boss ? 25 : 1));
      ch.gold += gold;
      p.session.meDirty = true;
      this.ev({ e: "gold", id: p.id, v: gold, x: t.x | 0, y: t.y | 0, own: p.id });
      this.rollDrops(p, t);
      if (p === killer || this.players.size === 1) ch.kills++;
      if (p.mythic?.has("swift_kill") && p === killer) p.buffs.set("swift_kill", { until: now + 2, mods: { move: 0.15 } });
      if (p.mythic?.has("mana_font") && p === killer) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.03);
    }
    if (t.boss) this.onBossDead(t);
    else if (this.kind === "dungeon" && !this.exitOpen && this.map.kind === "normal" && (this.wave ? this.wave.spawned >= this.total : true) && this.aliveMonsters() === 0) {
      this.exitOpen = true;
      this.ev({ e: "exit", open: 1 });
      this.ev({ e: "msg", text: "출구 포탈이 열렸어요!", kind: "info" });
    }
  }

  rollDrops(p, t) {
    const tier = t.boss ? "boss" : t.elite ? "elite" : "normal";
    const n = t.boss ? (t.mid ? 1 + (Math.random() < 0.5) : 2 + (Math.random() < 0.5)) : Math.random() < (t.elite ? 0.35 : 0.07) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const it = rollItem(secureRandom, { ilvl: Math.max(1, this.floor), cls: p.session.char.cls, tier });
      this.dropLoot(p.userId, it, t.x + (Math.random() * 40 - 20), t.y + (Math.random() * 40 - 20));
    }
    // 소모품 소량
    if (Math.random() < (t.boss ? 1 : 0.04)) this.dropLoot(p.userId, { cons: "hp_potion", n: t.boss ? 2 : 1 }, t.x + (Math.random() * 30 - 15), t.y + 10);
  }
  dropLoot(userId, item, x, y) {
    if (circleHitsWall(this.map, x, y, 4)) { x = Math.round(x / TILE) * TILE; }
    const l = { id: newUnitId(), owner: userId, item, x, y, until: this.now + 120 };
    this.loot.set(l.id, l);
    const p = [...this.players.values()].find((q) => q.userId === userId);
    if (p) p.session.send({ t: "ev", list: [{ e: "loot", ...this.lootDesc(l) }] });
    if (item.rarity === "신화" || item.rarity === "전설") this.ev({ e: "msg", text: `${p?.name ?? "?"}님에게 ${item.rarity} 아이템 [${item.name}]이(가) 떨어졌어요!`, kind: item.rarity === "신화" ? "mythic" : "legend" });
  }
  lootDesc(l) {
    return { id: l.id, x: l.x | 0, y: l.y | 0, r: l.item.rarity ?? "일반", n: l.item.name ?? (l.item.cons ? "체력 물약" : "?"), s: l.item.slot ?? "cons" };
  }

  onBossDead(b) {
    this.map.doorsOpen = true;
    this.ev({ e: "doors", open: 1 });
    this.ev({ e: "msg", text: `${b.name} 처치!`, kind: "boss" });
    this.ev({ e: "bossdead", id: b.id });
    for (const m of [...this.units.values()]) if (m.team === "m" && m.type === "m") { m.dead = true; this.units.delete(m.id); this.ev({ e: "die", id: m.id }); }
    // 보스가 남긴 예고·장판·탄환 정리
    this.areas = this.areas.filter((a) => a.team !== "m");
    for (const z of this.zones) if (z.team === "m") { z.until = 0; }
    for (const p of this.projectiles) if (p.team === "m") this.ev({ e: "pjx", id: p.id, x: p.x | 0, y: p.y | 0 });
    this.projectiles = this.projectiles.filter((p) => p.team !== "m");
    this.exitOpen = true;
    const isMain = !b.mid;
    const portal = { kind: "portal", id: isMain ? "safe" : "exit", x: b.x, y: b.y, label: isMain ? (this.floor >= 100 ? "마을로 (던전 정복!)" : "안전 구역으로") : `${this.floor + 1}층으로` };
    if (this.floor >= 100) portal.id = "victory";
    this.map.objects.push(portal);
    this.ev({ e: "obj", o: portal });
    this.world.onBossCleared(this, isMain);
  }

  // ── 매 틱
  tick() {
    const now = (this.now = this.world.clock ?? this.now + TICK_DT);
    this.tickN++;
    // 예약 실행
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      for (const t of due) try { t.fn(now); } catch (e) { console.error(e); }
    }
    if (now >= this.flowAt) { this.updateFlow(); this.flowAt = now + 0.5; }
    if (this.wave) this.tickWaves(now);
    if (this.wave && this.wave.spawned >= this.total && !this.exitOpen && now >= (this.rescueAt ?? 0)) { this.rescueAt = now + 8; this.rescueStragglers(); }
    if (this.map.traps?.length) this.tickTraps(now);
    for (const u of this.players.values()) this.tickPlayer(u, now);
    for (const u of [...this.units.values()]) {
      if (u.type === "p" || u.dead) continue;
      tickStatuses(this, u, now);
      if (u.dead) continue;
      if (u.type === "m" && !u.dummy) tickMonster(this, u, now);
      else if (u.type === "b") tickBoss(this, u, now);
      else if (u.type === "d") this.tickDevice(u, now);
      else if (u.dummy) this.tickDummy(u, now);
    }
    this.tickProjectiles(now);
    this.tickAreas(now);
    this.tickZones(now);
    this.tickLoot(now);
    this.checkProgress(now);
  }

  applyMove(u, inp, now) {
    const canMove = !isHardCC(u) && !u.status.has("root") && !u.casting && !u.channel && !(u.rooted && now < u.rooted);
    if (!canMove || (!inp.mx && !inp.my)) return;
    const spd = u.stats.move * moveMul(u) * (u.guarding && now < u.guarding ? 0.35 : 1);
    const [nx, ny] = applyInput(this.map, u.x, u.y, inp.mx, inp.my, spd, TICK_DT, u.r);
    if (Math.hypot(nx - u.x, ny - u.y) > 0.1) u.idleSince = now;
    u.x = nx; u.y = ny;
  }

  tickPlayer(u, now) {
    tickStatuses(this, u, now);
    if (u.dead) { u.inputs.length = 0; return; }
    const s = u.stats;
    // 자원 회복
    u.mp = Math.min(u.maxMp, u.mp + s.mpRegen * TICK_DT * (u.lastHurt && now - u.lastHurt < 3 ? 0.6 : 1));
    if (s.hpRegen) u.hp = Math.min(u.maxHp, u.hp + s.hpRegen * TICK_DT);
    if (this.map.safe && !u.lastHurt) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * TICK_DT);
    if (this.map.safe) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.03 * TICK_DT); u.mp = Math.min(u.maxMp, u.mp + u.maxMp * 0.05 * TICK_DT); }
    if (u.cls === "sword" || u.cls === "fist") {
      // 내력: 전투에서 멀어지면 천천히 감소
      if (!u.lastHurt || now - (u.lastAction ?? 0) > 6) u.ki = Math.max(0, u.ki - 4 * TICK_DT);
    }
    if (u.mythic?.has("guardian") && now >= (u.icd.get("m_guard") ?? 0)) {
      u.icd.set("m_guard", now + 12);
      giveShield(this, u, u.maxHp * 0.05, 12, now);
    }
    // 입력 1틱 소비 (속도 조작 불가: 서버가 한 틱에 한 입력만 적용)
    //  - 입력이 늦게 와서 빈 틱은 '빚'으로 쌓아 두고, 밀린 입력이 오면 한 틱에 하나 더 처리해 따라잡음
    //    (총 처리 수 ≤ 지난 틱 수라 속도 조작 불가, 밀린 입력 때문에 조작감이 계속 늦어지는 것 방지)
    //  - 빈 틱에 예전 입력으로 미리 움직이지 않음: 나중에 진짜 입력과 겹쳐 내 화면이 앞뒤로 튀는 원인
    let inp = u.inputs.shift();
    if (inp) {
      if (u.owed > 0 && u.inputs.length >= 1 && !u.dash) {
        this.applyMove(u, inp, now); // 밀린 입력 이동만 먼저 반영
        inp = u.inputs.shift(); u.owed--;
      }
      u.lastInput = inp; u.lastSeq = inp.s; u.missed = 0;
    } else {
      if (u.lastSeq) u.owed = Math.min(4, (u.owed ?? 0) + 1);
      inp = { ...u.lastInput, mx: 0, my: 0 };
    }
    // 스킬은 "누를 때까지 보낸 이동"이 다 반영된 뒤 시전 (서버·화면 위치가 같아 대시가 되돌아가지 않음)
    if (u.castQ?.length) {
      const q = u.castQ; u.castQ = [];
      for (const c of q) {
        if (u.lastSeq >= c.s || now >= c.exp || !u.inputs.some((i) => i.s <= c.s)) castSkill(this, u, c.slot, c.ax, c.ay, c.tx, now);
        else u.castQ.push(c);
      }
    }
    const aimAng = Math.atan2(inp.ay - u.y, inp.ax - u.x);
    tickPlayerSkills(this, u, now, inp);
    if (u.dash) {
      // 돌진 중: 강제 이동
      const d = u.dash;
      const step = Math.min(d.left, d.speed * TICK_DT);
      const [nx, ny] = moveCircle(this.map, u.x, u.y, Math.cos(d.dir) * step, Math.sin(d.dir) * step, u.r);
      const moved = Math.hypot(nx - u.x, ny - u.y);
      u.x = nx; u.y = ny;
      d.left -= step;
      d.onStep?.(now);
      if (d.left <= 0.5 || moved < step * 0.3 || d.stop) { u.dash = null; d.onEnd?.(now); }
      u.facing = d.dir;
      return;
    }
    this.applyMove(u, inp, now);
    if (!isHardCC(u)) u.facing = aimAng;
    if (u.casting && now >= u.casting.until) {
      const c = u.casting;
      u.casting = null;
      c.done(now);
    }
  }

  tickDevice(d, now) {
    if (now >= d.until) {
      this.removeUnit(d);
      return;
    }
    const o = d.o;
    const owner = this.units.get(d.owner);
    if (d.kind === "mine" || d.kind === "wire") {
      for (const m of this.units.values()) {
        if (m.team !== "m" || m.dead || m.fly || m.dummy) continue;
        if (Math.hypot(m.x - d.x, m.y - d.y) < (o.trigger ?? 22) + m.r) {
          if (d.kind === "mine") {
            this.ev({ e: "fx", fx: "explosions/dirt-explosion", x: d.x | 0, y: d.y | 0, s: 0.5 });
            for (const t of this.units.values()) {
              if (t.team !== "m" || t.dead || Math.hypot(t.x - d.x, t.y - d.y) > o.radius + t.r) continue;
              if (owner) dealDamage(this, owner, t, { pow: o.pow, threat: 3 }, now);
              applyStatus(this, owner, t, { type: "slow", dur: 3, v: 0.4 }, now);
            }
          } else {
            this.ev({ e: "fx", fx: "nature/root-snare", x: d.x | 0, y: d.y | 0 });
            if (m.elite || m.boss) applyStatus(this, owner, m, { type: "slow", dur: 2, v: 0.4 }, now);
            else applyStatus(this, owner, m, { type: "down", dur: 1.8, groggy: 15 }, now);
            if (owner) dealDamage(this, owner, m, { pow: 0.8 }, now);
          }
          this.removeUnit(d);
          return;
        }
      }
    } else if (d.kind === "golem" && owner) {
      if (now >= d.nextHit) {
        d.nextHit = now + 1;
        let best = null, bd = 90;
        for (const m of this.units.values()) {
          if (m.team !== "m" || m.dead || m.dummy) continue;
          const dist = Math.hypot(m.x - d.x, m.y - d.y);
          if (dist < bd) { bd = dist; best = m; }
          // 주변 적의 위협을 골렘(주인)에게
          if (dist < 160 && !m.boss) m.tauntBy = { id: d.id, until: now + 1.2 };
        }
        if (best) {
          d.facing = Math.atan2(best.y - d.y, best.x - d.x);
          this.ev({ e: "anim", id: d.id, a: "smash" });
          dealDamage(this, owner, best, { pow: o.pow, threat: 4 }, now);
        }
      }
    } else if (d.kind === "circuit" && owner) {
      if (now >= d.nextHit) {
        d.nextHit = now + 0.5;
        const [a, b] = o.ends;
        for (const m of this.units.values()) {
          if (m.team !== "m" || m.dead) continue;
          if (distToSeg(m.x, m.y, a[0], a[1], b[0], b[1]) < 14 + m.r) {
            dealDamage(this, owner, m, { pow: 0.25, threat: 2 }, now);
            if (!m.boss) applyStatus(this, owner, m, { type: "slow", dur: 1, v: 0.35 }, now);
          }
        }
        for (const p of this.players.values()) if (!p.dead && distToSeg(p.x, p.y, a[0], a[1], b[0], b[1]) < 60) p.buffs.set("circuit", { until: now + 0.7, mods: { dr: 0.08 } });
      }
    }
  }

  tickDummy(d, now) {
    if (d.dps.total > 0 && now - d.dps.last > 5) {
      const secs = Math.max(1, d.dps.last - d.dps.start);
      this.ev({ e: "msg", text: `허수아비 측정: ${secs.toFixed(1)}초 동안 ${Math.round(d.dps.total).toLocaleString()} 피해 (초당 ${Math.round(d.dps.total / secs).toLocaleString()})`, kind: "info" });
      d.dps = { total: 0, start: 0, last: 0 };
    }
  }

  // ── 투사체
  addProjectile(p) {
    p.id = newUnitId();
    p.hit = new Set();
    p.travelled = 0;
    this.projectiles.push(p);
    this.ev({ e: "pj", id: p.id, x: p.x | 0, y: p.y | 0, a: Math.round(Math.atan2(p.vy, p.vx) * 1000), v: Math.round(Math.hypot(p.vx, p.vy)), r: Math.round(p.range), fx: p.fx, tm: p.team === "p" ? 1 : 0, pal: p.pal ?? null, s: p.scale ?? null });
    return p;
  }
  tickProjectiles(now) {
    const keep = [];
    for (const p of this.projectiles) {
      const speed = Math.hypot(p.vx, p.vy);
      const steps = Math.max(1, Math.ceil((speed * TICK_DT) / 8));
      let end = false;
      for (let i = 0; i < steps && !end; i++) {
        p.x += (p.vx * TICK_DT) / steps;
        p.y += (p.vy * TICK_DT) / steps;
        p.travelled += (speed * TICK_DT) / steps;
        if (p.travelled >= p.range || blocksShot(this.map, p.x, p.y)) { end = true; break; }
        // 방벽(철벽 전개)이 적 투사체를 막음
        if (p.team === "m") for (const d of this.units.values()) {
          if (d.type === "d" && d.kind === "wall" && Math.hypot(d.x - p.x, d.y - p.y) < 30) {
            d.hp -= 1;
            this.ev({ e: "fx", fx: "impacts/shield-block", x: p.x | 0, y: p.y | 0, s: 0.6 });
            if (d.hp <= 0) this.removeUnit(d);
            end = true;
            break;
          }
        }
        if (end) break;
        for (const t of this.units.values()) {
          if (t.dead || t.team === p.team || p.hit.has(t.id) || (t.type === "d" && !t.targetable)) continue;
          if (Math.hypot(t.x - p.x, t.y - (p.team === "m" ? p.y : p.y) - (t.fly ? 0 : 0)) > t.r + p.r) continue;
          p.hit.add(t.id);
          p.onHit?.(t, now, p);
          if (p.pierce-- <= 0) { end = true; break; }
        }
      }
      if (end) {
        p.onEnd?.(now, p);
        this.ev({ e: "pjx", id: p.id, x: p.x | 0, y: p.y | 0 });
      } else keep.push(p);
    }
    this.projectiles = keep;
  }

  // ── 예고 장판 (telegraph → 피해)
  addArea(a) {
    a.id = newUnitId();
    a.fireAt = this.now + (a.tel ?? 0);
    a.ticksLeft = a.ticks ?? 1;
    this.areas.push(a);
    if (a.shape) this.ev({ e: "tel", id: a.id, sh: a.shape, x: a.x | 0, y: a.y | 0, r: a.r ? Math.round(a.r) : 0, r2: a.r2 ? Math.round(a.r2) : 0, a: a.ang != null ? Math.round(a.ang * 1000) : 0, w: a.w ?? 0, l: a.l ?? 0, arc: a.arc ?? 0, d: a.tel ?? 0, tm: a.team === "p" ? 1 : 0 });
    return a;
  }
  tickAreas(now) {
    const keep = [];
    for (const a of this.areas) {
      if (now >= a.fireAt) {
        a.fire(now, a);
        a.ticksLeft--;
        if (a.ticksLeft > 0) { a.fireAt = now + (a.interval ?? 0.5); keep.push(a); }
      } else keep.push(a);
    }
    this.areas = keep;
  }
  // ── 지속 구역
  addZone(z) {
    z.id = newUnitId();
    z.until = this.now + z.dur;
    z.next = this.now;
    this.zones.push(z);
    this.ev({ e: "zone", id: z.id, x: z.x | 0, y: z.y | 0, r: Math.round(z.r), d: z.dur, fx: z.fx ?? null, tm: z.team === "p" ? 1 : 0, fol: z.follow ?? 0, pal: z.pal ?? null });
    return z;
  }
  tickZones(now) {
    const keep = [];
    for (const z of this.zones) {
      if (z.follow) { const f = this.units.get(z.follow); if (!f || f.dead) z.until = 0; else { z.x = f.x; z.y = f.y; } }
      if (z.endOnMove) { const f = this.units.get(z.owner); if (!f || f.dead || Math.hypot(f.x - z.sx, f.y - z.sy) > 6) z.until = 0; }
      if (now >= z.until) { this.ev({ e: "zonex", id: z.id }); z.onEnd?.(now); continue; }
      if (now >= z.next) { z.next = now + z.interval; z.tick(now, z); }
      keep.push(z);
    }
    this.zones = keep;
  }

  // ── 전리품 (주인만 보이고 주인만 줍는다)
  tickLoot(now) {
    if (this.tickN % 4) return;
    for (const l of [...this.loot.values()]) {
      if (now > l.until) { this.loot.delete(l.id); continue; }
      const p = [...this.players.values()].find((q) => q.userId === l.owner);
      if (!p || p.dead) continue;
      if (Math.hypot(p.x - l.x, p.y - l.y) < 30) {
        if (this.world.pickup(p, l.item)) {
          this.loot.delete(l.id);
          p.session.send({ t: "ev", list: [{ e: "lootx", id: l.id }] });
        }
      }
    }
  }

  // ── 흐름장(길찾기): 플레이어까지 타일 거리
  updateFlow() {
    const { w, h } = this.map;
    for (const p of this.players.values()) {
      if (p.dead) { this.flow.delete(p.id); continue; }
      const dist = new Int16Array(w * h).fill(-1);
      const sx = Math.floor(p.x / TILE), sy = Math.floor(p.y / TILE);
      const q = new Int32Array(w * h);
      let qh = 0, qt = 0;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      dist[sy * w + sx] = 0;
      q[qt++] = sy * w + sx;
      while (qh < qt) {
        const i = q[qh++], x = i % w, y = (i / w) | 0, d = dist[i];
        if (d > 40) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (dist[j] !== -1) continue;
          const t = tileAt(this.map, nx, ny);
          if (t === 0 || t === 2 || t === 4 || t === 5 || (t === 3 && !this.map.doorsOpen)) continue;
          dist[j] = d + 1;
          q[qt++] = j;
        }
      }
      this.flow.set(p.id, dist);
    }
  }
  /** 대상 플레이어 쪽으로 가는 방향 (흐름장) */
  pathDir(m, target) {
    const f = this.flow.get(target.id);
    if (target.type !== "p" || !f || lineOfSight(this.map, m.x, m.y, target.x, target.y)) {
      return Math.atan2(target.y - m.y, target.x - m.x);
    }
    const { w } = this.map;
    const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
    let best = null, bd = f[ty * w + tx] === -1 ? 9999 : f[ty * w + tx];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const v = f[(ty + dy) * w + (tx + dx)];
      if (v >= 0 && v < bd) {
        if (dx && dy && (f[ty * w + tx + dx] < 0 || f[(ty + dy) * w + tx] < 0)) continue;
        bd = v; best = [dx, dy];
      }
    }
    if (!best) return Math.atan2(target.y - m.y, target.x - m.x);
    return Math.atan2((ty + best[1]) * TILE + TILE / 2 - m.y, (tx + best[0]) * TILE + TILE / 2 - m.x);
  }

  // ── 진행: 포탈·보스방·전멸
  checkProgress(now) {
    if (this.kind === "town") return;
    const alive = [...this.players.values()].filter((p) => !p.dead);
    if (this.players.size && !alive.length && this.kind === "dungeon") {
      if (!this.failedAt) {
        this.failedAt = now + 3;
        this.ev({ e: "msg", text: "파티가 전멸했어요... 3초 뒤 마을로 돌아가요.", kind: "death" });
      } else if (now >= this.failedAt) this.world.partyFailed(this);
      return;
    }
    // 보스방 진입 → 문 닫고 보스 등장
    if (this.map.arena && !this.bossStarted && alive.some((p) => p.y < this.map.arena.y1 - 8)) {
      this.bossStarted = true;
      this.map.doorsOpen = false;
      this.ev({ e: "doors", open: 0 });
      const a = this.map.arena;
      for (const p of this.players.values()) if (p.y >= a.y1 - 8) { p.x = (a.x0 + a.x1) / 2 + Math.random() * 30 - 15; p.y = a.y1 - 40; p.session.send({ t: "tp", x: p.x, y: p.y }); }
      this.ev({ e: "fx", fx: "spawn/spawn-portal", x: this.map.bossAt[0], y: this.map.bossAt[1] + 20 });
      this.schedule(1.2, () => this.spawnBoss(this.map.boss, this.map.bossAt[0], this.map.bossAt[1]));
    }
    // 포탈
    if (this.transition) {
      if (now >= this.transition.at) { const t = this.transition; this.transition = null; this.world.usePortal(this, t.id); }
      return;
    }
    if (this.vote) this.checkVote(now);
    if (this.transition) return;
    const onTown = new Set();
    for (const o of this.map.objects) {
      if (o.kind !== "portal") continue;
      if (o.id === "exit" && !this.exitOpen) continue;
      const on = alive.filter((p) => Math.hypot(p.x - o.x, p.y - o.y) < 22);
      if (!on.length) continue;
      if (o.id === "town") {
        for (const p of on) {
          onTown.add(p);
          if (p.townAt == null) { p.townAt = now; p.session.send({ t: "ev", list: [{ e: "msg", text: "잠시 서 있으면 마을로 돌아가요.", kind: "info" }] }); }
          else if (now - p.townAt >= 1.5) { p.townAt = null; this.world.toTown(p.session, "포탈을 타고 마을로 돌아왔어요."); }
        }
        continue;
      }
      if (this.players.size > 1) { this.startVote(o, on[0], now); continue; }
      this.transition = { at: now + 2, id: o.id };
      this.ev({ e: "msg", text: "2초 뒤 다음 곳으로 이동해요...", kind: "info" });
      this.ev({ e: "warp", d: 2 });
      break;
    }
    for (const p of this.players.values()) if (!onTown.has(p)) p.townAt = null;
  }

  // ── 스냅샷 전송
  flush() {
    const evs = this.events.length ? JSON.stringify(this.events) : null;
    this.events.length = 0;
    const parts = new Map();
    for (const u of this.units.values()) {
      if (u.dead && u.type !== "p") continue;
      let flags = 0;
      if (u.dead) flags |= 1;
      if (u.casting || u.channel) flags |= 2;
      if (u.shield && u.shield.amt > 0) flags |= 4;
      if (isHardCC(u)) flags |= 8;
      if (u.windup || u.pattern?.winding) flags |= 16;
      if (u.status?.has("slow") || u.status?.has("root")) flags |= 32;
      if (u.parry && this.now <= u.parry.until) flags |= 64;
      const hp = u.maxHp ? Math.ceil((u.hp / u.maxHp) * 1000) : 1000;
      parts.set(u, `[${u.id},${u.x | 0},${u.y | 0},${Math.round((u.facing ?? 0) * 100)},${hp},${flags}]`);
    }
    for (const p of this.players.values()) {
      const s = p.session;
      if (evs) s.send(`{"t":"ev","list":${evs}}`);
      // 플레이어마다 '마지막으로 보낸 상태'를 기억해서 바뀐 유닛만 보냄 (2초마다 전체)
      if (s.sentRoom !== this) { s.sentRoom = this; s.sent = new Map(); }
      const sent = s.sent, full = (this.tickN + p.id) % 40 === 0;
      const near = [];
      for (const [u, str] of parts) {
        if (u === p || u.type === "p" || u.type === "b" || Math.abs(u.x - p.x) < VIEW + 100 && Math.abs(u.y - p.y) < VIEW) {
          if (full || sent.get(u.id) !== str) { near.push(str); sent.set(u.id, str); }
        } else if (sent.has(u.id)) sent.delete(u.id);
      }
      if (full) for (const id of sent.keys()) if (!this.units.has(id)) sent.delete(id);
      s.send(`{"t":"s","k":${this.tickN},"a":${p.lastSeq},"e":[${near.join(",")}]}`);
      if (s.meDirty || this.tickN % 4 === 0) { s.sendMe(); s.meDirty = false; }
    }
  }
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
export { distToSeg };

// 방(마을·던전 한 층·안전 구역) 시뮬레이션: 서버가 모든 판정을 한다
import { TILE, TICK_DT, PLAYER_RADIUS } from "../../shared/constants.js";
import { applyInput, moveCircle, circleHitsWall, blocksShot, lineOfSight, tileAt } from "../../shared/move.js";
import { PATH_DMG } from "../../shared/classes2.js";
import { PVP } from "../../shared/pvp.js";
import { MONSTERS, BOSSES, monsterStats, bossStats, floorScale, zoneOf, effLevel, normDungeon, dungeonMax, progKeys, D2_MONSTER_STAT_MULTIPLIER, D2_BOSS_STAT_MULTIPLIER, D2_BOSS_SPEED_MULTIPLIER } from "../../shared/zones.js";
import { rollItem, rollAbyssRelic, rollVerdanItem, ILVL_CAP, VMATS, vmatTier, SIGIL_NAMES } from "../../shared/items.js";
import { wearOnDeath } from "./wear.js";
const KI_BASE = 30; // 내력 기본치
import { tickStatuses, dealDamage, heal, moveMul, isHardCC, applyStatus, buffSum, giveShield, foe } from "./combat.js";
import { newUnitId, gainXp, refreshStats } from "./player.js";
import { castSkill, onParry as skillOnParry, onPlayerHit as skillOnPlayerHit, tickPlayerSkills, cancelCast, onFrontGuard, playerHurt, playerEvade, skillOnKill, p2of } from "./skills.js";
import { tickMonster, tickBoss } from "./ai.js";
import { mapPayload } from "./dungeon.js";
import { secureRandom } from "./secure.js";

const VIEW = 600;
const FLOW_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// 근처 사람에게만 보내는 화면 효과 이벤트와 그 범위
const NEAR_ONLY = new Set(["fx", "anim", "cast", "casting", "cx", "st", "stx", "heal", "miss", "shake", "buff", "shield", "dmg", "pj", "tel", "zone", "beam", "dash", "parryup", "spk", "trap", "gap", "stance"]);
const EV_RANGE_X = 1000, EV_RANGE_Y = 760, CROWD_EV_CAP = 24;

const XP_RATE = 0.4; // 경험치 배율 (성장 속도)
// 마을 관문 포탈 → 던전 번호
export const TOWN_GATES = { dungeon: 1, dungeon2: 2, dungeon3: 3, dungeon4: 4 };
/** 제2 던전은 캐릭터 레벨과 층 차이에 따른 경험치 감소를 적용하지 않는다. */
export function levelGapXpMultiplier(level, floor, dungeon = 1) {
  // 에르덴 제2 던전: 레벨 180부터 경험치 획득량 감소 (180 → 95%, 190 → 45%, 197+ → 10%)
  if (dungeon === 2) return level < 180 ? 1 : Math.max(0.1, 1 - (level - 179) * 0.05);
  // 베르단 던전: 실제 몬스터 레벨보다 6레벨 이상 높으면 레벨당 8%씩 감소
  // 기억왕의 지하왕릉: 베르단 100층을 깬 고레벨 유저가 오는 곳이라 레벨 차이 경험치 감소 없음
  if (dungeon === 4) return 1;
  if (dungeon >= 3) { const L = effLevel(floor, dungeon); return level <= L + 5 ? 1 : Math.max(0.1, 1 - (level - L - 5) * 0.08); }
  if (level <= floor + 5) return 1;
  return Math.max(0.05, 1 - (level - floor - 5) * 0.15);
}
/** 제1 던전 100층 최종 보스는 캐릭터 레벨 차이와 관계없이 경험치를 온전히 지급한다. */
export function unitXpMultiplier(level, floor, dungeon = 1, target = null) {
  if (dungeon === 1 && floor === 100 && target?.boss && !target.mid) return 1;
  return levelGapXpMultiplier(level, floor, dungeon);
}
/** 몸 두께(반지름)를 고려한 직선 통로: 가운데와 양옆 선이 모두 벽에 안 막힘 */
// 걸어서 지나갈 수 없는 칸 (흐름장과 같은 기준: 벽·물·구덩이 등. 화살은 넘어가도 몸은 못 지나감)
const walkBlocked = (map, x, y) => { const t = tileAt(map, Math.floor(x / TILE), Math.floor(y / TILE)); return t === 0 || t === 2 || t === 4 || t === 5 || (t === 3 && !map.doorsOpen); };
function walkLine(map, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 3));
  for (let i = 1; i < n; i++) { const k = i / n; if (walkBlocked(map, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)) return false; }
  return true;
}
function clearPath(map, m, t) {
  const a = Math.atan2(t.y - m.y, t.x - m.x), r = (m.r ?? 10) * 0.9, px = -Math.sin(a) * r, py = Math.cos(a) * r;
  return walkLine(map, m.x, m.y, t.x, t.y) && walkLine(map, m.x + px, m.y + py, t.x + px, t.y + py) && walkLine(map, m.x - px, m.y - py, t.x - px, t.y - py);
}
export class Room {
  constructor(world, { id, kind, floor = 0, dungeon = 1, map, partyId = null, partySize = 1 }) {
    Object.assign(this, { world, id, kind, floor, dungeon: normDungeon(dungeon), map, partyId, partySize });
    // 실제 레벨: 제1 던전은 층 그대로, 제2 던전은 102~150 (방어력·드롭 아이템 레벨·골드 계산에 사용)
    this.lvl = effLevel(Math.max(1, floor), this.dungeon);
    // 지하왕릉 11~20층: 예고 공격 지연·반복
    this.echoTele = this.dungeon === 4 && kind === "dungeon" && !!zoneOf(Math.max(1, floor), 4).echoTele;
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
    this.flowBuffers = new Map();
    this.flowMeta = new Map();
    this.flowAt = 0;
    this.mobGrid = null;
    this.projectileGrid = null;
    this.projectileCandidates = [];
    this.tickUnitBuffer = [];
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
  // 균열 망령의 순간이동 구체 효과는 방 전체에서 초당 최대 3회만 표시한다.
  allowAbyssOrbFx(now = this.now) {
    if (this.dungeon !== 2) return true;
    if (now - (this.abyssOrbFxWindowAt ?? -Infinity) >= 1) {
      this.abyssOrbFxWindowAt = now;
      this.abyssOrbFxCount = 0;
    }
    if ((this.abyssOrbFxCount ?? 0) >= 3) return false;
    this.abyssOrbFxCount = (this.abyssOrbFxCount ?? 0) + 1;
    return true;
  }
  aliveMonsters() { let n = 0; for (const u of this.units.values()) if (u.type === "m" && !u.dead && !u.dummy && u.team === "m") n++; return n + this.timers.filter((t) => t.spawn).length; }
  schedule(delay, fn) {
    const timer = { at: this.now + delay, fn };
    this.timers.push(timer);
    return timer;
  }

  // ── 유닛 생성
  spawnMonster(mid, x, y, elite = false, opts = {}) {
    const def = MONSTERS[mid];
    if (!def) return null;
    const st = monsterStats(mid, Math.max(1, this.floor), this.partySize, this.dungeon);
    const m = {
      id: newUnitId(), team: "m", type: "m", mid, name: (elite ? "정예 " : "") + def.name, x, y, r: 11 * (def.look.scale ?? 1) * (elite ? 1.2 : 1),
      hp: Math.round(st.hp * (elite ? 3 : 1)), maxHp: Math.round(st.hp * (elite ? 3 : 1)), atk: st.dmg * (elite ? 1.5 : 1), def: (def.ai === "guard" ? 12 + this.lvl * 1.2 : 2 + this.lvl * 1.6) * (elite ? 1.5 : 1) * (this.dungeon === 2 ? D2_MONSTER_STAT_MULTIPLIER : this.dungeon >= 3 ? 0.6 : 1),
      level: st.level, xp: st.xp * (elite ? 3 : 1), speed: def.speed * (elite ? 1.08 : 1) * floorScale(this.floor, this.dungeon).speed, elite, ai: def.ai, def_: def,
      status: new Map(), buffs: new Map(), threat: new Map(), facing: Math.PI / 2, aggro: !!opts.aggro, home: [x, y],
      atkReady: 0, windup: null, dead: false, fly: !!def.fly, summoned: !!opts.summoned,
    };
    this.units.set(m.id, m);
    this.ev({ e: "add", ...this.describe(m) });
    return m;
  }
  spawnBoss(bid, x, y) {
    const def = BOSSES[bid];
    const st = bossStats(bid, this.floor, this.partySize, this.dungeon);
    const b = {
      id: newUnitId(), team: "m", type: "b", bid, name: def.name, x, y, r: 14 * Math.min(2.2, def.look.scale ?? 1),
      hp: st.hp, maxHp: st.hp, atk: st.dmg, def: (6 + this.lvl * 2.2) * (this.dungeon === 2 ? D2_BOSS_STAT_MULTIPLIER : this.dungeon >= 3 ? 0.6 : 1), level: st.level, xp: st.xp, speed: def.speed * (this.dungeon === 2 ? D2_BOSS_SPEED_MULTIPLIER : this.dungeon >= 3 ? 0.85 : 1),
      boss: true, mid: def.mid, def_: def, dungeon: this.dungeon, status: new Map(), buffs: new Map(), threat: new Map(), facing: Math.PI / 2,
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
      dummy: true, dpsByPlayer: new Map(), dead: false,
    };
    this.units.set(d.id, d);
    return d;
  }
  spawnDevice(owner, kind, x, y, o) {
    const d = {
      id: newUnitId(), team: owner.team, pvp: owner.pvp, type: "d", kind, owner: owner.id, x, y, r: kind === "golem" ? 14 : kind === "pet" ? (o.skin === "demon" ? 14 : 10) : 8,
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
      const ch = u.session.char, eq = (u.session.realChar ?? ch).equip ?? {};
      const tt = ch.title != null ? ch.titles?.find((x) => x.id === ch.title) : null;
      return { id: u.id, k: "p", n: u.name, tt: tt?.text ?? null, tc: tt?.color ?? null, c: ch.cls, mh: u.maxHp, lv: ch.level, w: eq.weapon?.type ?? null, o: eq.offhand?.type ?? null, party: this.partyId ? 1 : 0, ...(u.pvp ? { sd: u.pvp } : {}), ...(ch.cls2 ? { c2: ch.cls2 } : {}), x: u.x | 0, y: u.y | 0 };
    }
    if (u.type === "m") return { id: u.id, k: "m", n: u.name, m: u.mid, mh: u.maxHp, lv: u.level, el: u.elite ? 1 : 0, x: u.x | 0, y: u.y | 0 };
    if (u.type === "b") return { id: u.id, k: "b", n: u.name, b: u.bid, mh: u.maxHp, lv: u.level, x: u.x | 0, y: u.y | 0 };
    if (u.type === "d") return { id: u.id, k: "d", d: u.kind, own: u.owner, mh: u.maxHp, x: u.x | 0, y: u.y | 0, f: Math.round(u.facing * 100), dur: u.o.dur, ...(u.o.skin ? { sk: u.o.skin } : {}), ...(u.o.big ? { big: 1 } : {}) };
    return { id: u.id };
  }

  // ── 플레이어 입장/퇴장
  addPlayer(u, at) {
    // 파티 방 이동·재접속 중 낡은 ID나 팀 값이 남아도 플레이어로 안전하게 복구한다.
    if ((this.units.has(u.id) && this.units.get(u.id) !== u) || (this.players.has(u.id) && this.players.get(u.id) !== u)) u.id = newUnitId();
    u.team = "p";
    u.type = "p";
    u.userId ??= u.session?.userId;
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
    s.send({ t: "map", room: this.id, kind: this.kind, floor: this.floor, dungeon: this.dungeon, zone: this.floor ? zoneOf(this.floor, this.dungeon).name : null, ...mapPayload(this.map), exitOpen: this.exitOpen, you: u.id });
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
    this.flow.delete(u.id); this.flowBuffers.delete(u.id); this.flowMeta.delete(u.id);
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
    if (u.inputs.length >= 8) { u.inputs.shift(); u.session.inputOverflow = (u.session.inputOverflow ?? 0) + 1; }
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
  onPlayerHurt(t, src, dmg, o, now) { return playerHurt(this, t, src, dmg, o, now); }
  onPlayerEvade(t, src, now) { playerEvade(this, t, src, now); }

  // ── 웨이브: 남은 적이 줄거나 제한 시간이 지나면 다음 무리가 가장자리 소환진에서 나타남
  tickWaves(now) {
    const W = this.map.waves, st = this.wave;
    if (!W || !st || !this.players.size || st.spawned >= W.total || now < st.nextAt) return;
    const players = [...this.players.values()].filter((p) => !p.dead && !p.ghost);
    if (!players.length) return;
    const per = Math.ceil(W.total / W.waves);
    let alive = 0;
    for (const u of this.units.values()) if (u.type === "m" && !u.dead && !u.dummy && u.team === "m") alive++;
    const lowCount = alive <= Math.max(2, Math.floor(per * 0.35));
    const timedRelease = now >= (st.forceAt ?? 0);
    // 기존 층은 몬스터 수가 줄어야 다음 웨이브, D2는 22초 뒤 전투가 정체되지 않게 합류.
    if (st.n > 0 && !lowCount && (this.dungeon < 2 || !timedRelease)) return;

    // 데이터가 비거나 막힌 소환 좌표가 있어도 빈 배열 인덱싱으로 틱이 중단되지 않게 한다.
    let pts = (Array.isArray(W.points) ? W.points : []).filter(([x, y]) =>
      Number.isFinite(x) && Number.isFinite(y) && !circleHitsWall(this.map, x, y, 12)
    );
    const distant = pts.filter(([x, y]) => players.every((p) => Math.hypot(p.x - x, p.y - y) > 220));
    if (distant.length >= 4) pts = distant;
    if (!pts.length) {
      // 시작 위치 주변에서 도보 가능한 대체 소환 지점을 찾는다.
      for (const p of players) {
        for (const radius of [145, 185, 225, 265]) {
          for (let i = 0; i < 16 && pts.length < 24; i++) {
            const a = (i / 16) * Math.PI * 2;
            const x = p.x + Math.cos(a) * radius, y = p.y + Math.sin(a) * radius;
            if (!circleHitsWall(this.map, x, y, 12)) pts.push([x, y]);
          }
          if (pts.length) break;
        }
      }
    }
    if (!pts.length && this.map.start && !circleHitsWall(this.map, this.map.start[0], this.map.start[1], 12)) {
      pts = [this.map.start];
    }
    const pool = (Array.isArray(W.pool) ? W.pool : []).filter((id) => MONSTERS[id]);
    const mobPool = pool.length ? pool : zoneOf(this.floor, this.dungeon).monsters.filter((id) => MONSTERS[id]);
    if (!pts.length || !mobPool.length) {
      st.nextAt = now + 1;
      return;
    }

    st.n++;
    const n = Math.min(per, W.total - st.spawned);
    st.spawned += n;
    st.nextAt = now + (this.dungeon === 4 ? 1.5 : this.dungeon >= 2 ? 1.8 : 3);
    st.forceAt = now + (this.dungeon === 4 ? 19 : 22);
    this.ev({ e: "wave", n: st.n, of: W.waves });
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    for (let i = 0; i < n; i++) {
      const [bx, by] = pts[i % pts.length];
      const x = bx + (Math.random() * 16 - 8), y = by + (Math.random() * 16 - 8);
      const mid = mobPool[Math.floor(Math.random() * mobPool.length)];
      const elite = Math.random() < (Number(W.elite) || 0);
      this.ev({ e: "fx", fx: "arcane/portal", x: x | 0, y: y | 0, s: 0.45 });
      const timer = this.schedule(0.9 + Math.random() * 0.4, () => this.spawnMonster(mid, x, y, elite, { aggro: true }));
      timer.spawn = true;
    }
  }

  // 웨이브를 마친 뒤 멀리 떨어져 길찾기에서 이탈한 몬스터는 수에 상관없이 플레이어 근처로 재배치한다.
  rescueStragglers() {
    const ps = [...this.players.values()].filter((p) => !p.dead && !p.ghost);
    if (!ps.length) return;
    const left = [...this.units.values()].filter((u) => u.type === "m" && !u.dead && !u.dummy && u.team === "m");
    let moved = 0;
    for (const m of left) {
      let p = null, nearest = Infinity;
      for (const candidate of ps) {
        const d = Math.hypot(candidate.x - m.x, candidate.y - m.y);
        if (d < nearest) { nearest = d; p = candidate; }
      }
      if (!p || nearest < 330) continue;
      const radius = Math.max(10, Math.min(18, (m.r ?? 12) * 0.8));
      let pts = (this.map.waves?.points ?? []).filter(([x, y]) => {
        const d = Math.hypot(x - p.x, y - p.y);
        return d > 120 && d < 320 && !circleHitsWall(this.map, x, y, radius);
      });
      if (!pts.length) {
        for (const r of [145, 185, 225, 265]) {
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
            if (!circleHitsWall(this.map, x, y, radius)) pts.push([x, y]);
          }
          if (pts.length) break;
        }
      }
      if (!pts.length) continue;
      const [x, y] = pts[Math.floor(Math.random() * pts.length)];
      this.ev({ e: "fx", fx: "arcane/portal", x: x | 0, y: y | 0, s: 0.45 });
      m.x = x; m.y = y; m.home = [x, y]; m.stuckFor = 0; m.aggro = true;
      m.threat?.set(p.id, (m.threat.get(p.id) ?? 0) + 1);
      moved++;
    }
    if (moved) this.ev({ e: "msg", text: `남은 몬스터 ${moved}마리가 가까이 다가와요!`, kind: "info" });
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
      wearOnDeath(this, t);
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
    if (killer) skillOnKill(this, killer, t, now);
    for (const p of this.players.values()) {
      if (p.dead || Math.hypot(p.x - t.x, p.y - t.y) > 700) continue;
      const ch = p.session.char;
      // 기본 경험치 배율은 유지하고, 층-레벨 차이 감소는 제1 던전에만 적용한다.
      let xp = t.xp * XP_RATE * (this.players.size > 1 ? 0.8 : 1) * (t.summoned ? 0.15 : 1); // 소환된 몬스터는 경험치 적게
      xp *= unitXpMultiplier(ch.level, this.floor, this.dungeon, t);
      gainXp(this, p, xp);
      const gold = Math.round((2 + Math.random() * 3) * floorScale(this.floor, this.dungeon).gold * (t.elite ? 3 : 1) * (t.boss ? 25 : 1) * (t.summoned ? 0.15 : 1));
      ch.gold += gold;
      p.session.meDirty = true;
      this.ev({ e: "gold", id: p.id, v: gold, x: t.x | 0, y: t.y | 0, own: p.id });
      if (!t.summoned) this.rollDrops(p, t); // 소환된 몬스터는 아이템·균열 결정 없음 (무한 소환 파밍 방지)
      if (p === killer || this.players.size === 1) ch.kills++;
      if (p.mythic?.has("swift_kill") && p === killer) p.buffs.set("swift_kill", { until: now + 3, mods: { move: 0.4, dmg: 0.1 } });
      if (p.mythic?.has("mana_font") && p === killer) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.1);
      if (p.abyss?.has("rift_hunt") && p === killer) p.buffs.set("a_rift_hunt", { until: now + 4, mods: { move: 0.25, dmg: 0.12 } });
      if (p.abyss?.has("star_bloom") && p === killer) {
        heal(this, p, p, p.maxHp * 0.08, now);
        p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.08);
      }
    }
    if (t.boss) this.onBossDead(t);
    else if (this.kind === "dungeon" && !this.exitOpen && this.map.kind === "normal" && (this.wave ? this.wave.spawned >= this.total : true) && this.aliveMonsters() === 0) {
      this.exitOpen = true;
      // 층을 깬 순간 '깬 층'으로 기록 → 마을로 나갔다 와도 다음 층부터 이어서 도전 가능
      for (const p of this.players.values()) {
        const c = p.session.char;
        const K = progKeys(this.dungeon);
        c[K.best] = Math.max(c[K.best] ?? 0, this.floor);
        this.world.save?.(p.session); this.world.sendChar?.(p.session);
      }
      this.ev({ e: "exit", open: 1 });
      this.ev({ e: "msg", text: "층 클리어! 보상 상자가 나타나고 바닥 아이템을 모두 주웠어요.", kind: "info" });
      this.schedule(0.8, () => this.collectAll());
      this.spawnChest();
    }
  }

  /** 층을 깨면 바닥에 남은 아이템을 주인에게 전부 자동으로 (가방이 차면 남김) */
  collectAll() {
    const got = new Map();
    for (const l of [...this.loot.values()]) {
      const p = [...this.players.values()].find((q) => q.userId === l.owner);
      if (!p) continue;
      if (this.world.pickup(p, l.item)) {
        this.loot.delete(l.id);
        p.session.send({ t: "ev", list: [{ e: "lootx", id: l.id, fly: p.id }] });
        got.set(p, (got.get(p) ?? 0) + 1);
      }
    }
  }
  /** 층 클리어 보상 상자: 파티원 각자 한 번씩 열 수 있음 */
  spawnChest() {
    if (this.map.kind !== "normal" || this.chest) return;
    let [x, y] = this.map.exit;
    for (const [dx, dy] of [[0, 64], [48, 48], [-48, 48], [0, 40], [0, 0]]) if (!circleHitsWall(this.map, x + dx, y + dy, 12)) { x += dx; y += dy; break; }
    this.chest = { x, y, opened: new Set() };
    const o = { kind: "chest", id: "reward", x, y, label: "보상 상자" };
    this.map.objects.push(o);
    this.ev({ e: "obj", o });
  }
  tickChest(now) {
    const c = this.chest;
    if (!c) return;
    for (const p of this.players.values()) {
      if (p.dead || c.opened.has(p.userId) || Math.hypot(p.x - c.x, p.y - c.y) > 34) continue;
      c.opened.add(p.userId);
      const s = p.session, ch = s.char;
      const gold = Math.round((12 + this.lvl * 6 + Math.random() * this.lvl * 3) * (this.dungeon === 2 ? 1.3 : this.dungeon >= 3 ? 1.6 : 1));
      ch.gold += gold; s.meDirty = true; s.dirty = true;
      const n = 1 + (Math.random() < 0.35 ? 1 : 0);
      const names = [];
      for (let i = 0; i < n; i++) {
        const it = this.rollGear(ch.cls, "elite");
        if (this.world.pickup(p, it)) names.push(it.name); else this.dropLoot(p.userId, it, c.x + (Math.random() * 40 - 20), c.y + 20);
      }
      if (this.dungeon === 2 && Math.random() < 0.2) {
        ch.riftCrystals = Math.min(999999, (ch.riftCrystals ?? 0) + 1); s.dirty = true;
        this.world.sendChar?.(s);
        s.send({ t: "ev", list: [{ e: "msg", text: "균열 결정 1개를 획득했어요.", kind: "legend" }] });
      }
      if (this.dungeon >= 3) this.grantMats(p, 2 + (Math.random() < 0.5 ? 1 : 0));
      if (Math.random() < 0.5) this.world.pickup(p, { cons: Math.random() < 0.6 ? "hp_potion" : "mp_potion", n: 1 });
      s.send({ t: "ev", list: [{ e: "chestopen", id: "reward", x: c.x, y: c.y, gold }, { e: "msg", text: `보상 상자: ${gold}G${names.length ? " + " + names.join(", ") : ""}`, kind: "legend" }] });
      this.ev({ e: "fx", fx: "holy/blessing", x: c.x | 0, y: (c.y - 8) | 0, s: 0.7 });
    }
  }

  /** 이 층의 장비 드롭. 제2 던전은 아이템 레벨 100(최고) + 한 단계 좋은 등급표 (예전엔 1~30레벨짜리가 나왔음) */
  rollGear(cls, tier) {
    // 베르단 섬: 전설 3.5% · 신화 1.5% · 심연 0.5%, 아이템 레벨 = 실제 몬스터 레벨(151~250)
    // 왕릉은 베르단 100층 이후 던전: 아이템 레벨은 최고치(250)로 고정
    if (this.dungeon >= 3) return rollVerdanItem(secureRandom, { ilvl: this.dungeon === 4 ? ILVL_CAP : Math.min(ILVL_CAP, this.lvl), cls, tier, zone: this.dungeon === 3 ? Math.floor((this.floor - 1) / 10) + 1 : 10 });
    if (this.dungeon !== 2) return rollItem(secureRandom, { ilvl: Math.max(1, this.floor), cls, tier });
    const up = { normal: "elite", elite: "boss", boss: "boss" }[tier] ?? tier;
    return rollItem(secureRandom, { ilvl: Math.min(100, this.lvl), cls, tier: up });
  }
  rollDrops(p, t) {
    const tier = t.boss ? "boss" : t.elite ? "elite" : "normal";
    if (this.dungeon === 2 && Math.random() < (t.boss ? 0.75 : t.elite ? 0.28 : 0.12)) {
      const ch = p.session.char;
      ch.riftCrystals = Math.min(999999, (ch.riftCrystals ?? 0) + 1);
      p.session.dirty = true; p.session.meDirty = true;
      this.world.sendChar?.(p.session);
      p.session.send({ t: "ev", list: [{ e: "msg", text: "균열 결정 1개를 획득했어요.", kind: "legend" }] });
    }
    if (this.dungeon >= 3) this.verdanDrops(p, t);
    const n = t.boss ? (t.mid ? 1 + (Math.random() < 0.5) : 2 + (Math.random() < 0.5)) : Math.random() < (t.elite ? 0.35 : 0.07) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const it = this.rollGear(p.session.char.cls, tier);
      this.dropLoot(p.userId, it, t.x + (Math.random() * 40 - 20), t.y + (Math.random() * 40 - 20));
    }
    // 소모품 소량
    if (Math.random() < (t.boss ? 1 : 0.04)) this.dropLoot(p.userId, { cons: "hp_potion", n: t.boss ? 2 : 1 }, t.x + (Math.random() * 30 - 15), t.y + 10);
  }
  /** 베르단 재료(20층 단위 5단계) · 지역 각인(10층 주요 보스) · 섬 심장핵(100층) */
  grantMats(p, n) {
    const ch = p.session.char;
    const tier = this.dungeon === 4 ? 4 : vmatTier(this.floor);
    const id = VMATS[tier].id;
    ch.mats ??= {};
    ch.mats[id] = Math.min(999999, (ch.mats[id] ?? 0) + n);
    p.session.dirty = true;
    p.session.matsOut = (p.session.matsOut ?? 0) + n;
    return VMATS[tier];
  }
  verdanDrops(p, t) {
    const ch = p.session.char;
    let text = null;
    if (t.boss && !t.mid) {
      const m = this.grantMats(p, 12);
      const zone = this.dungeon === 3 ? Math.floor((this.floor - 1) / 10) + 1 : 10;
      ch.sigils ??= {};
      ch.sigils[zone] = Math.min(9999, (ch.sigils[zone] ?? 0) + 1);
      text = `${m.name} 12개와 「${SIGIL_NAMES[zone - 1]}의 각인」을 얻었어요.`;
      if ((this.dungeon === 3 && this.floor >= 100) || (this.dungeon === 4 && this.floor >= 30)) { ch.hearts = Math.min(9999, (ch.hearts ?? 0) + 1); text += " 「섬 심장핵」도 얻었어요!"; }
      else if (this.dungeon === 4 && Math.random() < 0.25) { ch.hearts = Math.min(9999, (ch.hearts ?? 0) + 1); text += " 「섬 심장핵」도 얻었어요!"; }
    } else if (t.boss) {
      const m = this.grantMats(p, 6); // 중간보스: 정제 재료
      text = `${m.name} 6개를 얻었어요.`;
    } else if (Math.random() < (t.elite ? 0.5 : 0.08)) {
      this.grantMats(p, t.elite ? 2 : 1);
    }
    if (text) { p.session.send({ t: "ev", list: [{ e: "msg", text, kind: "legend" }] }); this.world.sendChar?.(p.session); }
    else if (p.session.matsOut >= 5) { p.session.matsOut = 0; this.world.sendChar?.(p.session); }
  }
  dropLoot(userId, item, x, y) {
    if (circleHitsWall(this.map, x, y, 4)) { x = Math.round(x / TILE) * TILE; }
    const l = { id: newUnitId(), owner: userId, item, x, y, until: this.now + 120 };
    this.loot.set(l.id, l);
    const p = [...this.players.values()].find((q) => q.userId === userId);
    if (p) p.session.send({ t: "ev", list: [{ e: "loot", ...this.lootDesc(l) }] });
    if (["심연", "신화", "전설"].includes(item.rarity)) this.ev({ e: "msg", text: `${p?.name ?? "?"}님에게 ${item.rarity} 아이템 [${item.name}]이(가) 떨어졌어요!`, kind: item.rarity === "심연" ? "abyss" : item.rarity === "신화" ? "mythic" : "legend" });
  }
  lootDesc(l) {
    const it = l.item;
    return { id: l.id, x: l.x | 0, y: l.y | 0, r: it.rarity ?? "일반", n: it.name ?? (it.cons ? "체력 물약" : "?"), s: it.slot ?? "cons", ty: it.type ?? undefined, v: it.variant ?? 0, il: it.ilvl ?? 1, ...(it.relic ? { rl: it.relic, rc: it.relicColor } : {}) };
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
    this.schedule(2.0, () => this.collectAll()); // 보스가 떨어뜨린 아이템도 자동으로
    const isMain = !b.mid;
    const finalFloor = dungeonMax(this.dungeon);
    const isFinal = isMain && this.floor >= finalFloor;
    const VICTORY = { 1: "마을로 (던전 정복!)", 2: "마을로 (심연 정복!)", 3: "마을로 (베르단 정복!)", 4: "마을로 (지하왕릉 정복!)" };
    const portal = { kind: "portal", id: isFinal ? "victory" : isMain ? "safe" : "exit", x: b.x, y: b.y, label: isFinal ? VICTORY[this.dungeon] : isMain ? "안전 구역으로" : `${this.floor + 1}층으로` };
    if (this.dungeon === 2 && isFinal) {
      for (const p of this.players.values()) {
        const ch = p.session.char;
        ch.abyssKeys = Math.min(9999, (ch.abyssKeys ?? 0) + 1);
        p.session.dirty = true;
        p.session.send({ t: "ev", list: [{ e: "msg", text: "심연의 열쇠를 획득했어요! 마을의 심연 보관고에서 사용할 수 있어요.", kind: "legend" }] });
      }
    }
    this.map.objects.push(portal);
    this.ev({ e: "obj", o: portal });
    this.bossCleared = true;
    this.world.onBossCleared(this, isMain);
    // 보스 다시 도전 선택 창 (전리품을 다 주운 뒤)
    this.schedule(2.6, () => this.world.offerBossRetry?.(this, b.name));
  }

  // ── 매 틱
  tick() {
    const now = (this.now = this.world.clock ?? this.now + TICK_DT);
    this.tickN++;
    // 예약 실행
    if (this.timers.length) {
      const timers = this.timers, initialLength = timers.length;
      let kept = 0;
      for (let i = 0; i < initialLength; i++) {
        const timer = timers[i];
        if (timer.at <= now) { try { timer.fn(now); } catch (e) { console.error(e); } }
        else timers[kept++] = timer;
      }
      for (let i = initialLength; i < timers.length; i++) timers[kept++] = timers[i];
      timers.length = kept;
    }
    if (now >= this.flowAt) { this.updateFlow(); this.flowAt = now + (this.units.size > 24 ? 0.65 : 0.5); }
    if (this.wave) this.tickWaves(now);
    if (this.dungeon === 4 && this.kind === "dungeon") this.tickTomb(now);
    if (this.wave && this.wave.spawned >= this.total && !this.exitOpen && now >= (this.rescueAt ?? 0)) { this.rescueAt = now + 8; this.rescueStragglers(); }
    if (this.map.traps?.length) this.tickTraps(now);
    for (const u of this.players.values()) this.tickPlayer(u, now);
    this.rebuildMobGrid();
    // 틱 도중 소환·삭제되는 유닛이 있어도 현재 틱의 순회 목록을 고정한다.
    // 틱 도중 소환·삭제되는 유닛이 있어도 현재 틱의 순회 목록을 고정하되 배열은 재사용한다.
    const snapshot = this.tickUnitBuffer;
    snapshot.length = 0;
    for (const u of this.units.values()) snapshot.push(u);
    for (const u of snapshot) {
      if (u.type === "p" || u.dead) continue;
      tickStatuses(this, u, now);
      if (u.dead) continue;
      if (u.type === "m" && !u.dummy) tickMonster(this, u, now);
      else if (u.type === "b") tickBoss(this, u, now);
      else if (u.type === "d") this.tickDevice(u, now);
      else if (u.dummy) this.tickDummy(u, now);
    }
    // 투사체 충돌은 이동·AI가 끝난 최신 좌표로 만든 공간 그리드에서 후보만 검사한다.
    this.rebuildProjectileGrid();
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
    if (s.hpRegen) u.hp = Math.min(u.maxHp, u.hp + s.hpRegen * TICK_DT * (this.kind === "pvp" ? PVP.heal : 1));
    if (this.map.safe && !u.lastHurt) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * TICK_DT);
    if (this.map.safe) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.03 * TICK_DT); u.mp = Math.min(u.maxMp, u.mp + u.maxMp * 0.05 * TICK_DT); }
    if (u.cls === "sword" || u.cls === "fist") {
      // 내력: 전투에서 멀어지면 기본치(30)로 천천히 돌아감 (예전엔 0까지 빠져서 다음 층 시작 때 스킬이 잠김)
      if (now - (u.lastAction ?? -99) > 6 && (!u.lastHurt || now - u.lastHurt > 6)) u.ki = u.ki > KI_BASE ? Math.max(KI_BASE, u.ki - 4 * TICK_DT) : Math.min(KI_BASE, u.ki + 8 * TICK_DT);
    }
    if (u.mythic?.has("guardian") && now >= (u.icd.get("m_guard") ?? 0)) {
      u.icd.set("m_guard", now + 10);
      giveShield(this, u, u.maxHp * 0.16, 10, now);
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
      const fromX = u.x, fromY = u.y;
      const [nx, ny] = moveCircle(this.map, u.x, u.y, Math.cos(d.dir) * step, Math.sin(d.dir) * step, u.r);
      const moved = Math.hypot(nx - u.x, ny - u.y);
      u.x = nx; u.y = ny;
      d.left -= step;
      d.onStep?.(now, fromX, fromY);
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
        if (!(foe(m, d) && m.type !== "d") || m.dead || m.fly || m.dummy) continue;
        if (Math.hypot(m.x - d.x, m.y - d.y) < (o.trigger ?? 22) + m.r) {
          if (d.kind === "mine") {
            this.ev({ e: "fx", fx: "explosions/dirt-explosion", x: d.x | 0, y: d.y | 0, s: 0.5 });
            for (const t of this.units.values()) {
              if (!(foe(t, d) && t.type !== "d") || t.dead || Math.hypot(t.x - d.x, t.y - d.y) > o.radius + t.r) continue;
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
      // 수호 골렘 7호: 주인 근처(380 안)의 가장 가까운 적에게 걸어가서 내려찍음. 적이 없으면 주인을 따라다님
      let best = null, bd = 1e9;
      for (const m of this.units.values()) {
        if (!(foe(m, d) && m.type !== "d") || m.dead || m.dummy) continue;
        if (Math.hypot(m.x - owner.x, m.y - owner.y) > 380) continue;
        const dist = Math.hypot(m.x - d.x, m.y - d.y);
        if (dist < bd) { bd = dist; best = m; }
      }
      if (now >= (d.nextTaunt ?? 0)) { // 주변 적의 위협을 골렘에게 (1초마다)
        d.nextTaunt = now + 1;
        for (const m of this.units.values()) if ((foe(m, d) && m.type !== "d") && !m.dead && !m.boss && Math.hypot(m.x - d.x, m.y - d.y) < 160) m.tauntBy = { id: d.id, until: now + 1.2 };
      }
      let tx, ty, stopAt;
      if (best) { tx = best.x; ty = best.y; stopAt = d.r + best.r + 8; }
      else { const f = owner.facing ?? 0; tx = owner.x - Math.cos(f) * 46 + Math.sin(f) * 18; ty = owner.y - Math.sin(f) * 30 + 10; stopAt = 14; } // 주인 뒤쪽 옆에서 따라감
      const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
      const busy = now < (d.slamUntil ?? 0); // 내려찍는 동안은 멈춤
      if (!busy && dist > stopAt) {
        const step = Math.min(115 * TICK_DT * (dist > 260 ? 1.8 : 1), dist - stopAt); // 멀리 떨어지면 빨리 따라감
        const [nx, ny] = moveCircle(this.map, d.x, d.y, (dx / dist) * step, (dy / dist) * step, d.r);
        d.x = nx; d.y = ny;
        d.facing = Math.atan2(dy, dx);
      }
      if (best && dist <= stopAt + 16 && now >= d.nextHit) {
        d.nextHit = now + 0.95; d.slamUntil = now + 0.4;
        d.facing = Math.atan2(best.y - d.y, best.x - d.x);
        this.ev({ e: "anim", id: d.id, a: "smash" });
        const tgt = best;
        this.schedule(0.22, (t0) => { // 망치가 땅에 닿는 순간 피해: 대상 + 주변(반경 46) 적에게 절반
          if (d.dead || !this.units.has(d.id)) return;
          const x = tgt.x, y = tgt.y;
          this.ev({ e: "fx", fx: "impacts/ground-slam", x: x | 0, y: y | 0, s: 0.45 });
          if (!tgt.dead) dealDamage(this, owner, tgt, { pow: o.pow, threat: 4, p2: o.p2 }, t0);
          for (const m of this.units.values()) if (m !== tgt && (foe(m, d) && m.type !== "d") && !m.dead && Math.hypot(m.x - x, m.y - y) <= 46 + m.r) dealDamage(this, owner, m, { pow: o.pow * 0.5, threat: 2, p2: o.p2 }, t0);
        });
      }
    } else if (d.kind === "pet" && owner) {
      // 2차 전직 소환수 (지옥사냥개·악마 군주·망령·그림자 분신): 표적(지정 > 저주 > 가까운 적)을 쫓아 공격
      let best = o.focus ? this.units.get(o.focus) : null;
      if (!best || best.dead) {
        best = null; let bd = 1e9;
        for (const m of this.units.values()) {
          if (!(foe(m, d) && m.type !== "d") || m.dead || m.dummy || Math.hypot(m.x - owner.x, m.y - owner.y) > 420) continue;
          const dist = Math.hypot(m.x - d.x, m.y - d.y) - (o.preferCurse && m.status.has("curse") ? 200 : 0);
          if (dist < bd) { bd = dist; best = m; }
        }
      }
      if (o.taunt && now >= (d.nextTaunt ?? 0)) { d.nextTaunt = now + 1; for (const m of this.units.values()) if ((foe(m, d) && m.type !== "d") && !m.dead && !m.boss && Math.hypot(m.x - d.x, m.y - d.y) < 120) m.tauntBy = { id: owner.id, until: now + 0.6 }; }
      let tx, ty, stopAt;
      if (best) { tx = best.x; ty = best.y; stopAt = d.r + best.r + 6; }
      else { tx = owner.x - Math.cos(owner.facing ?? 0) * 40; ty = owner.y - Math.sin(owner.facing ?? 0) * 30; stopAt = 18; }
      const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
      if (dist > stopAt) {
        const step = Math.min((o.speed ?? 150) * TICK_DT * (dist > 300 ? 1.8 : 1), dist - stopAt);
        [d.x, d.y] = moveCircle(this.map, d.x, d.y, (dx / dist) * step, (dy / dist) * step, d.r);
        d.facing = Math.atan2(dy, dx);
      }
      if (best && dist <= stopAt + 14 && now >= d.nextHit) {
        d.nextHit = now + (o.interval ?? 0.8);
        d.hits = (d.hits ?? 0) + 1;
        this.ev({ e: "anim", id: d.id, a: "slash" });
        const P2 = p2of(owner);
        const bonus = P2.curseAmp && best.status.has("curse") ? P2.curseAmp : 0;
        dealDamage(this, owner, best, { pow: o.pow ?? 1, bonus, threat: 2, p2: true }, now);
        if (o.bleed) applyStatus(this, owner, best, { type: "bleed", dur: 4, pow: 0.3, pm: PATH_DMG[owner.cls2] ?? 1 }, now);
        if (o.wave && d.hits % 3 === 0) {
          this.ev({ e: "fx", fx: "shadow/necro-skulls", x: best.x | 0, y: best.y | 0, s: 0.7 });
          for (const m of this.units.values()) if ((foe(m, d) && m.type !== "d") && !m.dead && m !== best && m.status.has("curse") && Math.hypot(m.x - best.x, m.y - best.y) < 140) dealDamage(this, owner, m, { pow: o.wave, noProcs: true, p2: true }, now);
        }
      }
    } else if (d.kind === "turret" && owner) {
      if (now >= d.nextHit) {
        let best = null, bd = o.range ?? 300;
        for (const m of this.units.values()) {
          if (!(foe(m, d) && m.type !== "d") || m.dead || m.dummy) continue;
          const dist = Math.hypot(m.x - d.x, m.y - d.y);
          if (dist < bd && lineOfSight(this.map, d.x, d.y, m.x, m.y)) { bd = dist; best = m; }
        }
        if (best) {
          d.nextHit = now + (o.interval ?? 0.5);
          const a = Math.atan2(best.y - d.y, best.x - d.x);
          d.facing = a;
          this.addProjectile({ team: "p", pvp: d.pvp, src: owner.id, x: d.x + Math.cos(a) * 10, y: d.y - 12 + Math.sin(a) * 10, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, range: (o.range ?? 300) + 20, r: 6, pierce: 0, fx: o.big ? "projectiles/laser-bolt" : "projectiles/bullet-tracer",
            onHit: (t, t1) => dealDamage(this, owner, t, { pow: o.pow ?? 0.7, threat: 2, p2: true }, t1) });
        } else d.nextHit = now + 0.2;
      }
    } else if (d.kind === "circuit" && owner) {
      if (now >= d.nextHit) {
        d.nextHit = now + 0.5;
        const [a, b] = o.ends;
        for (const m of this.units.values()) {
          if (!(foe(m, d) && m.type !== "d") || m.dead) continue;
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
    if (!(d.dpsByPlayer instanceof Map)) d.dpsByPlayer = new Map();
    for (const [userId, stat] of d.dpsByPlayer) {
      if (!stat.total || now - stat.last <= 5) continue;
      const secs = Math.max(1, stat.last - stat.start);
      const text = `허수아비 측정: ${secs.toFixed(1)}초 동안 ${Math.round(stat.total).toLocaleString()} 피해 (초당 ${Math.round(stat.total / secs).toLocaleString()})`;
      const session = this.world.sessions?.get(userId)
        ?? [...this.players.values()].find((p) => p.userId === userId)?.session;
      if (session?.notice) session.notice(text);
      else session?.send?.({ t: "ev", list: [{ e: "msg", text, kind: "info" }] });
      d.dpsByPlayer.delete(userId);
    }
  }

  // ── 투사체
  addProjectile(p) {
    // 심연 보스의 중첩 탄막과 구형 공허 탄환이 화면·서버에 무한히 쌓이지 않게 방별 상한을 둔다.
    if (this.dungeon >= 2 && p.team === "m") {
      const enemyCount = this.projectiles.reduce((n, q) => n + (q.team === "m"), 0);
      if (enemyCount >= 48) return null;
      if (p.fx === "shadow/void-orb") {
        const orbCount = this.projectiles.reduce((n, q) => n + (q.team === "m" && q.fx === "shadow/void-orb"), 0);
        if (orbCount >= 8) return null;
      }
    }
    p.id = newUnitId();
    p.hit = new Set();
    p.travelled = 0;
    this.projectiles.push(p);
    this.ev({ e: "pj", id: p.id, x: p.x | 0, y: p.y | 0, a: Math.round(Math.atan2(p.vy, p.vx) * 1000), v: Math.round(Math.hypot(p.vx, p.vy)), r: Math.round(p.range), fx: p.fx, tm: p.team === "p" ? 1 : 0, ...(p.pvp ? { sd: p.pvp } : {}), pal: p.pal ?? null, s: p.scale ?? null });
    return p;
  }
  tickProjectiles(now) {
    const projectiles = this.projectiles, initialLength = projectiles.length;
    let kept = 0;
    for (let pi = 0; pi < initialLength; pi++) {
      const p = projectiles[pi];
      const speed = Math.hypot(p.vx, p.vy);
      const steps = Math.max(1, Math.ceil((speed * TICK_DT) / 8));
      let end = false;
      for (let i = 0; i < steps && !end; i++) {
        p.x += (p.vx * TICK_DT) / steps;
        p.y += (p.vy * TICK_DT) / steps;
        p.travelled += (speed * TICK_DT) / steps;
        if (p.travelled >= p.range || blocksShot(this.map, p.x, p.y)) { end = true; break; }
        // 이동 중인 투사체 주변 셀만 검사한다. 최대 보스 반지름과 투사체 반경보다 넉넉한 범위.
        const candidates = this.nearbyUnits(p.x, p.y, p.r + 40);
        // 방벽(철벽 전개)이 적 투사체를 막음
        if (p.team === "m") for (const d of candidates) {
          if (d.type === "d" && d.kind === "wall" && Math.hypot(d.x - p.x, d.y - p.y) < 30) {
            d.hp -= 1;
            this.ev({ e: "fx", fx: "impacts/shield-block", x: p.x | 0, y: p.y | 0, s: 0.6 });
            if (d.hp <= 0) this.removeUnit(d);
            end = true;
            break;
          }
        }
        if (end) break;
        for (const t of candidates) {
          if (t.dead || !foe(t, p) || p.hit.has(t.id) || (t.type === "d" && !t.targetable)) continue;
          if (Math.hypot(t.x - p.x, t.y - p.y) > (p.team === "m" && t.type === "p" ? t.r * 0.6 : t.r) + p.r) continue; // 적 탄은 플레이어 몸 가운데에 맞아야 함
          p.hit.add(t.id);
          p.onHit?.(t, now, p);
          if (p.pierce-- <= 0) { end = true; break; }
        }
      }
      if (end) {
        p.onEnd?.(now, p);
        this.ev({ e: "pjx", id: p.id, x: p.x | 0, y: p.y | 0 });
      } else projectiles[kept++] = p;
    }
    for (let i = initialLength; i < projectiles.length; i++) projectiles[kept++] = projectiles[i];
    projectiles.length = kept;
  }

  // ── 예고 장판 (telegraph → 피해)
  addArea(a) {
    a.id = newUnitId();
    a.fireAt = this.now + (a.tel ?? 0);
    a.ticksLeft = a.ticks ?? 1;
    this.areas.push(a);
    // 지하왕릉 11~20층: 적의 예고 공격이 한 번 더(0.9초 뒤 같은 자리) 반복된다
    if (a.team === "m" && a.shape && !a.echo && this.echoTele && a.r2 !== 1400) {
      const copy = { ...a, echo: true, tel: 0.9 };
      delete copy.id;
      this.schedule((a.tel ?? 0) + 0.05, () => this.areas.length < 160 && this.addArea(copy));
    }
    // 보스 예고 기록 (80층 잔상 재생·심장부의 수식어 회피 판정용)
    if (a.team === "m" && a.shape && this.bossId && !a.replay) {
      const log = (this.areaLog ??= []);
      log.push({ ...a, at: this.now });
      if (log.length > 24) log.shift();
    }
    if (a.shape) this.ev({ e: "tel", id: a.id, sh: a.shape, x: a.x | 0, y: a.y | 0, r: a.r ? Math.round(a.r) : 0, r2: a.r2 ? Math.round(a.r2) : 0, a: a.ang != null ? Math.round(a.ang * 1000) : 0, w: a.w ?? 0, l: a.l ?? 0, arc: a.arc ?? 0, d: a.tel ?? 0, tm: a.team === "p" ? 1 : 0, ...(a.pvp ? { sd: a.pvp } : {}), ...(a.g ? { g: a.g } : {}), ...(a.pts ? { pts: a.pts } : {}), ...(a.gh || a.echo ? { gh: a.gh ? 1 : 2 } : {}) });
    return a;
  }
  tickAreas(now) {
    const keep = [];
    for (const a of this.areas) {
      if (now >= a.fireAt) {
        a.fire(now, a);
        if (a.team === "m" && this.bossId && a.shape && a.ticksLeft === (a.ticks ?? 1)) this.heartcoreCheck(a, now);
        a.ticksLeft--;
        if (a.ticksLeft > 0) { a.fireAt = now + (a.interval ?? 0.5); keep.push(a); }
      } else keep.push(a);
    }
    this.areas = keep;
  }
  /** 심장부의 수식어: 보스 예고 공격을 아슬아슬하게 피하면 다음 공격 강화 */
  heartcoreCheck(a, now) {
    const R = Math.max(a.r ?? 0, a.l ?? 0, 40);
    for (const p of this.players.values()) {
      const v = p.stats?.vmods?.vm_heartcore;
      if (!v || p.dead || (p.lastHurt ?? -9) >= a.fireAt - 0.05 || now < (p.icd.get("vm_heart") ?? 0)) continue;
      if (a.r2 === 1400 || Math.hypot(p.x - a.x, p.y - a.y) > R + 90) continue;
      p.icd.set("vm_heart", now + 8);
      p.buffs.set("vm_heart", { until: now + 4, mods: {}, nextHit: { pow: v } });
      this.ev({ e: "buff", id: p.id, b: "vm_heart", d: 4 });
    }
  }
  /** 지하왕릉 층 기믹: 1~10 석관 / 21~29 역상 문양 */
  tickTomb(now) {
    const zone = zoneOf(this.floor, 4);
    if (zone.sarco) for (const o of this.map.objects) {
      if (o.kind !== "sarco" || o.opened) continue;
      for (const p of this.players.values()) {
        if (p.dead || Math.hypot(p.x - o.x, p.y - o.y) > 34) continue;
        o.opened = true;
        this.ev({ e: "sarco", x: o.x | 0, y: o.y | 0 });
        this.ev({ e: "msg", text: "석관이 열렸어요! 봉인됐던 망자들이 깨어납니다.", kind: "warn" });
        this.ev({ e: "fx", fx: "spawn/soul-rise", x: o.x | 0, y: o.y | 0, s: 0.9 });
        const n = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2, x = o.x + Math.cos(a) * 46, y = o.y + Math.sin(a) * 34;
          if (circleHitsWall(this.map, x, y, 10)) continue;
          const mid = zone.monsters[Math.floor(Math.random() * zone.monsters.length)];
          this.schedule(0.6 + k * 0.1, () => this.spawnMonster(mid, x, y, Math.random() < 0.4, { aggro: true, summoned: true }));
        }
        // 보상: 석관 속 유물(골드·재료) — 위험을 감수한 대가
        for (const q of this.players.values()) {
          if (q.dead) continue;
          const gold = Math.round(floorScale(this.floor, 4).gold * (20 + Math.random() * 20));
          q.session.char.gold += gold; q.session.meDirty = true;
          this.grantMats(q, 3);
          this.ev({ e: "gold", id: q.id, v: gold, x: o.x | 0, y: o.y | 0, own: q.id });
        }
        break;
      }
    }
    if (zone.glyphs && this.map.kind === "normal" && now >= (this.glyphAt ??= now + 8)) {
      this.glyphAt = now + 9 + Math.random() * 3;
      const atk = monsterStats(zone.monsters[0], this.floor, this.partySize, 4).dmg;
      this.ev({ e: "msg", text: "바닥의 역상 문양이 뒤집힙니다!", kind: "warn" });
      for (const p of this.players.values()) {
        if (p.dead) continue;
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2, d = k === 0 ? 0 : 70 + Math.random() * 60;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.75;
          this.addArea({ team: "m", shape: "c", x, y, r: 58, tel: 1.3 + k * 0.25, fire: (t0) => {
            this.ev({ e: "fx", fx: "arcane/rune-circle", x: x | 0, y: y | 0, s: 0.8 });
            for (const q of this.players.values()) if (!q.dead && Math.hypot(q.x - x, (q.y - y) / 0.75) <= 54) dealDamage(this, { team: "m", id: 0, status: new Map(), buffs: new Map(), stats: {}, atk, level: effLevel(this.floor, 4) }, q, { pow: 1.6, unblockable: true }, t0);
          } });
        }
      }
    }
  }
  // ── 지속 구역
  addZone(z) {
    z.id = newUnitId();
    z.until = this.now + z.dur;
    z.next = this.now;
    this.zones.push(z);
    this.ev({ e: "zone", id: z.id, x: z.x | 0, y: z.y | 0, r: Math.round(z.r), d: z.dur, fx: z.fx ?? null, tm: z.team === "p" ? 1 : 0, ...(z.pvp ? { sd: z.pvp } : {}), fol: z.follow ?? 0, pal: z.pal ?? null, own: z.owner ?? 0 });
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
    this.tickChest(now);
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

  // 몬스터 충돌 계산 공간 분할: 주변 셀만 검사해 군집 상황의 O(n²) 비용을 줄인다.
  rebuildMobGrid() {
    const cell = 96, cols = Math.ceil((this.map.w * TILE) / cell), buckets = new Map();
    for (const u of this.units.values()) {
      if (u.team !== "m" || u.dead || u.type === "d") continue;
      const cx = Math.floor(u.x / cell), cy = Math.floor(u.y / cell);
      const key = cy * cols + cx;
      let a = buckets.get(key); if (!a) buckets.set(key, (a = []));
      a.push(u);
    }
    this.mobGrid = { cell, cols, buckets, tick: this.tickN };
  }
  nearbyMobs(x, y, radius = 96) {
    const g = this.mobGrid;
    if (!g) return this.units.values();
    const { cell, cols, buckets } = g;
    const x0 = Math.floor((x - radius) / cell), x1 = Math.floor((x + radius) / cell);
    const y0 = Math.floor((y - radius) / cell), y1 = Math.floor((y + radius) / cell);
    const out = [];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const a = buckets.get(cy * cols + cx); if (a) for (const u of a) out.push(u);
    }
    return out;
  }
  // 투사체용 공간 그리드: 플레이어·몬스터·보스·장치를 모두 넣어 전수 충돌검사를 피한다.
  rebuildProjectileGrid() {
    const cell = 96, cols = Math.ceil((this.map.w * TILE) / cell), buckets = new Map();
    for (const u of this.units.values()) {
      if (u.dead) continue;
      const cx = Math.floor(u.x / cell), cy = Math.floor(u.y / cell);
      const key = cy * cols + cx;
      let a = buckets.get(key); if (!a) buckets.set(key, (a = []));
      a.push(u);
    }
    this.projectileGrid = { cell, cols, buckets };
  }
  nearbyUnits(x, y, radius) {
    const g = this.projectileGrid;
    const out = this.projectileCandidates;
    out.length = 0;
    if (!g) { for (const u of this.units.values()) out.push(u); return out; }
    const { cell, cols, buckets } = g;
    const x0 = Math.floor((x - radius) / cell), x1 = Math.floor((x + radius) / cell);
    const y0 = Math.floor((y - radius) / cell), y1 = Math.floor((y + radius) / cell);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const a = buckets.get(cy * cols + cx);
      if (a) for (const u of a) out.push(u);
    }
    return out;
  }
  // ── 흐름장(길찾기): 플레이어 타일이 바뀐 경우에만 다시 계산
  updateFlow() {
    const { w, h } = this.map, size = w * h, doorsOpen = !!this.map.doorsOpen;
    for (const p of this.players.values()) {
      if (p.dead) { this.flow.delete(p.id); this.flowMeta.delete(p.id); continue; }
      const sx = Math.floor(p.x / TILE), sy = Math.floor(p.y / TILE);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) { this.flow.delete(p.id); this.flowMeta.delete(p.id); continue; }
      const meta = this.flowMeta.get(p.id);
      if (meta && meta.x === sx && meta.y === sy && meta.doorsOpen === doorsOpen && this.flow.has(p.id)) continue;
      let buf = this.flowBuffers.get(p.id);
      if (!buf || buf.dist.length !== size) { buf = { dist: new Int16Array(size), q: new Int32Array(size) }; this.flowBuffers.set(p.id, buf); }
      const dist = buf.dist, q = buf.q;
      dist.fill(-1);
      let qh = 0, qt = 0;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      dist[sy * w + sx] = 0;
      q[qt++] = sy * w + sx;
      while (qh < qt) {
        const i = q[qh++], x = i % w, y = (i / w) | 0, d = dist[i];
        if (d > 250) continue;
        for (const [dx, dy] of FLOW_DIRS) {
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
      this.flowMeta.set(p.id, { x: sx, y: sy, doorsOpen });
    }
  }
  /** 대상 플레이어 쪽으로 가는 방향 (흐름장) */
  pathDir(m, target) {
    const f = this.flow.get(target.id);
    // 몸통 양옆 두 줄 모두 뚫려 있을 때만 직진 (가운데만 보고 직진하다 모서리에 끼던 문제), 오래 못 움직였으면 무조건 길찾기
    // 한 번 끼이면 3초 동안은 길찾기 유지 (예전엔 직진↔길찾기를 왔다 갔다 하며 제자리에 멈춰 있었음)
    if (m.stuckFor > 0.6) m.pathUntil = this.now + 3;
    const stuck = this.now < (m.pathUntil ?? 0);
    if (target.type !== "p" || !f || (!stuck && clearPath(this.map, m, target))) {
      return Math.atan2(target.y - m.y, target.x - m.x);
    }
    const { w } = this.map;
    const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
    // 오래 끼어 있으면 먼저 지금 칸 한가운데로 빠져나옴 (모서리에 걸린 상태 풀기)
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (m.stuckFor > 1.5 && f[ty * w + tx] >= 0 && Math.hypot(cx - m.x, cy - m.y) > 4) {
      if (m.stuckFor > 3) m.stuckFor = 0; // 그래도 안 되면 다시 길찾기부터
      return Math.atan2(cy - m.y, cx - m.x);
    }
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
          // 전투 중(근처 300px 안에 살아 있는 적이 있거나 3초 안에 맞았으면)에는 귀환 불가
          const fighting = now - (p.lastHurt ?? -99) < 3 || [...this.units.values()].some((m) => m.team === "m" && !m.dead && !m.dummy && Math.hypot(m.x - p.x, m.y - p.y) < 300);
          if (fighting) {
            if (now - (p.townWarn ?? -99) > 3) { p.townWarn = now; p.session.send({ t: "ev", list: [{ e: "msg", text: "전투 중에는 마을로 돌아갈 수 없어요. 주변 적을 처치하세요.", kind: "warn" }] }); }
            continue;
          }
          onTown.add(p);
          if (p.townAt == null) { p.townAt = now; p.session.send({ t: "ev", list: [{ e: "msg", text: "잠시 서 있으면 마을로 돌아가요.", kind: "info" }] }); }
          else if (now - p.townAt >= 1.5) { p.townAt = null; this.world.toTown(p.session, "포탈을 타고 마을로 돌아왔어요."); }
        }
        continue;
      }
      // 마을은 전체 이용자가 같은 방을 공유하므로, 관문을 밟은 사람의 파티만 입장시킨다.
      if (this.kind === "town" && TOWN_GATES[o.id]) {
        const trigger = on[0];
        if (now >= (trigger.gateAt ?? 0)) {
          trigger.gateAt = now + 1.5;
          this.world.enterDungeon(trigger.session, 1, TOWN_GATES[o.id]);
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
    // 관심 범위: 화면 효과(이펙트·피해 숫자·시전 등)는 근처 사람에게만 보냄 → 사람이 많아도 각자 받는 양이 거의 그대로
    let evAll = null, evParts = null;
    if (this.events.length) {
      evParts = this.events.map((e) => {
        let x = e.x, y = e.y;
        if (x == null && NEAR_ONLY.has(e.e)) { const o = this.units.get(e.id ?? e.at ?? e.src); if (o) { x = o.x; y = o.y; } }
        return { s: JSON.stringify(e), x: NEAR_ONLY.has(e.e) && x != null ? x : null, y, who: e.b ?? e.src ?? e.at ?? e.id, dmg: e.e === "dmg" };
      });
      if (this.players.size <= 1 || evParts.every((p) => p.x == null)) { evAll = evParts.map((p) => p.s).join(","); evParts = null; }
    }
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
    const crowd = this.players.size > 8;
    for (const p of this.players.values()) {
      const s = p.session;
      // 플레이어마다 '마지막으로 보낸 상태'를 기억해서 바뀐 유닛만 보냄 (2초마다 전체)
      if (s.sentRoom !== this) { s.sentRoom = this; s.sent = new Map(); }
      const sent = s.sent, full = (this.tickN + p.id) % 40 === 0;
      const near = [];
      for (const [u, str] of parts) {
        // 사람이 많으면(8명 초과) 다른 플레이어 위치는 0.1초마다(번갈아) — 화면에선 부드럽게 이어 그려서 티가 거의 안 남
        if (crowd && u.type === "p" && u !== p && !full && (this.tickN + u.id + p.id) % 2) continue;
        if (u === p || u.type === "b" || (u.type === "p" && this.partyId) || Math.abs(u.x - p.x) < VIEW + 100 && Math.abs(u.y - p.y) < VIEW) {
          if (full || sent.get(u.id) !== str) { near.push(str); sent.set(u.id, str); }
        } else if (sent.has(u.id)) sent.delete(u.id);
      }
      if (full) for (const id of sent.keys()) if (!this.units.has(id)) sent.delete(id);
      let evs = evAll;
      if (evParts) {
        const mine = [];
        let others = 0;
        for (const q of evParts) {
          if (q.x == null || q.who === p.id) { mine.push(q.s); continue; } // 전체 알림·나와 관련된 것은 항상
          // 레이드·파티 보스전은 파티원의 피해 이벤트를 거리와 관계없이 파티 전체에 동기화한다.
          if (this.partyId && q.dmg && this.players.has(q.who)) { mine.push(q.s); continue; }
          const dx = Math.abs(q.x - p.x), dy = Math.abs(q.y - p.y);
          if (dx >= EV_RANGE_X || dy >= EV_RANGE_Y) continue;
          // 붐빌 때: 남의 피해 숫자는 가까운 것만, 남의 화면 효과는 틱당 최대 개수까지
          if (crowd && q.dmg && (dx > 420 || dy > 300)) continue;
          if (crowd && ++others > CROWD_EV_CAP) continue;
          mine.push(q.s);
        }
        evs = mine.length ? mine.join(",") : null;
      }
      if (evs) evs = "[" + evs + "]";
      // 이벤트와 위치를 한 메시지로 (틱당 1개). 바뀐 게 하나도 없으면 아예 안 보냄
      if (evs || near.length || s.sentAck !== p.lastSeq) {
        s.sentAck = p.lastSeq;
        s.send(`{"t":"s","k":${this.tickN},"a":${p.lastSeq},"e":[${near.join(",")}]${evs ? `,"v":${evs}` : ""}}`);
      }
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
// PvP 결투장: 1대1, 3판 2선승. 레벨·스탯·장비는 같은 기준선, 스킬 세팅은 입장 전에 저장한 것만 사용.
import { Room } from "./room.js";
import { makeArena } from "./dungeon.js";
import { refreshStats, availableSkills, defaultLoadout } from "./player.js";
import { dealDamage } from "./combat.js";
import { SKILLS } from "../../shared/skills.js";
import { SKILL_SLOTS } from "../../shared/constants.js";
import { PROF_TOTAL } from "../../shared/prof.js";
import { PVP, presetStats, checkPvpStats } from "../../shared/pvp.js";
import { PATHS } from "../../shared/classes2.js";

/** 저장된 PvP 세팅 → 이번 경기에서 쓸 스킬칸 (해금 차이 없이 Lv.150 기준 1차 스킬 전부 사용 가능) */
export function pvpLoadout(real) {
  const base = { cls: real.cls, cls2: null, level: PVP.level, stats: {}, equip: {}, skills: [] };
  const avail = new Set(availableSkills(base).filter((s) => s.kind !== "passive" && !s.path).map((s) => s.id));
  const saved = real.pvp?.skills;
  const seen = new Set();
  let out = Array.isArray(saved) && saved.length === SKILL_SLOTS ? saved.map((id) => (id && avail.has(id) && !seen.has(id) ? (seen.add(id), id) : null)) : null;
  if (!out || !out.some((id) => id && SKILLS[id]?.kind === "basic")) out = defaultLoadout(base);
  return out;
}
export function pvpStatsOf(real) {
  const pv = real.pvp ?? {};
  if (pv.preset === "custom" && pv.stats) { const st = checkPvpStats(real.cls, pv.stats); if (typeof st === "object") return st; }
  return presetStats(real.cls, pv.preset ?? "bal");
}
/** 평준화된 PvP 전용 캐릭터 (저장되지 않음) */
export function pvpChar(real) {
  const skills = pvpLoadout(real);
  const base = { cls: real.cls, cls2: null, level: PVP.level, stats: {}, equip: {}, skills };
  const prof = Object.fromEntries(availableSkills(base).map((s) => [s.id, PROF_TOTAL]));
  return {
    v: 1, name: real.name, cls: real.cls, cls2: null, level: PVP.level, xp: 0, stats: pvpStatsOf(real), unspent: 0,
    skills, prof, equip: {}, inv: [], cons: {}, gold: 0, titles: real.titles ?? [], title: real.title ?? null, deaths: 0, kills: 0,
    mats: {}, sigils: {}, island: real.island, pvp: real.pvp,
  };
}

/** 유닛이 다른 세션 객체(PvP 캐릭터)를 보도록 감싼 대리 객체: 보내기·표시 플래그는 원래 세션으로 전달 */
function sessionProxy(s, char) {
  return new Proxy(s, {
    get(t, k) { return k === "char" ? char : k === "realChar" ? t.char : k === "isPvpProxy" ? true : Reflect.get(t, k); },
    set(t, k, v) { if (k === "char") return true; return Reflect.set(t, k, v); },
  });
}

// 라운드 시작: 직업 고유 자원(내력·성광·부품·틈)과 2차 전직 자원을 가득 채운 상태로 시작
const START_RES = { sword: { ki: 100 }, fist: { ki: 100 }, priest: { holy: 100 }, smith: { parts: 3 }, rogue: { gap: 3 } };

export class PvpRoom extends Room {
  constructor(world, { id, a, b, ranked = true }) {
    const map = makeArena();
    super(world, { id, kind: "pvp", floor: 0, dungeon: 1, map });
    this.ranked = ranked;
    this.sides = [a, b];                 // 원래 세션
    this.score = [0, 0];
    this.round = 0;
    this.phase = "prep";
    this.phaseAt = 0;
    this.done = false;
    this.log = [];
  }
  /** 두 사람을 결투장으로 */
  begin() {
    for (let i = 0; i < 2; i++) {
      const s = this.sides[i], u = s.unit;
      u.room?.removePlayer(u);
      s.pvpRoom = this;
      s.pvpChar = pvpChar(s.char);
      u.session = sessionProxy(s, s.pvpChar);
      u.pvp = i + 1;
      u.status.clear(); u.buffs.clear(); u.shield = null; u.cds.clear(); u.dead = false;
      refreshStats(u);
      this.addPlayer(u, this.map.spawnsPvp[i]);
      s.sendCharSoon = true;
    }
    this.world.sendChar(this.sides[0]); this.world.sendChar(this.sides[1]);
    this.startRound(this.now);
  }
  sideOf(s) { return this.sides.findIndex((x) => x.userId === s.userId); }
  unitOf(i) { return this.sides[i]?.unit; }

  startRound(now) {
    this.round++;
    this.phase = "prep";
    this.phaseAt = now + PVP.prepTime;
    this.roundStart = now + PVP.prepTime;
    this.zoneOn = false; this.stormOn = false; this.nextSec = now + PVP.prepTime + 1;
    this.areas = []; this.zones = []; this.projectiles = [];
    for (let i = 0; i < 2; i++) {
      const u = this.unitOf(i);
      if (!u || u.room !== this) continue;
      this.removeDevicesOf(u);
      u.dead = false; u.status.clear(); u.buffs.clear(); u.shield = null; u.cds.clear();
      u.casting = null; u.channel = null; u.dash = null; u.parry = null; u.castQ = []; u.inputs.length = 0;
      u.ki = 0; u.holy = 0; u.parts = 0; u.gap = 0; u.acupoint = 0;
      Object.assign(u, START_RES[u.cls] ?? {});
      u.r2 = PATHS[u.session.char?.cls2]?.res2?.max ?? 0;
      u.lastBeatHit = now + PVP.prepTime; // 바람의 박자: 시작하자마자 4초 무타격 초기화에 걸리지 않게
      u.pvpZone = 0; u.ccDr = null; u.lastHurt = 0; u.lockUntil = now + PVP.prepTime;
      refreshStats(u);
      u.hp = u.maxHp; u.mp = u.maxMp;
      const [x, y] = this.map.spawnsPvp[i];
      u.x = x; u.y = y; u.facing = i === 0 ? 0 : Math.PI;
      u.session.send({ t: "tp", x, y });
      this.ev({ e: "add", ...this.describe(u) });
      u.session.meDirty = true;
    }
    this.ev({ e: "msg", text: `${this.round}라운드 — ${PVP.prepTime}초 뒤 시작!`, kind: "boss" });
    this.sendState(now);
  }
  /** 경기 상태(점수·라운드·남은 시간·거점) */
  sendState(now) {
    const left = this.phase === "fight" ? Math.max(0, Math.ceil(this.roundStart + PVP.roundTime - now)) : this.phase === "prep" ? Math.ceil(this.phaseAt - now) : 0;
    this.ev({ e: "pvp", ph: this.phase, r: this.round, sc: this.score, t: left, z: this.zoneOn ? 1 : 0, st: this.stormOn ? 1 : 0, zx: this.map.zoneAt[0], zy: this.map.zoneAt[1], zr: PVP.zoneR,
      n: this.sides.map((s) => s.name), c: this.sides.map((s) => s.char.cls), ids: this.sides.map((s) => s.unit.id), rk: this.ranked ? 1 : 0 });
  }
  // 준비 시간에는 움직이거나 스킬을 쓸 수 없음
  pushInput(u, m) { if (this.phase !== "fight") { u.lastSeq = Math.max(u.lastSeq, m.s ?? 0); return; } super.pushInput(u, m); }
  cast(u, m) { if (this.phase !== "fight") return; super.cast(u, m); }
  voteCast() {}
  checkProgress() {}

  tick() {
    super.tick();
    if (!this.done) this.tickPvp(this.now);
  }
  tickPvp(now) {
    if (this.phase === "prep" && now >= this.phaseAt) {
      this.phase = "fight";
      this.ev({ e: "msg", text: "전투 시작!", kind: "boss" });
      this.sendState(now);
      return;
    }
    if (this.phase === "fight") {
      const [a, b] = [this.unitOf(0), this.unitOf(1)];
      const deadA = !a || a.dead || a.room !== this, deadB = !b || b.dead || b.room !== this;
      if (deadA || deadB) return this.endRound(deadA && deadB ? -1 : deadA ? 1 : 0, now, "ko");
      const t = now - this.roundStart;
      if (t >= PVP.roundTime) {
        const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
        return this.endRound(Math.abs(ra - rb) < 0.005 ? -1 : ra > rb ? 0 : 1, now, "time");
      }
      if (!this.zoneOn && t >= PVP.zoneAt) { this.zoneOn = true; this.ev({ e: "msg", text: "중앙 거점이 열렸어요! 혼자 점유하면 피해가 점점 강해져요.", kind: "warn" }); this.sendState(now); }
      if (!this.stormOn && t >= PVP.stormAt) { this.stormOn = true; this.ev({ e: "msg", text: "결계가 좁혀져요! 거점 밖에서는 매초 피해를 받아요.", kind: "warn" }); this.sendState(now); }
      if (now >= this.nextSec) {
        this.nextSec = now + 1;
        if (this.zoneOn) this.tickZoneSec(now);
        this.sendState(now);
      }
    }
    if (this.phase === "end" && now >= this.phaseAt) {
      if (this.score[0] >= PVP.winRounds || this.score[1] >= PVP.winRounds || this.round >= PVP.maxRounds) {
        const w = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
        return this.finish(w, "rounds");
      }
      this.startRound(now);
    }
  }
  inZone(u) { const [x, y] = this.map.zoneAt; return Math.hypot(u.x - x, u.y - y) <= PVP.zoneR; }
  tickZoneSec(now) {
    const us = [this.unitOf(0), this.unitOf(1)].filter((u) => u && !u.dead && u.room === this);
    const inside = us.filter((u) => this.inZone(u));
    for (const u of us) {
      if (inside.length === 1 && inside[0] === u) {
        u.pvpZone = Math.min(PVP.zoneDmgMax, (u.pvpZone ?? 0) + PVP.zoneDmgPerSec);
        u.buffs.set("pvp_zone", { until: now + 1.5, mods: {}, n: Math.round(u.pvpZone * 100) });
        this.ev({ e: "buff", id: u.id, b: "pvp_zone", d: 1.5 });
      }
      if (this.stormOn && !this.inZone(u)) dealDamage(this, null, u, { fixed: Math.max(1, Math.round(u.maxHp * PVP.stormPerSec)), dot: true, crit: "none" }, now);
    }
  }
  endRound(winner, now, why) {
    if (this.phase !== "fight") return;
    this.phase = "end";
    this.phaseAt = now + 2.5;
    if (winner >= 0) this.score[winner]++;
    this.log.push({ r: this.round, w: winner, why, t: Math.round(now - this.roundStart) });
    const txt = winner < 0 ? `${this.round}라운드 무승부` : `${this.round}라운드 승리: ${this.sides[winner].name}${why === "time" ? " (시간 종료 · 남은 체력)" : ""}`;
    this.ev({ e: "msg", text: `${txt}  (${this.score[0]} : ${this.score[1]})`, kind: "rank" });
    // 판이 끝나면 공격이 더 들어가지 않게 정리
    this.areas = []; this.zones = []; this.projectiles = [];
    for (let i = 0; i < 2; i++) { const u = this.unitOf(i); if (u && u.room === this) { u.inputs.length = 0; u.castQ = []; u.casting = null; u.channel = null; u.lockUntil = now + 3; this.removeDevicesOf(u); } }
    this.sendState(now);
  }
  /** 기권(접속 끊김·나가기) */
  forfeit(s, why = "forfeit") {
    if (this.done) return;
    const i = this.sideOf(s);
    if (i < 0) return;
    this.log.push({ r: this.round, w: 1 - i, why });
    this.finish(1 - i, why);
  }
  finish(winner, why) {
    if (this.done) return;
    this.done = true;
    this.phase = "done";
    this.sendState(this.now);
    this.world.pvpFinish(this, winner, why);
  }
  /** 어떤 이유로든(경기 종료·접속 끊김·관리자 이동) 결투장을 떠나면 원래 캐릭터로 되돌리고, 경기 중이었다면 기권 처리 */
  removePlayer(u) {
    super.removePlayer(u);
    const s = this.sides.find((x) => x.unit === u);
    if (!s) return;
    if (!this.done) this.forfeit(s, s.linkdead || this.world.sessions.get(s.userId) !== s ? "disconnect" : "leave");
    if (u.session !== s) this.world.pvpRestore(s, u);
  }
}

// 월드: 접속자, 파티, 방(마을·던전), 저장, 상점·강화·전직 등 서버 명령
import { Q, secLog, itemLog } from "../db.js";
import { TICK_RATE, ITEMS, MAX_PARTY, SKILL_SLOTS } from "../../shared/constants.js";
import { CLASS_INFO, STATS } from "../../shared/classes.js";
import { SKILLS, adventurerBasic } from "../../shared/skills.js";
import { canEquip, enhanceOdds, enhanceCost, sellPrice, MAX_ENH, SLOTS, CLASS_GEAR, baseStats, itemName, ensureDur, repairCost, syncMythic, enchantCost, rollEnchant } from "../../shared/items.js";
import { floorKind } from "../../shared/zones.js";
import { Room } from "./room.js";
import { makeFloor, makeTown, safeZone } from "./dungeon.js";
import { newCharacter, sanitizeChar, makePlayerUnit, refreshStats, availableSkills, defaultLoadout, INV_SIZE } from "./player.js";
import { secureRandom } from "./secure.js";
import { moveMul } from "./combat.js";
import { USERNAME_RE } from "../auth.js";

let roomSeq = 1;
const filterChat = (s) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);

export class World {
  constructor() {
    this.sessions = new Map(); // userId → session
    this.rooms = new Map();
    this.clock = 0; // 월드 시계(초): 모든 방이 공유
    this.parties = new Map();
    this.town = this.addRoom(new Room(this, { id: "town", kind: "town", floor: 0, map: makeTown() }));
    this.announcement = null;
    this.startedAt = Date.now();
    this.tickTimes = [];
    // 고정 시간 간격: 타이머가 늦게 깨어나도 실제 시간만큼 틱을 따라잡아 게임 속도·입력 처리 속도가 흔들리지 않게
    this.loop = null;
    this.startLoop();
  }
  /** 고정 간격 루프. 접속자가 없으면 1분 뒤 멈춰서 Cloudflare가 서버를 잠재울 수 있게 함 */
  startLoop() {
    if (this.loop) return;
    const STEP = 1000 / TICK_RATE;
    let last = performance.now(), acc = 0, saveAt = Date.now() + 30_000;
    this.emptySince = 0;
    const id = setInterval(() => {
      const n = performance.now();
      acc += n - last; last = n;
      if (acc > STEP * 5) acc = STEP * 2; // 너무 밀리면(일시 정지 등) 버림
      while (acc >= STEP) { this.tick(); acc -= STEP; }
      if (Date.now() >= saveAt) { saveAt = Date.now() + 30_000; this.saveAll(); }
      if (this.sessions.size) this.emptySince = 0;
      else if (!this.emptySince) this.emptySince = Date.now();
      else if (Date.now() - this.emptySince > 60_000) { clearInterval(id); this.loop = null; }
    }, STEP / 2);
    id.unref?.();
    this.loop = id;
  }
  addRoom(r) { this.rooms.set(r.id, r); return r; }

  tick() {
    const t0 = performance.now();
    this.clock = (this.clock ?? 0) + 1 / TICK_RATE;
    for (const r of this.rooms.values()) {
      try { r.tick(); r.flush(); } catch (e) { console.error("room tick", r.id, e); }
    }
    // 30초 넘게 다시 안 들어온 끊긴 플레이어는 정리
    if (this.tickN = (this.tickN ?? 0) + 1, this.tickN % 20 === 0) for (const s of [...this.sessions.values()]) if (s.linkdead && Date.now() - s.linkdead > 30_000) this.finishClose(s);
    for (const r of [...this.rooms.values()]) if (r !== this.town && r.players.size === 0 && Date.now() - r.createdAt > 5000) this.rooms.delete(r.id);
    const dt = performance.now() - t0;
    this.tickTimes.push(dt);
    if (this.tickTimes.length > 100) this.tickTimes.shift();
  }

  // ── 접속
  onOpen(conn) {
    const u = conn.user;
    const old = this.sessions.get(u.id);
    // 잠깐 끊겼다가 다시 들어오면(30초 안) 던전·파티 그대로 이어서 (튕겨도 진행이 날아가지 않게)
    if (old?.linkdead && old.unit?.room) {
      old.conn = conn; old.linkdead = 0; old.ip = conn.ip;
      const un = old.unit, room = un.room;
      un.ghost = false; un.inputs.length = 0;
      old.sent = null; old.sentRoom = null; old.sentAck = null; old.meKey = null;
      old.send({ t: "hello", name: u.username, char: this.publicChar(old), announce: this.announcement, serverTime: Date.now() });
      const at = [un.x, un.y];
      room.removePlayer(un); room.addPlayer(un, at); un.x = at[0]; un.y = at[1];
      room.ev({ e: "add", ...room.describe(un) });
      const p = this.partyOf(old); if (p) this.sendParty(p);
      old.notice("다시 연결됐어요. 하던 곳에서 이어서 해요.");
      return;
    }
    if (old) { old.conn.send({ t: "kick", why: "다른 곳에서 접속해서 연결이 끊겼어요." }); old.conn.close(4001, "dup"); this.finishClose(old); }
    const row = Q.charByUser.get(u.id);
    let char;
    try { char = row ? sanitizeChar(JSON.parse(row.data), u.username) : newCharacter(u.username); } catch { char = newCharacter(u.username); }
    const s = {
      userId: u.id, name: u.username, conn, char, ip: conn.ip, joinedAt: Date.now(), partyId: null, invites: new Set(),
      mutedUntil: u.muted_until, dirty: true, meDirty: true, potionCd: {},
      send: (o) => s.conn.send(o),
      notice: (text) => s.conn.send({ t: "ev", list: [{ e: "notice", text }] }),
      sendMe: () => this.sendMe(s),
    };
    this.sessions.set(u.id, s);
    this.startLoop();
    s.unit = makePlayerUnit(s);
    s.send({ t: "hello", name: u.username, char: this.publicChar(s), announce: this.announcement, serverTime: Date.now() });
    this.town.addPlayer(s.unit);
    this.save(s);
    this.broadcastSys(`${u.username}님이 접속했어요.`, "join");
  }
  onClose(conn) {
    const s = this.sessions.get(conn.user.id);
    if (!s || s.conn !== conn) return;
    // 던전에서 끊기면 30초 동안 자리 유지(몬스터가 무시, 피해 없음) → 다시 접속하면 그대로 이어감
    if (s.unit.room && s.unit.room !== this.town && !s.unit.dead) {
      s.linkdead = Date.now();
      s.conn = { send() {}, close() {}, user: conn.user, ip: conn.ip, dead: true };
      s.unit.ghost = true; s.unit.inputs.length = 0; s.unit.castQ = [];
      this.save(s);
      return;
    }
    this.finishClose(s);
  }
  finishClose(s) {
    this.leaveParty(s, true);
    s.unit.room?.removePlayer(s.unit);
    s.char.playtime += Math.round((Date.now() - s.joinedAt) / 1000);
    s.joinedAt = Date.now();
    this.save(s);
    this.sessions.delete(s.userId);
  }
  save(s) {
    try { Q.saveChar.run(s.userId, JSON.stringify(s.char), s.char.level, s.char.cls, s.char.best, Date.now()); s.dirty = false; } catch (e) { console.error("save", e); }
  }
  saveAll() {
    const t = Date.now();
    for (const s of this.sessions.values()) {
      s.char.playtime += Math.round((t - s.joinedAt) / 1000); s.joinedAt = t;
      const key = `${s.char.level}|${s.char.xp}|${s.char.gold}|${s.char.best}|${s.char.kills}|${s.char.deaths}|${JSON.stringify(s.char.cons)}|${s.char.inv?.length}`;
      if (s.dirty || key !== s.saveKey || t - (s.savedAt ?? 0) > 300_000) { this.save(s); s.saveKey = key; s.savedAt = t; }
    }
  }

  publicChar(s) {
    const c = s.char;
    return { name: c.name, level: c.level, xp: c.xp, cls: c.cls, stats: c.stats, unspent: c.unspent, skills: c.skills, equip: c.equip, inv: c.inv, cons: c.cons, gold: c.gold, best: c.best, checkpoint: c.checkpoint, cleared: c.cleared, kills: c.kills, deaths: c.deaths, prof: c.prof ?? {} };
  }
  sendChar(s) {
    if (syncMythic(s.char) && s.unit) refreshStats(s.unit); // 새로 얻은 신화도 내 레벨로
    s.dirty = true; s.send({ t: "char", char: this.publicChar(s) });
  }
  sendMe(s) {
    const u = s.unit;
    const now = u.room?.now ?? 0;
    const cds = {};
    for (const [id, at] of u.cds) if (at > now) cds[id] = Math.round((at - now) * 1000);
    const buffs = [];
    for (const [id, b] of u.buffs) buffs.push([id, Math.round((b.until - now) * 10) / 10, b.n ?? 0]);
    const st = [];
    for (const [id, x] of u.status) st.push([id, Math.round((x.until - now) * 10) / 10]);
    const o = { t: "me", hp: Math.ceil(u.hp), mh: u.maxHp, mp: Math.floor(u.mp), mm: u.maxMp, ki: Math.floor(u.ki), holy: Math.floor(u.holy), parts: u.parts, gap: u.gap,
      sh: u.shield ? Math.round(u.shield.amt) : 0, cds, buffs, st, lv: s.char.level, xp: s.char.xp, gold: s.char.gold, stance: u.stance, acu: u.acupoint ?? 0,
      dead: u.dead ? 1 : 0, cons: s.char.cons, cs: Math.round((u.stats.cast ?? 1) * 100) / 100, spd: Math.round(u.stats.move * moveMul(u) * (u.guarding && now < u.guarding ? 0.35 : 1) * 10) / 10, pcd: Object.fromEntries(Object.entries(s.potionCd).map(([k, v]) => [k, Math.max(0, Math.round((v - Date.now())))])) };
    // 바뀐 게 없으면 보내지 않음 (최대 1초에 한 번은 보냄)
    const key = JSON.stringify([o.cs, o.hp, o.mh, o.mp, o.mm, o.ki, o.holy, o.parts, o.gap, o.sh, o.lv, o.xp, o.gold, o.stance, o.acu, o.dead, o.cons, o.spd,
      Object.entries(o.cds).map(([k, v]) => [k, Math.round(now * 10 + v / 100)]), buffs.map((b) => [b[0], Math.round((now + b[1]) * 10), b[2]]), st.map((x) => [x[0], Math.round((now + x[1]) * 10)]), Object.keys(o.pcd).filter((k) => o.pcd[k] > 0)]);
    const tn = Date.now();
    if (s.profOut) { o.pf = s.profOut; s.profOut = null; } // 숙련 경험치 변경분
    else if (key === s.meKey && tn - (s.meAt ?? 0) < 1000) return;
    s.meKey = key; s.meAt = tn;
    s.send(o);
  }

  broadcastSys(text, kind = "sys") {
    for (const s of this.sessions.values()) s.send({ t: "chat", from: "", text, kind });
  }

  // ── 메시지 처리
  onMessage(conn, m) {
    const s = this.sessions.get(conn.user.id);
    if (!s || s.conn !== conn) return;
    const u = s.unit, room = u.room;
    switch (m.t) {
      case "in":
        if (!room) break;
        if (m.b) { for (const e of m.b) if (e[0] > (u.inputs.at(-1)?.s ?? u.lastSeq)) room.pushInput(u, { s: e[0], mx: e[1], my: e[2], ax: e[3], ay: e[4] }); }
        else room.pushInput(u, m);
        if (m.c) room.cast(u, m.c); // 이동 묶음에 같이 실려 온 스킬
        break;
      case "cast": if (room) room.cast(u, m); break;
      case "vote": if (room) room.voteCast(u, m.ok); break;
      case "use": this.usePotion(s, m.item); break;
      case "chat": this.chat(s, m.text); break;
      case "party": this.partyOp(s, m.op, m.name); break;
      case "enter": this.enterDungeon(s, m.floor); break;
      case "town": if (room && room !== this.town) this.toTown(s, "마을로 돌아왔어요."); break;
      case "skills": this.setSkills(s, m.list); break;
      case "stat": this.addStat(s, m.key, m.n); break;
      case "resetStats": this.resetStats(s); break;
      case "class": this.changeClass(s, m.cls); break;
      case "rename": this.rename(s, m.name); break;
      case "buy": this.buy(s, m.item, m.n); break;
      case "equip": this.equip(s, m.uid); break;
      case "unequip": this.unequip(s, m.slot); break;
      case "sell": this.sell(s, m.uid); break;
      case "sellMany": this.sellMany(s, m.uids); break;
      case "repair": this.repair(s, m.uid); break;
      case "enchant": this.enchant(s, m.uid); break;
      case "enhance": this.enhance(s, m.uid); break;
      case "lock": { const it = s.char.inv.find((i) => i.uid === m.uid) ?? Object.values(s.char.equip).find((i) => i?.uid === m.uid); if (it) { it.locked = !it.locked; this.sendChar(s); } break; }
      case "ping": s.send({ t: "pong", c: m.c, s: Date.now() }); break;
      case "dummy": break;
    }
  }

  nearNpc(s, id, dist = 90) {
    const u = s.unit, r = u.room;
    if (!r) return false;
    return r.map.objects.some((o) => o.kind === "npc" && o.id === id && Math.hypot(o.x - u.x, o.y - u.y) < dist);
  }
  inSafe(s) { return !!s.unit.room?.map.safe; }

  chat(s, text) {
    if (s.mutedUntil > Date.now()) return s.notice(`채팅 금지 상태예요. (${new Date(s.mutedUntil).toLocaleString("ko-KR")}까지)`);
    const now = Date.now();
    s.chatTimes = (s.chatTimes ?? []).filter((t) => now - t < 10_000);
    if (s.chatTimes.length >= 6) return s.notice("채팅을 너무 빨리 보내고 있어요.");
    s.chatTimes.push(now);
    const clean = filterChat(text);
    if (!clean) return;
    if (clean.startsWith("/p ") && s.partyId) {
      const p = this.parties.get(s.partyId);
      for (const id of p.members) this.sessions.get(id)?.send({ t: "chat", from: s.name, text: clean.slice(3), kind: "party" });
      return;
    }
    const room = s.unit.room;
    for (const o of this.sessions.values()) if (o.unit.room === room) o.send({ t: "chat", from: s.name, text: clean, kind: "say" });
  }

  // ── 파티
  partyOf(s) { return s.partyId ? this.parties.get(s.partyId) : null; }
  sendParty(p) {
    const members = [...p.members].map((id) => { const o = this.sessions.get(id); return o ? { name: o.name, cls: o.char.cls, lv: o.char.level, leader: id === p.leader ? 1 : 0, cp: o.char.checkpoint, best: o.char.best } : null; }).filter(Boolean);
    for (const id of p.members) this.sessions.get(id)?.send({ t: "party", members });
  }
  partyOp(s, op, name) {
    const p = this.partyOf(s);
    if (op === "invite") {
      const o = [...this.sessions.values()].find((x) => x.name.toLowerCase() === String(name ?? "").toLowerCase());
      if (!o || o === s) return s.notice("그 플레이어를 찾을 수 없어요.");
      if (o.partyId) return s.notice("이미 다른 파티에 있어요.");
      if (p && p.members.size >= MAX_PARTY) return s.notice("파티는 최대 4명이에요.");
      if (s.unit.room !== this.town || o.unit.room !== this.town) return s.notice("파티 초대는 마을에서만 할 수 있어요.");
      if (p && p.leader !== s.userId) return s.notice("파티장만 초대할 수 있어요.");
      o.invites.add(s.userId);
      o.send({ t: "invite", from: s.name });
      s.notice(`${o.name}님에게 파티 초대를 보냈어요.`);
    } else if (op === "accept" || op === "decline") {
      const from = [...this.sessions.values()].find((x) => x.name.toLowerCase() === String(name ?? "").toLowerCase());
      if (!from || !s.invites.has(from.userId)) return;
      s.invites.delete(from.userId);
      if (op === "decline") return from.notice(`${s.name}님이 초대를 거절했어요.`);
      if (s.partyId) return s.notice("이미 파티에 있어요.");
      if (s.unit.room !== this.town || from.unit.room !== this.town) return s.notice("마을에서만 파티에 들어갈 수 있어요.");
      let party = this.partyOf(from);
      if (!party) { party = { id: "p" + roomSeq++, leader: from.userId, members: new Set([from.userId]) }; this.parties.set(party.id, party); from.partyId = party.id; }
      if (party.members.size >= MAX_PARTY) return s.notice("파티가 가득 찼어요.");
      party.members.add(s.userId);
      s.partyId = party.id;
      this.sendParty(party);
    } else if (op === "leave") this.leaveParty(s);
    else if (op === "kick" && p && p.leader === s.userId) {
      const o = [...p.members].map((id) => this.sessions.get(id)).find((x) => x?.name === name);
      if (o && o !== s) { this.leaveParty(o); o.notice("파티에서 추방됐어요."); }
    } else if (op === "promote" && p && p.leader === s.userId) {
      const o = [...p.members].map((id) => this.sessions.get(id)).find((x) => x?.name === name);
      if (o) { p.leader = o.userId; this.sendParty(p); }
    }
  }
  leaveParty(s, disconnect = false) {
    const p = this.partyOf(s);
    if (!p) return;
    p.members.delete(s.userId);
    s.partyId = null;
    s.send({ t: "party", members: [] });
    if (p.leader === s.userId) p.leader = [...p.members][0];
    if (p.members.size <= 1) {
      for (const id of p.members) { const o = this.sessions.get(id); if (o) { o.partyId = null; o.send({ t: "party", members: [] }); } }
      this.parties.delete(p.id);
    } else this.sendParty(p);
    // 던전 안에서 파티를 떠나면 마을로
    if (!disconnect && s.unit.room && s.unit.room !== this.town) this.toTown(s, "파티를 떠나 마을로 돌아왔어요.");
  }

  // ── 던전 이동
  groupOf(s) {
    const p = this.partyOf(s);
    return p ? [...p.members].map((id) => this.sessions.get(id)).filter(Boolean) : [s];
  }
  enterDungeon(s, floor) {
    if (s.unit.room !== this.town) return s.notice("던전은 마을에서 들어갈 수 있어요.");
    const p = this.partyOf(s);
    if (p && p.leader !== s.userId) return s.notice("파티장만 던전 입장을 할 수 있어요.");
    const group = this.groupOf(s);
    const maxCp = Math.min(...group.map((g) => g.char.checkpoint));
    // 한 번 깬 보스층(주요·중간)은 문지기에게서 다시 도전 가능 (파티원 모두 깬 층만)
    const bossAgain = floorKind(floor) !== "normal" && group.every((g) => g.char.best >= floor);
    // 이어하기: 파티원 모두가 깬 가장 높은 층의 바로 다음 층
    const next = Math.min(100, Math.min(...group.map((g) => g.char.best ?? 0)) + 1);
    if (floor !== 1 && floor !== next && !bossAgain && (floor > maxCp || (floor - 1) % 10 !== 0)) return s.notice(`시작할 수 있는 층은 1층, 이어하기(${next}층), 열린 체크포인트(최대 ${maxCp}층), 또는 모두 깬 보스층이에요.`);
    if (group.some((g) => g.unit.room !== this.town)) return s.notice("파티원 모두 마을에 있어야 해요.");
    this.moveGroup(group, floor, "dungeon");
  }
  moveGroup(group, floor, kind) {
    const seed = (secureRandom() * 2 ** 31) | 0;
    const map = kind === "safe" ? safeZone(floor) : makeFloor(floor, seed, group.length);
    const room = this.addRoom(new Room(this, { id: "r" + roomSeq++, kind, floor, map, partyId: group[0].partyId, partySize: group.length }));
    for (const g of group) {
      const u = g.unit;
      u.room?.removePlayer(u);
      if (u.dead) { u.dead = false; u.hp = Math.round(u.maxHp * 0.5); }
      u.status.clear();
      u.buffs.clear();
      u.shield = null;
      // 새 층은 직업 자원을 기본치로 시작 (검사·권투사 내력 30, 성직자 성광 30, 대장장이 부품 1)
      if (u.cls === "sword" || u.cls === "fist") u.ki = Math.max(u.ki, 30); else u.ki = 0;
      if (u.cls === "priest") u.holy = Math.max(u.holy, 30);
      if (u.cls === "smith") u.parts = Math.max(u.parts, 1);
      room.addPlayer(u);
    }
    if (kind === "dungeon") {
      const k = floorKind(floor);
      room.ev({ e: "msg", text: `${floor}층 ${k === "boss" ? "— 주요 보스" : k === "mid" ? "— 중간보스" : ""}`, kind: "floor" });
    }
    return room;
  }
  usePortal(room, id) {
    const group = [...room.players.values()].map((p) => p.session);
    if (!group.length) return;
    if (id === "exit" || id === "next") {
      const f = room.floor + 1;
      for (const g of group) if (g.char.best < room.floor) g.char.best = room.floor;
      this.moveGroup(group, f, "dungeon");
    } else if (id === "safe") {
      this.moveGroup(group, room.floor, "safe");
    } else if (id === "victory") {
      for (const g of group) {
        if (!g.char.cleared) this.broadcastSys(`🏆 ${g.name}님이 던전 100층을 정복했어요!`, "legend");
        g.char.cleared = true;
        this.toTown(g, "던전의 왕을 쓰러뜨렸어요! 축하해요!");
      }
    }
  }
  onBossCleared(room, isMain) {
    for (const p of room.players.values()) {
      const c = p.session.char;
      if (c.best < room.floor) c.best = room.floor;
      if (isMain && room.floor < 100) c.checkpoint = Math.max(c.checkpoint, room.floor + 1);
      this.save(p.session);
      this.sendChar(p.session);
    }
  }
  partyFailed(room) {
    for (const p of [...room.players.values()]) this.toTown(p.session, "패배했어요. 마을에서 정비하고 다시 도전해요.");
  }
  toTown(s, text) {
    const u = s.unit;
    u.room?.removePlayer(u);
    if (u.dead) u.dead = false;
    u.hp = Math.max(u.hp, Math.round(u.maxHp * 0.6));
    u.status.clear(); u.buffs.clear(); u.shield = null;
    this.town.addPlayer(u);
    if (text) s.notice(text);
    this.save(s);
  }

  // ── 성장: 스탯·스킬·전직
  addStat(s, key, n) {
    const c = s.char;
    if (!CLASS_INFO[c.cls].stats.includes(key) || !STATS[key]) return;
    n = Math.min(n, c.unspent);
    if (n <= 0) return;
    c.stats[key] = (c.stats[key] ?? 0) + n;
    c.unspent -= n;
    refreshStats(s.unit);
    this.sendChar(s);
  }
  resetStats(s) {
    // 스탯 재분배는 기획서상 전직 때 1회. 그 외에는 골드를 받고 마을에서만 허용
    const c = s.char;
    if (s.unit.room !== this.town) return s.notice("스탯 초기화는 마을 훈련 교관에게서만 할 수 있어요.");
    if (!this.nearNpc(s, "trainer")) return s.notice("훈련 교관 근처에서 해 주세요.");
    const cost = 200 + c.level * 40;
    if (c.gold < cost) return s.notice(`골드가 부족해요. (${cost}G 필요)`);
    c.gold -= cost;
    c.unspent += Object.values(c.stats).reduce((a, b) => a + b, 0);
    c.stats = {};
    refreshStats(s.unit);
    this.sendChar(s);
    s.notice(`스탯을 초기화했어요. (-${cost}G)`);
  }
  setSkills(s, list) {
    if (!this.inSafe(s)) return s.notice("스킬 교체는 마을이나 안전 구역에서만 할 수 있어요.");
    const avail = new Set(availableSkills(s.char).map((x) => x.id));
    const seen = new Set();
    const out = [];
    for (const id of list.slice(0, SKILL_SLOTS)) {
      if (id && avail.has(id) && !seen.has(id)) {
        const sk = SKILLS[id];
        if (sk.exclusive && seen.has(sk.exclusive)) { s.notice(`${sk.name}은(는) ${SKILLS[sk.exclusive].name}과(와) 같이 장착할 수 없어요.`); out.push(null); continue; }
        seen.add(id); out.push(id);
      } else out.push(null);
    }
    // 무기 전용 기본 공격(활쏘기·마력탄)은 1번 칸에만, 모험가는 든 무기에 맞춰 자동
    for (let i = 1; i < out.length; i++) if (out[i] && SKILLS[out[i]].weaponBasic) out[i] = null;
    if (s.char.cls === "adventurer") out[0] = adventurerBasic(s.char.equip.weapon?.type);
    s.char.skills = out;
    refreshStats(s.unit);
    this.sendChar(s);
  }
  /** 닉네임 변경 (= 로그인 아이디도 바뀜). 1시간에 한 번 */
  rename(s, name) {
    const fail = (text) => s.send({ t: "renameFail", text });
    if (typeof name !== "string") return fail("닉네임을 넣어 주세요.");
    name = name.trim();
    if (!USERNAME_RE.test(name)) return fail("닉네임은 2~12자, 한글·영문·숫자·_ 만 쓸 수 있어요.");
    if (name === s.name) return fail("지금 닉네임과 같아요.");
    const wait = (s.char.renamedAt ?? 0) + 3600e3 - Date.now();
    if (wait > 0) return fail(`닉네임은 1시간에 한 번 바꿀 수 있어요. (${Math.ceil(wait / 60000)}분 남음)`);
    const other = Q.userByName.get(name);
    if (other && other.id !== s.userId) return fail("이미 있는 닉네임이에요.");
    try { Q.renameUser.run(name, s.userId); } catch { return fail("이미 있는 닉네임이에요."); }
    const old = s.name;
    s.name = name; s.char.name = name; s.unit.name = name; s.char.renamedAt = Date.now();
    this.save(s);
    secLog("rename", { userId: s.userId, username: name, ip: s.ip, detail: { from: old } });
    s.send({ t: "renamed", name });
    this.sendChar(s);
    s.unit.room?.ev({ e: "add", ...s.unit.room.describe(s.unit) });
    if (s.partyId) { const p = this.parties?.get?.(s.partyId); if (p) this.sendParty(p); }
    this.broadcastSys(`${old}님의 닉네임이 ${name}(으)로 바뀌었어요.`, "join");
  }

  changeClass(s, cls) {
    const c = s.char;
    if (!CLASS_INFO[cls] || cls === "adventurer") return;
    if (c.cls !== "adventurer") return s.notice("이미 전직을 마쳐 직업이 고정됐어요. 전직 기능은 잠겨 있어요.");
    if (s.unit.room?.kind !== "safe" || !this.nearNpc(s, "class_master", 110)) return s.notice("전직은 안전 구역의 전직소에서만 할 수 있어요.");
    // 첫 전직: 투자한 포인트 전부 미사용으로 반환, 직업 전용 능력치 열림 (1회)
    c.unspent += Object.values(c.stats).reduce((a, b) => a + b, 0);
    c.stats = {};
    c.cls = cls;
    // 새 직업 기본 스킬 세트: 1번 칸 직업 기본 공격, 2~6번 칸 지금 쓸 수 있는 직업 스킬, 7번 대시, 8번 응급처치
    c.skills = defaultLoadout(c);
    s.unit.ki = 0; s.unit.holy = 0; s.unit.parts = 0; s.unit.gap = 0;
    // 새 직업이 쓸 수 없는 장비는 가방으로, 직업 기본 무기 지급
    for (const slot of ["weapon", "offhand"]) {
      const it = c.equip[slot];
      if (it && !canEquip(it, cls)) { if (c.inv.length < INV_SIZE) c.inv.push(it); c.equip[slot] = null; }
    }
    if (!c.equip.weapon) {
      const wt = CLASS_GEAR[cls].w[0];
      c.equip.weapon = { uid: c.nextUid++, slot: "weapon", type: wt, variant: 0, rarity: "일반", ilvl: c.level, enh: 0, base: baseStats("weapon", wt, c.level, 0), opts: [], name: "" };
      c.equip.weapon.name = "수련생의 " + itemName(c.equip.weapon).split(" ").slice(1).join(" ");
    }
    for (const it of Object.values(c.equip)) ensureDur(it);
    if (!c.equip.offhand && CLASS_GEAR[cls].o[0] !== "shield") {
      const ot = CLASS_GEAR[cls].o[0];
      c.equip.offhand = { uid: c.nextUid++, slot: "offhand", type: ot, variant: 0, rarity: "일반", ilvl: c.level, enh: 0, base: baseStats("offhand", ot, c.level, 0), opts: [], name: "" };
      c.equip.offhand.name = "수련생의 " + itemName(c.equip.offhand).split(" ").slice(1).join(" ");
    }
    refreshStats(s.unit);
    s.unit.hp = s.unit.maxHp;
    this.sendChar(s);
    s.unit.room.ev({ e: "fx", fx: "ui/level-up", x: s.unit.x | 0, y: s.unit.y | 0, at: s.unit.id });
    s.unit.room.ev({ e: "add", ...s.unit.room.describe(s.unit) });
    this.broadcastSys(`${s.name}님이 ${CLASS_INFO[cls].name}(으)로 전직했어요!`, "rank");
    itemLog(s.userId, "class_change", { cls });
    this.save(s);
  }

  // ── 소모품·상점
  usePotion(s, id) {
    const it = ITEMS[id];
    const u = s.unit;
    if (!it || u.dead || !u.room) return;
    if ((s.char.cons[id] ?? 0) <= 0) return s.notice(`${it.name}이(가) 없어요.`);
    if ((s.potionCd[id] ?? 0) > Date.now()) return;
    s.potionCd[id] = Date.now() + it.cd * 1000;
    s.char.cons[id]--;
    const r = u.room;
    if (id === "hp_potion") { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.35); r.ev({ e: "heal", id: u.id, v: Math.round(u.maxHp * 0.35) }); }
    if (id === "mp_potion") u.mp = Math.min(u.maxMp, u.mp + u.maxMp * 0.4);
    if (id === "antidote") for (const k of ["poison", "burn", "bleed"]) u.status.delete(k);
    r.ev({ e: "fx", fx: "pickups/collect-burst", x: u.x | 0, y: u.y | 0, s: 0.5 });
    s.meDirty = true;
  }
  buy(s, id, n) {
    const it = ITEMS[id];
    if (!it) return;
    if (!this.nearNpc(s, "shop")) return s.notice("상인 근처에서 살 수 있어요.");
    const have = s.char.cons[id] ?? 0;
    n = Math.min(n, it.max - have);
    if (n <= 0) return s.notice(`${it.name}은(는) 최대 ${it.max}개까지 가질 수 있어요.`);
    const cost = it.price * n;
    if (s.char.gold < cost) return s.notice("골드가 부족해요.");
    s.char.gold -= cost;
    s.char.cons[id] = have + n;
    this.sendChar(s);
    s.notice(`${it.name} ${n}개를 샀어요. (-${cost}G)`);
  }
  pickup(u, item) {
    const s = u.session, c = s.char;
    if (item.cons) {
      c.cons[item.cons] = Math.min(ITEMS[item.cons].max, (c.cons[item.cons] ?? 0) + item.n);
      s.meDirty = true;
      return true;
    }
    if (c.inv.length >= INV_SIZE) {
      if (!s.fullWarned || Date.now() - s.fullWarned > 8000) { s.fullWarned = Date.now(); s.notice("가방이 가득 찼어요! 마을에서 팔거나 정리해 주세요."); }
      return false;
    }
    const it = { ...item, uid: c.nextUid++ };
    c.inv.push(it);
    if (["전설", "신화"].includes(it.rarity)) itemLog(s.userId, "drop", { name: it.name, rarity: it.rarity, ilvl: it.ilvl });
    s.send({ t: "ev", list: [{ e: "got", item: it }] });
    this.sendChar(s);
    s.dirty = true;
    return true;
  }
  equip(s, uid) {
    const c = s.char;
    const i = c.inv.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    const it = c.inv[i];
    if (!canEquip(it, c.cls)) return s.notice("지금 직업으로는 장착할 수 없는 장비예요.");
    if (s.unit.room && !s.unit.room.map.safe && s.unit.lastHurt && s.unit.room.now - s.unit.lastHurt < 5) return s.notice("전투 중에는 장비를 바꿀 수 없어요.");
    c.inv.splice(i, 1);
    const old = c.equip[it.slot];
    c.equip[it.slot] = it;
    if (old) c.inv.push(old);
    if (c.cls === "adventurer" && it.slot === "weapon") c.skills[0] = adventurerBasic(it.type);
    refreshStats(s.unit);
    s.unit.room?.ev({ e: "add", ...s.unit.room.describe(s.unit) });
    this.sendChar(s);
  }
  unequip(s, slot) {
    const c = s.char;
    if (!c.equip[slot]) return;
    if (c.inv.length >= INV_SIZE) return s.notice("가방이 가득 찼어요.");
    c.inv.push(c.equip[slot]);
    c.equip[slot] = null;
    if (c.cls === "adventurer" && slot === "weapon") c.skills[0] = adventurerBasic(null);
    refreshStats(s.unit);
    s.unit.room?.ev({ e: "add", ...s.unit.room.describe(s.unit) });
    this.sendChar(s);
  }
  sell(s, uid) {
    const c = s.char;
    const i = c.inv.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    if (c.inv[i].locked) return s.notice("잠긴 아이템은 팔 수 없어요.");
    const it = c.inv.splice(i, 1)[0];
    const g = sellPrice(it);
    c.gold += g;
    if (["전설", "신화"].includes(it.rarity) || it.enh >= 10) itemLog(s.userId, "sell", { name: it.name, rarity: it.rarity, enh: it.enh, gold: g });
    this.sendChar(s);
    s.notice(`${it.name}을(를) ${g}G에 팔았어요.`);
  }
  /** 일괄 판매: 잠긴 아이템은 건너뜀 */
  sellMany(s, uids) {
    const c = s.char;
    const want = new Set(uids);
    let n = 0, gold = 0, skipped = 0;
    c.inv = c.inv.filter((it) => {
      if (!want.has(it.uid)) return true;
      if (it.locked) { skipped++; return true; }
      const g = sellPrice(it);
      gold += g; n++;
      if (["전설", "신화"].includes(it.rarity) || it.enh >= 10) itemLog(s.userId, "sell", { name: it.name, rarity: it.rarity, enh: it.enh, gold: g });
      return false;
    });
    if (!n) return s.notice(skipped ? "잠긴 아이템은 팔 수 없어요." : "팔 아이템을 골라 주세요.");
    c.gold += gold;
    this.sendChar(s);
    s.notice(`${n}개를 ${gold.toLocaleString()}G에 팔았어요.${skipped ? ` (잠긴 ${skipped}개 제외)` : ""}`);
  }
  /** 인챈트 (마법부여사): 무작위 하나, 다시 하면 바뀜 */
  enchant(s, uid) {
    const c = s.char;
    if (!this.nearNpc(s, "enchanter")) return s.notice("마법부여사 근처에서 인챈트할 수 있어요.");
    let where = "inv", it = c.inv.find((x) => x.uid === uid);
    if (!it) { it = Object.values(c.equip).find((x) => x?.uid === uid); where = "equip"; }
    if (!it) return;
    const cost = enchantCost(it);
    if (c.gold < cost) return s.notice(`골드가 부족해요. (${cost.toLocaleString()}G 필요)`);
    c.gold -= cost;
    const before = it.ench ?? null;
    it.ench = rollEnchant(secureRandom());
    if (where === "equip") refreshStats(s.unit);
    itemLog(s.userId, "enchant", { name: it.name, rarity: it.rarity, from: before, to: it.ench, cost });
    s.send({ t: "ench", uid, ench: it.ench, before });
    if (it.ench === "mend") this.broadcastSys(`✨ ${s.name}님이 [${it.name}]에 0.1% 확률의 '수선' 인챈트를 붙였어요!`, "legend");
    s.unit.room?.ev({ e: "fx", fx: "arcane/mana-burst", x: s.unit.x | 0, y: (s.unit.y - 10) | 0 });
    this.sendChar(s);
    this.save(s);
  }
  /** 장비 수선 (대장장이): uid를 주면 그 장비만, 없으면 장착 장비 + 가방 속 장비 전부 */
  repair(s, uid) {
    const c = s.char;
    if (!this.nearNpc(s, "smithy")) return s.notice("대장장이 브론 근처에서 수선할 수 있어요.");
    const list = [...Object.values(c.equip), ...c.inv].filter((it) => it && (uid == null || it.uid === uid)).map(ensureDur).filter((it) => it.dur < it.maxDur);
    if (!list.length) return s.notice("수선할 장비가 없어요. (내구도가 모두 가득)");
    const cost = list.reduce((a, it) => a + repairCost(it), 0);
    if (c.gold < cost) return s.notice(`골드가 부족해요. (수선비 ${cost.toLocaleString()}G)`);
    c.gold -= cost;
    for (const it of list) it.dur = it.maxDur;
    refreshStats(s.unit);
    this.sendChar(s);
    s.unit.room?.ev({ e: "fx", fx: "impacts/hit-spark", x: s.unit.x | 0, y: (s.unit.y - 10) | 0 });
    s.notice(`장비 ${list.length}개를 ${cost.toLocaleString()}G에 수선했어요. 내구도 가득!`);
  }
  // 강화: 성공 (99-n)%, 파괴 1%, 나머지 실패(단계 유지). 서버 보안 난수로 판정
  enhance(s, uid) {
    const c = s.char;
    if (!this.nearNpc(s, "smithy")) return s.notice("대장장이 브론 근처에서 강화할 수 있어요.");
    let where = "inv";
    let it = c.inv.find((x) => x.uid === uid);
    if (!it) { it = Object.values(c.equip).find((x) => x?.uid === uid); where = "equip"; }
    if (!it) return;
    if (it.enh >= MAX_ENH) return s.notice("이미 최대 강화(+99)예요.");
    const cost = enhanceCost(it);
    if (c.gold < cost) return s.notice(`골드가 부족해요. (${cost}G 필요)`);
    c.gold -= cost;
    const odds = enhanceOdds(it.enh);
    const r = secureRandom();
    let result;
    if (r < odds.destroy) {
      result = "destroy";
      if (where === "inv") c.inv = c.inv.filter((x) => x !== it);
      else for (const k of SLOTS) if (c.equip[k] === it) c.equip[k] = null;
      refreshStats(s.unit);
      s.unit.room?.ev({ e: "add", ...s.unit.room.describe(s.unit) });
    } else if (r < odds.destroy + odds.success) {
      result = "success";
      it.enh++;
      if (where === "equip") refreshStats(s.unit);
    } else result = "fail"; // 실패: 단계 유지
    itemLog(s.userId, "enhance", { name: it.name, rarity: it.rarity, from: result === "success" ? it.enh - 1 : it.enh, result, cost });
    if (result === "success" && it.enh >= 20) this.broadcastSys(`${s.name}님이 [${it.name}] +${it.enh} 강화에 성공했어요!`, "legend");
    s.send({ t: "enh", result, uid, enh: it.enh, name: it.name, cost });
    this.sendChar(s);
    this.save(s);
  }

  // ── GM 도구
  gmFind(userId) { return this.sessions.get(userId) ?? null; }
  gmKick(userId, why) {
    const s = this.sessions.get(userId);
    if (!s) return false;
    s.send({ t: "kick", why: why || "관리자에 의해 연결이 끊겼어요." });
    setTimeout(() => s.conn.close(4002, "kicked"), 100);
    return true;
  }
  gmAnnounce(text) {
    this.announcement = text ? { text, at: Date.now() } : null;
    for (const s of this.sessions.values()) s.send({ t: "announce", text });
  }
  gmApplyChar(userId, fn) {
    const s = this.sessions.get(userId);
    if (s) {
      fn(s.char);
      s.char = sanitizeChar(s.char, s.name);
      refreshStats(s.unit);
      this.sendChar(s);
      this.save(s);
      s.notice("관리자가 캐릭터 정보를 수정했어요.");
      return true;
    }
    const row = Q.charByUser.get(userId);
    const u = Q.userById.get(userId);
    if (!u) return false;
    let c;
    try { c = row ? JSON.parse(row.data) : newCharacter(u.username); } catch { c = newCharacter(u.username); }
    fn(c);
    c = sanitizeChar(c, u.username);
    Q.saveChar.run(userId, JSON.stringify(c), c.level, c.cls, c.best, Date.now());
    return true;
  }
  gmWarp(userId, floor) {
    const s = this.sessions.get(userId);
    if (!s) return false;
    const group = this.groupOf(s).filter((g) => g === s || g.unit.room === s.unit.room);
    this.moveGroup(group, floor, "dungeon");
    s.notice(`관리자가 ${floor}층으로 이동시켰어요.`);
    return true;
  }
  gmTeleportTown(userId) {
    const s = this.sessions.get(userId);
    if (!s) return false;
    this.toTown(s, "관리자가 마을로 이동시켰어요.");
    return true;
  }
  stats() {
    const rooms = [...this.rooms.values()].map((r) => ({
      id: r.id, kind: r.kind, floor: r.floor, players: [...r.players.values()].map((p) => ({ name: p.name, cls: p.cls, lv: p.level, hp: Math.round(p.hp), mh: p.maxHp, dead: p.dead })),
      monsters: [...r.units.values()].filter((u) => u.team === "m" && !u.dummy).length, boss: r.bossId ? r.units.get(r.bossId)?.name ?? "처치됨" : null,
      age: Math.round((Date.now() - r.createdAt) / 1000),
    }));
    const avg = this.tickTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.tickTimes.length);
    return { online: this.sessions.size, rooms, tickMs: +avg.toFixed(2), uptime: Math.round((Date.now() - this.startedAt) / 1000), mem: typeof process !== "undefined" && process.memoryUsage ? Math.round(process.memoryUsage().rss / 1048576) : null, announcement: this.announcement };
  }
}

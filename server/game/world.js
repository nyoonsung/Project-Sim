// 월드: 접속자, 파티, 방(마을·던전), 저장, 상점·강화·전직 등 서버 명령
import { Q, secLog, itemLog } from "../db.js";
import { TICK_RATE, ITEMS, MAX_PARTY, SKILL_SLOTS } from "../../shared/constants.js";
import { CLASS_INFO, STATS } from "../../shared/classes.js";
import { SKILLS, adventurerBasic } from "../../shared/skills.js";
import { canEquip, enhanceOdds, enhanceCost, sellPrice, MAX_ENH, SLOTS, CLASS_GEAR, baseStats, itemName, ensureDur, repairCost, syncMythic, enchantCost, rollEnchant, rollAbyssRelic } from "../../shared/items.js";
import { floorKind, DUNGEON2_MAX_FLOOR } from "../../shared/zones.js";
import { Room } from "./room.js";
import { makeFloor, makeTown, safeZone } from "./dungeon.js";
import { newCharacter, sanitizeChar, makePlayerUnit, refreshStats, availableSkills, defaultLoadout, INV_SIZE } from "./player.js";
import { secureRandom } from "./secure.js";
import { moveMul } from "./combat.js";
import { USERNAME_RE } from "../auth.js";
import { tradeOp, endTrade, inOffer } from "./trade.js";

let roomSeq = 1;
const filterChat = (s) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);

// 관리자가 예약해 둔 칭호: 그 계정이 다음에 접속하면 한 번만 지급 (key로 중복 지급 방지)
const RESERVED_TITLES = [
  { key: "worldgod-gm-yunseong", user: "GM_윤성", text: "세계의 신", color: "#c8a0ff" },
  { key: "firstrival-yuminthomas", user: "yuminthomas", text: "최초의 대적자", color: "#ff5a6e" },
];
function grantReserved(c, username, userId) {
  for (const g of RESERVED_TITLES) {
    if (g.user.toLowerCase() !== String(username).toLowerCase()) continue;
    // 처음 받은 계정 번호에 영구히 묶음: 나중에 누가 같은 닉네임을 차지해도(이름 변경·계정 삭제 후 등) 칭호를 못 받음
    let owner = null;
    try { owner = Q.metaGet.get("reserved:" + g.key)?.v ?? null; } catch {}
    if (owner && String(owner) !== String(userId)) continue;
    if (!owner && userId != null) { try { Q.metaSet.run("reserved:" + g.key, String(userId)); } catch {} }
    if ((c.granted ??= []).includes(g.key)) continue;
    c.titles ??= [];
    if (!c.titles.some((t) => t.text === g.text)) {
      c.titleSeq = Math.max(c.titleSeq ?? 0, ...c.titles.map((t) => t.id)) + 1;
      c.titles.push({ id: c.titleSeq, text: g.text, color: g.color, at: Date.now() });
    }
    c.granted.push(g.key);
  }
}
const ITEM_OPS = new Set(["equip", "unequip", "sell", "sellMany", "repair", "enchant", "enhance", "buy", "lock", "class", "stat", "resetStats", "skills", "title", "rename"]);

export class World {
  constructor() {
    this.sessions = new Map(); // userId → session
    this.rooms = new Map();
    this.clock = 0; // 월드 시계(초): 모든 방이 공유
    this.parties = new Map();
    this.town = this.addRoom(new Room(this, { id: "town", kind: "town", floor: 0, map: makeTown() }));
    this.resumes = new Map(); // 서버 재시작 뒤 던전 복귀: 파티(멤버·층)별로 다시 만든 방
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
    let last = performance.now(), acc = 0, saveAt = Date.now() + 10_000;
    this.emptySince = 0;
    const id = setInterval(() => {
      const n = performance.now();
      acc += n - last; last = n;
      if (acc > STEP * 5) acc = STEP * 2; // 너무 밀리면(일시 정지 등) 버림
      while (acc >= STEP) { this.tick(); acc -= STEP; }
      // 정기 저장: 10초마다 모두를 한꺼번에 저장하면 그 순간 서버가 잠깐 멈칫(렉)함
      //  → 사람마다 저장 차례를 10초 안에 고르게 흩어서 틱마다 조금씩 (잃는 양은 그대로 최대 10초)
      if (Date.now() >= saveAt) { saveAt = Date.now() + 250; this.saveSome(); }
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
    grantReserved(char, u.username, u.id);
    s.unit = makePlayerUnit(s);
    s.send({ t: "hello", name: u.username, char: this.publicChar(s), announce: this.announcement, serverTime: Date.now() });
    if (!this.tryResume(s)) this.town.addPlayer(s.unit);
    this.save(s);
    this.broadcastSys(`${u.username}님이 접속했어요.`, "join");
  }
  onClose(conn) {
    const s = this.sessions.get(conn.user.id);
    if (!s || s.conn !== conn || s.deleted) return;
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
  // ── 서버 재시작(업데이트 배포) 뒤 던전 복귀
  //  던전에 들어갈 때 '어느 층에, 누구와' 를 저장해 두고, 마을로 돌아오거나 정상적으로 나가면 지움.
  //  배포로 서버가 갑자기 꺼지면 이 기록이 남아 있으므로, 다시 접속하는 순간 같은 층(처음부터)으로 보내 주고 파티도 다시 묶어 줌.
  markResume(group, floor, kind, dungeon = 1) {
    const ids = group.map((g) => g.userId);
    for (const g of group) { g.char.resume = { floor, kind, dungeon, party: ids, leader: this.partyOf(g)?.leader ?? g.userId, at: Date.now() }; this.save(g); }
  }
  tryResume(s) {
    const r = s.char.resume;
    delete s.char.resume;
    // 저장 기록이 없거나 손상된 경우 속성을 읽기 전에 종료한다.
    if (!r || typeof r !== "object" || !Number.isInteger(r.floor) || !Number.isFinite(r.at)) return false;
    const dungeon = r.dungeon === 2 ? 2 : 1;
    const maxFloor = dungeon === 2 ? DUNGEON2_MAX_FLOOR : 100;
    const age = Date.now() - r.at;
    if (r.floor < 1 || r.floor > maxFloor || age < 0 || age >= 6 * 3600_000) return false; // 이상하거나 오래된 기록은 무시
    if (dungeon === 2 && !s.char.cleared) return false;
    const ids = [...new Set(r.party ?? [s.userId])].sort((a, b) => a - b);
    const key = `${dungeon}|${r.kind}|${r.floor}|${ids.join(",")}`;
    let e = this.resumes.get(key);
    if (e && (!this.rooms.has(e.room.id) || Date.now() - e.at > 10 * 60_000)) { this.resumes.delete(key); e = null; }
    if (ids.length > 1) {
      // 파티 다시 묶기 (먼저 돌아온 사람 기준, 원래 파티장이 돌아오면 파티장으로)
      let p = e ? this.parties.get(e.partyId) : null;
      if (!p) { p = { id: "p" + roomSeq++, leader: s.userId, members: new Set() }; this.parties.set(p.id, p); }
      if (p.members.size < MAX_PARTY) { p.members.add(s.userId); s.partyId = p.id; if (r.leader === s.userId) p.leader = s.userId; }
      if (!e) {
        const room = this.moveGroup([s], r.floor, r.kind === "safe" ? "safe" : "dungeon", { partySize: ids.length, keepResume: true, dungeon });
        this.resumes.set(key, (e = { room, partyId: p.id, at: Date.now() }));
      } else this.joinRoom(s, e.room);
      this.sendParty(p);
    } else {
      this.moveGroup([s], r.floor, r.kind === "safe" ? "safe" : "dungeon", { keepResume: true, dungeon });
    }
    s.char.resume = { ...r, at: Date.now() }; // 원래 파티 정보 그대로 (또 재시작돼도 같은 방으로)
    this.save(s);
    s.notice(`서버 업데이트로 잠깐 끊겼어요. ${r.floor}층으로 돌아왔어요. (층은 처음부터 다시 시작해요)`);
    return true;
  }
  joinRoom(s, room) {
    const u = s.unit;
    u.room?.removePlayer(u);
    if (u.cls === "sword" || u.cls === "fist") u.ki = Math.max(u.ki, 30);
    if (u.cls === "priest") u.holy = Math.max(u.holy, 30);
    if (u.cls === "smith") u.parts = Math.max(u.parts, 1);
    room.addPlayer(u);
  }
  finishClose(s) {
    delete s.char.resume; // 정상적으로 나감 → 다음 접속은 마을에서
    if (s.trade) endTrade(s, `${s.name}님의 접속이 끊겨 거래가 취소됐어요.`);
    this.leaveParty(s, true);
    s.unit.room?.removePlayer(s.unit);
    s.char.playtime += Math.round((Date.now() - s.joinedAt) / 1000);
    s.joinedAt = Date.now();
    this.save(s);
    this.sessions.delete(s.userId);
  }
  /** 바로 저장. 단 메시지를 마구 보내 DB 쓰기를 폭주시키지 못하게: 연속 5번까지는 즉시, 그 뒤로는 초당 2번꼴(남은 건 잠시 뒤 한 번에) */
  saveSoon(s) {
    const now = Date.now();
    s.saveTok = Math.min(5, (s.saveTok ?? 5) + ((now - (s.saveTokAt ?? now)) / 1000) * 2);
    s.saveTokAt = now;
    if (s.saveTok >= 1) { s.saveTok -= 1; return this.save(s); }
    if (s.saveTimer) return;
    s.saveTimer = setTimeout(() => { s.saveTimer = null; if (this.sessions.get(s.userId) === s && s.dirty) this.save(s); }, 600);
  }
  save(s) {
    if (s.deleted) return; // 관리자가 지운 계정: 다시 저장하지 않음
    try { Q.saveChar.run(s.userId, JSON.stringify(s.char), s.char.level, s.char.cls, s.char.best, Date.now()); s.dirty = false; } catch (e) { console.error("save", e); }
  }
  /** 이번 0.25초 차례인 사람만 저장 (한 사람당 10초에 한 번) */
  saveSome() {
    const slot = (this.saveSlot = ((this.saveSlot ?? 0) + 1) % 40);
    for (const s of this.sessions.values()) if (s.userId % 40 === slot) this.saveOne(s);
  }
  saveOne(s, t = Date.now()) {
    s.char.playtime += Math.round((t - s.joinedAt) / 1000); s.joinedAt = t;
    const key = `${s.char.level}|${s.char.xp}|${s.char.gold}|${s.char.best}|${s.char.kills}|${s.char.deaths}|${JSON.stringify(s.char.cons)}|${s.char.inv?.length}`;
    if (s.dirty || key !== s.saveKey || t - (s.savedAt ?? 0) > 300_000) { this.save(s); s.saveKey = key; s.savedAt = t; }
  }
  saveAll() {
    const t = Date.now();
    for (const s of this.sessions.values()) this.saveOne(s, t);
  }


  publicChar(s) {
    const c = s.char;
    return { name: c.name, level: c.level, xp: c.xp, cls: c.cls, stats: c.stats, unspent: c.unspent, skills: c.skills, equip: c.equip, inv: c.inv, cons: c.cons, gold: c.gold,
      best: c.best, checkpoint: c.checkpoint, cleared: c.cleared,
      best2: c.best2 ?? 0, checkpoint2: c.checkpoint2 ?? 1, cleared2: !!c.cleared2, abyssKeys: c.abyssKeys ?? 0, riftCrystals: c.riftCrystals ?? 0,
      kills: c.kills, deaths: c.deaths, prof: c.prof ?? {}, titles: c.titles ?? [], title: c.title ?? null };
  }
  sendChar(s) {
    if (syncMythic(s.char) && s.unit) refreshStats(s.unit); // 새로 얻은 신화도 내 레벨로
    // 파티원 정보(레벨·직업·체크포인트)도 최신으로
    const pp = this.partyOf(s);
    if (pp) { const k = `${s.char.level}|${s.char.cls}|${s.char.checkpoint}|${s.char.best}|${s.char.cleared}|${s.char.checkpoint2}|${s.char.best2}|${s.char.cleared2}`; if (k !== s.partyKey) { s.partyKey = k; this.sendParty(pp); } }
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
    // 거래에 올린 아이템은 팔기·강화·인챈트·장착 금지 (확정 직전 바꿔치기 방지)
    if (s.trade && ((m.uid != null && ["sell", "enhance", "enchant", "equip", "lock"].includes(m.t) && inOffer(s, m.uid)) || (m.t === "sellMany" && m.uids.some((u) => inOffer(s, u))))) return s.notice("거래에 올린 아이템이에요. 거래창에서 먼저 내려 주세요.");
    switch (m.t) {
      case "trade": tradeOp(this, s, m); break;
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
      case "enter": this.enterDungeon(s, m.floor, m.dungeon ?? 1); break;
      case "vault": this.openAbyssVault(s); break;
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
      case "title": this.equipTitle(s, m.id); break;
      case "who": this.who(s); break;
      case "enhance": this.enhance(s, m.uid); break;
      case "lock": { const it = s.char.inv.find((i) => i.uid === m.uid) ?? Object.values(s.char.equip).find((i) => i?.uid === m.uid); if (it) { it.locked = !it.locked; this.sendChar(s); } break; }
      case "ping": s.send({ t: "pong", c: m.c, s: Date.now() }); break;
      case "dummy": break;
    }
    // 아이템·장비가 바뀌는 행동은 바로 저장 (업데이트 배포 등으로 서버가 재시작돼도 신화 장착 같은 게 되돌아가지 않게)
    if (ITEM_OPS.has(m.t) && s.dirty) this.saveSoon(s);
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
    const members = [...p.members].map((id) => { const o = this.sessions.get(id); return o ? { name: o.name, cls: o.char.cls, lv: o.char.level, leader: id === p.leader ? 1 : 0, cp: o.char.checkpoint, best: o.char.best, cp2: o.char.checkpoint2 ?? 1, best2: o.char.best2 ?? 0, cleared: !!o.char.cleared } : null; }).filter(Boolean);
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
      // 같은 사람에게 연달아 초대 금지(5초), 초대는 60초 뒤 만료
      const at = o.inviteAt?.get(s.userId) ?? 0;
      if (Date.now() - at < 5000) return s.notice("방금 초대했어요. 잠시 기다려 주세요.");
      (o.inviteAt ??= new Map()).set(s.userId, Date.now());
      o.invites.add(s.userId);
      o.send({ t: "invite", from: s.name });
      s.notice(`${o.name}님에게 파티 초대를 보냈어요.`);
    } else if (op === "accept" || op === "decline") {
      const from = [...this.sessions.values()].find((x) => x.name.toLowerCase() === String(name ?? "").toLowerCase());
      if (!from || !s.invites.has(from.userId)) return s.notice("초대가 만료됐거나 상대가 접속해 있지 않아요.");
      s.invites.delete(from.userId);
      if (Date.now() - (s.inviteAt?.get(from.userId) ?? 0) > 60_000) return s.notice("초대가 만료됐어요. (60초)");
      if (op === "decline") return from.notice(`${s.name}님이 초대를 거절했어요.`);
      if (s.partyId) return s.notice("이미 파티에 있어요.");
      if (s.unit.room !== this.town || from.unit.room !== this.town) return s.notice("마을에서만 파티에 들어갈 수 있어요.");
      let party = this.partyOf(from);
      if (!party) { party = { id: "p" + roomSeq++, leader: from.userId, members: new Set([from.userId]) }; this.parties.set(party.id, party); from.partyId = party.id; }
      if (party.members.size >= MAX_PARTY) return s.notice("파티가 가득 찼어요.");
      party.members.add(s.userId);
      s.partyId = party.id;
      s.invites.clear(); // 다른 초대들은 정리
      this.sendParty(party);
      for (const id of party.members) this.sessions.get(id)?.notice(id === s.userId ? `${from.name}님의 파티에 들어갔어요.` : `${s.name}님이 파티에 들어왔어요.`);
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
  enterDungeon(s, floor, dungeon = 1) {
    if (s.unit.room !== this.town) return s.notice("던전은 마을에서 들어갈 수 있어요.");
    const p = this.partyOf(s);
    if (p && p.leader !== s.userId) return s.notice("파티장만 던전 입장을 할 수 있어요.");
    const group = this.groupOf(s);
    if (group.some((g) => g.unit.room !== this.town)) return s.notice("파티원 모두 마을에 있어야 해요.");
    dungeon = dungeon === 2 ? 2 : 1;
    if (dungeon === 2) {
      if (!group.every((g) => g.char.cleared)) return s.notice("제2 던전은 제1 던전 100층을 정복한 모험가만 입장할 수 있어요.");
      floor = Math.max(1, Math.min(DUNGEON2_MAX_FLOOR, Math.floor(Number(floor) || 1)));
      const maxCp = Math.min(...group.map((g) => g.char.checkpoint2 ?? 1));
      const best = Math.min(...group.map((g) => g.char.best2 ?? 0));
      const next = Math.min(DUNGEON2_MAX_FLOOR, best + 1);
      const floors = [1]; for (let f = 11; f <= maxCp; f += 10) floors.push(f);
      const bossAgain = floorKind(floor) !== "normal" && group.every((g) => (g.char.best2 ?? 0) >= floor);
      if (floor !== 1 && floor !== next && !bossAgain && !floors.includes(floor)) return s.notice(`시작할 수 있는 층은 1층, 이어하기(${next}층), 열린 체크포인트, 또는 모두 깬 보스층이에요.`);
    } else {
      const maxCp = Math.min(...group.map((g) => g.char.checkpoint));
      const bossAgain = floorKind(floor) !== "normal" && group.every((g) => g.char.best >= floor);
      const next = Math.min(100, Math.min(...group.map((g) => g.char.best ?? 0)) + 1);
      if (floor !== 1 && floor !== next && !bossAgain && (floor > maxCp || (floor - 1) % 10 !== 0)) return s.notice(`시작할 수 있는 층은 1층, 이어하기(${next}층), 열린 체크포인트(최대 ${maxCp}층), 또는 모두 깬 보스층이에요.`);
    }
    this.moveGroup(group, floor, "dungeon", { dungeon });
  }
  moveGroup(group, floor, kind, opt = {}) {
    const seed = (secureRandom() * 2 ** 31) | 0;
    const size = opt.partySize ?? group.length;
    const dungeon = opt.dungeon === 2 ? 2 : 1;
    const map = kind === "safe" ? safeZone(floor, dungeon) : makeFloor(floor, seed, size, dungeon);
    const room = this.addRoom(new Room(this, { id: "r" + roomSeq++, kind, floor, dungeon, map, partyId: group[0].partyId, partySize: size }));
    for (const g of group) {
      if (g.trade) endTrade(g, `${g.name}님이 마을을 떠나서 거래가 취소됐어요.`);
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
    // 서버가 갑자기 재시작돼도 이 층으로 돌아올 수 있게 기록 (파티원 전원)
    if (!opt.keepResume) { const party = this.partyOf(group[0]); this.markResume(party ? [...party.members].map((id) => this.sessions.get(id)).filter(Boolean) : group, floor, kind, dungeon); }
    if (kind === "dungeon") {
      const k = floorKind(floor);
      room.ev({ e: "msg", text: `${dungeon === 2 ? "심연의 균열 · " : ""}${floor}층 ${k === "boss" ? "— 주요 보스" : k === "mid" ? "— 중간보스" : ""}`, kind: "floor" });
    }
    return room;
  }
  usePortal(room, id) {
    const group = [...room.players.values()].map((p) => p.session);
    if (!group.length) return;
    if (room.kind === "town" && (id === "dungeon" || id === "dungeon2")) {
      const leader = group.find((g) => this.partyOf(g)?.leader === g.userId) ?? group[0];
      this.enterDungeon(leader, 1, id === "dungeon2" ? 2 : 1);
      return;
    }
    const dungeon = room.dungeon === 2 ? 2 : 1;
    if (id === "exit" || id === "next") {
      const f = room.floor + 1;
      for (const g of group) {
        if (dungeon === 2) g.char.best2 = Math.max(g.char.best2 ?? 0, room.floor);
        else g.char.best = Math.max(g.char.best, room.floor);
      }
      this.moveGroup(group, f, "dungeon", { dungeon });
    } else if (id === "safe") {
      this.moveGroup(group, room.floor, "safe", { dungeon });
    } else if (id === "victory") {
      for (const g of group) {
        if (dungeon === 2) {
          if (!g.char.cleared2) this.broadcastSys(`🏆 ${g.name}님이 심연의 균열 30층을 정복했어요!`, "legend");
          g.char.cleared2 = true;
          this.toTown(g, "심연의 감시자를 쓰러뜨렸어요! 심연의 균열을 정복했어요!");
          this.sendChar(g);
        } else {
          if (!g.char.cleared) this.broadcastSys(`🏆 ${g.name}님이 던전 100층을 정복했어요!`, "legend");
          g.char.cleared = true;
          this.sendChar(g);
          this.toTown(g, "던전의 왕을 쓰러뜨렸어요! 축하해요!");
        }
      }
    }
  }
  onBossCleared(room, isMain) {
    const dungeon = room.dungeon === 2 ? 2 : 1;
    for (const p of room.players.values()) {
      const c = p.session.char;
      if (dungeon === 2) {
        c.best2 = Math.max(c.best2 ?? 0, room.floor);
        if (isMain && room.floor < DUNGEON2_MAX_FLOOR) c.checkpoint2 = Math.max(c.checkpoint2 ?? 1, room.floor + 1);
      } else {
        c.best = Math.max(c.best, room.floor);
        if (isMain && room.floor < 100) c.checkpoint = Math.max(c.checkpoint, room.floor + 1);
      }
      this.save(p.session);
      this.sendChar(p.session);
    }
  }
  openAbyssVault(s) {
    // 보관고는 제2 던전 관문지기 창에서도 열 수 있음 (둘이 붙어 있음)
    if (!this.nearNpc(s, "vault", 160) && !this.nearNpc(s, "gate2", 160)) return s.notice("마을 오른쪽 심연 보관고(또는 관문지기) 앞에서만 사용할 수 있어요.");
    const c = s.char;
    if ((c.abyssKeys ?? 0) < 1) return s.notice("심연의 열쇠가 필요해요. 심연의 감시자를 처치해 얻을 수 있어요.");
    if ((c.riftCrystals ?? 0) < 5) return s.notice(`균열 결정이 부족해요. 5개가 필요해요. (보유: ${c.riftCrystals ?? 0}개)`);
    // 예전엔 아이템 레벨 30으로 나와서 레벨 100 이상에게 쓸모가 없었음 → 최고 레벨(100)
    const it = rollAbyssRelic(secureRandom, { ilvl: 100, cls: c.cls });
    if (!this.pickup(s.unit, it)) return;
    c.abyssKeys--; c.riftCrystals -= 5;
    this.save(s); this.sendChar(s);
    s.notice(`심연 보관고가 열렸어요! [${it.name}]을(를) 획득했어요.`);
  }
  partyFailed(room) {
    for (const p of [...room.players.values()]) this.toTown(p.session, "패배했어요. 마을에서 정비하고 다시 도전해요.");
  }
  toTown(s, text) {
    delete s.char.resume;
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
    this.saveSoon(s); // 주운 장비는 바로 저장 (1초에 한 번까지)
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
  /** 접속자 목록 (2초에 한 번만) */
  who(s) {
    const t = Date.now();
    if (t - (s.whoAt ?? 0) < 2000) return;
    s.whoAt = t;
    const list = [...this.sessions.values()].map((o) => {
      const r = o.unit?.room;
      const where = !r ? "-" : r === this.town ? "마을" : r.map?.safe ? `${r.floor}층 안전 구역` : `${r.floor}층`;
      const tt = o.char.title != null ? o.char.titles?.find((x) => x.id === o.char.title)?.text ?? null : null;
      return { n: o.name, lv: o.char.level, c: o.char.cls, w: where, tt, p: o.partyId && o.partyId === s.partyId ? 1 : 0, ld: o.linkdead ? 1 : 0 };
    }).sort((a, b) => b.p - a.p || b.lv - a.lv);
    s.send({ t: "who", list, n: list.length });
  }
  /** 칭호 장착/해제 (보관함에 있는 것만) */
  equipTitle(s, id) {
    const c = s.char;
    if (id !== null && !c.titles?.some((t) => t.id === id)) return;
    c.title = id;
    this.refreshLook(s);
    this.sendChar(s);
  }
  /** 이름 위 칭호 등 겉모습이 바뀌면 같은 방 사람들에게 다시 알림 */
  refreshLook(s) { const r = s.unit?.room; if (r) r.ev({ e: "add", ...r.describe(s.unit) }); }
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
    if (r < odds.destroy && it.rarity === "신화") {
      // 신화는 터져도 사라지지 않고 강화 단계만 +0으로
      result = "reset";
      it.enh = 0;
      if (where === "equip") refreshStats(s.unit);
    } else if (r < odds.destroy) {
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
  /** 관리자: 닉네임 강제 변경 (1시간 제한 없음). 실패하면 이유 문자열 */
  gmRename(userId, name) {
    name = String(name ?? "").trim();
    if (!USERNAME_RE.test(name)) return "닉네임은 2~12자, 한글·영문·숫자·_ 만 쓸 수 있어요.";
    const other = Q.userByName.get(name);
    if (other && other.id !== userId) return "이미 있는 닉네임이에요.";
    const u = Q.userById.get(userId);
    if (!u) return "없는 플레이어예요.";
    if (u.username === name) return "지금 닉네임과 같아요.";
    try { Q.renameUser.run(name, userId); } catch { return "이미 있는 닉네임이에요."; }
    const s = this.sessions.get(userId), old = u.username;
    if (s) {
      s.name = name; s.char.name = name; s.unit.name = name;
      this.save(s);
      s.send({ t: "renamed", name });
      this.sendChar(s);
      s.unit.room?.ev({ e: "add", ...s.unit.room.describe(s.unit) });
      const p = this.partyOf(s); if (p) this.sendParty(p);
      s.notice(`관리자가 닉네임을 ${name}(으)로 바꿨어요. 다음 로그인부터 새 닉네임으로 들어오세요.`);
    } else this.gmApplyChar(userId, (c) => { c.name = name; });
    this.broadcastSys(`${old}님의 닉네임이 ${name}(으)로 바뀌었어요.`, "join");
    return null;
  }
  /** 관리자: 계정 완전히 삭제 (접속 중이면 내보내고, 캐릭터·로그인 기록까지 지움). 되돌릴 수 없음 */
  gmDeleteAccount(userId) {
    const s = this.sessions.get(userId);
    if (s) {
      s.deleted = true;
      if (s.trade) endTrade(s, `${s.name}님의 계정이 삭제돼 거래가 취소됐어요.`);
      s.send({ t: "kick", why: "관리자에 의해 계정이 삭제됐어요." });
      const conn = s.conn;
      setTimeout(() => conn.close?.(4002, "deleted"), 100);
      this.leaveParty(s, true);
      s.unit.room?.removePlayer(s.unit);
      this.sessions.delete(userId);
    }
    Q.deleteUserSessions.run(userId);
    Q.deleteChar.run(userId);
    Q.deleteUser.run(userId);
    return true;
  }
  gmAnnounce(text) {
    this.announcement = text ? { text, at: Date.now() } : null;
    for (const s of this.sessions.values()) s.send({ t: "announce", text });
  }
  /** 관리자가 칭호를 주거나 뺐을 때: 접속 중이면 알림 + 이름 위 표시 갱신 */
  gmTitleNotice(userId, made) {
    const s = this.sessions.get(userId);
    if (!s) return;
    if (made) s.notice(`새 칭호를 받았어요: 「${made.text}」 (캐릭터 창 → 칭호, 또는 T 키에서 장착)`);
    this.refreshLook(s);
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
  gmWarp(userId, floor, dungeon = 1) {
    const s = this.sessions.get(userId);
    if (!s) return false;
    const group = this.groupOf(s).filter((g) => g === s || g.unit.room === s.unit.room);
    this.moveGroup(group, floor, "dungeon", { dungeon });
    s.notice(`관리자가 ${dungeon === 2 ? "제2 던전 " : ""}${floor}층으로 이동시켰어요.`);
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

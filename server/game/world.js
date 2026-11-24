// 월드: 접속자, 파티, 방(마을·던전), 저장, 상점·강화·전직 등 서버 명령
import { Q, secLog, itemLog } from "../db.js";
import { TICK_RATE, ITEMS, MAX_PARTY, SKILL_SLOTS } from "../../shared/constants.js";
import { CLASS_INFO, STATS } from "../../shared/classes.js";
import { SKILLS, adventurerBasic } from "../../shared/skills.js";
import { canEquip, enhanceOdds, enhanceCost, sellPrice, MAX_ENH, SLOTS, CLASS_GEAR, baseStats, itemName, ensureDur, repairCost, syncMythic, syncAbyss, enchantCost, rollEnchant, rollAbyssVaultItem, MYTHIC_EFFECTS, ABYSS_EFFECTS, specialRerollCost, rollMythicEffect, rollAbyssEffect, VMATS, VMODS, CRAFT_TIERS, CRAFT_SLOTS, craftVerdanItem, makeClassRelic, ensureAbyss } from "../../shared/items.js";
import { floorKind, DUNGEON2_MAX_FLOOR, DUNGEONS, normDungeon, dungeonMax, dungeonIsland, progKeys } from "../../shared/zones.js";
import { PATHS, canClass2, CLASS2_LEVEL } from "../../shared/classes2.js";
import { MAX_LEVEL } from "../../shared/constants.js";
import { Room } from "./room.js";
import { makeFloor, makeTown, makeVerdanTown, makeAstraTown, safeZone } from "./dungeon.js";
import { ASTRA, CONSTELLATIONS, CONST_BY_KEY, STORY, trialFloor, todayConstellation, blessUpCost, blessSlots, newAstraRecord } from "../../shared/astra.js";
import { newCharacter, sanitizeChar, makePlayerUnit, refreshStats, availableSkills, defaultLoadout, defaultLoadout2, INV_SIZE } from "./player.js";
import { secureRandom } from "./secure.js";
import { moveMul } from "./combat.js";
import { USERNAME_RE } from "../auth.js";
import { tradeOp, endTrade, inOffer } from "./trade.js";
import { PvpRoom } from "./pvp.js";
import { PVP, PVP_PRESETS, canPvp, checkPvpStats, eloDelta, pvpTier, newPvpRecord } from "../../shared/pvp.js";

let roomSeq = 1;
const filterChat = (s) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);

// 관리자가 예약해 둔 칭호: 그 계정이 다음에 접속하면 한 번만 지급 (key로 중복 지급 방지)
const RESERVED_TITLES = [
  { key: "worldgod-gm-yunseong", user: "GM_윤성", text: "세계의 신", color: "#c8a0ff" },
  { key: "firstrival-yuminthomas", user: "yuminthomas", text: "최초의 대적자", color: "#ff5a6e" },
  { key: "shinryu-shingung-gyukatchu", user: "규카츠", text: "신궁神弓", color: "#4ef59b" },
  { key: "hephaestus-dandan", user: "dandan", text: "헤파이스토스", color: "#ff8738" },
  { key: "suara-blade-ppakppagi", user: "빡빡이", text: "수아라의 블리트", color: "#a9c5ff" },
];
function grantReserved(c, username, userId) {
  // 이전 배포에서 오독한 칭호 이름을 보관함에서 교정한다. ID를 유지해 장착 상태도 보존한다.
  if (Array.isArray(c.titles)) {
    const oldTitle = c.titles.find((t) => t.text === "신룡神弓");
    if (oldTitle) {
      const correctTitle = c.titles.find((t) => t.text === "신궁神弓");
      if (correctTitle) {
        if (c.title === oldTitle.id) c.title = correctTitle.id;
        c.titles = c.titles.filter((t) => t.id !== oldTitle.id);
      } else oldTitle.text = "신궁神弓";
    }
  }
  for (const g of RESERVED_TITLES) {
    // 닉네임이 바뀌어도 기존 계정 ID가 확인되면 같은 계정에 계속 지급한다.
    let owner = null;
    try { owner = Q.metaGet.get("reserved:" + g.key)?.v ?? null; } catch {}
    const nameMatches = g.user.toLowerCase() === String(username).toLowerCase();
    const ownerMatches = owner != null && String(owner) === String(userId);
    if (!nameMatches && !ownerMatches) continue;
    // 처음 받은 계정 번호에 영구히 묶음: 다른 사용자가 같은 닉네임을 차지해도 칭호를 못 받음
    if (owner && String(owner) !== String(userId)) continue;
    if (!owner && nameMatches && userId != null) { try { Q.metaSet.run("reserved:" + g.key, String(userId)); } catch {} }
    c.titles ??= [];
    // 지급 기록만 남고 실제 칭호가 빠진 경우에도 보관함을 복구한다.
    if (!c.titles.some((t) => t.text === g.text)) {
      c.titleSeq = Math.max(c.titleSeq ?? 0, ...c.titles.map((t) => t.id)) + 1;
      c.titles.push({ id: c.titleSeq, text: g.text, color: g.color, at: Date.now() });
    }
    c.granted ??= [];
    if (!c.granted.includes(g.key)) c.granted.push(g.key);
  }
}
const ITEM_OPS = new Set(["equip", "unequip", "sell", "sellMany", "repair", "enchant", "specialReroll", "mythicReroll", "enhance", "buy", "lock", "class", "stat", "resetStats", "skills", "title", "rename"]);
const uidToken = (value) => {
  if (typeof value === "string" && !/^\d{1,10}$/.test(value)) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= 2 ** 31 ? String(n) : null;
};
const findItemByUid = (items, uid) => {
  const key = uidToken(uid);
  return key == null ? undefined : items.find((it) => it && uidToken(it.uid) === key);
};

export class World {
  constructor() {
    this.sessions = new Map(); // userId → session
    this.rooms = new Map();
    this.clock = 0; // 월드 시계(초): 모든 방이 공유
    this.parties = new Map();
    this.town = this.addRoom(new Room(this, { id: "town", kind: "town", floor: 0, map: makeTown() }));
    // 2차 업데이트: 베르단 섬 마을 (에르덴 마을 아래 선착장의 뱃사공 → 베르단 섬)
    this.town2 = this.addRoom(new Room(this, { id: "town2", kind: "town", floor: 0, map: makeVerdanTown() }));
    // 3차 업데이트: 별무덤 마을 아스트라엘 (뱃사공 → 아스트라엘)
    this.town3 = this.addRoom(new Room(this, { id: "town3", kind: "town", floor: 0, map: makeAstraTown() }));
    this.town.island = "erden"; this.town2.island = "verdan"; this.town3.island = "astra";
    this.resumes = new Map(); // 서버 재시작 뒤 던전 복귀: 파티(멤버·층)별로 다시 만든 방
    this.pvpQueue = new Map(); // PvP 대기열: userId → { at(ms), rating }
    this.pvpPairs = new Map(); // 같은 두 사람의 최근 순위전 시각 (승패 주고받기 방지)
    this.pvpTop = null;
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
    const id = setInterval(() => { try { step(); } catch (e) { console.error("loop error", e); } }, STEP / 2);
    // 한 틱에서 예외가 나도 루프·서버가 멈추지 않게 (Cloudflare는 처리 안 된 예외가 나면 서버를 통째로 재시작 → 모두 끊김)
    const step = () => {
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
    };
    id.unref?.();
    this.loop = id;
  }
  addRoom(r) { this.rooms.set(r.id, r); return r; }
  isTown(r) { return !!r && (r === this.town || r === this.town2 || r === this.town3); }
  /** 캐릭터가 머무는 섬의 마을 */
  townOf(s) {
    const c = s.char;
    if (c.island === "astra" && c.astra?.pass) return this.town3;
    return c.island === "verdan" && c.verdanPass ? this.town2 : this.town;
  }
  /** 오늘의 성좌 (별가루 2배) */
  todayStar() { return todayConstellation(); }

  tick() {
    const t0 = performance.now();
    this.clock = (this.clock ?? 0) + 1 / TICK_RATE;
    for (const r of this.rooms.values()) {
      try { r.tick(); r.flush(); } catch (e) { console.error("room tick", r.id, e); }
    }
    // 30초 넘게 다시 안 들어온 끊긴 플레이어는 정리
    if (this.tickN = (this.tickN ?? 0) + 1, this.tickN % 20 === 0) for (const s of [...this.sessions.values()]) if (s.linkdead && Date.now() - s.linkdead > 30_000) { try { this.finishClose(s); } catch (e) { console.error("finishClose", e); this.sessions.delete(s.userId); } }
    if (this.tickN % 20 === 10 && this.pvpQueue.size >= 2) { try { this.pvpMatchmake(); } catch (e) { console.error("matchmake", e); } }
    for (const r of [...this.rooms.values()]) if (!this.isTown(r) && r.players.size === 0 && Date.now() - r.createdAt > 5000) this.rooms.delete(r.id);
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
      grantReserved(old.char, u.username, u.id);
      this.save(old);
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
    this.sendPvpTop(s);
    if (!this.tryResume(s)) this.townOf(s).addPlayer(s.unit);
    this.save(s);
    this.broadcastSys(`${u.username}님이 접속했어요.`, "join");
  }
  onClose(conn) {
    const s = this.sessions.get(conn.user.id);
    if (!s || s.conn !== conn || s.deleted) return;
    // 던전에서 끊기면 30초 동안 자리 유지(몬스터가 무시, 피해 없음) → 다시 접속하면 그대로 이어감
    this.pvpQueue.delete(s.userId);
    if (s.unit.room && !this.isTown(s.unit.room) && !s.unit.dead && s.unit.room.kind !== "pvp") {
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
    const dungeon = normDungeon(r.dungeon);
    const maxFloor = dungeonMax(dungeon);
    const age = Date.now() - r.at;
    if (r.floor < 1 || r.floor > maxFloor || age < 0 || age >= 6 * 3600_000) return false; // 이상하거나 오래된 기록은 무시
    if (dungeon === 2 && !s.char.cleared) return false;
    if (dungeon >= 3 && !s.char.verdanPass) return false;
    if (dungeon === 4 && !s.char.cleared3) return false;
    if (dungeon === 5 && !s.char.astra?.pass) return false;
    s.char.island = dungeonIsland(dungeon);
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
    const where = dungeon === 5 ? `${CONSTELLATIONS[Math.ceil(r.floor / 5) - 1]?.name ?? "성좌"}의 시련 ${((r.floor - 1) % 5) + 1}단계` : `${r.floor}층`;
    s.notice(`서버 업데이트로 잠깐 끊겼어요. ${where}(으)로 돌아왔어요. (처음부터 다시 시작해요)`);
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
    if (s?.isPvpProxy) s = this.sessions.get(s.userId);
    if (!s) return;
    const now = Date.now();
    s.saveTok = Math.min(5, (s.saveTok ?? 5) + ((now - (s.saveTokAt ?? now)) / 1000) * 2);
    s.saveTokAt = now;
    if (s.saveTok >= 1) { s.saveTok -= 1; return this.save(s); }
    if (s.saveTimer) return;
    s.saveTimer = setTimeout(() => { s.saveTimer = null; if (this.sessions.get(s.userId) === s && s.dirty) this.save(s); }, 600);
  }
  save(s) {
    if (s?.isPvpProxy) s = this.sessions.get(s.userId); // 결투장 대리 세션 → 원래 캐릭터를 저장
    if (!s || s.deleted) return; // 관리자가 지운 계정: 다시 저장하지 않음
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
    if (s?.isPvpProxy) s = this.sessions.get(s.userId) ?? s;
    const c = s.char;
    return { name: c.name, level: c.level, xp: c.xp, cls: c.cls, stats: c.stats, unspent: c.unspent, skills: c.skills, equip: c.equip, inv: c.inv, cons: c.cons, gold: c.gold,
      best: c.best, checkpoint: c.checkpoint, cleared: c.cleared,
      best2: c.best2 ?? 0, checkpoint2: c.checkpoint2 ?? 1, cleared2: !!c.cleared2, abyssKeys: c.abyssKeys ?? 0, riftCrystals: c.riftCrystals ?? 0,
      best3: c.best3 ?? 0, checkpoint3: c.checkpoint3 ?? 1, cleared3: !!c.cleared3, best4: c.best4 ?? 0, checkpoint4: c.checkpoint4 ?? 1, cleared4: !!c.cleared4,
      island: c.island ?? "erden", verdanPass: !!c.verdanPass, cls2: c.cls2 ?? null, mats: c.mats ?? {}, sigils: c.sigils ?? {}, hearts: c.hearts ?? 0, reward250: !!c.reward250,
      kills: c.kills, deaths: c.deaths, prof: c.prof ?? {}, titles: c.titles ?? [], title: c.title ?? null,
      pvp: c.pvp ?? newPvpRecord(), astra: c.astra ?? newAstraRecord(), today: todayConstellation(), ...(s.pvpRoom && s.pvpChar ? { skills: s.pvpChar.skills, pvpActive: { level: s.pvpChar.level, stats: s.pvpChar.stats } } : {}) };
  }
  sendChar(s) {
    if (s?.isPvpProxy) s = this.sessions.get(s.userId) ?? s;
    const scaled = syncMythic(s.char) | syncAbyss(s.char);
    if (scaled && s.unit) refreshStats(s.unit); // 신화·심연 장비를 캐릭터 레벨에 맞춤
    // 파티원 정보(레벨·직업·체크포인트)도 최신으로
    const pp = this.partyOf(s);
    if (pp) { const c = s.char; const k = [c.level, c.cls, c.cls2, c.island, c.verdanPass, c.checkpoint, c.best, c.cleared, c.checkpoint2, c.best2, c.cleared2, c.checkpoint3, c.best3, c.cleared3, c.checkpoint4, c.best4].join("|"); if (k !== s.partyKey) { s.partyKey = k; this.sendParty(pp); } }
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
    const swordSeq = s.char.cls2 === "swordmaster" ? u.seq : null;
    const seqDone = !!swordSeq && (swordSeq.doneUntil ?? 0) > now;
    const seqLeft = swordSeq?.n ? Math.max(0, 6 - (now - (swordSeq.at ?? now))) : 0;
    const seq = s.char.cls2 === "swordmaster" ? {
      n: seqDone ? 3 : Math.max(0, Math.min(2, swordSeq?.n ?? 0)),
      left: seqDone ? Math.max(0, swordSeq.doneUntil - now) : seqLeft,
      done: seqDone,
    } : null;
    const o = { t: "me", hp: Math.ceil(u.hp), mh: u.maxHp, mp: Math.floor(u.mp), mm: u.maxMp, ki: Math.floor(u.ki), holy: Math.floor(u.holy), parts: u.parts, gap: u.gap, r2: Math.floor(u.r2 ?? 0),
      sh: u.shield ? Math.round(u.shield.amt) : 0, cds, buffs, st, seq, lv: s.char.level, xp: s.char.xp, gold: s.char.gold, stance: u.stance, acu: u.acupoint ?? 0,
      dead: u.dead ? 1 : 0, cons: s.char.cons, cs: Math.round((u.stats.cast ?? 1) * 100) / 100, spd: Math.round(u.stats.move * moveMul(u) * (u.guarding && now < u.guarding ? 0.35 : 1) * 10) / 10, pcd: Object.fromEntries(Object.entries(s.potionCd).map(([k, v]) => [k, Math.max(0, Math.round((v - Date.now())))])) };
    // 바뀐 게 없으면 보내지 않음 (최대 1초에 한 번은 보냄)
    const key = JSON.stringify([o.cs, o.hp, o.mh, o.mp, o.mm, o.ki, o.holy, o.parts, o.gap, o.r2, o.sh, o.lv, o.xp, o.gold, o.stance, o.acu, o.dead, o.cons, o.spd,
      Object.entries(o.cds).map(([k, v]) => [k, Math.round(now * 10 + v / 100)]), buffs.map((b) => [b[0], Math.round((now + b[1]) * 10), b[2]]), st.map((x) => [x[0], Math.round((now + x[1]) * 10)]), [seq?.n ?? 0, !!seq?.done, Math.ceil(seq?.left ?? 0)], Object.keys(o.pcd).filter((k) => o.pcd[k] > 0)]);
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
    // 잘못된 판매 요청은 조용히 무시하지 않고 안내한다.
    if (m.t === "sell" && uidToken(m.uid) == null) return s.notice("판매할 아이템을 찾지 못했어요. 가방을 다시 열어 주세요.");
    if (m.t === "sellMany" && !Array.isArray(m.uids)) return s.notice("판매할 아이템을 다시 선택해 주세요.");
    // 거래에 올린 아이템은 팔기·강화·인챈트·장착 금지 (확정 직전 바꿔치기 방지)
    if (s.trade && ((m.uid != null && ["sell", "enhance", "enchant", "specialReroll", "mythicReroll", "equip", "lock"].includes(m.t) && inOffer(s, m.uid)) || (m.t === "sellMany" && m.uids.some((uid) => inOffer(s, uid))))) return s.notice("거래에 올린 아이템이에요. 거래창에서 먼저 내려 주세요.");
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
      case "town": if (room?.kind === "pvp") { room.forfeit(s, "leave"); break; } if (room && !this.isTown(room)) this.toTown(s, "마을로 돌아왔어요."); break;
      case "pvp": this.pvpOp(s, m); break;
      case "retryBoss": this.retryBoss(s); break;
      case "boat": this.travelBoat(s, m.to); break;
      case "trial": this.enterTrial(s, m.c); break;
      case "bless": this.blessOp(s, m); break;
      case "story": this.markStory(s, m.n); break;
      case "class2": this.changeClass2(s, m.path); break;
      case "craft": this.craft(s, m); break;
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
      case "specialReroll": this.rerollSpecial(s, m.uid, m.index); break;
      case "mythicReroll": this.rerollSpecial(s, m.uid, 0); break;
      case "title": this.equipTitle(s, m.id); break;
      case "who": this.who(s); break;
      case "enhance": this.enhance(s, m.uid); break;
      case "lock": {
        const it = findItemByUid([...s.char.inv, ...Object.values(s.char.equip)], m.uid);
        if (it) { it.locked = !it.locked; this.sendChar(s); }
        else s.notice("잠금을 변경할 아이템을 찾지 못했어요. 가방을 다시 열어 주세요.");
        break;
      }
      case "ping": s.send({ t: "pong", c: m.c, s: Date.now() }); break;
      case "dummy": this.resetDummy(s); break;
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

  resetDummy(s) {
    const room = s.unit.room;
    if (!this.isTown(room)) return s.notice("훈련 허수아비는 마을에서만 이용할 수 있어요.");
    const dummy = [...room.units.values()].find((u) => u.dummy);
    if (!dummy) return s.notice("이 마을에는 훈련 허수아비가 없어요.");
    if (Math.hypot(dummy.x - s.unit.x, dummy.y - s.unit.y) >= 145) return s.notice("훈련 허수아비 가까이에서 G 키를 눌러 주세요.");
    dummy.dpsByPlayer?.delete(s.userId);
    s.notice("내 허수아비 피해 측정 기록을 초기화했어요.");
  }

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
    const members = [...p.members].map((id) => { const o = this.sessions.get(id); if (!o) return null; const c = o.char; return { name: o.name, cls: c.cls, cls2: c.cls2 ?? null, lv: c.level, leader: id === p.leader ? 1 : 0, cp: c.checkpoint, best: c.best, cp2: c.checkpoint2 ?? 1, best2: c.best2 ?? 0, cleared: !!c.cleared, cp3: c.checkpoint3 ?? 1, best3: c.best3 ?? 0, cleared3: !!c.cleared3, cp4: c.checkpoint4 ?? 1, best4: c.best4 ?? 0, pass: !!c.verdanPass, island: c.island ?? "erden" }; }).filter(Boolean);
    for (const id of p.members) this.sessions.get(id)?.send({ t: "party", members });
  }
  partyOp(s, op, name) {
    const p = this.partyOf(s);
    if (op === "invite") {
      const o = [...this.sessions.values()].find((x) => x.name.toLowerCase() === String(name ?? "").toLowerCase());
      if (!o || o === s) return s.notice("그 플레이어를 찾을 수 없어요.");
      if (o.partyId) return s.notice("이미 다른 파티에 있어요.");
      if (p && p.members.size >= MAX_PARTY) return s.notice("파티는 최대 4명이에요.");
      if (!this.isTown(s.unit.room) || s.unit.room !== o.unit.room) return s.notice("파티 초대는 같은 마을에서만 할 수 있어요.");
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
      if (!this.isTown(s.unit.room) || s.unit.room !== from.unit.room) return s.notice("같은 마을에서만 파티에 들어갈 수 있어요.");
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
    if (!disconnect && s.unit.room && !this.isTown(s.unit.room)) this.toTown(s, "파티를 떠나 마을로 돌아왔어요.");
  }

  // ── 던전 이동
  groupOf(s) {
    const p = this.partyOf(s);
    return p ? [...p.members].map((id) => this.sessions.get(id)).filter(Boolean) : [s];
  }
  enterDungeon(s, floor, dungeon = 1) {
    const town = s.unit.room;
    if (!this.isTown(town)) return s.notice("던전은 마을에서 들어갈 수 있어요.");
    const p = this.partyOf(s);
    if (p && p.leader !== s.userId) return s.notice("파티장만 던전 입장을 할 수 있어요.");
    const group = this.groupOf(s);
    if (group.some((g) => g.unit.room !== town)) return s.notice("파티원 모두 같은 마을에 있어야 해요.");
    dungeon = normDungeon(dungeon);
    if (dungeon === 5) return s.notice("성좌의 시련은 아스트라엘의 별자리 기록관에게서 골라 들어가요.");
    const D = DUNGEONS[dungeon], K = progKeys(dungeon), max = D.max;
    if (town.island !== D.island) return s.notice(`${D.title}은(는) ${D.island === "verdan" ? "베르단 섬" : D.island === "astra" ? "아스트라엘" : "에르덴 섬"}에 있어요.`);
    if (dungeon === 2 && !group.every((g) => g.char.cleared)) return s.notice("제2 던전은 제1 던전 100층을 정복한 모험가만 입장할 수 있어요.");
    if (dungeon >= 3 && !group.every((g) => g.char.verdanPass)) return s.notice("베르단 섬 입도를 마친 모험가만 입장할 수 있어요.");
    if (dungeon === 4 && !group.every((g) => g.char.cleared3)) return s.notice("「기억왕의 지하왕릉」은 베르단 제1 던전 100층을 돌파해야 열려요.");
    floor = Math.max(1, Math.min(max, Math.floor(Number(floor) || 1)));
    const maxCp = Math.min(...group.map((g) => g.char[K.checkpoint] ?? 1));
    const best = Math.min(...group.map((g) => g.char[K.best] ?? 0));
    const next = Math.min(max, best + 1);
    const floors = [1]; for (let f = 11; f <= maxCp; f += 10) floors.push(f);
    const bossAgain = floorKind(floor, dungeon) !== "normal" && group.every((g) => (g.char[K.best] ?? 0) >= floor);
    if (floor !== 1 && floor !== next && !bossAgain && !floors.includes(floor)) return s.notice(`시작할 수 있는 층은 1층, 이어하기(${next}층), 열린 체크포인트(최대 ${maxCp}층), 또는 모두 깬 보스층이에요.`);
    this.moveGroup(group, floor, "dungeon", { dungeon });
  }
  moveGroup(group, floor, kind, opt = {}) {
    const seed = (secureRandom() * 2 ** 31) | 0;
    const size = opt.partySize ?? group.length;
    const dungeon = normDungeon(opt.dungeon);
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
      const k = floorKind(floor, dungeon);
      if (room.astra) room.ev({ e: "msg", text: `${room.astra.sign} ${room.astra.name}의 시련 · ${room.stage}/5단계${k === "boss" ? " — 수호성" : ""}`, kind: "floor" });
      else room.ev({ e: "msg", text: `${dungeon === 1 ? "" : DUNGEONS[dungeon].title + " · "}${floor}층 ${k === "boss" ? "— 주요 보스" : k === "mid" ? "— 중간보스" : ""}`, kind: "floor" });
    }
    return room;
  }
  usePortal(room, id) {
    const group = [...room.players.values()].map((p) => p.session);
    if (!group.length) return;
    const GATES = { dungeon: 1, dungeon2: 2, dungeon3: 3, dungeon4: 4 };
    if (room.kind === "town" && GATES[id]) {
      const leader = group.find((g) => this.partyOf(g)?.leader === g.userId) ?? group[0];
      this.enterDungeon(leader, 1, GATES[id]);
      return;
    }
    const dungeon = normDungeon(room.dungeon);
    const K = progKeys(dungeon);
    if (id === "exit" || id === "next") {
      const f = room.floor + 1;
      for (const g of group) g.char[K.best] = Math.max(g.char[K.best] ?? 0, room.floor);
      this.moveGroup(group, f, "dungeon", { dungeon });
    } else if (id === "safe") {
      this.moveGroup(group, room.floor, "safe", { dungeon });
    } else if (id === "victory") {
      if (dungeon === 5) {
        this.astraReward(room); // 보통은 처치 순간에 이미 받음 (중복 없음)
        for (const g of group) { g.char.island = "astra"; this.toTown(g, `${room.astra?.name ?? "별자리"}의 시련을 마치고 아스트라엘로 돌아왔어요.`); this.sendChar(g); }
        return;
      }
      for (const g of group) {
        if (dungeon >= 3) {
          const first = !g.char[K.cleared];
          g.char[K.cleared] = true;
          g.char[K.best] = Math.max(g.char[K.best] ?? 0, room.floor);
          if (first) this.broadcastSys(dungeon === 3 ? `🏆 ${g.name}님이 베르단 섬 100층을 돌파했어요! 「기억왕의 지하왕릉」이 열렸어요.` : `🏆 ${g.name}님이 기억왕의 지하왕릉을 정복했어요!`, "legend");
          this.toTown(g, dungeon === 3 ? "베르단의 심장을 쓰러뜨렸어요! 지하왕릉이 열렸어요." : "기억왕의 잔영을 쓰러뜨렸어요! 지하왕릉을 정복했어요!");
          this.sendChar(g);
        } else if (dungeon === 2) {
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
    const dungeon = normDungeon(room.dungeon);
    const K = progKeys(dungeon), max = dungeonMax(dungeon);
    for (const p of room.players.values()) {
      const c = p.session.char;
      c[K.best] = Math.max(c[K.best] ?? 0, room.floor);
      if (isMain && room.floor < max) c[K.checkpoint] = Math.max(c[K.checkpoint] ?? 1, room.floor + 1);
      this.save(p.session);
      this.sendChar(p.session);
    }
  }
  /** 보스층을 깨면 "보스에 다시 도전하시겠습니까?" — 혼자면 본인, 파티면 파티장이 고름 */
  offerBossRetry(room, bossName) {
    if (room.kind !== "dungeon" || !this.rooms.has(room.id)) return;
    for (const p of room.players.values()) {
      const s = p.session, party = this.partyOf(s);
      s.send({ t: "bossRetry", floor: room.floor, dungeon: room.dungeon, boss: bossName, leader: !party || party.leader === s.userId ? 1 : 0 });
    }
  }
  retryBoss(s) {
    const room = s.unit.room;
    if (!room || room.kind !== "dungeon" || !room.bossCleared || room.transition) return s.notice("지금은 보스에 다시 도전할 수 없어요.");
    const party = this.partyOf(s);
    if (party && party.leader !== s.userId) return s.notice("파티장만 다시 도전을 고를 수 있어요.");
    const group = [...room.players.values()].map((p) => this.sessions.get(p.userId)).filter((g) => g && g.unit.room === room);
    if (!group.length) return;
    for (const g of group) if (g.unit.dead) { g.unit.dead = false; g.unit.hp = Math.round(g.unit.maxHp * 0.5); }
    const newRoom = this.moveGroup(group, room.floor, "dungeon", { dungeon: room.dungeon, partySize: group.length });
    for (const g of group) g.notice(`${room.floor}층 보스에 다시 도전해요!`);
    return newRoom;
  }
  vaultReply(s, ok, text, item = null) {
    s.send?.({ t: "vaultResult", ok, text, item: item ? { name: item.name, rarity: item.rarity, relic: item.relic ?? null } : null });
  }
  openAbyssVault(s) {
    const fail = (text) => { this.vaultReply(s, false, text); };
    // 보관고 창은 관문지기 창에서도 열 수 있으므로 마을 안이면 이용할 수 있다.
    if (s.unit.room !== this.town) return fail("심연 보관고는 에르덴 마을에서만 이용할 수 있어요.");
    const c = s.char;
    if ((c.abyssKeys ?? 0) < 1) return fail("심연의 열쇠가 필요해요. 심연의 감시자를 처치해 얻을 수 있어요.");
    if ((c.riftCrystals ?? 0) < 5) return fail(`균열 결정이 부족해요. 5개가 필요해요. (보유: ${c.riftCrystals ?? 0}개)`);
    if ((c.inv?.length ?? 0) >= INV_SIZE) return fail("가방이 가득 찼어요! 아이템을 정리한 뒤 다시 시도해 주세요.");
    // 심연 유물 5종은 각각 1%, 나머지 95%는 일반~전설 장비로 생성한다.
    const it = rollAbyssVaultItem(secureRandom, { ilvl: Math.max(100, Number(c.level) || 100), cls: c.cls });
    if (!it || !this.pickup(s.unit, it)) return fail("보상을 가방에 넣지 못했어요. 가방 공간을 확인해 주세요.");
    c.abyssKeys--;
    c.riftCrystals -= 5;
    this.save(s);
    this.sendChar(s);
    this.vaultReply(s, true, `심연 보관고가 열렸어요! [${it.name}]을(를) 획득했어요.`, it);
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
    const town = this.townOf(s);
    town.addPlayer(u);
    if (text) s.notice(text);
    this.save(s);
    // 새로 밝힌 별의 이야기는 아스트라엘에 돌아오는 순간 펼쳐짐 (보스 재도전·패배 귀환이어도)
    if (town === this.town3 && s.astraStories?.length) { for (const n of s.astraStories.splice(0)) this.sendStory(s, n, true); }
  }

  // ── PvP 결투장 (1대1 · 3판 2선승 · 레이팅 순위)
  pvpWhyNot(s) {
    const u = s.unit;
    if (!canPvp(s.char.cls)) return "1차 전직을 마친 캐릭터만 결투장에 들어갈 수 있어요. (레벨·장비는 결투장에서 똑같이 맞춰져요)";
    if (s.pvpRoom) return "이미 결투 중이에요.";
    if (!this.isTown(u.room)) return "결투장은 마을에서 신청할 수 있어요.";
    if (s.trade) return "거래 중에는 결투를 신청할 수 없어요.";
    if (s.linkdead || u.dead) return "지금은 결투를 신청할 수 없어요.";
    return null;
  }
  pvpOp(s, m) {
    const c = s.char;
    c.pvp ??= newPvpRecord();
    switch (m.a) {
      case "queue": {
        const why = this.pvpWhyNot(s);
        if (why) return s.notice(why);
        this.pvpQueue.set(s.userId, { at: Date.now(), rating: c.pvp.rating });
        s.send({ t: "pvpQ", on: 1, n: this.pvpQueue.size });
        s.notice("결투 상대를 찾고 있어요… (비슷한 레이팅부터, 오래 기다릴수록 범위가 넓어져요)");
        if (this.pvpQueue.size >= 2) this.pvpMatchmake();
        return;
      }
      case "leave": this.pvpQueue.delete(s.userId); s.send({ t: "pvpQ", on: 0 }); return;
      case "save": {
        if (s.pvpRoom) return s.notice("경기 중에는 결투 세팅을 바꿀 수 없어요.");
        if (!canPvp(c.cls)) return s.notice("1차 전직을 마친 뒤 결투 세팅을 저장할 수 있어요.");
        if (m.preset === "custom") {
          const st = checkPvpStats(c.cls, m.stats);
          if (typeof st === "string") return s.notice(st);
          c.pvp.stats = st; c.pvp.preset = "custom";
        } else if (PVP_PRESETS[m.preset]) c.pvp.preset = m.preset;
        if (Array.isArray(m.skills)) {
          const base = { cls: c.cls, cls2: null, level: PVP.level, stats: {}, equip: {}, skills: [] };
          const ok = new Set(availableSkills(base).filter((x) => x.kind !== "passive" && !x.path).map((x) => x.id));
          const seen = new Set();
          const list = m.skills.slice(0, SKILL_SLOTS).map((id) => (typeof id === "string" && ok.has(id) && !seen.has(id) ? (seen.add(id), id) : null));
          while (list.length < SKILL_SLOTS) list.push(null);
          if (!list.some((id) => id && SKILLS[id]?.kind === "basic")) return s.notice("기본 공격 스킬을 하나 이상 넣어 주세요.");
          c.pvp.skills = list;
        }
        this.sendChar(s);
        this.saveSoon(s);
        return s.notice("결투 세팅을 저장했어요. 다음 경기부터 이 세팅으로 싸워요.");
      }
      case "challenge": {
        const why = this.pvpWhyNot(s);
        if (why) return s.notice(why);
        const name = String(m.name ?? "").trim().toLowerCase();
        const o = [...this.sessions.values()].find((x) => x.name.toLowerCase() === name);
        if (!o || o === s) return s.notice("결투를 신청할 접속 중인 플레이어를 찾지 못했어요.");
        const why2 = this.pvpWhyNot(o);
        if (why2) return s.notice(`${o.name}님은 지금 결투를 받을 수 없어요.`);
        if ((s.pvpChallengeAt ?? 0) > Date.now()) return s.notice("결투 신청은 잠시 뒤에 다시 보낼 수 있어요.");
        s.pvpChallengeAt = Date.now() + 5000;
        o.pvpInvite = { from: s.userId, at: Date.now() };
        o.send({ t: "pvpInvite", from: s.name, cls: c.cls });
        return s.notice(`${o.name}님에게 친선 결투를 신청했어요. (순위에는 반영되지 않아요)`);
      }
      case "accept": case "decline": {
        const inv = s.pvpInvite;
        s.pvpInvite = null;
        if (!inv || Date.now() - inv.at > 30_000) return s.notice("받은 결투 신청이 없거나 시간이 지났어요.");
        const o = this.sessions.get(inv.from);
        if (!o) return s.notice("신청한 플레이어가 접속을 종료했어요.");
        if (m.a === "decline") { o.notice(`${s.name}님이 결투 신청을 거절했어요.`); return; }
        const why = this.pvpWhyNot(s) ?? this.pvpWhyNot(o);
        if (why) return s.notice(why);
        this.startPvp(o, s, false);
        return;
      }
      case "top": this.sendPvpTop(s); return;
    }
  }
  pvpMatchmake() {
    const now = Date.now();
    const list = [...this.pvpQueue.entries()].map(([id, e]) => ({ id, ...e, s: this.sessions.get(id) })).filter((e) => {
      if (!e.s || this.pvpWhyNot(e.s)) { this.pvpQueue.delete(e.id); e.s?.send({ t: "pvpQ", on: 0 }); return false; }
      return true;
    }).sort((a, b) => a.at - b.at);
    const used = new Set();
    for (const a of list) {
      if (used.has(a.id)) continue;
      let best = null;
      for (const b of list) {
        if (b.id === a.id || used.has(b.id)) continue;
        const wait = Math.max(now - a.at, now - b.at) / 1000;
        // 방금 붙은 상대와는 바로 다시 붙이지 않음 (둘 다 1분 넘게 기다렸으면 허용)
        const last = this.pvpPairs.get(this.pvpPairKey(a.id, b.id))?.at(-1) ?? 0;
        if (now - last < 120_000 && Math.min(now - a.at, now - b.at) < 60_000) continue;
        const spread = PVP.queueSpread + wait * PVP.queueSpreadPerSec;
        const d = Math.abs(a.rating - b.rating);
        if (d <= spread && (!best || d < best.d)) best = { b, d };
      }
      if (!best) continue;
      used.add(a.id); used.add(best.b.id);
      this.startPvp(a.s, best.b.s, true);
    }
  }
  startPvp(a, b, ranked) {
    if (a === b || a.pvpRoom || b.pvpRoom) return null;
    for (const s of [a, b]) { this.pvpQueue.delete(s.userId); s.send({ t: "pvpQ", on: 0 }); s.pvpInvite = null; if (s.trade) endTrade(s, "결투가 시작돼 거래가 취소됐어요."); }
    const room = this.addRoom(new PvpRoom(this, { id: "pvp" + roomSeq++, a, b, ranked }));
    room.begin();
    for (const [s, o] of [[a, b], [b, a]]) s.send({ t: "pvpStart", opp: o.name, cls: o.char.cls, rating: ranked ? o.char.pvp?.rating ?? PVP.startRating : null, ranked: ranked ? 1 : 0 });
    return room;
  }
  /** 결투장을 떠나는 순간 원래 캐릭터로 되돌림 */
  pvpRestore(s, u) {
    u.session = s;
    delete u.pvp;
    u.pvpZone = 0; u.ccDr = null; u.ccImmuneUntil = 0;
    s.pvpRoom = null; s.pvpChar = null;
    u.dead = false;
    u.status.clear(); u.buffs.clear(); u.shield = null; u.cds.clear();
    refreshStats(u);
    u.hp = u.maxHp; u.mp = u.maxMp;
    this.sendChar(s);
  }
  pvpFinish(room, winner, why) {
    const [a, b] = room.sides;
    const res = [winner === 0 ? 1 : winner === 1 ? 0 : 0.5, winner === 1 ? 1 : winner === 0 ? 0 : 0.5];
    const deltas = [0, 0];
    // 같은 두 사람이 1시간 안에 순위전을 3판 넘게 하면 레이팅은 그대로 (승패 주고받기 방지)
    let frozen = false;
    if (room.ranked) {
      const key = this.pvpPairKey(a.userId, b.userId), now = Date.now();
      const hist = (this.pvpPairs.get(key) ?? []).filter((t) => now - t < 3600_000);
      frozen = hist.length >= 3;
      hist.push(now);
      this.pvpPairs.set(key, hist);
      if (this.pvpPairs.size > 5000) for (const [k, v] of this.pvpPairs) if (now - v.at(-1) > 3600_000) this.pvpPairs.delete(k);
    }
    if (room.ranked) {
      const ra = a.char.pvp ?? newPvpRecord(), rb = b.char.pvp ?? newPvpRecord();
      deltas[0] = frozen ? 0 : eloDelta(ra.rating, rb.rating, res[0], ra.games);
      deltas[1] = frozen ? 0 : eloDelta(rb.rating, ra.rating, res[1], rb.games);
      for (const [s, rec, d, r] of [[a, ra, deltas[0], res[0]], [b, rb, deltas[1], res[1]]]) {
        rec.rating = Math.max(0, rec.rating + d);
        rec.best = Math.max(rec.best ?? 0, rec.rating);
        rec.games++;
        if (r === 1) { rec.w++; rec.streak = Math.max(0, rec.streak) + 1; }
        else if (r === 0) { rec.l++; rec.streak = Math.min(0, rec.streak) - 1; }
        else rec.d++;
        s.char.pvp = rec;
        this.save(s);
      }
    }
    for (const [i, s] of [[0, a], [1, b]]) {
      const rec = s.char.pvp ?? newPvpRecord();
      if (frozen) s.notice("같은 상대와 1시간 안에 순위전을 여러 번 해서 이번 판은 레이팅이 바뀌지 않아요.");
      s.send({ t: "pvpEnd", win: res[i] === 1 ? 1 : res[i] === 0 ? 0 : null, sc: room.score, me: i, opp: room.sides[1 - i].name, ranked: room.ranked ? 1 : 0, delta: deltas[i], rating: rec.rating, tier: pvpTier(rec.rating).name, why, log: room.log });
    }
    if (room.ranked) {
      const txt = winner < 0 ? `⚔ 결투장: ${a.name} vs ${b.name} 무승부 (${room.score[0]}:${room.score[1]})`
        : ["forfeit", "leave", "disconnect"].includes(why) ? `⚔ 결투장: ${room.sides[1 - winner].name}님의 기권으로 ${room.sides[winner].name}님이 이겼어요. (${room.score[winner]}:${room.score[1 - winner]})`
          : `⚔ 결투장: ${room.sides[winner].name}님이 ${room.sides[1 - winner].name}님을 ${Math.max(...room.score)}:${Math.min(...room.score)}로 꺾었어요!`;
      this.broadcastSys(txt, "rank");
      const ws = winner >= 0 ? room.sides[winner] : null;
      if (ws && (ws.char.pvp?.streak ?? 0) >= 3) this.broadcastSys(`🔥 ${ws.name}님 결투장 ${ws.char.pvp.streak}연승 중!`, "rank");
      this.refreshPvpTop(true);
    }
    room.schedule(3.5, () => { for (const s of room.sides) if (this.sessions.get(s.userId) === s && s.unit.room === room) this.toTown(s, "결투장에서 마을로 돌아왔어요."); });
  }
  pvpPairKey(x, y) { return x < y ? `${x}|${y}` : `${y}|${x}`; }
  refreshPvpTop(broadcast = false) {
    try { this.pvpTop = Q.pvpTop.all().slice(0, 10).map((r) => ({ n: r.username, c: r.cls, r: r.rating, w: r.w, l: r.l })); } catch { this.pvpTop = []; }
    if (broadcast) for (const s of this.sessions.values()) s.send({ t: "pvpTop", list: this.pvpTop });
  }
  sendPvpTop(s) {
    if (!this.pvpTop) this.refreshPvpTop();
    s.send({ t: "pvpTop", list: this.pvpTop });
  }

  // ── 2차 업데이트: 섬 이동 · 2차 전직 · 베르단 공방 · 250 보상
  /** 뱃사공: 세 섬을 잇는 배.
   *  베르단 첫 입도: 레벨 150 + 심연 등급 아이템 1개 공물(소모). 아스트라엘 첫 입도: 레벨 250 + 베르단 50층 돌파 (공물 없음).
   *  to: erden / verdan / astra / pay(공물 확인). 목적지가 없으면 갈 수 있는 곳을 물어봄 */
  travelBoat(s, to) {
    const c = s.char, room = s.unit.room;
    if (!this.isTown(room)) return s.notice("배는 마을 선착장에서만 탈 수 있어요.");
    const npc = room === this.town ? "boatman" : room === this.town2 ? "boatman2" : "boatman3";
    if (!this.nearNpc(s, npc, 120)) return s.notice("선착장의 뱃사공 근처에서 이용해 주세요.");
    if (this.partyOf(s)) return s.notice("파티 중에는 섬을 옮길 수 없어요. 파티를 떠난 뒤 이용해 주세요.");
    if (s.trade) return s.notice("거래 중에는 배를 탈 수 없어요.");
    const here = room.island;
    const pay = to === "pay";
    if (pay) to = "verdan";
    // 예전 화면(목적지 없음): 에르덴 ↔ 베르단 그대로
    if (to === undefined && here !== "astra") to = here === "erden" ? "verdan" : "erden";
    if (!["erden", "verdan", "astra"].includes(to) || to === here) {
      // 목적지 고르기
      const list = ["erden", "verdan", "astra"].filter((k) => k !== here).map((k) => ({ k, ok: k === "erden" || (k === "verdan" ? true : !!c.astra?.pass || this.astraWhyNot(c) == null), first: k === "verdan" ? !c.verdanPass : k === "astra" ? !c.astra?.pass : false, why: k === "astra" && !c.astra?.pass ? this.astraWhyNot(c) : null }));
      return s.send({ t: "boatPick", here, list });
    }
    if (to === "erden") { c.island = "erden"; return this.moveToTown(s, this.town, "에르덴 섬으로 돌아왔어요."); }
    if (to === "verdan") {
      if (!c.verdanPass) {
        if (c.level < 150) return s.notice("베르단 섬은 레벨 150 이상만 건널 수 있어요.");
        const idx = c.inv.findIndex((it) => it && it.rarity === "심연" && !it.locked);
        if (idx < 0) return s.notice(c.inv.some((it) => it?.rarity === "심연") ? "잠금을 푼 심연 등급 아이템이 가방에 있어야 공물로 바칠 수 있어요." : "공물로 바칠 심연 등급 아이템 1개가 가방에 있어야 해요. (장착 중인 장비는 바칠 수 없어요)");
        if (!pay) return s.send({ t: "boatAsk", item: { uid: c.inv[idx].uid, name: c.inv[idx].name } });
        const [it] = c.inv.splice(idx, 1);
        itemLog(s.userId, "verdan_tribute", { item: it.name, rarity: it.rarity });
        c.verdanPass = true;
        this.broadcastSys(`⛵ ${s.name}님이 심연의 공물을 바치고 베르단 섬에 첫발을 디뎠어요!`, "legend");
      }
      c.island = "verdan";
      return this.moveToTown(s, this.town2, "베르단 섬에 도착했어요. 2차 전직소·베르단 공방·두 던전이 기다려요.");
    }
    // 아스트라엘
    c.astra ??= newAstraRecord();
    if (!c.astra.pass) {
      const why = this.astraWhyNot(c);
      if (why) return s.notice(why);
      c.astra.pass = true;
      this.broadcastSys(`🌌 ${s.name}님이 별이 꺼진 섬, 아스트라엘에 닿았어요!`, "legend");
    }
    c.island = "astra";
    this.moveToTown(s, this.town3, "아스트라엘에 도착했어요. 꺼진 별 열세 개가 당신을 기다려요.");
    if (!c.astra.seen.includes(0)) this.sendStory(s, 0);
  }
  astraWhyNot(c) {
    if (c.level < ASTRA.needLevel) return `아스트라엘은 레벨 ${ASTRA.needLevel} 이상만 건널 수 있어요.`;
    if (!c.verdanPass || (c.best3 ?? 0) < ASTRA.needBest3) return `아스트라엘은 「베르단 제1 던전」 ${ASTRA.needBest3}층을 돌파해야 건널 수 있어요.`;
    return null;
  }
  sendStory(s, n, fresh = false) {
    const st = n === 0 ? STORY.prologue : STORY.chapters[CONSTELLATIONS[n - 1]?.key];
    if (!st) return;
    s.send({ t: "story", n, fresh, title: st.title, text: st.text, sign: n ? CONSTELLATIONS[n - 1].sign : "✦", color: n ? CONSTELLATIONS[n - 1].color : "#c8a0ff" });
  }
  markStory(s, n) {
    const a = s.char.astra;
    if (!a || !Number.isInteger(n) || n < 0 || n > 13) return;
    if (n > 0 && !a.stars[CONSTELLATIONS[n - 1].key]) return;
    if (!a.seen.includes(n)) { a.seen.push(n); s.dirty = true; }
    this.sendStory(s, n);
  }
  /** 성좌의 시련 입장 (별자리 기록관). 파티는 모두 아스트라엘 마을에 있어야 함 */
  enterTrial(s, c) {
    const town = s.unit.room;
    if (town !== this.town3) return s.notice("성좌의 시련은 아스트라엘에서만 들어갈 수 있어요.");
    if (!this.nearNpc(s, "observatory", 140)) return s.notice("별자리 기록관 엘시 근처에서 시련을 고를 수 있어요.");
    const p = this.partyOf(s);
    if (p && p.leader !== s.userId) return s.notice("파티장만 시련을 고를 수 있어요.");
    c = Math.floor(Number(c));
    const K = CONSTELLATIONS[c - 1];
    if (!K) return s.notice("고를 수 없는 별자리예요.");
    const group = this.groupOf(s);
    if (group.some((g) => g.unit.room !== town)) return s.notice("파티원 모두 아스트라엘 마을에 있어야 해요.");
    if (!group.every((g) => g.char.astra?.pass)) return s.notice("파티원 모두 아스트라엘 입도를 마쳐야 해요.");
    if (K.hidden && !group.every((g) => CONSTELLATIONS.slice(0, 12).every((k) => g.char.astra.stars[k.key]))) return s.notice("열두 별을 모두 밝힌 사람만 열세 번째 별자리에 닿을 수 있어요.");
    this.moveGroup(group, trialFloor(c, 1), "dungeon", { dungeon: 5 });
  }
  /** 수호성을 쓰러뜨린 순간 방 안 모두에게 한 번만 보상 (별 밝힘·축복·별가루). 이야기는 마을로 돌아갈 때 펼침 */
  astraReward(room) {
    if (!room.astra || room.astraDone) return;
    room.astraDone = true;
    for (const p of room.players.values()) {
      const g = p.session, n = this.astraClear(g, room);
      if (n) (g.astraStories ??= []).push(n);
    }
  }
  /** 한 사람의 시련 클리어 기록·보상. 처음 밝힌 별이면 이야기 장 번호를 돌려줌 */
  astraClear(g, room) {
    const c = g.char;
    c.astra ??= newAstraRecord();
    const K = room.astra;
    const a = c.astra;
    const first = !a.stars[K.key];
    a.clears[K.key] = Math.min(99999, (a.clears[K.key] ?? 0) + 1);
    let dust = 20 + 2 * K.id;
    if (todayConstellation() === K.id) dust *= 2;
    if (first) {
      dust += 80;
      a.stars[K.key] = true;
      if (K.bless && !a.bless[K.key]) a.bless[K.key] = 1;
      if (K.bless && a.equip.length < blessSlots(c) && !a.equip.includes(K.key)) a.equip.push(K.key);
      if (K.hidden) {
        c.titles ??= [];
        if (!c.titles.some((t) => t.text === ASTRA.title.text)) {
          c.titleSeq = Math.max(c.titleSeq ?? 0, 0, ...c.titles.map((t) => t.id)) + 1;
          c.titles.push({ id: c.titleSeq, text: ASTRA.title.text, color: ASTRA.title.color, at: Date.now() });
        }
        this.broadcastSys(`🌌 ${g.name}님이 별을 삼킨 자를 쓰러뜨리고 열세 번째 별을 되찾았어요!`, "legend");
      } else this.broadcastSys(`✦ ${g.name}님이 ${K.name}(${K.sign})의 별을 밝혔어요!`, "legend");
    }
    a.dust = Math.min(999999, (a.dust ?? 0) + dust);
    c.best5 = Math.max(c.best5 ?? 0, room.floor);
    if (g.unit.room === room) { refreshStats(g.unit); g.send({ t: "ev", list: [{ e: "msg", text: first ? `✦ ${K.name}의 별이 다시 빛나요! 별가루 ${dust}개 · 축복 「${K.bless?.name ?? "별의 칭호"}」` : `✦ ${K.name}의 시련을 다시 넘었어요. 별가루 ${dust}개`, kind: "star" }] }); }
    g.dirty = true;
    this.save(g);
    this.sendChar(g);
    return first ? K.id : 0;
  }
  /** 축복의 제단: 밝힌 별자리의 축복을 장착·해제·강화 (별가루) */
  blessOp(s, m) {
    if (s.unit.room !== this.town3 || !this.nearNpc(s, "altar", 140)) return s.notice("축복은 아스트라엘 축복의 제단에서 다룰 수 있어요.");
    const c = s.char, a = (c.astra ??= newAstraRecord());
    const K = CONST_BY_KEY[m.key];
    if (!K || !K.bless) return s.notice("알 수 없는 축복이에요.");
    if (!a.stars[K.key]) return s.notice(`${K.name}의 별을 먼저 밝혀야 해요.`);
    if (m.a === "equip") {
      if (a.equip.includes(K.key)) return;
      if (a.equip.length >= blessSlots(c)) return s.notice(`축복은 최대 ${blessSlots(c)}개까지 품을 수 있어요. 하나를 내려 주세요.`);
      a.equip.push(K.key);
    } else if (m.a === "unequip") {
      a.equip = a.equip.filter((k) => k !== K.key);
    } else if (m.a === "up") {
      const lv = a.bless[K.key] ?? 1;
      if (lv >= ASTRA.blessMax) return s.notice("이미 가장 밝게 빛나는 축복이에요.");
      const cost = blessUpCost(lv);
      if ((a.dust ?? 0) < cost) return s.notice(`별가루가 부족해요. (${cost}개 필요, 보유 ${a.dust ?? 0}개)`);
      a.dust -= cost;
      a.bless[K.key] = lv + 1;
      s.notice(`「${K.bless.name}」 축복이 ${lv + 1}단계로 밝아졌어요!`);
    } else return;
    refreshStats(s.unit);
    s.dirty = true;
    this.sendChar(s);
    this.saveSoon?.(s);
  }
  moveToTown(s, town, text) {
    const u = s.unit;
    u.room?.removePlayer(u);
    if (u.dead) u.dead = false;
    u.status.clear(); u.buffs.clear(); u.shield = null;
    town.addPlayer(u);
    if (text) s.notice(text);
    this.sendChar(s);
    this.save(s);
  }
  changeClass2(s, path) {
    const c = s.char;
    if (s.unit.room !== this.town2 || !this.nearNpc(s, "class2_master", 120)) return s.notice("2차 전직은 베르단 섬 2차 전직소에서만 할 수 있어요.");
    const why = canClass2(c, path);
    if (why) return s.notice(why);
    c.cls2 = path;
    c.skills = defaultLoadout2(c);
    s.unit.r2 = 0;
    refreshStats(s.unit);
    s.unit.hp = s.unit.maxHp;
    this.sendChar(s);
    s.unit.room.ev({ e: "fx", fx: "ui/level-up", x: s.unit.x | 0, y: s.unit.y | 0, at: s.unit.id });
    s.unit.room.ev({ e: "fx", fx: "holy/resurrection", x: s.unit.x | 0, y: s.unit.y | 0 });
    s.unit.room.ev({ e: "add", ...s.unit.room.describe(s.unit) });
    this.broadcastSys(`✨ ${s.name}님이 ${PATHS[path].name}(으)로 2차 전직했어요!`, "rank");
    itemLog(s.userId, "class2_change", { path });
    this.save(s);
  }
  /** 베르단 공방: 재료 30 + 지역 각인 1 + 골드 → 원하는 부위·수식어의 전설 장비 (섬 심장핵을 더하면 신화) */
  craft(s, m) {
    const c = s.char;
    if (s.unit.room !== this.town2 || !this.nearNpc(s, "vforge", 120)) return s.notice("베르단 공방 장인 근처에서 제작할 수 있어요.");
    const tier = Math.floor(Number(m.tier));
    const T = CRAFT_TIERS[tier];
    const vmod = String(m.vmod ?? "");
    if (!T || !CRAFT_SLOTS.includes(m.slot) || !VMODS[vmod]) return s.notice("제작 정보를 다시 골라 주세요.");
    const zone = VMODS[vmod].zone, mat = VMATS[tier];
    const heart = !!m.heart;
    if ((c.mats?.[mat.id] ?? 0) < T.mat) return s.notice(`${mat.name}이(가) 부족해요. (${c.mats?.[mat.id] ?? 0}/${T.mat})`);
    if ((c.sigils?.[zone] ?? 0) < 1) return s.notice(`「${VMODS[vmod].name}」 수식어에는 해당 지역 각인이 필요해요.`);
    if (heart && (c.hearts ?? 0) < 1) return s.notice("섬 심장핵이 없어요.");
    if (c.gold < T.gold) return s.notice(`골드가 부족해요. (${T.gold.toLocaleString()}G 필요)`);
    if (c.inv.length >= INV_SIZE) return s.notice("가방이 가득 찼어요.");
    const it = craftVerdanItem(secureRandom, { slot: m.slot, vmod, tier, cls: c.cls, level: c.level, heart });
    if (!it) return s.notice("제작에 실패했어요. 다시 시도해 주세요.");
    c.mats[mat.id] -= T.mat; c.sigils[zone] -= 1; c.gold -= T.gold; if (heart) c.hearts -= 1;
    ensureDur(it);
    if (!this.pickup(s.unit, it)) { c.mats[mat.id] += T.mat; c.sigils[zone] += 1; c.gold += T.gold; if (heart) c.hearts += 1; return s.notice("가방에 넣지 못했어요."); }
    itemLog(s.userId, "verdan_craft", { item: it.name, rarity: it.rarity, vmod, tier });
    s.send({ t: "crafted", item: { name: it.name, rarity: it.rarity } });
    if (heart) this.broadcastSys(`🔨 ${s.name}님이 섬 심장핵으로 신화 장비 [${it.name}]을(를) 벼려 냈어요!`, "mythic");
    this.sendChar(s);
    this.save(s);
  }
  /** 레벨 250: 현재 직업 전용 아이템 1개 (가방이 가득하면 비울 때까지 보류) */
  grantReward250(s) {
    const c = s.char;
    if (c.reward250 || c.level < MAX_LEVEL) return;
    if (c.inv.length >= INV_SIZE) { if (!s.reward250Warned) { s.reward250Warned = true; s.notice("레벨 250 보상을 받으려면 가방을 한 칸 비워 주세요. 마을에 돌아가면 다시 지급돼요."); } return; }
    const it = makeClassRelic(c.cls, MAX_LEVEL);
    if (!it) return;
    ensureAbyss(it); ensureDur(it);
    if (!this.pickup(s.unit, it)) return;
    c.reward250 = true;
    itemLog(s.userId, "reward250", { item: it.name, cls: c.cls });
    this.broadcastSys(`👑 ${s.name}님이 레벨 250에 도달해 [${it.name}]을(를) 받았어요!`, "legend");
    this.sendChar(s);
    this.save(s);
  }

  // ── 성장: 스탯·스킬·전직
  addStat(s, key, n) {
    const c = s.char;
    if (!CLASS_INFO[c.cls].stats.includes(key) || !STATS[key] || !Number.isSafeInteger(n) || n <= 0) return;
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
    if (!this.isTown(s.unit.room)) return s.notice("스탯 초기화는 마을 훈련 교관에게서만 할 수 있어요.");
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
      if (id && SKILLS[id]?.kind === "passive") {
        s.notice(`${SKILLS[id].name}은(는) 패시브라 장착할 필요가 없어요. 해금되면 자동 적용돼요.`);
        out.push(null);
      } else if (id && avail.has(id) && !seen.has(id)) {
        const sk = SKILLS[id];
        if (sk.exclusive && seen.has(sk.exclusive)) { s.notice(`${sk.name}은(는) ${SKILLS[sk.exclusive].name}과(와) 같이 장착할 수 없어요.`); out.push(null); continue; }
        seen.add(id); out.push(id);
      } else out.push(null);
    }
    while (out.length < SKILL_SLOTS) out.push(null);
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
    if (u.room.kind === "pvp") return s.notice("결투장에서는 소모품을 쓸 수 없어요.");
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
    if (["전설", "신화", "심연"].includes(it.rarity)) itemLog(s.userId, "drop", { name: it.name, rarity: it.rarity, ilvl: it.ilvl });
    s.send({ t: "ev", list: [{ e: "got", item: it }] });
    this.sendChar(s);
    s.dirty = true;
    return true;
  }
  equip(s, uid) {
    const c = s.char;
    const key = uidToken(uid);
    const i = key == null ? -1 : c.inv.findIndex((x) => uidToken(x.uid) === key);
    if (i < 0) return s.notice("장착할 아이템을 찾지 못했어요. 가방을 다시 열어 주세요.");
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
    const key = uidToken(uid);
    const i = key == null ? -1 : c.inv.findIndex((x) => uidToken(x.uid) === key);
    if (i < 0) return s.notice("판매할 아이템을 찾지 못했어요. 가방을 다시 열어 주세요.");
    const it = c.inv[i];
    if (it.locked) return s.notice("잠긴 아이템은 팔 수 없어요.");
    const g = sellPrice(it);
    c.inv.splice(i, 1);
    c.gold = (Number.isFinite(c.gold) ? c.gold : 0) + g;
    const enh = Number.isFinite(it.enh) ? it.enh : 0;
    if (["전설", "신화", "심연"].includes(it.rarity) || enh >= 10) itemLog(s.userId, "sell", { name: it.name, rarity: it.rarity, enh, gold: g });
    this.sendChar(s);
    s.notice(`${it.name ?? "아이템"}을(를) ${g.toLocaleString()}G에 팔았어요.`);
  }
  /** 일괄 판매: 잠긴 아이템과 이미 사라진 UID는 건너뜀 */
  sellMany(s, uids) {
    const c = s.char;
    if (!Array.isArray(uids)) return s.notice("판매할 아이템을 다시 선택해 주세요.");
    const want = new Set(uids.map(uidToken).filter((uid) => uid != null));
    if (!want.size) return s.notice("팔 아이템을 골라 주세요.");
    let n = 0, gold = 0, skipped = 0;
    c.inv = c.inv.filter((it) => {
      if (!want.has(uidToken(it.uid))) return true;
      if (it.locked) { skipped++; return true; }
      const g = sellPrice(it);
      gold += g; n++;
      const enh = Number.isFinite(it.enh) ? it.enh : 0;
      if (["전설", "신화", "심연"].includes(it.rarity) || enh >= 10) itemLog(s.userId, "sell", { name: it.name, rarity: it.rarity, enh, gold: g });
      return false;
    });
    if (!n) return s.notice(skipped ? "잠긴 아이템은 팔 수 없어요." : "판매할 아이템을 찾지 못했어요. 가방을 다시 열어 주세요.");
    c.gold = (Number.isFinite(c.gold) ? c.gold : 0) + gold;
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
      const dn = r && !this.isTown(r) ? (normDungeon(r.dungeon) === 1 ? "" : DUNGEONS[normDungeon(r.dungeon)].name + " ") : "";
      const where = !r ? "-" : r === this.town ? "에르덴 마을" : r === this.town2 ? "베르단 마을" : r === this.town3 ? "아스트라엘" : r.map?.safe ? `${dn}${r.floor}층 안전 구역` : `${dn}${r.floor}층`;
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
    const key = uidToken(uid);
    let where = "inv", it = key == null ? null : findItemByUid(c.inv, key);
    if (!it && key != null) { it = findItemByUid(Object.values(c.equip), key); where = "equip"; }
    if (!it) return s.notice("인챈트할 장비를 찾지 못했어요. 가방을 다시 열어 주세요.");
    const cost = enchantCost(it);
    if (c.gold < cost) return s.notice(`골드가 부족해요. (${cost.toLocaleString()}G 필요)`);
    c.gold -= cost;
    const before = it.ench ?? null;
    it.ench = rollEnchant(secureRandom());
    if (where === "equip") refreshStats(s.unit);
    itemLog(s.userId, "enchant", { name: it.name, rarity: it.rarity, from: before, to: it.ench, cost });
    s.send({ t: "ench", uid: it.uid, ench: it.ench, before });
    if (it.ench === "mend") this.broadcastSys(`✨ ${s.name}님이 [${it.name}]에 0.1% 확률의 '수선' 인챈트를 붙였어요!`, "legend");
    s.unit.room?.ev({ e: "fx", fx: "arcane/mana-burst", x: s.unit.x | 0, y: (s.unit.y - 10) | 0 });
    this.sendChar(s);
    this.save(s);
  }
  /** 신화·심연 장비의 고유 효과 리롤 (마법부여사) */
  rerollSpecial(s, uid, index = 0) {
    const c = s.char;
    if (!this.nearNpc(s, "enchanter")) return s.notice("마법부여사 근처에서 특수 효과를 리롤할 수 있어요.");
    const key = uidToken(uid);
    let where = "inv", it = key == null ? null : findItemByUid(c.inv, key);
    if (!it && key != null) { it = findItemByUid(Object.values(c.equip), key); where = "equip"; }
    if (!it) return s.notice("효과를 변경할 장비를 찾지 못했어요. 가방을 다시 열어 주세요.");
    let before, next, effectName;
    if (it.rarity === "신화" && MYTHIC_EFFECTS[it.mythic] && index === 0) {
      before = it.mythic;
      next = rollMythicEffect(secureRandom, before);
      effectName = MYTHIC_EFFECTS[next]?.name;
    } else if (it.rarity === "심연" && Array.isArray(it.abyssEffects) && it.abyssEffects.length === 2
      && Number.isInteger(index) && index >= 0 && index < 2 && ABYSS_EFFECTS[it.abyssEffects[index]]) {
      before = it.abyssEffects[index];
      next = rollAbyssEffect(secureRandom, before, it.abyssEffects[1 - index]);
      effectName = ABYSS_EFFECTS[next]?.name;
    } else {
      return s.notice("신화 또는 심연 등급 장비의 고유 효과만 리롤할 수 있어요.");
    }
    if (!next || next === before) return s.notice("새 특수 효과를 뽑지 못했어요. 다시 시도해 주세요.");
    const cost = specialRerollCost(it);
    if (c.gold < cost) return s.notice(`골드가 부족해요. (${cost.toLocaleString()}G 필요)`);
    c.gold -= cost;
    if (it.rarity === "신화") it.mythic = next;
    else it.abyssEffects[index] = next;
    if (where === "equip") refreshStats(s.unit);
    itemLog(s.userId, "special_reroll", { name: it.name, rarity: it.rarity, index, from: before, to: next, cost });
    s.send({ t: "specialReroll", uid: it.uid, rarity: it.rarity, index, effect: next, effectName, before, cost, name: it.name });
    s.unit.room?.ev({ e: "fx", fx: "arcane/mana-burst", x: s.unit.x | 0, y: (s.unit.y - 10) | 0 });
    this.sendChar(s);
    this.save(s);
  }
  /** 장비 수선 (대장장이): uid를 주면 그 장비만, 없으면 장착 장비 + 가방 속 장비 전부 */
  repair(s, uid) {
    const c = s.char;
    if (!this.nearNpc(s, "smithy")) return s.notice("대장장이 브론 근처에서 수선할 수 있어요.");
    const key = uid == null ? null : uidToken(uid);
    if (uid != null && key == null) return s.notice("수선할 장비를 찾지 못했어요. 가방을 다시 열어 주세요.");
    const list = [...Object.values(c.equip), ...c.inv].filter((it) => it && (key == null || uidToken(it.uid) === key)).map(ensureDur).filter((it) => it.dur < it.maxDur);
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
    const key = uidToken(uid);
    let where = "inv";
    let it = key == null ? null : findItemByUid(c.inv, key);
    if (!it && key != null) { it = findItemByUid(Object.values(c.equip), key); where = "equip"; }
    if (!it) return s.notice("강화할 장비를 찾지 못했어요. 가방을 다시 열어 주세요.");
    if (it.enh >= MAX_ENH) return s.notice("이미 최대 강화(+99)예요.");
    const cost = enhanceCost(it);
    if (c.gold < cost) return s.notice(`골드가 부족해요. (${cost}G 필요)`);
    c.gold -= cost;
    const odds = enhanceOdds(it.enh);
    const r = secureRandom();
    let result;
    if (r < odds.destroy && ["신화", "심연"].includes(it.rarity)) {
      // 신화·심연은 터져도 사라지지 않고 강화 단계만 +0으로
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
    s.send({ t: "enh", result, uid: it.uid, enh: it.enh, name: it.name, rarity: it.rarity, cost });
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
    dungeon = normDungeon(dungeon);
    // 베르단 던전으로 보내면 섬도 베르단으로 (관리자 이동은 입도 조건을 건너뜀)
    for (const g of group) {
      g.char.island = dungeonIsland(dungeon); if (dungeon >= 3) g.char.verdanPass = true;
      if (dungeon === 5) { g.char.astra ??= newAstraRecord(); g.char.astra.pass = true; }
    }
    this.moveGroup(group, floor, "dungeon", { dungeon });
    s.notice(`관리자가 ${dungeon === 1 ? "" : DUNGEONS[dungeon].title + " "}${floor}층으로 이동시켰어요.`);
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

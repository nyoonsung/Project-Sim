// 웹소켓 연결: 메시지 형식 검증, 초당 메시지 제한, 위반 기록 후 차단 (플랫폼 공용)
//   sock 어댑터: { onMessage(fn(text|null, size)), onClose(fn), send(text), close(code, why), isOpen() }
import { secLog } from "./db.js";
import { World } from "./game/world.js";

/** 게임 월드 (처음 쓸 때 생성: Cloudflare는 전역 범위에서 타이머를 못 씀) */
export let world = null;
export function initWorld() { world ??= new World(); return world; }

const isNum = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === "string" && v.length <= max;
const isId = (v) => typeof v === "string" && /^[a-z0-9_]{1,24}$/.test(v);

// 메시지 종류별 검증기
const SCHEMA = {
  // 이동 입력: 한 메시지에 틱 입력 1~4개를 묶어 보냄 [순번, x, y, 조준x, 조준y]
  in: (m) => Array.isArray(m.b) ? m.b.length >= 1 && m.b.length <= 4 && (m.c === undefined || (m.c && typeof m.c === "object" && SCHEMA.cast(m.c))) && m.b.every((e) => Array.isArray(e) && e.length === 5 && isInt(e[0], 0, 2 ** 31) && isNum(e[1], -1, 1) && isNum(e[2], -1, 1) && isNum(e[3], -1e5, 1e5) && isNum(e[4], -1e5, 1e5))
    : isInt(m.s, 0, 2 ** 31) && isNum(m.mx, -1, 1) && isNum(m.my, -1, 1) && isNum(m.ax, -1e5, 1e5) && isNum(m.ay, -1e5, 1e5),
  cast: (m) => isInt(m.slot, 0, 7) && (m.s === undefined || isInt(m.s, 0, 2 ** 31)) && isNum(m.ax, -1e5, 1e5) && isNum(m.ay, -1e5, 1e5) && (m.tx === undefined || isInt(m.tx, 0, 2 ** 31)),
  use: (m) => isId(m.item),
  chat: (m) => isStr(m.text, 120) && m.text.trim().length > 0,
  party: (m) => ["invite", "accept", "decline", "leave", "kick", "promote"].includes(m.op) && (m.name === undefined || isStr(m.name, 12)),
  enter: (m) => isInt(m.floor, 1, 100),
  vault: () => true, // 심연 보관고 교환 요청
  portal: () => true,
  vote: (m) => typeof m.ok === "boolean",
  town: () => true,
  skills: (m) => Array.isArray(m.list) && m.list.length === 8 && m.list.every((x) => x === null || isId(x)),
  stat: (m) => isId(m.key) && isInt(m.n, 1, 500),
  resetStats: () => true,
  class: (m) => isId(m.cls),
  rename: (m) => isStr(m.name, 24),
  buy: (m) => isId(m.item) && isInt(m.n, 1, 20),
  equip: (m) => isInt(m.uid, 1, 2 ** 31),
  unequip: (m) => ["weapon", "offhand", "helmet", "armor", "trinket"].includes(m.slot),
  sell: (m) => isInt(m.uid, 1, 2 ** 31),
  enhance: (m) => isInt(m.uid, 1, 2 ** 31),
  trade: (m) => ["request", "accept", "decline", "set", "ready", "confirm", "reject", "cancel"].includes(m.op) && (m.name === undefined || isStr(m.name, 12)) && (m.gold === undefined || isInt(m.gold, 0, 1e9)) && (m.uids === undefined || (Array.isArray(m.uids) && m.uids.length <= 12 && m.uids.every((u) => isInt(u, 1, 2 ** 31)))) && (m.ver === undefined || isInt(m.ver, 0, 1e9)),
  sellMany: (m) => Array.isArray(m.uids) && m.uids.length >= 1 && m.uids.length <= 60 && m.uids.every((u) => isInt(u, 1, 2 ** 31)),
  repair: (m) => m.uid === undefined || isInt(m.uid, 1, 2 ** 31),
  enchant: (m) => isInt(m.uid, 1, 2 ** 31),
  title: (m) => m.id === null || isInt(m.id, 1, 1e6),
  who: () => true,
  lock: (m) => isInt(m.uid, 1, 2 ** 31),
  ping: (m) => isNum(m.c, 0, 1e15),
  dummy: (m) => ["reset"].includes(m.op),
};

export function attachSocket(sock, user, ip) {
  const w = initWorld();
  const conn = {
    user, ip, tokens: 60, last: Date.now(), strikes: 0,
    send(obj) { if (sock.isOpen()) { try { sock.send(typeof obj === "string" ? obj : JSON.stringify(obj)); } catch {} } },
    close(code = 4000, why = "") { try { sock.close(code, why); } catch {} },
  };
  const strike = (kind, detail) => {
    // 벌점은 30초마다 1점씩 줄어듦 (예전엔 안 줄어서 오래 하다 보면 정상 유저도 쫓겨날 수 있었음)
    const now = Date.now();
    conn.strikes = Math.max(0, conn.strikes - Math.floor((now - (conn.strikeAt ?? now)) / 30_000));
    conn.strikeAt = now;
    conn.strikes++;
    secLog(kind, { userId: user.id, username: user.username, ip, detail });
    if (conn.strikes >= 8) {
      secLog("ws_kick_abuse", { userId: user.id, username: user.username, ip });
      conn.close(4008, "abuse");
    }
  };
  sock.onMessage((text, size) => {
    // 토큰 버킷: 초당 40개, 최대 60개 몰아서
    const now = Date.now();
    conn.tokens = Math.min(60, conn.tokens + ((now - conn.last) / 1000) * 40);
    conn.last = now;
    if (conn.tokens < 1) {
      // 너무 많이 보내면 그 메시지는 버리고, 벌점은 2초에 한 번만 (잠깐 몰린 것 때문에 쫓겨나지 않게)
      if (now - (conn.dropAt ?? 0) > 5000) { conn.dropAt = now; conn.dropped = 0; }
      // 5초 안에 150개 넘게 버려질 정도면 의도적인 폭주 → 바로 차단
      if (++conn.dropped > 150) { secLog("ws_kick_abuse", { userId: user.id, username: user.username, ip, detail: { flood: conn.dropped } }); conn.close(4008, "abuse"); return; }
      if (now - (conn.floodAt ?? 0) > 2000) { conn.floodAt = now; strike("ws_flood", { n: Math.round(conn.tokens) }); }
      return;
    }
    conn.tokens -= 1;
    if (text == null || size > 2048) return strike("ws_bad_frame", { len: size });
    let m;
    try { m = JSON.parse(text); } catch { return strike("ws_bad_json"); }
    if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.t !== "string") return strike("ws_bad_msg");
    const check = SCHEMA[m.t];
    if (!check || !check(m)) return strike("ws_bad_schema", { t: String(m.t).slice(0, 16) });
    try { w.onMessage(conn, m); } catch (e) { console.error("message error", e); }
  });
  sock.onClose(() => w.onClose(conn));
  w.onOpen(conn);
}

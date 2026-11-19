// 플레이어 간 거래 (골드 + 아이템)
//  흐름: 신청 → 수락 → 서로 물건·골드 올리기 → 한 명이 '거래하기' → 상대에게 수락/거절 창 → 수락하면 서버가 한 번에 교환
//  - 올린 물건·골드가 바뀌면 거래 요청이 풀림 (몰래 바꿔치기 방지)
//  - 확정 순간에 다시 전부 검사: 아이템이 그대로 가방에 있는지(올릴 때 모습과 똑같은지), 골드가 충분한지, 가방 칸이 남는지
//  - 받은 아이템은 받는 사람 번호(uid)로 새로 매김 → 아이템 복사·충돌 없음
//  - 마을에서만, 잠긴 아이템은 거래 불가, 접속이 끊기거나 마을을 떠나면 자동 취소
import { itemLog } from "../db.js";
import { INV_SIZE } from "./player.js";

const MAX_ITEMS = 12, REQ_TTL = 60_000;
const byName = (world, name) => [...world.sessions.values()].find((x) => x.name.toLowerCase() === String(name ?? "").toLowerCase());
const inTown = (world, s) => s.unit.room === world.town && !s.linkdead;
const snap = (it) => JSON.stringify(it);

function side(T, s) { return T.sides.get(s.userId); }
function other(T, s) { return T.a === s ? T.b : T.a; }
function unready(T) { for (const v of T.sides.values()) { v.ready = false; v.ok = false; } }

function view(T, s) {
  const me = side(T, s), o = other(T, s), them = side(T, o);
  const items = (sess, sd) => sd.uids.map((u) => sess.char.inv.find((i) => i.uid === u)).filter(Boolean);
  return { ver: T.ver, with: o.name, mine: { items: items(s, me), gold: me.gold, ready: me.ready, ok: me.ok }, theirs: { items: items(o, them), gold: them.gold, ready: them.ready, ok: them.ok } };
}
function push(T) { for (const s of [T.a, T.b]) s.send({ t: "trade", st: view(T, s) }); }

export function endTrade(s, why) {
  const T = s.trade;
  if (!T) return;
  for (const x of [T.a, T.b]) { x.trade = null; x.send({ t: "trade", st: null, msg: why }); }
}

export function tradeOp(world, s, m) {
  const T = s.trade;
  switch (m.op) {
    case "request": {
      const o = byName(world, m.name);
      if (!o || o === s) return s.notice("그 플레이어를 찾을 수 없어요.");
      if (!inTown(world, s) || !inTown(world, o)) return s.notice("거래는 둘 다 마을에 있을 때만 할 수 있어요.");
      if (s.trade) return s.notice("이미 거래 중이에요.");
      if (o.trade) return s.notice(`${o.name}님은 다른 사람과 거래 중이에요.`);
      const at = o.tradeReqs?.get(s.userId) ?? 0;
      if (Date.now() - at < 5000) return s.notice("방금 신청했어요. 잠시 기다려 주세요.");
      (o.tradeReqs ??= new Map()).set(s.userId, Date.now());
      o.send({ t: "tradeReq", from: s.name });
      return s.notice(`${o.name}님에게 거래를 신청했어요.`);
    }
    case "accept": case "decline": {
      const from = byName(world, m.name);
      const at = from ? s.tradeReqs?.get(from.userId) : null;
      if (!from || !at) return s.notice("거래 신청이 만료됐거나 상대가 접속해 있지 않아요.");
      s.tradeReqs.delete(from.userId);
      if (Date.now() - at > REQ_TTL) return s.notice("거래 신청이 만료됐어요. (60초)");
      if (m.op === "decline") return from.notice(`${s.name}님이 거래를 거절했어요.`);
      if (!inTown(world, s) || !inTown(world, from)) return s.notice("거래는 둘 다 마을에 있을 때만 할 수 있어요.");
      if (s.trade || from.trade) return s.notice("둘 중 한 명이 이미 거래 중이에요.");
      const NT = { ver: 1, a: from, b: s, sides: new Map([[from.userId, { uids: [], snaps: [], gold: 0, ready: false, ok: false }], [s.userId, { uids: [], snaps: [], gold: 0, ready: false, ok: false }]]) };
      from.trade = s.trade = NT;
      return push(NT);
    }
  }
  if (!T) return s.notice("거래 중이 아니에요.");
  const me = side(T, s), o = other(T, s);
  if (!inTown(world, s) || !inTown(world, o)) return endTrade(s, "한 명이 마을을 떠나서 거래가 취소됐어요.");
  switch (m.op) {
    case "set": {
      const uids = [...new Set(m.uids ?? me.uids)];
      if (uids.length > MAX_ITEMS) return s.notice(`한 번에 ${MAX_ITEMS}개까지 올릴 수 있어요.`);
      const items = uids.map((u) => s.char.inv.find((i) => i.uid === u));
      if (items.some((i) => !i)) return s.notice("가방에 있는 아이템만 올릴 수 있어요. (장착 중인 건 먼저 해제)");
      if (items.some((i) => i.locked)) return s.notice("잠긴 아이템은 거래할 수 없어요. 잠금을 풀어 주세요.");
      const gold = m.gold ?? me.gold;
      if (gold > s.char.gold) return s.notice("가진 골드보다 많이 올릴 수 없어요.");
      me.uids = uids; me.snaps = items.map(snap); me.gold = gold;
      T.ver++;
      unready(T);
      return push(T);
    }
    case "ready": {
      if (me.ready) unready(T); else me.ready = true;
      return push(T);
    }
    case "confirm": {
      // 내가 본 조건(버전)과 지금 조건이 다르면 거절: 상대가 바꾼 직후 옛 화면에서 수락 누르는 것 방지
      if (m.ver !== T.ver) { push(T); return s.notice("거래 조건이 방금 바뀌었어요. 다시 확인하고 눌러 주세요."); }
      // 한 명이 '거래하기'를 누르면 상대에게 수락/거절 창이 뜸 → 상대가 수락(=confirm)하면 바로 교환
      if (!me.uids.length && !me.gold && !side(T, o).uids.length && !side(T, o).gold) return s.notice("올린 물건이나 골드가 없어요.");
      me.ok = true;
      if (!side(T, o).ok) { push(T); return o.notice(`${s.name}님이 지금 조건으로 거래하자고 해요. 확인 후 수락해 주세요.`); }
      return execute(world, T);
    }
    case "reject": {
      const them = side(T, o);
      if (!them.ok) return;
      unready(T); push(T);
      return o.notice(`${s.name}님이 거래 조건을 거절했어요. 조건을 바꿔 다시 요청해 보세요.`);
    }
    case "cancel": return endTrade(s, `${s.name}님이 거래를 취소했어요.`);
  }
}

function execute(world, T) {
  const A = T.a, B = T.b, sa = side(T, A), sb = side(T, B);
  // 확정 순간 재검사
  const check = (s, sd) => {
    const items = sd.uids.map((u) => s.char.inv.find((i) => i.uid === u));
    if (items.some((i) => !i)) return `${s.name}님이 올린 아이템이 가방에 없어요.`;
    if (items.some((i, k) => i.locked || snap(i) !== sd.snaps[k])) return `${s.name}님이 올린 아이템이 바뀌었어요.`;
    if (sd.gold > s.char.gold) return `${s.name}님의 골드가 부족해요.`;
    return null;
  };
  const err = check(A, sa) ?? check(B, sb);
  if (err) { unready(T); push(T); for (const s of [A, B]) s.notice(err + " 다시 확인해 주세요."); return; }
  for (const [s, mine, theirs, o] of [[A, sa, sb, B], [B, sb, sa, A]]) {
    if (s.char.inv.length - mine.uids.length + theirs.uids.length > INV_SIZE) {
      unready(T); push(T);
      s.notice("가방 칸이 모자라서 받을 수 없어요. 가방을 비워 주세요."); o.notice(`${s.name}님의 가방 칸이 모자라요.`);
      return;
    }
  }
  // 교환 (한 번에)
  const take = (s, sd) => { const out = sd.uids.map((u) => s.char.inv.find((i) => i.uid === u)); s.char.inv = s.char.inv.filter((i) => !sd.uids.includes(i.uid)); return out; };
  const give = (s, items) => { for (const it of items) s.char.inv.push({ ...it, uid: s.char.nextUid++, locked: false }); };
  const fromA = take(A, sa), fromB = take(B, sb);
  give(A, fromB); give(B, fromA);
  A.char.gold += sb.gold - sa.gold; B.char.gold += sa.gold - sb.gold;
  const sum = (items) => items.map((i) => `${i.name}${i.enh ? "+" + i.enh : ""}(${i.rarity})`);
  itemLog(A.userId, "trade", { with: B.name, gave: sum(fromA), got: sum(fromB), goldGave: sa.gold, goldGot: sb.gold });
  itemLog(B.userId, "trade", { with: A.name, gave: sum(fromB), got: sum(fromA), goldGave: sb.gold, goldGot: sa.gold });
  for (const s of [A, B]) { world.save(s); world.sendChar(s); s.meDirty = true; }
  endTrade(A, "거래가 완료됐어요!");
}

/** 이 아이템이 지금 거래에 올라가 있나 (팔기·강화 등 막기용) */
export function inOffer(s, uid) { return !!s.trade && side(s.trade, s).uids.includes(uid); }

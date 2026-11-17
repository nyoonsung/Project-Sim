// 클라이언트 게임 상태: 서버 메시지 반영, 내 캐릭터 이동 예측, 입력 전송
import { applyInput } from "/shared/move.js";
import { TICK_DT, PLAYER_RADIUS, SLOT_KEYS, VIEW_W, VIEW_H } from "/shared/constants.js";
import { SKILLS } from "/shared/skills.js";
import { zoneOf, ZONES } from "/shared/zones.js";
import { TileMap } from "./render/tiles.js";

export const G = {
  net: null, ui: null, renderer: null,
  name: "", role: "player", char: null, me: null, meAt: 0,
  you: 0, map: null, room: null, kind: "town", floor: 0, zone: null, zoneName: "", objects: [], exitOpen: false, arena: null,
  ents: new Map(), projectiles: new Map(), tels: new Map(), zones: new Map(), loot: new Map(), beams: [],
  floaters: [], party: [], boss: null, shake: 0, hurtFlash: 0,
  pred: { x: 0, y: 0, px: 0, py: 0, at: 0 }, pending: [], seq: 0, forced: 0,
  keys: new Set(), mouse: { x: 0, y: 0, down: [false, false, false], wx: 0, wy: 0 }, cam: { x: 0, y: 0 },
  lastCastTry: 0, typing: false, casting: null,
};

const now = () => performance.now() / 1000;

export function send(o) { G.net.send(o); }

// ── 서버 메시지
export function onMessage(m) {
  switch (m.t) {
    case "hello":
      G.name = m.name; G.role = m.role; G.char = m.char;
      G.ui.onChar(); if (m.announce) G.ui.announce(m.announce.text);
      break;
    case "map": onMap(m); break;
    case "ents": for (const d of m.list) addEnt(d); break;
    case "s": onSnapshot(m); break;
    case "ev": for (const e of m.list) onEvent(e); break;
    case "me": G.me = m; G.meAt = now(); G.ui.onMe(); break;
    case "char": G.char = m.char; G.ui.onChar(); break;
    case "chat": G.ui.chat(m); break;
    case "party": G.party = m.members; G.ui.onParty(); break;
    case "invite": G.ui.invite(m.from); break;
    case "announce": G.ui.announce(m.text); break;
    case "kick": G.ui.kicked(m.why); break;
    case "enh": G.ui.onEnhance(m); break;
    case "tp": G.pred.x = G.pred.px = m.x; G.pred.y = G.pred.py = m.y; G.pending.length = 0; break;
  }
}

function onMap(m) {
  G.room = m.room; G.kind = m.map?.kind ?? m.kind; G.floor = m.floor; G.you = m.you;
  G.mapKind = m.kind === "town" ? "town" : m.kind === "safe" ? "safe" : m.kind;
  G.zone = m.floor ? zoneOf(m.floor) : ZONES[0];
  G.map = new TileMap({ ...m, kind: m.kind === "town" ? "town" : m.kind }, G.zone);
  G.map.doorsOpen = m.doorsOpen;
  G.objects = m.objects;
  G.exitOpen = m.exitOpen;
  G.arena = m.arena;
  G.ents.clear(); G.projectiles.clear(); G.tels.clear(); G.zones.clear(); G.loot.clear(); G.beams = []; G.floaters = [];
  G.boss = null;
  G.pred.x = G.pred.px = m.start[0]; G.pred.y = G.pred.py = m.start[1];
  G.pending.length = 0;
  G.renderer?.onMap();
  G.ui.onMap(m);
}

function addEnt(d) {
  let e = G.ents.get(d.id);
  if (!e) {
    e = { id: d.id, buf: [], x: d.x ?? 0, y: d.y ?? 0, rx: d.x ?? 0, ry: d.y ?? 0, facing: Math.PI / 2, hp: 1, fl: 0, anim: null, st: new Map(), moving: false, born: now() };
    G.ents.set(d.id, e);
  }
  Object.assign(e, { info: d, k: d.k });
  if (d.k === "d") e.facing = (d.f ?? 0) / 100;
  if (d.id === G.you) e.self = true;
}

function onSnapshot(m) {
  const t = now();
  for (const a of m.e) {
    const [id, x, y, f, hp, fl] = a;
    const e = G.ents.get(id);
    if (!e) continue;
    const moved = Math.hypot(x - e.x, y - e.y) > 0.5;
    e.x = x; e.y = y; e.facing = f / 100; e.hp = hp / 1000; e.fl = fl;
    e.buf.push([t, x, y]);
    if (e.buf.length > 12) e.buf.shift();
    if (moved) e.movedAt = t;
    e.seenAt = t;
  }
  // 내 위치 보정 (서버 위치 + 아직 확인 안 된 입력 재적용)
  const me = G.ents.get(G.you);
  if (me && G.map) {
    G.pending = G.pending.filter((p) => p.s > m.a);
    let x = me.x, y = me.y;
    const spd = G.me?.spd ?? 120;
    if (t < G.forced) { G.pred.x = x; G.pred.y = y; return; }
    for (const p of G.pending) if (!p.frozen) [x, y] = applyInput(G.map, x, y, p.mx, p.my, spd, TICK_DT, PLAYER_RADIUS);
    const ex = x - G.pred.x, ey = y - G.pred.y;
    if (Math.hypot(ex, ey) > 48) { G.pred.x = x; G.pred.y = y; G.pred.px = x; G.pred.py = y; }
    else { G.pred.x += ex * 0.35; G.pred.y += ey * 0.35; }
  }
}

function floater(x, y, text, kind) {
  G.floaters.push({ x: x + (Math.random() * 14 - 7), y, text, kind, t0: now() });
  if (G.floaters.length > 80) G.floaters.shift();
}

function onEvent(e) {
  const R = G.renderer;
  const ent = e.id != null ? G.ents.get(e.id) : null;
  switch (e.e) {
    case "add": addEnt(e); break;
    case "del": G.ents.delete(e.id); break;
    case "die":
      if (ent) {
        ent.dead = true; ent.diedAt = now();
        R?.fx(ent.k === "p" ? "spawn/soul-rise" : ent.k === "b" ? "explosions/big-explosion" : "spawn/poof", ent.rx, ent.ry - (ent.k === "p" ? 0 : 8), { s: ent.k === "b" ? 0.7 : ent.k === "p" ? 1 : 0.55 });
        if (ent.k !== "p") setTimeout(() => G.ents.get(e.id)?.dead && G.ents.delete(e.id), 400);
      }
      break;
    case "dmg":
      if (ent) {
        ent.hurtAt = now();
        floater(ent.rx, ent.ry - 34, String(e.v), e.p ? "hurt" : e.c ? "crit" : e.d ? "dot" : e.a ? "absorb" : "dmg");
        if (e.id === G.you) { G.hurtFlash = 0.35; G.shake = Math.max(G.shake, e.v > (G.me?.mh ?? 999) * 0.15 ? 5 : 2); }
        if (e.c && !e.p) G.shake = Math.max(G.shake, 1.5);
      }
      break;
    case "heal": if (ent) floater(ent.rx, ent.ry - 34, "+" + e.v, "heal"); break;
    case "miss": if (ent) floater(ent.rx, ent.ry - 34, "회피", "miss"); break;
    case "gold": if (e.own === G.you) floater(e.x, e.y - 20, `+${e.v}G`, "gold"); break;
    case "fx": R?.fx(e.fx, e.x, e.y, { a: e.a != null ? e.a / 1000 : undefined, pal: e.pal ?? undefined, s: e.s ?? undefined, follow: e.at ?? undefined }); break;
    case "anim": if (ent) ent.anim = { name: e.a, t0: now(), n: e.n ?? 1 }; break;
    case "cast": if (ent) { ent.castAng = e.a / 1000; } if (e.id === G.you) G.ui.flashSkill(e.s); break;
    case "casting": if (ent) ent.casting = { s: e.s, t0: now(), d: e.d }; if (e.id === G.you) G.casting = { s: e.s, t0: now(), d: e.d }; break;
    case "cx": if (ent) ent.casting = null; if (e.id === G.you) G.casting = null; break;
    case "pj": G.projectiles.set(e.id, { ...e, a: e.a / 1000, t0: now() }); break;
    case "pjx": { const p = G.projectiles.get(e.id); if (p) { G.projectiles.delete(e.id); } break; }
    case "tel": G.tels.set(e.id, { ...e, a: e.a / 1000, t0: now() }); setTimeout(() => G.tels.delete(e.id), (e.d + 0.25) * 1000); break;
    case "zone": G.zones.set(e.id, { ...e, t0: now() }); R?.zone(e); break;
    case "zonex": G.zones.delete(e.id); R?.zoneEnd(e.id); break;
    case "st":
      if (ent) { ent.st.set(e.s, now() + e.d); R?.statusFx(ent, e.s, e.d); }
      if (e.id === G.you && ["stun", "freeze", "down"].includes(e.s)) floater(ent?.rx ?? 0, (ent?.ry ?? 0) - 48, { stun: "기절!", freeze: "빙결!", down: "넘어짐!" }[e.s], "status");
      break;
    case "stx": if (ent) ent.st.delete(e.s); break;
    case "msg": if (!(e.kind === "self" && e.id !== G.you)) G.ui.toast(e.text, e.kind); break;
    case "notice": G.ui.toast(e.text, "info"); break;
    case "lvl": if (ent) { R?.fx("ui/level-up", ent.rx, ent.ry, { follow: e.id }); if (e.id === G.you) G.ui.center(`레벨 업! Lv.${e.l}`); } break;
    case "loot": G.loot.set(e.id, { ...e, t0: now() }); break;
    case "lootx": G.loot.delete(e.id); break;
    case "got": G.ui.gotItem(e.item); break;
    case "boss": G.boss = { id: e.id, name: e.name, mid: e.mid }; G.ui.onBoss(); break;
    case "bossdead": G.boss = null; G.ui.onBoss(); G.ui.center("보스 처치!"); break;
    case "exit": G.exitOpen = !!e.open; break;
    case "doors": if (G.map) G.map.doorsOpen = !!e.open; break;
    case "obj": G.objects.push(e.o); break;
    case "warp": G.ui.center("이동 중..."); R?.fx("arcane/portal", G.pred.x, G.pred.y, { s: 0.6 }); break;
    case "shake": G.shake = Math.max(G.shake, e.v); break;
    case "dash": if (e.id === G.you) G.forced = now() + e.d / e.v + 0.1; break;
    case "stance": if (e.id === G.you) G.ui.toast(`${e.s} 자세`, "self"); break;
    case "nores": if (e.id === G.you) G.ui.noRes(e.k); break;
    case "beam": G.beams.push({ ...e, t0: now(), d: e.d ?? 0.25 }); break;
    case "bbeam": G.beams.push({ boss: e.id, a: e.a / 1000, rot: e.rot / 1000, d: e.d, w: e.w, l: e.l, at: e.at, fx: e.fx, t0: now() }); break;
    case "parryup": if (ent) ent.parryUntil = now() + e.d; break;
    case "buff": if (e.id === G.you) G.ui.onMe(); break;
  }
}

// ── 입력 → 서버 (20Hz) + 내 이동 예측
export function inputTick() {
  if (!G.map || !G.net) return;
  let mx = 0, my = 0;
  if (!G.typing) {
    if (G.keys.has("KeyW") || G.keys.has("ArrowUp")) my -= 1;
    if (G.keys.has("KeyS") || G.keys.has("ArrowDown")) my += 1;
    if (G.keys.has("KeyA") || G.keys.has("ArrowLeft")) mx -= 1;
    if (G.keys.has("KeyD") || G.keys.has("ArrowRight")) mx += 1;
  }
  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  const s = ++G.seq;
  const ax = Math.round(G.mouse.wx), ay = Math.round(G.mouse.wy);
  send({ t: "in", s, mx: +mx.toFixed(3), my: +my.toFixed(3), ax, ay });
  const me = G.ents.get(G.you);
  const frozen = !!(me && (me.fl & (2 | 8))) || G.me?.dead || now() < G.forced;
  G.pending.push({ s, mx, my, frozen });
  if (G.pending.length > 40) G.pending.shift();
  G.pred.px = G.pred.x; G.pred.py = G.pred.y; G.pred.at = now();
  if (!frozen) [G.pred.x, G.pred.y] = applyInput(G.map, G.pred.x, G.pred.y, mx, my, G.me?.spd ?? 120, TICK_DT, PLAYER_RADIUS);
  // 누르고 있는 스킬 키 반복
  tryHeldCasts();
}

export function cdLeft(id) {
  if (!G.me?.cds?.[id]) return 0;
  return Math.max(0, G.me.cds[id] / 1000 - (now() - G.meAt));
}

const KEYCODE = { Q: "KeyQ", E: "KeyE", R: "KeyR", F: "KeyF", SHIFT: "ShiftLeft", V: "KeyV" };
function held(slotKey) {
  if (slotKey === "LMB") return G.mouse.down[0];
  if (slotKey === "RMB") return G.mouse.down[2];
  if (slotKey === "SHIFT") return G.keys.has("ShiftLeft") || G.keys.has("ShiftRight");
  return G.keys.has(KEYCODE[slotKey]);
}
function tryHeldCasts() {
  if (G.typing || G.ui.blockingWindow()) return;
  SLOT_KEYS.forEach((k, i) => { if (held(k)) tryCast(i); });
}
export function tryCast(slot) {
  const id = G.char?.skills?.[slot];
  const sk = id && SKILLS[id];
  if (!sk || sk.kind === "passive" || G.me?.dead) return;
  if (cdLeft(id) > 0.06) return;
  for (const [k, v] of Object.entries(sk.cost ?? {})) if ((G.me?.[k] ?? 0) < v) return;
  const t = now();
  if (t - G.lastCastTry < 0.09) return;
  G.lastCastTry = t;
  const msg = { t: "cast", slot, ax: Math.round(G.mouse.wx), ay: Math.round(G.mouse.wy) };
  if (sk.aim === "ally") {
    let best = null, bd = 60;
    for (const e of G.ents.values()) if (e.k === "p" && !e.dead) { const d = Math.hypot(e.rx - G.mouse.wx, e.ry - 16 - G.mouse.wy); if (d < bd) { bd = d; best = e; } }
    if (best) msg.tx = best.id;
  }
  send(msg);
  // 다음 확인 전 중복 전송 방지용 임시 쿨타임
  if (G.me) { G.me.cds = { ...G.me.cds, [id]: Math.max(G.me.cds[id] ?? 0, 150 + (now() - G.meAt) * 1000) }; }
}

/** 화면 → 월드 좌표 */
export function updateMouseWorld() {
  G.mouse.wx = G.cam.x + G.mouse.x;
  G.mouse.wy = G.cam.y + G.mouse.y;
}
export const VIEW = { W: VIEW_W, H: VIEW_H };

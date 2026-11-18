// 클라이언트 게임 상태: 서버 메시지 반영, 내 캐릭터 이동 예측, 입력 전송
import { applyInput } from "/shared/move.js";
import { KEYS } from "./keys.js";
import { castFx, hitFx, profUpFx } from "./render/skillfx.js";
import { profOf, profCost } from "/shared/prof.js";
import { onTown } from "./update.js";
import { sfx, onEnemyHit, onEnemyDie, onMeHurt } from "./feel.js";
import { TICK_DT, PLAYER_RADIUS, SLOT_KEYS, VIEW_W, VIEW_H, ITEMS } from "/shared/constants.js";
import { SKILLS } from "/shared/skills.js";
import { zoneOf, ZONES } from "/shared/zones.js";
import { TileMap } from "./render/tiles.js";

export const G = {
  net: null, ui: null, renderer: null,
  name: "", char: null, me: null, meAt: 0,
  you: 0, map: null, room: null, kind: "town", floor: 0, zone: null, zoneName: "", objects: [], exitOpen: false, arena: null,
  ents: new Map(), projectiles: new Map(), tels: new Map(), zones: new Map(), loot: new Map(), beams: [],
  floaters: [], party: [], boss: null, shake: 0, hurtFlash: 0,
  pred: { x: 0, y: 0, px: 0, py: 0, at: 0 }, local: { x: 0, y: 0 }, stick: [0, 0], touchHeld: new Set(), touch: false, aimLine: null, pending: [], seq: 0, ackSeq: 0, forced: 0,
  keys: new Set(), mouse: { x: 0, y: 0, down: [false, false, false], wx: 0, wy: 0 }, cam: { x: 0, y: 0 },
  lastCastTry: 0, typing: false, casting: null,
};

const now = () => performance.now() / 1000;

export function send(o) { G.net.send(o); }

// ── 서버 메시지
export function onMessage(m) {
  switch (m.t) {
    case "hello":
      G.name = m.name; G.char = m.char;
      G.ui.onChar(); if (m.announce) G.ui.announce(m.announce.text);
      break;
    case "map": onMap(m); break;
    case "ents": for (const d of m.list) addEnt(d); break;
    case "s": onSnapshot(m); break;
    case "ev": for (const e of m.list) onEvent(e); break;
    case "me":
      G.me = m; G.meAt = now(); G.ui.onMe();
      if (m.pf && G.char) { G.char.prof ??= {}; for (const [k, v] of Object.entries(m.pf)) { G.char.prof[k] = v; } G.ui.onProf?.(); }
      break;
    case "prof": if (G.char) { (G.char.prof ??= {})[m.s] = m.xp; G.ui.onProf?.(m.s); } break;
    case "char": G.char = m.char; G.ui.onChar(); break;
    case "chat": G.ui.chat(m); break;
    case "party": G.party = m.members; G.ui.onParty(); break;
    case "invite": G.ui.invite(m.from); break;
    case "announce": G.ui.announce(m.text); break;
    case "kick": G.ui.kicked(m.why); break;
    case "enh": G.ui.onEnhance(m); break;
    case "renamed": G.name = m.name; G.ui.toast(`닉네임을 ${m.name}(으)로 바꿨어요. 다음 로그인부터 새 닉네임으로 로그인하세요.`, "rank"); break;
    case "renameFail": G.ui.toast(m.text, "info"); break;
    case "tp": G.localDash = null; G.pred.x = G.pred.px = G.local.x = m.x; G.pred.y = G.pred.py = G.local.y = m.y; G.pending.length = 0; break;
  }
}

function onMap(m) {
  G.room = m.room; G.kind = m.map?.kind ?? m.kind; G.floor = m.floor; G.you = m.you;
  if (G.kind === "town") onTown((t) => G.ui?.center(t));
  G.mapKind = m.kind === "town" ? "town" : m.kind === "safe" ? "safe" : m.kind;
  G.zone = m.floor ? zoneOf(m.floor) : ZONES[0];
  G.map = new TileMap({ ...m, kind: m.kind === "town" ? "town" : m.kind }, G.zone);
  G.map.doorsOpen = m.doorsOpen;
  G.map.explored.fill(1); // 투기장 한 방이라 지도 전체를 바로 보여 줌
  G.wave = null;
  G.objects = m.objects;
  G.exitOpen = m.exitOpen;
  G.arena = m.arena;
  G.ents.clear(); G.projectiles.clear(); G.tels.clear(); G.zones.clear(); G.loot.clear(); G.beams = []; G.floaters = [];
  G.boss = null;
  G.localDash = null; G.chestOpened = new Set(); G.lootFly = [];
  G.pred.x = G.pred.px = G.local.x = m.start[0]; G.pred.y = G.pred.py = G.local.y = m.start[1];
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
    // 한동안 안 바뀌어 안 왔던 유닛: 직전 위치를 한 틱 전에 찍어 두어 출발이 부드럽게
    if (e.buf.length && t - e.buf[e.buf.length - 1][0] > 0.12) e.buf.push([t - 0.05, e.x, e.y]);
    e.x = x; e.y = y; e.facing = f / 100; e.hp = hp / 1000; e.fl = fl;
    e.buf.push([t, x, y]);
    if (e.buf.length > 12) e.buf.shift();
    if (moved) e.movedAt = t;
    e.seenAt = t;
  }
  // 내 위치 보정 (서버 위치 + 아직 확인 안 된 입력 재적용)
  const me = G.ents.get(G.you);
  if (me && G.map) {
    G.ackSeq = m.a;
    G.pending = G.pending.filter((p) => p.s > m.a);
    let x = me.x, y = me.y;
    const spd = G.me?.spd ?? 120;
    if (t < G.forced) { G.pred.x = x; G.pred.y = y; return; }
    for (const p of G.pending) if (!p.frozen) [x, y] = applyInput(G.map, x, y, p.mx, p.my, spd, TICK_DT, PLAYER_RADIUS);
    G.pred.x = x; G.pred.y = y;
  }
}

function floater(x, y, text, kind) {
  G.floaters.push({ x: x + (Math.random() * 14 - 7), y, text, kind, t0: now(), vx: (Math.random() - 0.5) * 30 });
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
        if (ent.k === "m" || ent.k === "b") onEnemyDie(ent);
        if (ent.k !== "p") setTimeout(() => G.ents.get(e.id)?.dead && G.ents.delete(e.id), 400);
      }
      break;
    case "dmg":
      if (ent) {
        ent.hurtAt = now();
        floater(ent.rx, ent.ry - 34, String(e.v), e.p ? "hurt" : e.c ? "crit" : e.d ? "dot" : e.a ? "absorb" : "dmg");
        if (e.id === G.you) { G.hurtFlash = 0.35; if (!e.d) onMeHurt(e.v); }
        else if ((ent.k === "m" || ent.k === "b") && !e.d && !e.a) { onEnemyHit(ent, e); hitFx(ent, e); }
      }
      break;
    case "heal": if (ent) floater(ent.rx, ent.ry - 34, "+" + e.v, "heal"); break;
    case "miss": if (ent) floater(ent.rx, ent.ry - 34, "회피", "miss"); break;
    case "gold": if (e.own === G.you) { floater(e.x, e.y - 20, `+${e.v}G`, "gold"); sfx("coin"); } break;
    case "fx": R?.fx(e.fx, e.x, e.y, { a: e.a != null ? e.a / 1000 : undefined, pal: e.pal ?? undefined, s: e.s ?? undefined, follow: e.at ?? undefined }); break;
    case "anim": if (ent) {
      // 내가 방금 미리 보여 준 동작이면 처음부터 다시 그리지 않음
      if (ent.anim?.local && ent.anim.name === e.a && now() - ent.anim.t0 < 0.45) { ent.anim.local = false; ent.anim.n = e.n ?? 1; }
      else ent.anim = { name: e.a, t0: now(), n: e.n ?? 1 };
    } break;
    case "cast": if (ent) { ent.castAng = e.a / 1000; } if (e.id === G.you) G.ui.flashSkill(e.s); castFx(e, ent); break;
    case "proflv": {
      profUpFx(e, ent);
      if (e.id === G.you) { floater((ent?.rx ?? e.x), (ent?.ry ?? e.y) - 50, `${SKILLS[e.s]?.name ?? ""} 숙련 Lv.${e.lv}!`, "crit"); sfx("level"); G.ui.onProf?.(e.s); }
      break;
    }
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
    case "lvl": if (ent) { R?.fx("ui/level-up", ent.rx, ent.ry, { follow: e.id }); if (e.id === G.you) { G.ui.center(`레벨 업! Lv.${e.l}`); sfx("level"); } } break;
    case "loot": G.loot.set(e.id, { ...e, t0: now() }); break;
    case "lootx": {
      const l = G.loot.get(e.id);
      if (l && e.fly) (G.lootFly ??= []).push({ ...l, to: e.fly, t0: now() }); // 층 클리어 자동 획득: 날아와서 쏙
      G.loot.delete(e.id);
      break;
    }
    case "chestopen": {
      (G.chestOpened ??= new Set()).add(e.id);
      sfx("item"); sfx("coin");
      floater(e.x, e.y - 30, `+${e.gold}G`, "crit");
      profUpFx({ x: e.x, y: e.y, lv: 5 }, null);
      break;
    }
    case "got": G.ui.gotItem(e.item); sfx("item"); break;
    case "boss": G.boss = { id: e.id, name: e.name, mid: e.mid }; G.ui.onBoss(); break;
    case "bossdead": G.boss = null; G.ui.onBoss(); G.ui.center("보스 처치!"); break;
    case "exit": G.exitOpen = !!e.open; break;
    case "vote": G.ui.showVote?.(e); if (!e.end && !e.yes.includes(G.you)) sfx("wave"); break;
    case "doors": if (G.map) G.map.doorsOpen = !!e.open; break;
    case "obj": G.objects.push(e.o); break;
    case "spk": (G.spikes ??= [0, 0])[e.p] = e.s; break;
    case "trap": if (e.id === G.you) { const me = G.ents.get(G.you); if (me) floater(me.rx, me.ry - 40, "가시 함정!", "hurt"); } break;
    case "wave": sfx("wave"); G.ui.center(e.n >= e.of ? `마지막 웨이브! (${e.n}/${e.of})` : `웨이브 ${e.n} / ${e.of}`); G.wave = { n: e.n, of: e.of }; break;
    case "warp": G.ui.center("이동 중..."); R?.fx("arcane/portal", G.pred.x, G.pred.y, { s: 0.6 }); break;
    case "shake": G.shake = Math.max(G.shake, e.v); break;
    case "dash": {
      if (e.id !== G.you) break;
      const D = G.localDash;
      if (D && !D.got && now() - D.t0 < 1.5) D.got = true; // 내가 미리 움직인 대시: 서버 위치 강제 맞춤 안 함
      else G.forced = now() + e.d / e.v + 0.1;
      break;
    }
    case "stance": if (e.id === G.you) G.ui.toast(`${e.s} 자세`, "self"); break;
    case "nores": if (e.id === G.you) G.ui.noRes(e.k); break;
    case "beam": G.beams.push({ ...e, t0: now(), d: e.d ?? 0.25 }); break;
    case "bbeam": G.beams.push({ boss: e.id, a: e.a / 1000, rot: e.rot / 1000, d: e.d, w: e.w, l: e.l, at: e.at, fx: e.fx, t0: now() }); break;
    case "parryup": if (ent) ent.parryUntil = now() + e.d; break;
    case "buff": if (e.id === G.you) G.ui.onMe(); break;
  }
}

// ── 입력 → 서버 (20Hz) + 내 이동 예측
export function moveDir() {
  let mx = 0, my = 0;
  if (!G.typing) {
    if (G.keys.has("KeyW") || G.keys.has("ArrowUp")) my -= 1;
    if (G.keys.has("KeyS") || G.keys.has("ArrowDown")) my += 1;
    if (G.keys.has("KeyA") || G.keys.has("ArrowLeft")) mx -= 1;
    if (G.keys.has("KeyD") || G.keys.has("ArrowRight")) mx += 1;
  }
  if (!G.typing && (G.stick[0] || G.stick[1])) { mx += G.stick[0]; my += G.stick[1]; }
  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  return [mx, my];
}
function isFrozen() {
  const me = G.ents.get(G.you);
  // 내가 방금 시전한 스킬의 시전 시간은 서버 확인을 기다리지 않고 바로 멈춤(예측) → 시전 후 뒤로 끌려가는 현상 방지
  return !!(me && (me.fl & (2 | 8))) || !!G.me?.dead || now() < G.forced || now() < (G.castFreeze ?? 0);
}

/** 매 프레임: 내 캐릭터를 키 입력대로 바로 움직임 (지연 없음).
 *  서버 확정 위치(pred)와 어긋나면 눈에 안 띄게 조금씩 맞추고, 크게 어긋나면(순간이동 등) 바로 맞춤 */
export function localStep(dt) {
  if (!G.map) return;
  const L = G.local, A = G.pred;
  // 대시: 누르는 즉시 내 화면에서 먼저 이동 (서버 위치는 뒤따라 맞춤)
  const D = G.localDash, tn = now();
  if (D && tn < D.until) { [L.x, L.y] = applyInput(G.map, L.x, L.y, D.dx, D.dy, D.speed, Math.min(dt, D.until - tn + dt), PLAYER_RADIUS); return; }
  // 대시 직후: 서버가 대시 동안 보낸 입력을 다 처리할 때까지(= 서버 위치에 대시가 반영될 때까지) 뒤로 당기지 않음
  const hold = D && !D.done && (G.ackSeq < D.seqEnd + 2 && tn < D.until + 1.2);
  if (D && !hold && !D.done) { D.done = true; G.softUntil = tn + 0.4; }
  if (!hold && isFrozen()) { const k = Math.min(1, dt * 20); L.x += (A.x - L.x) * k; L.y += (A.y - L.y) * k; return; }
  const [mx, my] = moveDir();
  if ((mx || my) && !isFrozen()) [L.x, L.y] = applyInput(G.map, L.x, L.y, mx, my, G.me?.spd ?? 120, dt, PLAYER_RADIUS);
  if (hold) return;
  const ex = A.x - L.x, ey = A.y - L.y, d = Math.hypot(ex, ey);
  // 크게 어긋나면 바로 맞춤 (단, 대시 직후엔 부드럽게)
  // 아주 크게 어긋날 때(순간이동급)만 바로 맞추고, 그 외에는 빠르게 미끄러지듯 따라감 → 툭툭 끌려가는 느낌 줄임
  if (d > (tn < (G.softUntil ?? 0) ? 200 : 140)) { L.x = A.x; L.y = A.y; }
  else if (d > 0.5) { const k = Math.min(1, dt * (d > 40 ? 10 : (mx || my) ? 4 : d < 8 ? 1.5 : 8)); [L.x, L.y] = [L.x + ex * k, L.y + ey * k]; }
}

export function inputTick() {
  if (!G.map || !G.net) return;
  let [mx, my] = moveDir();
  const ax = Math.round(G.mouse.wx), ay = Math.round(G.mouse.wy);
  // 내 화면에서 대시 중이면 이동 입력은 0 (서버도 대시 중엔 걷지 않음 → 두 위치가 그대로 일치)
  const D = G.localDash, tn = now(), dashing = D && tn < D.until;
  if (dashing) { mx = 0; my = 0; }
  // 가만히 서 있으면 입력을 보내지 않음 (서버는 입력이 없으면 정지로 처리) → 보내는 메시지 수 대폭 감소
  //  단, 멈춘 직후 한 번·조준이 크게 바뀔 때(최대 초당 4번)·대시 확인 중에는 보냄
  const still = !mx && !my, aimMoved = Math.abs(ax - (G.lastAx ?? ax)) + Math.abs(ay - (G.lastAy ?? ay)) > 12;
  const needed = !still || !G.wasStill || (D && !D.done) || (aimMoved && tn - (G.lastAimSend ?? 0) > 0.25);
  G.wasStill = still;
  if (needed) {
    const s = ++G.seq;
    if (dashing) D.seqEnd = s;
    G.lastAx = ax; G.lastAy = ay; if (aimMoved) G.lastAimSend = tn;
    (G.outBatch ??= []).push([s, +mx.toFixed(3), +my.toFixed(3), ax, ay]);
    // 두 틱씩 묶어서 전송 (멈출 때·대시 중엔 바로)
    if (G.outBatch.length >= 2 || still || dashing) flushInputs();
    const frozen = isFrozen() || dashing;
    G.pending.push({ s, mx, my, frozen });
    if (G.pending.length > 40) G.pending.shift();
    G.pred.px = G.pred.x; G.pred.py = G.pred.y; G.pred.at = tn;
    if (!frozen) [G.pred.x, G.pred.y] = applyInput(G.map, G.pred.x, G.pred.y, mx, my, G.me?.spd ?? 120, TICK_DT, PLAYER_RADIUS);
  }
  // 누르고 있는 스킬 키 반복 + 자동 사용 스킬
  tryHeldCasts();
  autoTick();
}
/** 묶어 둔 이동 입력을 바로 전송 (스킬 쓰기 직전에도 호출: 서버가 같은 위치에서 시전하도록) */
export function flushInputs() {
  if (!G.outBatch?.length) return;
  send({ t: "in", b: G.outBatch });
  G.outBatch = [];
}
/** 숙련도가 반영된 실제 소모량 (마나만 줄어듦) */
export function effCost(sk) {
  const c = { ...(sk.cost ?? {}) };
  const lv = profOf(G.char, sk.id);
  if (c.mp && lv) c.mp = Math.round(c.mp * (1 - profCost(lv)) * 10) / 10;
  return c;
}
export function cdLeft(id) {
  const t = now();
  const srv = G.me?.cds?.[id] ? Math.max(0, G.me.cds[id] / 1000 - (t - G.meAt)) : 0;
  // 누르자마자 쿨타임 표시(예측). 서버가 확인하면 서버 값, 0.6초+핑 안에 확인이 없으면(거절) 예측 취소
  const L = G.localCd?.[id];
  if (L) {
    if (srv > 0.05 && G.meAt > L.at) { delete G.localCd[id]; return srv; }
    if (t - L.at > 0.6 + (G.rtt ?? 100) / 1000) { delete G.localCd[id]; return srv; }
    return Math.max(srv, L.until - t);
  }
  return srv;
}
/** 물약: 누르자마자 반응(소리·쿨타임·개수), 실제 회복은 서버가 처리 */
export function usePotion(id) {
  const n = G.me?.cons?.[id] ?? 0;
  const left = Math.max(0, ((G.me?.pcd?.[id] ?? 0) / 1000) - (now() - G.meAt), (G.localPcd?.[id] ?? 0) - now());
  if (n <= 0 || left > 0.05 || G.me?.dead) return;
  send({ t: "use", item: id });
  sfx("potion");
  (G.localPcd ??= {})[id] = now() + (ITEMS[id]?.cd ?? 1);
  if (G.me?.cons) G.me.cons[id] = n - 1;
  const me = G.ents.get(G.you);
  if (me) floater(me.rx, me.ry - 34, id === "hp_potion" ? "+체력" : id === "mp_potion" ? "+마나" : "해독", "heal");
}

/** i번 스킬 칸 키를 누르고 있나 (키 설정 반영) */
function held(i) {
  const code = KEYS.slots[i];
  if (i === 0 && G.touchHeld.has(0)) return true;
  if (code?.startsWith("Mouse")) return !!G.mouse.down[+code.slice(5)];
  if (code?.startsWith("Shift")) return G.keys.has("ShiftLeft") || G.keys.has("ShiftRight");
  return G.keys.has(code);
}
function tryHeldCasts() {
  if (now() < (G.holdPauseUntil ?? 0)) return; // 방금 다른 스킬을 눌렀으면 그 스킬이 먼저
  if (G.typing || G.ui.blockingWindow()) return;
  for (let i = 0; i < 8; i++) if (held(i)) tryCast(i);
}
/** 스킬 시전. at = { x, y, tx } 를 주면 마우스 대신 그 지점(자동 조준·자동 사용·대시 버튼) */
export function tryCast(slot, at) {
  const id = G.char?.skills?.[slot];
  const sk = id && SKILLS[id];
  if (!sk || sk.kind === "passive" || G.me?.dead) return false;
  const left = cdLeft(id);
  if (left > 0.3) return false; // 0.3초 안에 풀리면 서버가 기억해 뒀다가 바로 시전(선입력)
  for (const [k, v] of Object.entries(effCost(sk))) if ((G.me?.[k] ?? 0) < v) return false;
  const t = now();
  if (t - G.lastCastTry < 0.05) return false;
  G.lastCastTry = t;
  const ax = at ? at.x : G.mouse.wx, ay = at ? at.y : G.mouse.wy;
  flushInputs();
  const msg = { t: "cast", slot, ax: Math.round(ax), ay: Math.round(ay), s: G.seq };
  if (at?.tx) msg.tx = at.tx;
  else if (sk.aim === "ally") {
    let best = null, bd = 60;
    for (const e of G.ents.values()) if (e.k === "p" && !e.dead) { const d = Math.hypot(e.rx - ax, e.ry - 16 - ay); if (d < bd) { bd = d; best = e; } }
    if (best) msg.tx = best.id;
  }
  send(msg);
  G.lastCastAt = t;
  // 예측: 쿨타임 바로 표시, 시전 시간이 있으면 그동안 제자리에 (서버도 똑같이 멈춤)
  if (sk.cd && sk.kind !== "basic") (G.localCd ??= {})[id] = { until: t + sk.cd, at: t };
  if (sk.cast) G.castFreeze = t + sk.cast / (G.me?.cs ?? 1);
  if (sk.steps?.some((s) => s.do === "channel")) G.castFreeze = t + (sk.steps.find((s) => s.do === "channel").dur ?? 0);
  if (sk.kind !== "basic" && !at) G.holdPauseUntil = t + 0.35;
  // 대시류(이동기): 내 화면에서 바로 출발
  const dashStep = sk.moveSkill && (sk.steps ?? []).find((st) => st.do === "dash");
  if (dashStep && left <= 0.06 && t >= (G.localDash?.until ?? 0) + 0.2 && !isFrozen()) {
    const me = G.ents.get(G.you);
    if (me) {
      // 출발점을 '서버가 이 입력까지 처리했을 때의 위치'(pred)로 맞춰 서버 대시와 정확히 같은 경로로 이동
      if (Math.hypot(G.pred.x - G.local.x, G.pred.y - G.local.y) < 24) { G.local.x = G.pred.x; G.local.y = G.pred.y; }
      let dx = ax - G.local.x, dy = ay - G.local.y; // 서버와 같은 기준(발밑)
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      G.localDash = { dx, dy, t0: t, seqEnd: G.seq, speed: dashStep.speed ?? 520, until: t + (dashStep.dist ?? 96) / (dashStep.speed ?? 520) };
    }
  }
  // 바로 동작 보여 주기 (서버 응답을 기다리지 않음)
  const ent = G.ents.get(G.you);
  if (ent && left <= 0.06 && t >= (G.localLock ?? 0) && !sk.cast) {
    ent.anim = { name: sk.anim ?? "slash", t0: t, n: 1, local: true };
    sfx(sk.moveSkill ? "dash" : sk.anim === "shoot" ? "shoot" : sk.anim === "cast" ? "magic" : "swing");
    G.localLock = t + 0.18;
    G.ui.flashSkill(id);
  }
  // 다음 확인 전 중복 전송 방지용 임시 쿨타임
  if (G.me) { G.me.cds = { ...G.me.cds, [id]: Math.max(G.me.cds[id] ?? 0, 150 + (now() - G.meAt) * 1000) }; }
  return true;
}

// ── 스킬 자동 사용 (공용 스킬 제외, 스킬마다 수동/자동 선택. 설정은 이 브라우저에 저장)
const AUTO_KEY = "abyss-auto-skills";
G.autoSkills = (() => { try { return new Set(JSON.parse(localStorage.getItem(AUTO_KEY) || "[]")); } catch { return new Set(); } })();
export const canAuto = (sk) => !!sk && sk.cls !== "common" && sk.kind !== "passive";
export function setAuto(id, on) {
  if (on) G.autoSkills.add(id); else G.autoSkills.delete(id);
  try { localStorage.setItem(AUTO_KEY, JSON.stringify([...G.autoSkills])); } catch {}
}
/** 스킬이 닿는 대략의 거리 */
function reachOf(sk) {
  if (sk.range) return sk.range;
  let r = 0;
  for (const st of sk.steps ?? []) if (st.range) r = Math.max(r, st.range + (st.do === "melee" ? 10 : 0));
  return r || 150;
}
const isHeal = (sk) => (sk.steps ?? []).some((st) => st.do === "heal");
/** 가장 가까운 살아 있는 적 */
export function nearestEnemy(range = 320) {
  const me = G.ents.get(G.you);
  if (!me) return null;
  let best = null, bd = range;
  for (const e of G.ents.values()) {
    if ((e.k !== "m" && e.k !== "b") || e.dead) continue;
    const d = Math.hypot(e.rx - me.rx, e.ry - me.ry);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function autoTick() {
  if (!G.autoSkills.size || !G.char || !G.me || G.me.dead || G.mapKind === "town" || G.mapKind === "safe") return;
  const me = G.ents.get(G.you);
  if (!me) return;
  const myHp = G.me.hp / Math.max(1, G.me.mh);
  for (let i = 0; i < 8; i++) {
    const id = G.char.skills[i], sk = SKILLS[id];
    if (!G.autoSkills.has(id) || !canAuto(sk) || cdLeft(id) > 0.06) continue;
    let at = null;
    if (sk.aim === "ally" || (sk.aim === "self" && isHeal(sk))) {
      // 회복: 체력이 낮은 아군(나 포함)에게
      let best = myHp < 0.7 ? { id: G.you, r: myHp, x: me.rx, y: me.ry } : null;
      if (sk.aim === "ally") for (const e of G.ents.values()) {
        if (e.k !== "p" || e.dead || e.id === G.you || e.hp == null) continue;
        if (e.hp < 0.7 && Math.hypot(e.rx - me.rx, e.ry - me.ry) < reachOf(sk) && (!best || e.hp < best.r)) best = { id: e.id, r: e.hp, x: e.rx, y: e.ry };
      }
      if (best) at = { x: best.x, y: best.y - 16, tx: sk.aim === "ally" ? best.id : undefined };
    } else if (sk.aim === "self") {
      const t = nearestEnemy(170);
      if (t) at = { x: t.rx, y: t.ry };
    } else {
      const t = nearestEnemy(reachOf(sk));
      if (t) at = { x: t.rx, y: t.ry };
    }
    if (at && tryCast(i, at)) return; // 한 틱에 하나
  }
}

/** 화면 → 월드 좌표 */
export function updateMouseWorld() {
  G.mouse.wx = G.cam.x + G.mouse.x;
  G.mouse.wy = G.cam.y + G.mouse.y;
}
export const VIEW = { W: VIEW_W, H: VIEW_H };

// HUD: 체력·자원·경험치, 스킬바, 물약, 버프, 채팅, 알림, 보스바, 미니맵, 파티창
import { G, send, cdLeft, tryCast, effCost, usePotion } from "../game.js";
import { KEYS, keyLabel } from "../keys.js";
import { profLevel, isUncapped } from "/shared/prof.js";
import { h, $, tipOn, retrigger } from "./dom.js";
import { SKILLS } from "/shared/skills.js";
import { SLOT_KEYS, ITEMS, TILE, T, GRADE_COLOR } from "/shared/constants.js";
import { xpToNext, CLASS_INFO } from "/shared/classes.js";
import { skillTip } from "./windows.js";
import { skillIconURL } from "./icons.js";
import { pixImg } from "./pix.js";

const RES = { sword: ["ki", "내력", 100], fist: ["ki", "내력", 100], priest: ["holy", "성광", 100], smith: ["parts", "부품", 3], rogue: ["gap", "틈", 3] };
const BUFF_NAME = { riposte: "반격 기회", imun: "이문정주", sidestep: "횡이동", dance: "권무", acupoint: "점혈", evasion: "이베이젼", absolute: "앱솔루트", footwork: "발놀림", poison_blade: "독날", afterimage: "잔영", track: "약점 추적", precise: "정밀 시전", echo: "잔향", eo_burst: "어검발산", hymn_atk: "축복(공격)", hymn_def: "축복(방어)", zone_dr: "회랑", circuit: "회로", swift_kill: "질주", m_guard: "가호", flash_edge: "일섬 여진", eo_tempest: "회천 폭풍", king_resolve: "권왕의 결의", night_hunt: "밤의 사냥", forge_oath: "대장간 서약", sword_saint: "검성의 기백", fist_king: "권왕의 기백", heaven_bow: "천궁의 가호", execution_flow: "처형의 흐름", apocalypse_aftershock: "종말의 여진", blink_ward: "차원 보호막" };
const ST_NAME = { burn: "화상", poison: "중독", bleed: "출혈", slow: "감속", root: "속박", stun: "기절", down: "넘어짐", freeze: "빙결", shock: "감전", weaken: "약화", blind: "실명" };

let slotEls = [];
export function buildHud() {
  const bar = $("#skillbar");
  bar.replaceChildren();
  slotEls = SLOT_KEYS.map((k, i) => {
    const el = h("div", { class: "slot", onmousedown: (e) => { e.stopPropagation(); } }, h("span", { class: "key", text: keyLabel(KEYS.slots[i]) }), h("div", { class: "cd" }), h("span", { class: "nm" }), h("span", { class: "cdt" }));
    tipOn(el, () => { const id = G.char?.skills?.[i]; return id ? skillTip(SKILLS[id]) : [h("div", { text: "빈 칸 — 스킬 창(K)에서 장착" })]; });
    bar.append(el);
    return el;
  });
  const pots = $("#potions");
  pots.replaceChildren(...["hp_potion", "mp_potion", "antidote"].map((id, i) => {
    const el = h("div", { class: "slot pot", onclick: () => usePotion(id) }, pixImg(id, "pic", 3), h("span", { class: "key", text: keyLabel(KEYS.potions[i]) }), h("div", { class: "cd" }), h("span", { class: "nm" }), h("span", { class: "cnt" }), h("span", { class: "cdt" }));
    el.dataset.item = id;
    el.classList.add("pot-" + i);
    tipOn(el, () => [h("div", { class: "tt-name", text: ITEMS[id].name }), h("div", { text: ITEMS[id].desc }), h("div", { class: "tt-sub", text: `재사용 대기 ${ITEMS[id].cd}초 · 마을 상인에게서 구입` })]);
    return el;
  }));
}

// 바뀐 값만 DOM에 씀 (매 프레임 스타일을 다시 쓰면 약한 기기에서 렉의 큰 원인)
const setText = (el, v) => { if (el._t !== v) { el._t = v; el.textContent = v; } };
const setVar = (el, k, v) => { const c = "_" + k; if (el[c] !== v) { el[c] = v; el.style.setProperty(k, v); } };
const setTf = (el, v) => { if (el._tf !== v) { el._tf = v; el.style.transform = v; } };
const toggle = (el, c, on) => { const k = "_c" + c; if (el[k] !== on) { el[k] = on; el.classList.toggle(c, on); } };
export function updateSkillbar() {
  const skills = G.char?.skills ?? [];
  slotEls.forEach((el, i) => {
    const id = skills[i], sk = id && SKILLS[id];
    const nm = el.querySelector(".nm"), cd = el.querySelector(".cd"), cdt = el.querySelector(".cdt");
    toggle(el, "empty", !sk);
    setText(nm, sk ? sk.name : "");
    if (el._bc !== (sk?.grade ?? "")) { el._bc = sk?.grade ?? ""; el.style.borderColor = sk ? GRADE_COLOR[sk.grade] : ""; }
    setVar(el, "--gc", sk ? GRADE_COLOR[sk.grade] : "#59527a");
    // 숙련도 배지 (Lv.1 이상)
    const plv = sk && sk.kind !== "passive" ? profLevel(G.char?.prof?.[id] ?? 0, id).lv : 0;
    if (el._plv !== plv) {
      el._plv = plv;
      let b = el.querySelector(".plv");
      if (!plv) b?.remove();
      else { if (!b) { b = h("span", { class: "plv" }); el.append(b); } b.textContent = plv >= 10 && !isUncapped(id) ? "M" : plv; b.className = "plv" + (plv >= 10 ? " t2" : plv >= 5 ? " t1" : ""); }
    }
    if (el.dataset.sid !== (id ?? "")) {
      el.dataset.sid = id ?? "";
      el.querySelector(".ic")?.remove();
      if (sk) el.prepend(h("img", { class: "ic", src: skillIconURL(sk), alt: "", draggable: "false" }));
    }
    if (sk && sk.kind !== "passive") {
      const left = cdLeft(id);
      const total = sk.kind === "basic" ? sk.aspd : sk.cd;
      // 기본 공격은 쿨타임 표시 없음 (공격 속도만큼 자동 반복)
      const frac = sk.kind === "basic" ? 0 : Math.min(1, left / (total || 1));
      const fq = Math.round(frac * 60) / 60; // 60단계면 눈으로 구분 안 됨
      setTf(cd, `scaleY(${fq})`);
      setVar(el, "--p", fq.toFixed(3));
      // 쿨타임이 끝나는 순간 반짝
      if (el._cd > 0.15 && left <= 0.02 && sk.kind !== "basic") { retrigger(el, "ready"); }
      el._cd = left;
      setText(cdt, left > 0.3 && sk.kind !== "basic" ? String(left >= 10 ? Math.ceil(left) : left.toFixed(1)) : "");
      // 자원 부족 표시
      let lack = false;
      for (const [k, v] of Object.entries(effCost(sk))) if ((G.me?.[k] ?? 0) < v) lack = true;
      toggle(el, "nores", lack);
    } else { setTf(cd, "scaleY(0)"); setText(cdt, sk ? "패시브" : ""); }
  });
  for (const el of $("#potions").children) {
    const id = el.dataset.item;
    const n = G.me?.cons?.[id] ?? G.char?.cons?.[id] ?? 0;
    setText(el.querySelector(".nm"), ITEMS[id].name.replace(" 물약", ""));
    setText(el.querySelector(".cnt"), String(n));
    toggle(el, "none", n <= 0);
    const left = Math.max(0, ((G.me?.pcd?.[id] ?? 0) / 1000) - (performance.now() / 1000 - G.meAt), (G.localPcd?.[id] ?? 0) - performance.now() / 1000);
    const pf = Math.round(Math.min(1, left / ITEMS[id].cd) * 60) / 60;
    setTf(el.querySelector(".cd"), `scaleY(${pf})`);
    setVar(el, "--p", pf.toFixed(3));
    setText(el.querySelector(".cdt"), left > 0.3 ? String(Math.ceil(left)) : "");
  }
}

export function flashSkill(id) {
  const i = G.char?.skills?.indexOf(id);
  if (i >= 0 && slotEls[i]) { retrigger(slotEls[i], "flash"); }
}

export function updateBars() {
  const m = G.me;
  if (!m) return;
  // 바뀐 것만 DOM에 씀 (같은 값을 다시 쓰면 휴대폰에서 매번 레이아웃·다시 그리기가 일어나 렉)
  const set = (sel, v, max, text) => { const b = $(sel); const w = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100)).toFixed(1)}%`; const f = b.querySelector(".fill"); if (f._w !== w) { f._w = w; f.style.width = w; } setText(b.querySelector("span"), text); };
  set("#orbs .hp", m.hp, m.mh, `HP ${m.hp.toLocaleString()} / ${m.mh.toLocaleString()}${m.sh ? `  (+${m.sh})` : ""}`);
  // 체력이 30% 아래면 체력바가 깜빡이고 화면 가장자리가 붉게
  const low = !m.dead && m.hp > 0 && m.hp / Math.max(1, m.mh) < 0.3;
  if (document.body._low !== low) { document.body._low = low; document.body.classList.toggle("lowhp", low); }
  const lv = $("#hud-lv");
  if (lv) setText(lv, String(m.lv));
  const shEl = $("#orbs .hp .shield"), shW = `${Math.min(100, ((m.sh ?? 0) / m.mh) * 100).toFixed(1)}%`;
  if (shEl._w !== shW) { shEl._w = shW; shEl.style.width = shW; }
  set("#orbs .mp", m.mp, m.mm, `MP ${m.mp} / ${m.mm}`);
  const need = xpToNext(m.lv);
  set("#orbs .xp", m.xp, need, `Lv.${m.lv}  ${((m.xp / need) * 100).toFixed(1)}%`);
  // 골드·물약 개수
  const c = m.cons ?? G.char?.cons ?? {};
  // 장착 장비 중 내구도가 가장 낮은 것 경고
  let wp = null;
  for (const it of Object.values(G.char?.equip ?? {})) if (it?.dur != null && (!wp || it.dur / it.maxDur < wp.dur / wp.maxDur)) wp = it;
  const SN = { weapon: "무기", offhand: "보조장비", helmet: "투구", armor: "갑옷", trinket: "장신구" };
  const durTxt = wp && wp.dur <= wp.maxDur * 0.2 ? (wp.dur <= 0 ? `   ⚠ ${SN[wp.slot]} 부서짐!` : `   ⚠ ${SN[wp.slot]} 내구도 ${Math.floor((wp.dur / wp.maxDur) * 100)}%`) : "";
  const w = `${(m.gold ?? G.char?.gold ?? 0).toLocaleString()} G${durTxt}`;
  void c;
  const we = $("#wallet");
  if (we._t !== w) { we._t = w; we.textContent = w; }
  const res = RES[G.char?.cls];
  const rb = $("#orbs .res");
  if (rb._hid !== !res) { rb._hid = !res; rb.classList.toggle("hidden", !res); }
  if (res) {
    let text = `${res[1]} ${m[res[0]]} / ${res[2]}`;
    if (G.char.cls === "sword") text += `  · ${m.stance} 자세`;
    if (G.char.cls === "fist" && m.acu) text += `  · 점혈 ${m.acu}단계`;
    set("#orbs .res", m[res[0]], res[2], text);
  }
  // 버프·상태
  const bf = $("#buffs");
  const bl = [...(m.buffs ?? []).filter(([id]) => !id.startsWith("hot_")).map(([id, left, n]) => ["buff", `${BUFF_NAME[id] ?? id}${n ? " " + n : ""} ${left > 0 && left < 60 ? Math.ceil(left) + "s" : ""}`]),
    ...(m.st ?? []).map(([id, left]) => ["buff debuff", `${ST_NAME[id] ?? id} ${Math.ceil(left)}s`])];
  const bk = bl.map((x) => x.join("|")).join("~");
  if (bf._k !== bk) { bf._k = bk; bf.replaceChildren(...bl.map(([c, t]) => h("span", { class: c, text: t }))); }
  const dov = $("#dead-overlay");
  if (dov._d !== !!m.dead) { dov._d = !!m.dead; dov.classList.toggle("hidden", !m.dead); }
}

// ── 채팅
export function chatLine(m) {
  const log = $("#chat-log");
  const line = h("div", { class: m.kind ?? "say" });
  if (m.from) {
    line.append(h("b", { text: m.from + (m.kind === "party" ? " (파티)" : "") + ": " }), document.createTextNode(m.text));
  } else line.textContent = m.text;
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 10;
  log.append(line);
  // 10초 지나면 흐려져 사라짐 (Enter로 채팅창을 열면 다시 다 보임)
  setTimeout(() => line.classList.add("fade"), 10000);
  while (log.children.length > 120) log.firstChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

export function toast(text, kind = "info") {
  for (const t of $("#toasts").children) if (t.textContent === text) return;
  const el = h("div", { class: `toast ${kind}`, text });
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 4000);
  while ($("#toasts").children.length > 6) $("#toasts").firstChild.remove();
}
/** 파티 이동 투표 창 (파티원 전원이 동의해야 이동) */
export function showVote(e) {
  let el = $("#vote");
  if (e.end) {
    if (el) el.remove();
    if (e.why) toast(e.why);
    return;
  }
  const mine = e.yes.includes(G.you);
  const box = h("div", { id: "vote" },
    h("div", { class: "vt", text: `${e.label} 이동 투표 · ${e.yes.length}/${e.need}명 동의` }),
    e.by ? h("div", { class: "vs", text: `${e.by}님이 이동을 제안했어요.` }) : null,
    mine ? h("div", { class: "vs", text: "동의했어요. 다른 파티원을 기다리는 중..." })
      : h("div", { class: "vb" },
        h("button", { class: "btn primary", onclick: () => send({ t: "vote", ok: true }) }, "동의 (Y)"),
        h("button", { class: "btn", onclick: () => send({ t: "vote", ok: false }) }, "거절 (N)")));
  if (el) el.replaceWith(box); else $("#ui").append(box);
}
let centerTimer;
export function center(text) {
  const el = $("#center-msg");
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(centerTimer);
  centerTimer = setTimeout(() => (el.style.opacity = 0), 1600);
}

export function updateBoss() {
  const bb = $("#bossbar");
  // 매 프레임 불리므로 바뀐 것만 씀
  if (!G.boss) { if (bb._on !== false) { bb._on = false; bb.classList.add("hidden"); } return; }
  const e = G.ents.get(G.boss.id);
  if (bb._on !== true) { bb._on = true; bb.classList.remove("hidden"); }
  setText(bb.querySelector(".bname"), `${G.boss.mid ? "중간보스" : "보스"} · ${G.boss.name}`);
  const f = bb.querySelector(".bfill"), w = `${((e?.hp ?? 1) * 100).toFixed(1)}%`;
  if (f._w !== w) { f._w = w; f.style.width = w; }
}

export function updateZoneLabel() {
  const z = $("#zone-label");
  if (G.kind === "town" || G.mapKind === "town") z.textContent = "모험가 마을";
  else if (G.mapKind === "safe") z.textContent = `${G.dungeon === 2 ? "제2 던전 " : ""}${G.floor}층 안전 구역 · 전직소`;
  else z.textContent = `제${G.dungeon === 2 ? "2" : "1"} 던전 · ${G.floor}층 · ${G.zone?.name ?? ""}`;
}

let partyKey = "";
export function updateParty() {
  const pf = $("#party-frames");
  const list = G.party.filter((m) => m.name !== G.name).map((m) => {
    let ent = null;
    for (const e of G.ents.values()) if (e.k === "p" && e.info?.n === m.name) { ent = e; break; }
    return { m, dead: !!ent?.dead, hp: Math.round((ent?.hp ?? 1) * 100) };
  });
  // 바뀐 게 없으면 화면을 건드리지 않음 (예전엔 0.2초마다 통째로 다시 만들었음)
  const key = list.map((x) => `${x.m.name}|${x.m.leader}|${x.m.lv}|${x.m.cls}|${x.dead}|${x.hp}`).join(";");
  if (key === partyKey) return;
  partyKey = key;
  pf.replaceChildren(...list.map(({ m, dead, hp }) => {
    const el = h("div", { class: "pf" + (dead ? " dead" : "") }, h("div", { text: `${m.leader ? "★ " : ""}${m.name}  Lv.${m.lv} ${CLASS_INFO[m.cls]?.name ?? ""}` }), h("div", { class: "pbar" }, h("div")));
    el.querySelector(".pbar > div").style.width = `${hp}%`;
    return el;
  }));
}

// ── 미니맵
const mmCache = new WeakMap();
export function drawMinimap() {
  drawMapOn($("#minimap"), 3);
  const big = $("#bigmap");
  if (big && !big.classList.contains("hidden")) drawMapOn(big, 10, true);
}
export function toggleBigMap() { $("#bigmap").classList.toggle("hidden"); drawMinimap(); }
function drawMapOn(cv, maxS, big) {
  const g = cv.getContext("2d");
  const M = G.map;
  if (!M) return;
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = big ? "#08070bee" : "#08070bdd";
  g.fillRect(0, 0, cv.width, cv.height);
  const s = Math.min((cv.width - (big ? 20 : 0)) / M.w, (cv.height - (big ? 40 : 0)) / M.h, maxS);
  const ox = (cv.width - M.w * s) / 2, oy = (cv.height - M.h * s) / 2;
  const town = G.mapKind === "town";
  // 최적화: 지형(타일 수천 개)은 지도마다 한 번만 그려 두고 0.2초마다 그 그림만 붙임 (예전엔 매번 타일마다 fillRect → 주기적 끊김)
  const key = `${cv.width}x${cv.height}|${big ? 1 : 0}|${town ? 1 : 0}`;
  let cache = mmCache.get(M);
  if (!cache || cache.key !== key) {
    const c = new OffscreenCanvas(cv.width, cv.height), cg = c.getContext("2d");
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      if (!town && !M.explored[y * M.w + x]) continue;
      const t = M.tiles[y * M.w + x];
      if (t === T.VOID) continue;
      cg.fillStyle = t === T.WALL ? (town ? "#a64a36" : "#5a5466") : t === T.WATER ? "#2a5a90" : t === T.PIT ? "#000" : town ? (t === T.GRASS ? "#3e6a30" : "#a08a68") : "#2a2634";
      cg.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
    }
    cache = { key, c };
    mmCache.set(M, cache);
  }
  g.drawImage(cache.c, 0, 0);
  for (const o of G.objects) {
    if (o.kind === "portal") { g.fillStyle = o.id === "exit" && !G.exitOpen ? "#555" : "#7ff0ff"; g.fillRect(ox + (o.x / TILE) * s - 2, oy + (o.y / TILE) * s - 2, 4, 4); }
    if (o.kind === "npc") { g.fillStyle = "#9ef0a0"; g.fillRect(ox + (o.x / TILE) * s - 1, oy + (o.y / TILE) * s - 1, 3, 3); }
  }
  for (const e of G.ents.values()) {
    if (e.dead) continue;
    const x = ox + (e.rx / TILE) * s, y = oy + (e.ry / TILE) * s;
    if (e.k === "p") { g.fillStyle = e.id === G.you ? "#fff" : "#5ab0ff"; g.fillRect(x - 2, y - 2, 4, 4); }
    else if (e.k === "b") { g.fillStyle = "#ff3050"; g.fillRect(x - 3, y - 3, 6, 6); }
    else if (e.k === "m" && e.info?.m !== "dummy" && performance.now() / 1000 - (e.seenAt ?? 0) < 1) { g.fillStyle = e.info?.el ? "#ffa040" : "#ff4a5a"; const r = big ? 3 : 2; g.fillRect(x - r / 2, y - r / 2, r, r); }
  }
  // 웨이브·남은 적
  if (G.wave && G.mapKind !== "town") {
    let alive = 0;
    for (const e of G.ents.values()) if (e.k === "m" && !e.dead) alive++;
    const text = G.exitOpen ? "출구 열림!" : `웨이브 ${G.wave.n}/${G.wave.of} · 적 ${alive}`;
    g.font = big ? "14px Galmuri11" : "9px Galmuri9";
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "#000"; g.fillText(text, cv.width / 2 + 1, cv.height - 2);
    g.fillStyle = G.exitOpen ? "#7ff0ff" : "#ffd35a"; g.fillText(text, cv.width / 2, cv.height - 3);
  }
  if (big) { g.font = "16px Galmuri11"; g.textAlign = "center"; g.textBaseline = "top"; g.fillStyle = "#ffd35a"; g.fillText(G.mapKind === "town" ? "모험가 마을" : `${G.dungeon === 2 ? "제2 던전 " : ""}${G.floor}층 · ${G.zone?.name ?? ""}`, cv.width / 2, 8); }
}

// 상호작용 안내
export function interactTarget() {
  const me = G.ents.get(G.you);
  if (!me) return null;
  let best = null, bd = 90;
  for (const o of G.objects) {
    if (o.kind !== "npc") continue;
    const d = Math.hypot(o.x - me.rx, o.y - me.ry);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
export function updateInteract() {
  const t = interactTarget();
  const el = $("#interact-hint");
  const txt = t ? `[G] ${t.name}와(과) 대화` : "";
  if (el._t === txt) return; // 바뀔 때만 화면 갱신
  el._t = txt;
  el.classList.toggle("hidden", !t);
  if (t) el.textContent = txt;
}

export { tryCast };
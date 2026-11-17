// HUD: 체력·자원·경험치, 스킬바, 물약, 버프, 채팅, 알림, 보스바, 미니맵, 파티창
import { G, send, cdLeft, tryCast } from "../game.js";
import { h, $, tipOn } from "./dom.js";
import { SKILLS } from "/shared/skills.js";
import { SLOT_KEYS, ITEMS, TILE, T, GRADE_COLOR } from "/shared/constants.js";
import { xpToNext, CLASS_INFO } from "/shared/classes.js";
import { skillTip } from "./windows.js";
import { skillIconURL } from "./icons.js";

const RES = { sword: ["ki", "내력", 100], fist: ["ki", "내력", 100], priest: ["holy", "성광", 100], smith: ["parts", "부품", 3], rogue: ["gap", "틈", 3] };
const BUFF_NAME = { riposte: "반격 기회", imun: "이문정주", sidestep: "횡이동", dance: "권무", acupoint: "점혈", evasion: "이베이젼", absolute: "앱솔루트", footwork: "발놀림", poison_blade: "독날", afterimage: "잔영", track: "약점 추적", precise: "정밀 시전", echo: "잔향", eo_burst: "어검발산", hymn_atk: "축복(공격)", hymn_def: "축복(방어)", zone_dr: "회랑", circuit: "회로", swift_kill: "질주", m_guard: "가호" };
const ST_NAME = { burn: "화상", poison: "중독", bleed: "출혈", slow: "감속", root: "속박", stun: "기절", down: "넘어짐", freeze: "빙결", shock: "감전", weaken: "약화", blind: "실명" };

let slotEls = [];
export function buildHud() {
  const bar = $("#skillbar");
  bar.replaceChildren();
  slotEls = SLOT_KEYS.map((k, i) => {
    const el = h("div", { class: "slot", onmousedown: (e) => { e.stopPropagation(); } }, h("span", { class: "key", text: k === "SHIFT" ? "⇧" : k }), h("div", { class: "cd" }), h("span", { class: "nm" }), h("span", { class: "cdt" }));
    tipOn(el, () => { const id = G.char?.skills?.[i]; return id ? skillTip(SKILLS[id]) : [h("div", { text: "빈 칸 — 스킬 창(K)에서 장착" })]; });
    bar.append(el);
    return el;
  });
  const pots = $("#potions");
  pots.replaceChildren(...["hp_potion", "mp_potion", "antidote"].map((id, i) => {
    const el = h("div", { class: "slot", onclick: () => { send({ t: "use", item: id }); G.ui.sfx?.("potion"); } }, h("span", { class: "key", text: String(i + 1) }), h("div", { class: "cd" }), h("span", { class: "nm" }), h("span", { class: "cdt" }));
    el.dataset.item = id;
    el.classList.add("pot-" + i);
    tipOn(el, () => [h("div", { class: "tt-name", text: ITEMS[id].name }), h("div", { text: ITEMS[id].desc }), h("div", { class: "tt-sub", text: `재사용 대기 ${ITEMS[id].cd}초 · 마을 상인에게서 구입` })]);
    return el;
  }));
}

export function updateSkillbar() {
  const skills = G.char?.skills ?? [];
  slotEls.forEach((el, i) => {
    const id = skills[i], sk = id && SKILLS[id];
    const nm = el.querySelector(".nm"), cd = el.querySelector(".cd"), cdt = el.querySelector(".cdt");
    el.classList.toggle("empty", !sk);
    nm.textContent = sk ? sk.name : "";
    el.style.borderColor = sk ? GRADE_COLOR[sk.grade] : "";
    el.style.setProperty("--gc", sk ? GRADE_COLOR[sk.grade] : "#59527a");
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
      cd.style.transform = `scaleY(${frac})`;
      el.style.setProperty("--p", frac.toFixed(3));
      // 쿨타임이 끝나는 순간 반짝
      if (el._cd > 0.15 && left <= 0.02 && sk.kind !== "basic") { el.classList.remove("ready"); void el.offsetWidth; el.classList.add("ready"); }
      el._cd = left;
      cdt.textContent = left > 0.3 && sk.kind !== "basic" ? (left >= 10 ? Math.ceil(left) : left.toFixed(1)) : "";
      // 자원 부족 표시
      let lack = false;
      for (const [k, v] of Object.entries(sk.cost ?? {})) if ((G.me?.[k] ?? 0) < v) lack = true;
      el.classList.toggle("nores", lack);
    } else { cd.style.transform = "scaleY(0)"; cdt.textContent = sk ? "패시브" : ""; }
  });
  for (const el of $("#potions").children) {
    const id = el.dataset.item;
    el.querySelector(".nm").textContent = `${ITEMS[id].name.replace(" 물약", "")}\n${G.me?.cons?.[id] ?? G.char?.cons?.[id] ?? 0}`;
    const left = Math.max(0, ((G.me?.pcd?.[id] ?? 0) / 1000) - (performance.now() / 1000 - G.meAt));
    el.querySelector(".cd").style.transform = `scaleY(${Math.min(1, left / ITEMS[id].cd)})`;
    el.style.setProperty("--p", Math.min(1, left / ITEMS[id].cd).toFixed(3));
    el.querySelector(".cdt").textContent = left > 0.3 ? Math.ceil(left) : "";
  }
}

export function flashSkill(id) {
  const i = G.char?.skills?.indexOf(id);
  if (i >= 0 && slotEls[i]) { slotEls[i].classList.remove("flash"); void slotEls[i].offsetWidth; slotEls[i].classList.add("flash"); }
}

export function updateBars() {
  const m = G.me;
  if (!m) return;
  const set = (sel, v, max, text) => { const b = $(sel); b.querySelector(".fill").style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`; b.querySelector("span").textContent = text; };
  set("#orbs .hp", m.hp, m.mh, `HP ${m.hp.toLocaleString()} / ${m.mh.toLocaleString()}${m.sh ? `  (+${m.sh})` : ""}`);
  $("#orbs .hp .shield").style.width = `${Math.min(100, (m.sh / m.mh) * 100)}%`;
  set("#orbs .mp", m.mp, m.mm, `MP ${m.mp} / ${m.mm}`);
  const need = xpToNext(m.lv);
  set("#orbs .xp", m.xp, need, `Lv.${m.lv}  ${((m.xp / need) * 100).toFixed(1)}%`);
  const res = RES[G.char?.cls];
  const rb = $("#orbs .res");
  rb.classList.toggle("hidden", !res);
  if (res) {
    let text = `${res[1]} ${m[res[0]]} / ${res[2]}`;
    if (G.char.cls === "sword") text += `  · ${m.stance} 자세`;
    if (G.char.cls === "fist" && m.acu) text += `  · 점혈 ${m.acu}단계`;
    set("#orbs .res", m[res[0]], res[2], text);
  }
  // 버프·상태
  const bf = $("#buffs");
  bf.replaceChildren(...(m.buffs ?? []).filter(([id]) => !id.startsWith("hot_")).map(([id, left, n]) => h("span", { class: "buff", text: `${BUFF_NAME[id] ?? id}${n ? " " + n : ""} ${left > 0 && left < 60 ? Math.ceil(left) + "s" : ""}` })),
    ...(m.st ?? []).map(([id, left]) => h("span", { class: "buff debuff", text: `${ST_NAME[id] ?? id} ${Math.ceil(left)}s` })));
  $("#dead-overlay").classList.toggle("hidden", !m.dead);
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
  if (!G.boss) return bb.classList.add("hidden");
  const e = G.ents.get(G.boss.id);
  bb.classList.remove("hidden");
  bb.querySelector(".bname").textContent = `${G.boss.mid ? "중간보스" : "보스"} · ${G.boss.name}`;
  bb.querySelector(".bfill").style.width = `${(e?.hp ?? 1) * 100}%`;
}

export function updateZoneLabel() {
  const z = $("#zone-label");
  if (G.kind === "town" || G.mapKind === "town") z.textContent = "모험가 마을";
  else if (G.mapKind === "safe") z.textContent = `${G.floor}층 안전 구역 · 전직소`;
  else z.textContent = `${G.floor}층 · ${G.zone?.name ?? ""}`;
}

export function updateParty() {
  const pf = $("#party-frames");
  pf.replaceChildren(...G.party.filter((m) => m.name !== G.name).map((m) => {
    const ent = [...G.ents.values()].find((e) => e.k === "p" && e.info?.n === m.name);
    const el = h("div", { class: "pf" + (ent?.dead ? " dead" : "") }, h("div", { text: `${m.leader ? "★ " : ""}${m.name}  Lv.${m.lv} ${CLASS_INFO[m.cls]?.name ?? ""}` }), h("div", { class: "pbar" }, h("div")));
    el.querySelector(".pbar > div").style.width = `${(ent?.hp ?? 1) * 100}%`;
    return el;
  }));
}

// ── 미니맵
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
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
    if (!town && !M.explored[y * M.w + x]) continue;
    const t = M.tiles[y * M.w + x];
    if (t === T.VOID) continue;
    g.fillStyle = t === T.WALL ? (town ? "#a64a36" : "#5a5466") : t === T.WATER ? "#2a5a90" : t === T.PIT ? "#000" : town ? (t === T.GRASS ? "#3e6a30" : "#a08a68") : "#2a2634";
    g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
  }
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
  if (big) { g.font = "16px Galmuri11"; g.textAlign = "center"; g.textBaseline = "top"; g.fillStyle = "#ffd35a"; g.fillText(G.mapKind === "town" ? "모험가 마을" : `${G.floor}층 · ${G.zone?.name ?? ""}`, cv.width / 2, 8); }
}

// 상호작용 안내
export function interactTarget() {
  const me = G.ents.get(G.you);
  if (!me) return null;
  let best = null, bd = 70;
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
  el.classList.toggle("hidden", !t);
  if (t) el.textContent = `[G] ${t.name}와(과) 대화`;
}

export { tryCast };

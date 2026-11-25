// DOM 도우미: 사용자 입력은 항상 textContent로 넣어 XSS를 막는다 (innerHTML 금지)
import { pixImg, WIN_TABS } from "./pix.js";
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);

// ── 툴팁
const tip = () => $("#tooltip");
export function showTip(e, build) {
  const t = tip();
  t.replaceChildren(...[].concat(build()));
  t.classList.remove("hidden");
  moveTip(e);
}
export function moveTip(e) {
  const t = tip();
  const w = t.offsetWidth, hgt = t.offsetHeight;
  let x = e.clientX + 16, y = e.clientY + 16;
  if (x + w > innerWidth - 8) x = e.clientX - w - 12;
  if (y + hgt > innerHeight - 8) y = innerHeight - hgt - 8;
  t.style.left = x + "px"; t.style.top = y + "px";
}
export function hideTip() { tip().classList.add("hidden"); }
export function tipOn(el, build) {
  el.addEventListener("mouseenter", (e) => { if (document.body.classList.contains("touch") && el.closest("#skillbar, #potions")) return; showTip(e, build); });
  el.addEventListener("mousemove", moveTip);
  el.addEventListener("mouseleave", hideTip);
  return el;
}

// ── 창 (끌어서 이동)
const wins = new Map();
let z = 10;
/** 창 겹침 순서: 숫자가 끝없이 커져 툴팁(설명 창)보다 위로 올라가는 버그 방지 → 일정 이상이면 순서대로 다시 매김 */
function bumpZ() {
  if (z > 400) {
    const list = [...wins.values()].sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));
    z = 10;
    for (const w of list) w.style.zIndex = ++z;
  }
  return ++z;
}
export function openWin(id, title, build, { x, y, w, onClose } = {}) {
  let win = wins.get(id);
  if (!win) {
    const body = h("div", { class: "body" });
    // 주요 창(캐릭터·가방·스킬…)은 머리 줄 왼쪽에 아이콘 탭 → 눌러서 같은 자리에 다른 창으로 전환
    const tabs = WIN_TABS.some(([t]) => t === id) ? h("div", { class: "win-tabs" }, ...WIN_TABS.map(([t, nm]) => {
      const b = h("button", { class: "win-tab" + (t === id ? " on" : ""), title: nm, onclick: (e) => { e.stopPropagation(); switchTab(id, t); } });
      b.append(pixImg(t));
      return b;
    })) : null;
    const head = h("header", { class: tabs ? "tabbed" : "" }, tabs, h("span", { class: "wt", text: title }), h("span", { class: "x", text: "✕", onclick: () => closeWin(id) }));
    win = h("div", { class: "win" + (tabs ? " has-tabs" : "") }, head, body);
    win.dataset.id = id;
    if (w) win.style.width = w + "px";
    $("#windows").append(win);
    const touch = document.body.classList.contains("touch");
    const viewport = globalThis.visualViewport;
    const viewW = viewport?.width ?? innerWidth;
    const viewH = viewport?.height ?? innerHeight;
    if (touch && w) win.style.width = Math.min(w, viewW - 16) + "px";
    const ww = Math.min(w ?? 360, viewW - 16);
    win.style.left = Math.max(8, Math.min(viewW - ww - 8, x ?? viewW / 2 - ww / 2 + (touch ? 0 : (wins.size % 4) * 24))) + "px";
    win.style.top = (y ?? Math.max(touch ? 6 : 10, viewH * (touch ? 0.03 : 0.12) + (touch ? 0 : (wins.size % 4) * 24))) + "px";
    // 창 아래가 화면 밖으로 잘리지 않게: 위치에서 화면 아래까지만 (내용은 창 안에서 스크롤)
    win.style.maxHeight = Math.max(160, Math.min(viewH * (touch ? 1 : 0.84), viewH - parseFloat(win.style.top) - 8)) + "px";
    let drag = null;
    head.addEventListener("pointerdown", (e) => { if (e.target.classList.contains("x") || e.target.closest(".win-tab")) return; drag = [e.clientX - win.offsetLeft, e.clientY - win.offsetTop, e.pointerId]; head.setPointerCapture(e.pointerId); win.style.zIndex = bumpZ(); e.preventDefault(); });
    head.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag[2]) return;
      const vw = globalThis.visualViewport?.width ?? innerWidth;
      const vh = globalThis.visualViewport?.height ?? innerHeight;
      win.style.left = Math.max(-win.offsetWidth + 60, Math.min(vw - 60, e.clientX - drag[0])) + "px";
      win.style.top = Math.max(0, Math.min(vh - 40, e.clientY - drag[1])) + "px";
    });
    head.addEventListener("pointerup", () => (drag = null));
    head.addEventListener("pointercancel", () => (drag = null));
    win.addEventListener("pointerdown", () => (win.style.zIndex = bumpZ()));
    wins.set(id, win);
    win._build = build;
    win._onClose = onClose;
  }
  win._build = build;
  win.style.zIndex = bumpZ();
  refreshWin(id);
  return win;
}
function switchTab(from, to) {
  if (from === to) return;
  const old = wins.get(from);
  const pos = old ? [old.style.left, old.style.top] : null;
  closeWin(from);
  if (wins.has(to)) closeWin(to);
  document.querySelector(`#menu-buttons [data-win="${to}"]`)?.click();
  const nw = wins.get(to);
  if (nw && pos) { nw.style.left = pos[0]; nw.style.top = pos[1]; }
}
export function refreshWin(id) {
  const win = wins.get(id);
  if (!win) return;
  const body = win.querySelector(".body");
  const st = body.scrollTop;
  body.replaceChildren(...[].concat(win._build()).filter((x) => x != null && x !== false));
  body.scrollTop = st;
}
/** 여러 창을 한꺼번에: 스크롤 위치를 먼저 다 읽고 → 내용 교체 → 스크롤 복원 (화면 배치 계산을 창마다 두 번씩 하던 것을 한 번으로) */
export function refreshWins(ids) {
  const list = [];
  for (const id of ids) { const win = wins.get(id); if (win) { const body = win.querySelector(".body"); list.push([win, body, body.scrollTop]); } }
  const built = list.map(([win]) => [].concat(win._build()).filter((x) => x != null && x !== false));
  list.forEach(([, body], i) => body.replaceChildren(...built[i]));
  for (const [, body, st] of list) if (st) body.scrollTop = st;
}
export function closeWin(id) { const w = wins.get(id); if (w) { w.remove(); wins.delete(id); hideTip(); w._onClose?.(); } }
export function isOpen(id) { return wins.has(id); }
export function toggleWin(id, open) { if (wins.has(id)) closeWin(id); else open(); }
export function openWins() { return [...wins.keys()]; }
export function closeAll() { for (const id of [...wins.keys()]) closeWin(id); }

/** CSS 애니메이션 다시 재생: 강제 레이아웃(offsetWidth 읽기) 없이 다음 프레임에 클래스를 다시 붙임 */
export function retrigger(el, cls) {
  el.classList.remove(cls);
  requestAnimationFrame(() => el.classList.add(cls));
}

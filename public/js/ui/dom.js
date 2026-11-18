// DOM 도우미: 사용자 입력은 항상 textContent로 넣어 XSS를 막는다 (innerHTML 금지)
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
export function openWin(id, title, build, { x, y, w } = {}) {
  let win = wins.get(id);
  if (!win) {
    const body = h("div", { class: "body" });
    const head = h("header", {}, h("span", { text: title }), h("span", { class: "x", text: "✕", onclick: () => closeWin(id) }));
    win = h("div", { class: "win" }, head, body);
    win.dataset.id = id;
    if (w) win.style.width = w + "px";
    $("#windows").append(win);
    const touch = document.body.classList.contains("touch");
    if (touch && w) win.style.width = Math.min(w, innerWidth - 16) + "px";
    const ww = Math.min(w ?? 360, innerWidth - 16);
    win.style.left = Math.max(8, Math.min(innerWidth - ww - 8, x ?? innerWidth / 2 - ww / 2 + (touch ? 0 : (wins.size % 4) * 24))) + "px";
    win.style.top = (y ?? Math.max(touch ? 6 : 10, innerHeight * (touch ? 0.03 : 0.12) + (touch ? 0 : (wins.size % 4) * 24))) + "px";
    let drag = null;
    head.addEventListener("pointerdown", (e) => { if (e.target.classList.contains("x")) return; drag = [e.clientX - win.offsetLeft, e.clientY - win.offsetTop, e.pointerId]; head.setPointerCapture(e.pointerId); win.style.zIndex = bumpZ(); e.preventDefault(); });
    head.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag[2]) { win.style.left = Math.max(-win.offsetWidth + 60, Math.min(innerWidth - 60, e.clientX - drag[0])) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - drag[1])) + "px"; } });
    head.addEventListener("pointerup", () => (drag = null));
    head.addEventListener("pointercancel", () => (drag = null));
    win.addEventListener("pointerdown", () => (win.style.zIndex = bumpZ()));
    wins.set(id, win);
    win._build = build;
  }
  win._build = build;
  win.style.zIndex = bumpZ();
  refreshWin(id);
  return win;
}
export function refreshWin(id) {
  const win = wins.get(id);
  if (!win) return;
  const body = win.querySelector(".body");
  const st = body.scrollTop;
  body.replaceChildren(...[].concat(win._build()).filter((x) => x != null && x !== false));
  body.scrollTop = st;
}
export function closeWin(id) { const w = wins.get(id); if (w) { w.remove(); wins.delete(id); hideTip(); } }
export function isOpen(id) { return wins.has(id); }
export function toggleWin(id, open) { if (wins.has(id)) closeWin(id); else open(); }
export function openWins() { return [...wins.keys()]; }
export function closeAll() { for (const id of [...wins.keys()]) closeWin(id); }

/** CSS 애니메이션 다시 재생: 강제 레이아웃(offsetWidth 읽기) 없이 다음 프레임에 클래스를 다시 붙임 */
export function retrigger(el, cls) {
  el.classList.remove(cls);
  requestAnimationFrame(() => el.classList.add(cls));
}

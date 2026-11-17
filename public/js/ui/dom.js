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
  el.addEventListener("mouseenter", (e) => showTip(e, build));
  el.addEventListener("mousemove", moveTip);
  el.addEventListener("mouseleave", hideTip);
  return el;
}

// ── 창 (끌어서 이동)
const wins = new Map();
let z = 10;
export function openWin(id, title, build, { x, y, w } = {}) {
  let win = wins.get(id);
  if (!win) {
    const body = h("div", { class: "body" });
    const head = h("header", {}, h("span", { text: title }), h("span", { class: "x", text: "✕", onclick: () => closeWin(id) }));
    win = h("div", { class: "win" }, head, body);
    win.dataset.id = id;
    if (w) win.style.width = w + "px";
    $("#windows").append(win);
    win.style.left = (x ?? Math.max(10, innerWidth / 2 - (w ?? 360) / 2 + (wins.size % 4) * 24)) + "px";
    win.style.top = (y ?? Math.max(10, innerHeight * 0.12 + (wins.size % 4) * 24)) + "px";
    let drag = null;
    head.addEventListener("mousedown", (e) => { drag = [e.clientX - win.offsetLeft, e.clientY - win.offsetTop]; win.style.zIndex = ++z; });
    addEventListener("mousemove", (e) => { if (drag) { win.style.left = e.clientX - drag[0] + "px"; win.style.top = Math.max(0, e.clientY - drag[1]) + "px"; } });
    addEventListener("mouseup", () => (drag = null));
    win.addEventListener("mousedown", () => (win.style.zIndex = ++z));
    wins.set(id, win);
    win._build = build;
  }
  win._build = build;
  win.style.zIndex = ++z;
  refreshWin(id);
  return win;
}
export function refreshWin(id) {
  const win = wins.get(id);
  if (!win) return;
  const body = win.querySelector(".body");
  const st = body.scrollTop;
  body.replaceChildren(...[].concat(win._build()));
  body.scrollTop = st;
}
export function closeWin(id) { const w = wins.get(id); if (w) { w.remove(); wins.delete(id); hideTip(); } }
export function isOpen(id) { return wins.has(id); }
export function toggleWin(id, open) { if (wins.has(id)) closeWin(id); else open(); }
export function openWins() { return [...wins.keys()]; }
export function closeAll() { for (const id of [...wins.keys()]) closeWin(id); }

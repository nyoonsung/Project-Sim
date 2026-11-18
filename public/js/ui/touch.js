// 모바일(터치) 조작
//  - 왼쪽 화면 아무 데나 누르고 끌면 이동 조이스틱
//  - 오른쪽 아래 스킬 버튼: 누르면 가장 가까운 적에게 자동 조준해서 시전 (적이 없으면 보는 방향)
//  - 첫 칸(기본 공격)은 누르고 있으면 계속 공격
//  - 오른쪽 대시 버튼: 이동 중인 방향으로 대시
//  - 위쪽: 물약·메뉴·채팅·전체 화면 버튼
import { G, tryCast, moveDir, nearestEnemy } from "../game.js";
import { SKILLS } from "/shared/skills.js";
import { h, $, hideTip } from "./dom.js";
import { skillIconURL } from "./icons.js";

export const isTouchDevice = () =>
  (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) || (navigator.maxTouchPoints > 0 && "ontouchstart" in window);

const STICK_R = 46; // 조이스틱 최대 반경(px)
let lastDir = [1, 0];

/** 매 프레임: 조준점(마우스 대신) = 가장 가까운 적, 없으면 이동하던 방향 */
export function touchAimTick() {
  const me = G.ents.get(G.you);
  if (!me) return;
  const [mx, my] = moveDir();
  if (Math.hypot(mx, my) > 0.2) { const l = Math.hypot(mx, my); lastDir = [mx / l, my / l]; }
  const t = nearestEnemy();
  if (t) { G.mouse.wx = t.rx; G.mouse.wy = t.ry; }
  else { G.mouse.wx = me.rx + lastDir[0] * 80; G.mouse.wy = me.ry + lastDir[1] * 80; }
  // 대시가 들어 있는 칸은 원호에서 숨김(오른쪽 대시 버튼으로 사용), 자동 사용 표시
  const skills = G.char?.skills ?? [];
  [...$("#skillbar").children].forEach((el, i) => {
    el.classList.toggle("is-dash", skills[i] === "c_dash");
    el.classList.toggle("auto", !!skills[i] && G.autoSkills.has(skills[i]));
  });
  const dash = $("#dash-btn");
  if (dash) {
    const i = skills.indexOf("c_dash");
    dash.classList.toggle("off", i < 0);
    const left = i >= 0 ? cdLeftOf("c_dash") : 0;
    dash.querySelector(".cdt").textContent = left > 0.3 ? left.toFixed(1) : "";
    const total = SKILLS.c_dash.cd;
    dash.style.setProperty("--p", Math.min(1, left / total).toFixed(3));
    if (dash._cd > 0.15 && left <= 0.02) { dash.classList.remove("ready"); void dash.offsetWidth; dash.classList.add("ready"); }
    dash._cd = left;
  }
}
function cdLeftOf(id) { return G.me?.cds?.[id] ? Math.max(0, G.me.cds[id] / 1000 - (performance.now() / 1000 - G.meAt)) : 0; }

function joystick() {
  const zone = h("div", { id: "joy-zone" });
  const base = h("div", { id: "joy-base", class: "hidden" }, h("div", { id: "joy-knob" }));
  let id = null, ox = 0, oy = 0;
  const knob = () => base.firstChild;
  zone.addEventListener("pointerdown", (e) => {
    if (id !== null) return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    zone.setPointerCapture(id);
    base.style.left = ox + "px"; base.style.top = oy + "px";
    base.classList.remove("hidden");
    knob().style.transform = "translate(-50%, -50%)";
    e.preventDefault();
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) {
      // 멀리 끌면 받침이 따라옴 (손가락이 미끄러져도 계속 조작)
      const k = (l - STICK_R) / l;
      ox += dx * k; oy += dy * k; dx -= dx * k; dy -= dy * k;
      base.style.left = ox + "px"; base.style.top = oy + "px";
    }
    knob().style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const m = Math.hypot(dx, dy) / STICK_R;
    G.stick = m < 0.18 ? [0, 0] : [dx / STICK_R, dy / STICK_R];
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null; G.stick = [0, 0];
    base.classList.add("hidden");
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
  return [zone, base];
}

/** 스킬바 칸을 엄지 주변 원호 모양 버튼으로 */
function skillButtons() {
  const slots = [...$("#skillbar").children];
  // 0번(기본 공격)은 크게, 나머지는 두 겹 원호
  const pos = [[0, 0]];
  const ring = (r, angs) => angs.forEach((a) => pos.push([Math.cos((a * Math.PI) / 180) * r, -Math.sin((a * Math.PI) / 180) * r]));
  ring(92, [180, 135, 90]);
  ring(160, [196, 166, 136, 106]);
  slots.forEach((el, i) => {
    el.classList.add("tb");
    if (i === 0) el.classList.add("big");
    el.style.setProperty("--tx", pos[i][0] + "px");
    el.style.setProperty("--ty", pos[i][1] + "px");
    let pid = null;
    el.addEventListener("pointerdown", (e) => {
      if (pid !== null) return;
      pid = e.pointerId;
      el.setPointerCapture(pid);
      el.classList.add("down");
      touchAimTick();
      if (i === 0) G.touchHeld.add(0);
      tryCast(i);
      e.preventDefault(); e.stopPropagation();
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      el.classList.remove("down");
      if (i === 0) G.touchHeld.delete(0);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  });
}

/** 오른쪽 대시 버튼: 이동 방향(멈춰 있으면 보던 방향)으로 */
function dashButton(toast) {
  const btn = h("div", { id: "dash-btn", class: "slot tb" }, h("img", { class: "ic", src: skillIconURL(SKILLS.c_dash), alt: "", draggable: "false" }), h("div", { class: "cd" }), h("span", { class: "nm", text: "대시" }), h("span", { class: "cdt" }));
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const i = (G.char?.skills ?? []).indexOf("c_dash");
    if (i < 0) return toast("대시를 스킬 칸에 장착하면 쓸 수 있어요. (✨ 스킬 창, 마을에서)");
    const me = G.ents.get(G.you);
    if (!me) return;
    let [dx, dy] = moveDir();
    if (Math.hypot(dx, dy) < 0.2) [dx, dy] = lastDir;
    const l = Math.hypot(dx, dy) || 1;
    btn.classList.add("down");
    setTimeout(() => btn.classList.remove("down"), 150);
    tryCast(i, { x: me.rx + (dx / l) * 120, y: me.ry + (dy / l) * 120 });
  });
  return btn;
}

export function setupTouch({ openNpc, interactTarget, toast }) {
  document.body.classList.add("touch");
  G.touch = true;
  G.stick = [0, 0];
  G.touchHeld = new Set();
  const ui = $("#ui");
  const [zone, base] = joystick();
  ui.prepend(zone);
  ui.append(base);
  skillButtons();
  ui.append(dashButton(toast));
  // 위쪽 버튼 줄: 채팅·전체 화면
  const chatBtn = h("button", { class: "tbtn", onclick: () => { document.body.classList.toggle("chat-open"); if (document.body.classList.contains("chat-open")) $("#chat-input").focus(); } }, "💬");
  const fsBtn = h("button", { class: "tbtn", onclick: () => toggleFullscreen() }, "⛶");
  $("#menu-buttons").append(chatBtn, fsBtn);
  const ICON = { char: "👤", skills: "✨", inv: "🎒", party: "👥", help: "❔" };
  for (const b of document.querySelectorAll("#menu-buttons button[data-win]")) { b.title = b.textContent.replace(/\s*\S$/, "").trim(); b.textContent = ICON[b.dataset.win] ?? b.textContent; }
  $("#chat-input").placeholder = "채팅 ( /p 파티 채팅 )";
  $("#chat-input").addEventListener("blur", () => setTimeout(() => document.body.classList.remove("chat-open"), 150));
  // NPC 대화 안내를 누를 수 있는 버튼으로
  const hint = $("#interact-hint");
  hint.addEventListener("click", () => { const o = interactTarget(); if (o) openNpc(o); });
  // 바깥을 누르면 툴팁 닫기
  addEventListener("pointerdown", (e) => { if (!e.target.closest?.(".win .slot, .win .cell, .win .item")) hideTip(); }, true);
  // 세로 화면도 그대로 플레이 (위: 게임 화면, 아래: 조작 버튼). 가로 고정 안 되는 폰·카톡 인앱 브라우저 대응
  // 처음 화면을 누르면 전체 화면 + 가로 고정 시도 (지원하는 기기만)
  addEventListener("pointerdown", function once() { removeEventListener("pointerdown", once); toggleFullscreen(true); }, { once: true });
  // 핀치 확대·더블탭 확대 막기
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());
}

async function toggleFullscreen(onlyEnter) {
  const d = document;
  try {
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const el = d.documentElement;
      await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
      await screen.orientation?.lock?.("landscape").catch(() => {});
    } else if (!onlyEnter) await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
  } catch {}
}

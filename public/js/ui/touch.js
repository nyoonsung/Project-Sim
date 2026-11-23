// 모바일(터치) 조작
//  - 왼쪽 화면 아무 데나 누르고 끌면 이동 조이스틱
//  - 오른쪽 아래 스킬 버튼: 누르면 가장 가까운 적에게 자동 조준해서 시전 (적이 없으면 보는 방향)
//  - 첫 칸(기본 공격)은 누르고 있으면 계속 공격
//  - 오른쪽 대시 버튼: 이동 중인 방향으로 대시
//  - 위쪽: 물약·메뉴·채팅·전체 화면 버튼
import { G, tryCast, moveDir, nearestEnemy, isFoeEnt } from "../game.js";
import { pixImg } from "./pix.js";
import { SKILLS } from "/shared/skills.js";
import { h, $, hideTip, retrigger } from "./dom.js";
import { skillIconURL } from "./icons.js";

// 휴대폰·태블릿만 터치 화면. 터치스크린 노트북(마우스·터치패드가 있음)은 PC 화면 → 채팅·단축키 그대로
export const isTouchDevice = () => {
  const mm = (q) => typeof matchMedia === "function" && matchMedia(q).matches;
  if (mm("(pointer: coarse)")) return true;
  return navigator.maxTouchPoints > 0 && "ontouchstart" in window && !mm("(any-pointer: fine)");
};

const STICK_R = 46; // 조이스틱 최대 반경(px)
let lastDir = [1, 0];

/** 이동 방향 앞쪽 부채꼴 안에서 가장 가까운 적 */
function enemyAhead(me, dir, deg, range = 320) {
  let best = null, bd = range;
  const c = Math.cos((deg * Math.PI) / 180);
  for (const e of G.ents.values()) {
    if (!isFoeEnt(e) || e.dead) continue;
    const dx = e.rx - me.rx, dy = e.ry - me.ry, d = Math.hypot(dx, dy);
    if (d >= bd || (d > 30 && (dx * dir[0] + dy * dir[1]) / d < c)) continue;
    bd = d; best = e;
  }
  return best;
}
/** 매 프레임: 조준점(마우스 대신) = 가장 가까운 적, 없으면 이동하던 방향 */
export function touchAimTick() {
  const me = G.ents.get(G.you);
  if (!me) return;
  const [mx, my] = moveDir();
  if (Math.hypot(mx, my) > 0.2) { const l = Math.hypot(mx, my); lastDir = [mx / l, my / l]; }
  // 스킬 조준점(가장 가까운 적)과 캐릭터가 보는 방향을 분리:
  //  움직이는 중에는 이동 방향을 보고, 공격한 직후(0.5초)나 멈춰 서서 적이 있으면 적을 봄
  const moving = Math.hypot(mx, my) > 0.2;
  // 움직이는 중엔 조이스틱 방향 앞쪽(±75°)의 적만 노림 → 가고 싶은 방향으로 공격·스킬이 나감. 멈추면 가장 가까운 적
  const t = moving ? enemyAhead(me, lastDir, 75) : nearestEnemy();
  const ahead = { x: me.rx + lastDir[0] * 80, y: me.ry + lastDir[1] * 80 };
  G.touchTarget = t ? { x: t.rx, y: t.ry } : ahead;
  G.touchAhead = ahead; G.touchMoving = moving;
  const faceTarget = t && (!moving || performance.now() / 1000 < (G.faceTargetUntil ?? 0));
  const f = faceTarget ? G.touchTarget : ahead;
  G.mouse.wx = f.x; G.mouse.wy = f.y;
  // 대시가 들어 있는 칸은 원호에서 숨김(오른쪽 대시 버튼으로 사용), 자동 사용 표시
  const skills = G.char?.skills ?? [];
  // 칸 표시는 스킬 구성·자동 설정이 바뀔 때만 다시
  const key = skills.join(",") + "|" + [...G.autoSkills].join(",");
  if (key !== touchAimTick._k) {
    touchAimTick._k = key;
    [...$("#skillbar").children].forEach((el, i) => {
      el.classList.toggle("is-dash", skills[i] === "c_dash");
      el.classList.toggle("auto", !!skills[i] && G.autoSkills.has(skills[i]));
    });
  }
  const dash = $("#dash-btn");
  if (dash) {
    const i = skills.indexOf("c_dash");
    if (dash._off !== i < 0) { dash._off = i < 0; dash.classList.toggle("off", i < 0); }
    const left = i >= 0 ? cdLeftOf("c_dash") : 0;
    const txt = left > 0.3 ? left.toFixed(1) : "", cdt = dash.querySelector(".cdt");
    if (cdt._t !== txt) { cdt._t = txt; cdt.textContent = txt; }
    const total = SKILLS.c_dash.cd;
    const p = (Math.round(Math.min(1, left / total) * 60) / 60).toFixed(3);
    if (dash._p !== p) { dash._p = p; dash.style.setProperty("--p", p); }
    if (dash._cd > 0.15 && left <= 0.02) { retrigger(dash, "ready"); }
    dash._cd = left;
  }
}
function cdLeftOf(id) { return G.me?.cds?.[id] ? Math.max(0, G.me.cds[id] / 1000 - (performance.now() / 1000 - G.meAt)) : 0; }

function joystick() {
  const zone = h("div", { id: "joy-zone" });
  const base = h("div", { id: "joy-base", class: "hidden" }, h("div", { id: "joy-knob" }));
  let id = null, ox = 0, oy = 0, lastAt = 0;
  const knob = () => base.firstChild;
  // 조이스틱이 '눌린 채'로 남는 문제 방지: 손가락을 뗀 신호를 놓쳐도(키보드·팝업·화면 회전 등) 풀림
  const reset = () => { id = null; G.stick = [0, 0]; base.classList.add("hidden"); };
  G.resetStick = reset;
  zone.addEventListener("pointerdown", (e) => {
    if (id !== null && performance.now() - lastAt < 400) return; // 다른 손가락이 정말 쥐고 있을 때만 무시
    lastAt = performance.now();
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    zone.setPointerCapture(id);
    base.style.left = ox + "px"; base.style.top = oy + "px";
    base.classList.remove("hidden");
    knob().style.transform = "translate(-50%, -50%)";
    e.preventDefault();
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    lastAt = performance.now();
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
  zone.addEventListener("lostpointercapture", end);
  addEventListener("blur", reset);
  document.addEventListener("visibilitychange", reset);
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
  ring(224, [165, 140, 115, 90]);
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
    el.addEventListener("lostpointercapture", end);
    // 뗀 신호를 놓쳐 버튼이 '눌린 채' 굳는 문제 방지 (기본 공격이 멈추지 않거나 버튼이 안 눌리던 문제)
    const reset = () => { pid = null; el.classList.remove("down"); if (i === 0) G.touchHeld.delete(0); };
    addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    document.addEventListener("focusin", (e) => { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) reset(); });
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
  const chatBtn = h("button", { class: "tbtn", title: "채팅", onclick: () => { document.body.classList.toggle("chat-open"); if (document.body.classList.contains("chat-open")) $("#chat-input").focus(); } }, pixImg("chat"));
  const fsBtn = h("button", { class: "tbtn", title: "전체 화면", onclick: () => toggleFullscreen() }, pixImg("full"));
  $("#menu-buttons").append(chatBtn, fsBtn);
  for (const b of document.querySelectorAll("#menu-buttons button[data-win]")) { b.title = b.textContent.replace(/\s*\S$/, "").trim(); b.replaceChildren(pixImg(b.dataset.win)); }
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

// 시작점: 로그인 → 게임 연결 → 입력·렌더 루프
import { G, onMessage, inputTick, tryCast, updateMouseWorld, send } from "./game.js";
import { isTouchDevice, setupTouch, touchAimTick } from "./ui/touch.js";
import { unlockAudio, toggleSound, soundOn, sfx, toggleShake, shakeEnabled, addTrauma } from "./feel.js";
import { loadDT2, frame } from "./render/dt2.js";
import { dtLookFor, drawDT } from "./render/looks.js";
if (isTouchDevice()) document.body.classList.add("touch");
import { Net } from "./net.js";
import { watchUpdates, onTown, autoReconnect } from "./update.js";
import { Renderer } from "./render/world.js";
import { $, h, closeAll, openWins, toggleWin, refreshWin, isOpen, closeWin } from "./ui/dom.js";
import * as HUD from "./ui/hud.js";
import * as WIN from "./ui/windows.js";
import { sprite, playerLook } from "./render/sprites.js";
import { CLASS_INFO } from "/shared/classes.js";
import { VIEW_W, VIEW_H, ITEMS } from "/shared/constants.js";
import { RARITY_COLOR } from "/shared/items.js";

// ── 로그인
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), credentials: "same-origin" });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
}
function loginArt() {
  // 로그인 화면: 7직업이 던전 바닥 위에서 번갈아 공격 (게임과 같은 그림)
  const cv = $("#login-art"), g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  const t0 = performance.now();
  const classes = [["sword", "sword"], ["fist", "knuckle"], ["archer", "bow"], ["rogue", "dagger"], ["mage", "staff"], ["priest", "mace"], ["smith", "hammer"]];
  const ATT = { sword: "slash", fist: "punch", archer: "shoot", rogue: "stab", mage: "cast", priest: "cast", smith: "smash" };
  loadDT2().then(() => {
    const loop = () => {
      if ($("#login").classList.contains("hidden")) return;
      const t = (performance.now() - t0) / 1000;
      g.fillStyle = "#0b0a0f"; g.fillRect(0, 0, 320, 120);
      for (let x = 0; x < 320; x += 16) for (let y = 64; y < 120; y += 16) { const c = frame((x * 7 + y * 3) % 11 === 0 ? "floor_2" : "floor_1"); if (c) g.drawImage(c, x, y); }
      for (let x = 0; x < 320; x += 16) { const c = frame("wall_mid"), top = frame("wall_top_mid"); if (c) g.drawImage(c, x, 48); if (top) g.drawImage(top, x, 32); }
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 64, 320, 8);
      classes.forEach(([c, w], i) => {
        const e = { id: i + 1, info: { c, w, o: null }, k: "p" };
        const L = dtLookFor(e);
        if (!L) return;
        L.scale = 1.6;
        const cyc = (t + i * 0.45) % 2.4, p = cyc / 0.4;
        const anim = p < 1 ? { name: ATT[c], p } : null;
        g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(26 + i * 44, 104, 9, 3, 0, 0, Math.PI * 2); g.fill();
        drawDT(g, e, L, 26 + i * 44, 104, { moving: false, hurt: false, flip: false, aim: 0, anim, t });
      });
      requestAnimationFrame(loop);
    };
    loop();
  }).catch(() => {});
}

async function boot() {
  // 링크(데모) 버전: 서버 없이 브라우저 안에서 같은 게임 엔진을 돌림
  if (globalThis.__LOCAL_NET) {
    $("#login").classList.remove("hidden");
    $("#lf-pass").remove();
    $("#lf-register").remove();
    $("#lf-login").textContent = "시작하기";
    $(".tagline").textContent = "100층 던전을 정복하라 — 혼자 플레이 데모 (저장: 이 브라우저)";
    let saved = "";
    try { saved = localStorage.getItem("psim_name") ?? ""; } catch {}
    $("#lf-user").value = saved;
    $("#lf-user").placeholder = "닉네임 (2~12자, 한글·영문·숫자)";
    loginArt();
    $("#login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#lf-user").value.trim();
      if (!/^[A-Za-z0-9가-힣_]{2,12}$/.test(name)) { $("#lf-msg").textContent = "닉네임은 2~12자, 한글·영문·숫자·_ 만 쓸 수 있어요."; return; }
      try { localStorage.setItem("psim_name", name); } catch {}
      G.localName = name;
      startGame();
    });
    return;
  }
  const me = await fetch("/api/me", { credentials: "same-origin" });
  if (me.ok) return startGame();
  $("#login").classList.remove("hidden");
  loginArt();
  const msg = $("#lf-msg");
  const go = async (path) => {
    msg.textContent = "";
    const name = $("#lf-user").value.trim(), pw = $("#lf-pass").value;
    if (!name || !pw) { msg.textContent = "닉네임과 비밀번호를 넣어 주세요."; return; }
    const r = await api(path, { username: name, password: pw });
    if (!r.ok) { msg.textContent = r.j.error ?? "실패했어요."; return; }
    startGame();
  };
  $("#login-form").addEventListener("submit", (e) => { e.preventDefault(); go("/api/login"); });
  $("#lf-register").addEventListener("click", () => go("/api/register"));
}

// ── UI 연결
const ui = {
  onChar() { HUD.updateSkillbar(); WIN.refreshAll(); },
  onMe() { HUD.updateBars(); },
  onProf() { if (isOpen("skills") && !(G._profRefresh > performance.now())) { G._profRefresh = performance.now() + 500; refreshWin("skills"); } },
  onMap() { HUD.updateZoneLabel(); WIN.refreshAll(); HUD.toast(G.mapKind === "town" ? "모험가 마을" : G.mapKind === "safe" ? "안전 구역 — 전직소" : `${G.floor}층 · ${G.zone.name}`, "floor"); },
  chat: HUD.chatLine,
  onParty() { HUD.updateParty(); WIN.refreshAll(); },
  invite(from) {
    const box = h("div", { class: "invite" }, h("div", { text: `${from}님이 파티에 초대했어요.` }),
      h("div", { class: "flexrow" }, h("button", { class: "btn small primary", onclick: () => { send({ t: "party", op: "accept", name: from }); box.remove(); } }, "수락"), h("button", { class: "btn small", onclick: () => { send({ t: "party", op: "decline", name: from }); box.remove(); } }, "거절")));
    $("#ui").append(box);
    setTimeout(() => box.remove(), 30000);
  },
  announce(text) { const a = $("#announce"); a.classList.toggle("hidden", !text); a.textContent = text ? "📢 " + text : ""; },
  kicked(why) { G.kickedWhy = why; },
  onEnhance(m) { WIN.onEnhance(m); HUD.toast(m.result === "success" ? `강화 성공! ${m.name} +${m.enh}` : m.result === "fail" ? `강화 실패 (${m.name} +${m.enh} 유지)` : `${m.name}이(가) 파괴됐어요…`, m.result === "success" ? "rank" : m.result === "destroy" ? "death" : "info"); },
  toast: HUD.toast,
  center: HUD.center,
  showVote: HUD.showVote,
  gotItem(it) { HUD.toast(`획득: ${it.name} [${it.rarity}]`, it.rarity === "신화" ? "mythic" : it.rarity === "전설" ? "legend" : "info"); },
  onBoss: HUD.updateBoss,
  noRes() {},
  flashSkill: HUD.flashSkill,
  sfx,
  blockingWindow: () => false,
  async logout() { if (!globalThis.__LOCAL_NET) await api("/api/logout"); location.reload(); },
};

function resize() {
  const cv = $("#view");
  // 실제로 보이는 높이 (주소창·키보드 제외) — 휴대폰에서 위쪽이 잘리는 문제 방지
  const vv = globalThis.visualViewport;
  const W = vv?.width ?? innerWidth, H = vv?.height ?? innerHeight;
  document.documentElement.style.setProperty("--vh", H + "px");
  const portrait = G.touch && H > W;
  document.body.classList.toggle("portrait", portrait);
  if (scrollY || scrollX) scrollTo(0, 0); // 입력창 때문에 페이지가 밀려 올라간 채로 남지 않게
  if (portrait) {
    // 세로: 폭 400 기준으로 위 메뉴(66px) 아래 화면 끝까지 게임 화면, 캐릭터는 위쪽 40% 지점
    const top = 66, scale = W / 400, vh = Math.round((H - top) / scale);
    G.renderer?.setView(400, vh, 0.4);
    cv.style.width = W + "px"; cv.style.height = vh * scale + "px";
    G.scale = scale;
    return;
  }
  G.renderer?.setView(VIEW_W, VIEW_H, 0.5);
  const s = Math.max(1, Math.floor(Math.min(W / VIEW_W, H / VIEW_H)));
  const fs = Math.min(W / VIEW_W, H / VIEW_H);
  const scale = fs >= 1 && !G.touch ? s : fs;
  cv.style.width = VIEW_W * scale + "px";
  cv.style.height = VIEW_H * scale + "px";
  G.scale = scale;
}

async function startGame() {
  $("#login").classList.add("hidden");
  $("#game").classList.remove("hidden");
  G.ui = ui;
  window.__game = G; // 디버그용 (서버가 모든 판정을 하므로 조작해도 의미 없음)
  G.renderer = new Renderer($("#view"));
  HUD.buildHud();
  if (isTouchDevice()) setupTouch({ openNpc: WIN.openNpc, interactTarget: HUD.interactTarget, toast: (t) => HUD.toast(t, "info") });
  resize();
  addEventListener("resize", resize);
  globalThis.visualViewport?.addEventListener("resize", resize);
  globalThis.visualViewport?.addEventListener("scroll", () => { if (scrollY) scrollTo(0, 0); });
  addEventListener("orientationchange", () => setTimeout(resize, 250));
  await Promise.all([loadDT2().catch((e) => console.warn("아틀라스 로드 실패", e)), document.fonts.load("12px Galmuri11").catch(() => {})]);
  await document.fonts.load("10px Galmuri9").catch(() => {});
  document.fonts.load("14px Galmuri14").catch(() => {}); // 제목·데미지 숫자용 (기다리지 않음)
  const NetClass = globalThis.__LOCAL_NET ?? Net;
  G.net = new NetClass(onMessage, (e) => {
    $("#game").classList.add("hidden");
    $("#login").classList.remove("hidden");
    $("#login-form").classList.add("hidden");
    $("#lf-msg").textContent = G.kickedWhy ?? (e.code === 1006 ? "서버와 연결이 끊겼어요." : "연결이 끊겼어요.");
    const b = h("button", { class: "btn primary", onclick: () => location.reload() }, "다시 접속");
    $(".login-card").append(b);
    // 쫓겨난 게 아니면(업데이트 배포·잠깐 끊김) 서버가 살아나는 대로 자동 재접속 = 새 버전 적용
    if (!G.kickedWhy) autoReconnect((t) => ($("#lf-msg").textContent = t));
  });
  try { await G.net.connect(); } catch { $("#lf-msg").textContent = "접속하지 못했어요."; return; }
  bindInput();
  watchUpdates({ inTown: () => G.kind === "town", show: (t) => HUD.center(t), notice: (t) => HUD.toast(t, "legend") });
  setInterval(inputTick, 50);
  setInterval(() => { HUD.drawMinimap(); HUD.updateParty(); HUD.updateInteract(); }, 200);
  const loop = () => {
    if (G.touch) touchAimTick(); else updateMouseWorld();
    G.renderer.frame();
    HUD.updateSkillbar();
    HUD.updateBoss();
    requestAnimationFrame(loop);
  };
  loop();
}

function bindInput() {
  const cv = $("#view");
  const chat = $("#chat-input");
  const toMouse = (e) => {
    const r = cv.getBoundingClientRect();
    G.mouse.x = ((e.clientX - r.left) / r.width) * cv.width;
    G.mouse.y = ((e.clientY - r.top) / r.height) * cv.height;
  };
  addEventListener("mousemove", toMouse);
  cv.addEventListener("mousedown", (e) => { toMouse(e); G.mouse.down[e.button] = true; if (e.button === 0) tryCast(0); if (e.button === 2) tryCast(1); });
  addEventListener("mouseup", (e) => (G.mouse.down[e.button] = false));
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("blur", () => { G.keys.clear(); G.mouse.down = [false, false, false]; });
  chat.addEventListener("focus", () => { G.typing = true; G.keys.clear(); });
  chat.addEventListener("blur", () => (G.typing = false));
  chat.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const t = chat.value.trim(); if (t) send({ t: "chat", text: t }); chat.value = ""; chat.blur(); e.preventDefault(); }
    if (e.key === "Escape") chat.blur();
    e.stopPropagation();
  });
  const SLOT = { KeyQ: 2, KeyE: 3, KeyR: 4, KeyF: 5, ShiftLeft: 6, ShiftRight: 6, KeyV: 7 };
  addEventListener("keydown", (e) => {
    if (G.typing || e.target.tagName === "INPUT") return;
    if (e.code === "Enter") { chat.focus(); e.preventDefault(); return; }
    if (e.code === "Escape") { const w = openWins(); if (w.length) closeWin(w[w.length - 1]); return; }
    if ((e.code === "KeyY" || e.code === "KeyN") && document.querySelector("#vote .vb")) { send({ t: "vote", ok: e.code === "KeyY" }); return; }
    if (e.repeat && !SLOT[e.code]) return;
    G.keys.add(e.code);
    if (SLOT[e.code] != null) { tryCast(SLOT[e.code]); e.preventDefault(); }
    if (e.code === "Digit1") { send({ t: "use", item: "hp_potion" }); sfx("potion"); }
    if (e.code === "Digit2") { send({ t: "use", item: "mp_potion" }); sfx("potion"); }
    if (e.code === "Digit3") { send({ t: "use", item: "antidote" }); sfx("potion"); }
    if (e.code === "KeyC") toggleWin("char", WIN.openChar);
    if (e.code === "KeyK") toggleWin("skills", WIN.openSkills);
    if (e.code === "KeyI") toggleWin("inv", WIN.openInv);
    if (e.code === "KeyP") toggleWin("party", WIN.openParty);
    if (e.code === "KeyH") toggleWin("help", WIN.openHelp);
    if (e.code === "KeyG") { const o = HUD.interactTarget(); if (o) WIN.openNpc(o); }
    if (e.code === "KeyM") HUD.toggleBigMap();
    if (e.code === "Tab") e.preventDefault();
  });
  addEventListener("keyup", (e) => G.keys.delete(e.code));
  // 소리: 브라우저 정책상 처음 누를 때 켜짐
  const unlock = () => unlockAudio();
  addEventListener("pointerdown", unlock); addEventListener("keydown", unlock);
  const sb = $("#sound-btn");
  const paintSound = () => { sb.textContent = G.touch ? (soundOn() ? "🔊" : "🔇") : soundOn() ? "소리 켜짐" : "소리 꺼짐"; };
  paintSound();
  sb.addEventListener("click", () => { unlockAudio(); toggleSound(); paintSound(); sfx("click"); });
  const kb = $("#shake-btn");
  const paintShake = () => { kb.textContent = G.touch ? (shakeEnabled() ? "📳" : "📴") : shakeEnabled() ? "흔들림 켜짐" : "흔들림 꺼짐"; };
  paintShake();
  kb.addEventListener("click", () => { toggleShake(); paintShake(); sfx("click"); if (shakeEnabled()) addTrauma(0.4); });
  $("#minimap").addEventListener("click", () => HUD.toggleBigMap());
  $("#bigmap").addEventListener("click", () => HUD.toggleBigMap());
  for (const b of document.querySelectorAll("#menu-buttons button[data-win]")) {
    const map = { char: WIN.openChar, skills: WIN.openSkills, inv: WIN.openInv, party: WIN.openParty, help: WIN.openHelp };
    b.addEventListener("click", () => toggleWin(b.dataset.win, map[b.dataset.win]));
  }
}

boot();

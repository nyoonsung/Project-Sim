// 시작점: 로그인 → 게임 연결 → 입력·렌더 루프
import { G, onMessage, inputTick, tryCast, updateMouseWorld, send } from "./game.js";
import { Net } from "./net.js";
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
  const cv = $("#login-art"), g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  let t0 = performance.now();
  const classes = ["sword", "fist", "archer", "rogue", "mage", "priest", "smith"];
  const loop = () => {
    if ($("#login").classList.contains("hidden")) return;
    const t = (performance.now() - t0) / 1000;
    g.fillStyle = "#0e0c14"; g.fillRect(0, 0, 320, 120);
    g.fillStyle = "#1c1828"; g.fillRect(0, 96, 320, 24);
    for (let x = 0; x < 320; x += 16) { g.fillStyle = x % 32 ? "#221e30" : "#191524"; g.fillRect(x, 96, 16, 24); }
    classes.forEach((c, i) => {
      const { look, key } = playerLook(c, null, null);
      const anim = Math.floor(t + i * 0.7) % 4 === 0 ? (c === "archer" ? "shoot" : c === "mage" || c === "priest" ? "cast" : c === "fist" ? "punch" : "slash") : "idle";
      const s = sprite({ ...look, weapon: CLASS_INFO[c].look.weapon }, key + ":art", anim, Math.floor(t * (anim === "idle" ? 2 : 6)) % 3, 0.3);
      g.drawImage(s.canvas, 24 + i * 44 - s.ox, 102 - s.oy);
    });
    requestAnimationFrame(loop);
  };
  loop();
}

async function boot() {
  // 링크(데모) 버전: 서버 없이 브라우저 안에서 같은 게임 엔진을 돌림
  if (globalThis.__LOCAL_NET) {
    $("#login").classList.remove("hidden");
    $("#nick-box").classList.remove("hidden");
    $("#nick-note").textContent = "닉네임만 정하면 바로 시작해요.";
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
  const params = new URLSearchParams(location.search);
  const ERR = { state: "로그인 시간이 지났어요. 다시 시도해 주세요.", google: "구글 로그인에 실패했어요. 다시 시도해 주세요.", banned: "이용이 제한된 계정이에요.", google_off: "서버에 구글 로그인이 아직 설정되지 않았어요." };
  if (params.get("error")) msg.textContent = ERR[params.get("error")] ?? "로그인에 실패했어요.";
  const cfg = await fetch("/api/auth/config").then((r) => r.json()).catch(() => ({}));
  if (params.get("signup")) {
    // 첫 로그인: 닉네임 정하기
    $("#nick-box").classList.remove("hidden");
    $("#lf-user").focus();
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.textContent = "";
      const r = await api("/api/auth/signup", { name: $("#lf-user").value.trim() });
      if (!r.ok) { msg.textContent = r.j.error ?? "실패했어요."; if (r.status === 400 && /시간|다시/.test(r.j.error ?? "")) $("#google-btn").classList.remove("hidden"); return; }
      history.replaceState(null, "", "/");
      startGame();
    });
  } else {
    $("#google-btn").classList.remove("hidden");
    if (!cfg.google) { $("#google-btn").classList.add("hidden"); if (!params.get("error")) msg.textContent = ERR.google_off; }
  }
  if (cfg.dev) {
    $("#dev-box").classList.remove("hidden");
    $("#dev-login").addEventListener("click", async () => {
      const r = await api("/api/dev-login", { username: $("#dev-user").value.trim() });
      if (!r.ok) { msg.textContent = r.j.error ?? "실패"; return; }
      startGame();
    });
  }
  if (params.get("error")) history.replaceState(null, "", "/");
}

// ── UI 연결
const ui = {
  onChar() { HUD.updateSkillbar(); WIN.refreshAll(); },
  onMe() { HUD.updateBars(); },
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
  gotItem(it) { HUD.toast(`획득: ${it.name} [${it.rarity}]`, it.rarity === "신화" ? "mythic" : it.rarity === "전설" ? "legend" : "info"); },
  onBoss: HUD.updateBoss,
  noRes() {},
  flashSkill: HUD.flashSkill,
  blockingWindow: () => false,
  async logout() { if (!globalThis.__LOCAL_NET) await api("/api/logout"); location.reload(); },
};

function resize() {
  const cv = $("#view");
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  const fs = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  const scale = fs >= 1 ? s : fs;
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
  resize();
  addEventListener("resize", resize);
  await document.fonts.load("12px Galmuri11").catch(() => {});
  await document.fonts.load("10px Galmuri9").catch(() => {});
  const NetClass = globalThis.__LOCAL_NET ?? Net;
  G.net = new NetClass(onMessage, (e) => {
    $("#game").classList.add("hidden");
    $("#login").classList.remove("hidden");
    $("#login-form").classList.add("hidden");
    $("#lf-msg").textContent = G.kickedWhy ?? (e.code === 1006 ? "서버와 연결이 끊겼어요." : "연결이 끊겼어요.");
    const b = h("button", { class: "btn primary", onclick: () => location.reload() }, "다시 접속");
    $(".login-card").append(b);
  });
  try { await G.net.connect(); } catch { $("#lf-msg").textContent = "접속하지 못했어요."; return; }
  bindInput();
  setInterval(inputTick, 50);
  setInterval(() => { HUD.drawMinimap(); HUD.updateParty(); HUD.updateInteract(); }, 200);
  const loop = () => {
    updateMouseWorld();
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
    G.mouse.x = ((e.clientX - r.left) / r.width) * VIEW_W;
    G.mouse.y = ((e.clientY - r.top) / r.height) * VIEW_H;
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
    if (e.repeat && !SLOT[e.code]) return;
    G.keys.add(e.code);
    if (SLOT[e.code] != null) { tryCast(SLOT[e.code]); e.preventDefault(); }
    if (e.code === "Digit1") send({ t: "use", item: "hp_potion" });
    if (e.code === "Digit2") send({ t: "use", item: "mp_potion" });
    if (e.code === "Digit3") send({ t: "use", item: "antidote" });
    if (e.code === "KeyC") toggleWin("char", WIN.openChar);
    if (e.code === "KeyK") toggleWin("skills", WIN.openSkills);
    if (e.code === "KeyI") toggleWin("inv", WIN.openInv);
    if (e.code === "KeyP") toggleWin("party", WIN.openParty);
    if (e.code === "KeyH") toggleWin("help", WIN.openHelp);
    if (e.code === "KeyG") { const o = HUD.interactTarget(); if (o) WIN.openNpc(o); }
    if (e.code === "Tab") e.preventDefault();
  });
  addEventListener("keyup", (e) => G.keys.delete(e.code));
  for (const b of document.querySelectorAll("#menu-buttons button")) {
    const map = { char: WIN.openChar, skills: WIN.openSkills, inv: WIN.openInv, party: WIN.openParty, help: WIN.openHelp };
    b.addEventListener("click", () => toggleWin(b.dataset.win, map[b.dataset.win]));
  }
}

boot();

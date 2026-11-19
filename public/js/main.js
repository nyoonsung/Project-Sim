// 시작점: 로그인 → 게임 연결 → 입력·렌더 루프
import { G, onMessage, inputTick, tryCast, updateMouseWorld, send, usePotion } from "./game.js";
import { pixImg } from "./ui/pix.js";
import { slotForCode, potionForCode, slotForMouse } from "./keys.js";
import { isTouchDevice, setupTouch, touchAimTick } from "./ui/touch.js";
import { unlockAudio, toggleSound, soundOn, sfx, toggleShake, shakeEnabled, addTrauma } from "./feel.js";
import { loadDT2, frame } from "./render/dt2.js";
import { dtLookFor, drawDT } from "./render/looks.js";
if (isTouchDevice()) document.body.classList.add("touch");
import { Net } from "./net.js";
import { watchUpdates, onTown, autoReconnect, latestVersion, reloadNow } from "./update.js";
import { VERSION } from "./version.js";
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
  // 같은 탭에서 이미 시작했으면(업데이트 새로고침 등) 바로 이어서. 새로 들어오면 '계속하기' 또는 다른 계정 선택
  const ss = { get: () => { try { return sessionStorage.getItem("psim_go"); } catch { return null; } }, set: (v) => { try { v ? sessionStorage.setItem("psim_go", "1") : sessionStorage.removeItem("psim_go"); } catch {} } };
  const start = () => { ss.set(true); startGame(); };
  if (me.ok && ss.get()) return startGame();
  $("#login").classList.remove("hidden");
  loginArt();
  const msg = $("#lf-msg");
  if (me.ok) {
    const { name } = await me.json().catch(() => ({}));
    const cont = h("button", { type: "button", class: "btn primary continue-login", onclick: start }, `▶ ${name ?? "내 계정"}(으)로 계속하기`);
    const hint = h("p", { class: "note", text: "다른 계정으로 로그인하거나 새 계정을 만들려면 아래에 입력하세요." });
    $("#login-form").before(cont, hint);
    $("#lf-login").classList.remove("primary");
  }
  const go = async (path) => {
    msg.textContent = "";
    const name = $("#lf-user").value.trim(), pw = $("#lf-pass").value;
    if (!name || !pw) { msg.textContent = "닉네임과 비밀번호를 넣어 주세요."; return; }
    const r = await api(path, { username: name, password: pw });
    if (!r.ok) { msg.textContent = r.j.error ?? "실패했어요."; return; }
    start();
  };
  $("#login-form").addEventListener("submit", (e) => { e.preventDefault(); go("/api/login"); });
  $("#lf-register").addEventListener("click", () => go("/api/register"));
}

// ── UI 연결
const ui = {
  onChar() { HUD.updateSkillbar(); WIN.refreshAll(); },
  onMe() { HUD.updateBars(); },
  onProf() { if (isOpen("skills") && !(G._profRefresh > performance.now())) { G._profRefresh = performance.now() + 500; refreshWin("skills"); } },
  onMap() { HUD.updateZoneLabel(); WIN.refreshAll(); HUD.toast(G.mapKind === "town" ? "모험가 마을" : G.mapKind === "safe" ? "안전 구역 — 전직소" : `${G.dungeon === 2 ? "제2 던전 " : ""}${G.floor}층 · ${G.zone.name}`, "floor"); },
  chat: HUD.chatLine,
  onParty() { HUD.updateParty(); WIN.refreshAll(); },
  invite(from) {
    // 같은 사람의 초대는 하나만, 화면 위쪽 가운데(스킬 버튼·미니맵을 가리지 않게), 30초 카운트다운, PC는 Y/N
    document.querySelector(`.invite[data-from="${CSS.escape(from)}"]`)?.remove();
    const left = h("span", { class: "inv-left", text: "30" });
    const done = () => { clearInterval(tm); box.remove(); };
    const answer = (ok) => { send({ t: "party", op: ok ? "accept" : "decline", name: from }); done(); };
    const box = h("div", { class: "invite" }, h("div", { text: `${from}님이 파티에 초대했어요. ` }, left, "초"),
      h("div", { class: "flexrow" }, h("button", { class: "btn small primary", onclick: () => answer(true) }, G.touch ? "수락" : "수락 (Y)"), h("button", { class: "btn small", onclick: () => answer(false) }, G.touch ? "거절" : "거절 (N)")));
    box.dataset.from = from;
    box._answer = answer;
    $("#ui").append(box);
    let n = 30;
    const tm = setInterval(() => { n--; left.textContent = String(n); if (n <= 0) done(); }, 1000);
  },
  tradeReq(from) {
    document.querySelector(`.invite[data-trade="${CSS.escape(from)}"]`)?.remove();
    const left = h("span", { class: "inv-left", text: "30" });
    const done = () => { clearInterval(tm); box.remove(); };
    const answer = (ok) => { send({ t: "trade", op: ok ? "accept" : "decline", name: from }); done(); };
    const box = h("div", { class: "invite" }, h("div", { text: `💰 ${from}님이 거래를 신청했어요. ` }, left, "초"),
      h("div", { class: "flexrow" }, h("button", { class: "btn small primary", onclick: () => answer(true) }, G.touch ? "수락" : "수락 (Y)"), h("button", { class: "btn small", onclick: () => answer(false) }, G.touch ? "거절" : "거절 (N)")));
    box.dataset.trade = from;
    box._answer = answer;
    $("#ui").append(box);
    let n = 30;
    const tm = setInterval(() => { n--; left.textContent = String(n); if (n <= 0) done(); }, 1000);
  },
  onTrade(msg) {
    try {
      if (G.trade) { if (!isOpen("trade")) WIN.openTrade(); else refreshWin("trade"); }
      else if (isOpen("trade")) closeWin("trade");
    } catch (e) { console.error("trade ui", e); }
    // 상대가 '거래하기'를 눌렀으면 수락/거절 창
    const T = G.trade, ask = document.querySelector(".invite.trade-ask");
    if (T && T.theirs.ok && !T.mine.ok) {
      if (!ask) {
        const sum = `${T.theirs.items.length ? T.theirs.items.length + "개 아이템" : ""}${T.theirs.items.length && T.theirs.gold ? " + " : ""}${T.theirs.gold ? T.theirs.gold.toLocaleString() + "G" : ""}` || "아무것도 없음";
        const give = `${T.mine.items.length ? T.mine.items.length + "개 아이템" : ""}${T.mine.items.length && T.mine.gold ? " + " : ""}${T.mine.gold ? T.mine.gold.toLocaleString() + "G" : ""}` || "아무것도 없음";
        const ver = T.ver;
        const answer = (ok) => { send({ t: "trade", op: ok ? "confirm" : "reject", ver }); box.remove(); };
        const box = h("div", { class: "invite trade-ask" }, h("div", { text: `💰 ${T.with}님이 거래하자고 해요. 받음: ${sum} / 줌: ${give}` }),
          h("div", { class: "flexrow" }, h("button", { class: "btn small primary", onclick: () => answer(true) }, G.touch ? "수락" : "수락 (Y)"), h("button", { class: "btn small", onclick: () => answer(false) }, G.touch ? "거절" : "거절 (N)")));
        box._answer = answer;
        $("#ui").append(box);
      }
    } else ask?.remove();
    if (msg) HUD.toast(msg, msg.includes("완료") ? "rank" : "info");
  },
  announce(text) { const a = $("#announce"); a.classList.toggle("hidden", !text); a.textContent = text ? "📢 " + text : ""; },
  kicked(why) { G.kickedWhy = why; },
  onWho() { if (isOpen("who")) refreshWin("who"); },
  onEnchant(m) { WIN.onEnchant(m); const { ENCHANTS } = WIN; HUD.toast(`인챈트: ✦ ${ENCHANTS[m.ench].name} (${ENCHANTS[m.ench].desc})`, m.ench === "mend" ? "mythic" : "rank"); },
  onEnhance(m) { WIN.onEnhance(m); HUD.toast(m.result === "success" ? `강화 성공! ${m.name} +${m.enh}` : m.result === "fail" ? `강화 실패 (${m.name} +${m.enh} 유지)` : m.result === "reset" ? `강화 폭발! 신화라 사라지지 않고 ${m.name} +0이 됐어요` : `${m.name}이(가) 파괴됐어요…`, m.result === "success" ? "rank" : m.result === "destroy" || m.result === "reset" ? "death" : "info"); },
  toast: HUD.toast,
  center: HUD.center,
  refreshKeys() { if (!G.touch) { HUD.buildHud(); HUD.updateSkillbar(); } },
  onDur() { HUD.updateBars(); for (const id of ["inv", "smithy"]) if (isOpen(id)) refreshWin(id); },
  showVote: HUD.showVote,
  gotItem(it) { HUD.toast(`획득: ${it.name} [${it.rarity}]`, it.rarity === "신화" ? "mythic" : it.rarity === "전설" ? "legend" : "info"); },
  onBoss: HUD.updateBoss,
  noRes() {},
  flashSkill: HUD.flashSkill,
  sfx,
  blockingWindow: () => false,
  async logout() { try { sessionStorage.removeItem("psim_go"); } catch {} if (!globalThis.__LOCAL_NET) await api("/api/logout"); location.reload(); },
};

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
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
  // 정수 배율에 가까우면 정수(또렷), 아니면 창을 꽉 채움 (작은 창에서 화면이 작게 가운데 뜨는 문제)
  const scale = fs >= 1 && !G.touch && fs - s < 0.15 ? s : fs;
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
  // 끊기면 화면을 그대로 둔 채 조용히 다시 연결 (예전엔 로그인 화면으로 튕겼다가 새로고침)
  //  서버가 30초 동안 던전 자리를 지켜 주므로 이어서 플레이. 새 버전이 배포된 경우만 새로고침
  let reconnecting = false;
  const reconnect = async () => {
    if (reconnecting) return;
    reconnecting = true;
    const bar = $("#reconnect") ?? $("#ui").appendChild(h("div", { id: "reconnect" }));
    bar.textContent = "연결이 잠깐 끊겼어요. 다시 연결하는 중...";
    bar.classList.remove("hidden");
    G.keys.clear(); G.stick = [0, 0];
    let wait = 400;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, wait));
      const v = await latestVersion().catch(() => null);
      if (v && v !== VERSION && VERSION !== "dev") return reloadNow((t) => (bar.textContent = t)); // 새 버전 → 새로고침
      try { await G.net.connect(); bar.classList.add("hidden"); reconnecting = false; return; } catch {}
      wait = Math.min(5000, wait * 1.6);
      bar.textContent = `다시 연결하는 중... (${i + 1})`;
    }
    reconnecting = false;
    showLost({ code: 1006 });
  };
  const showLost = (e) => {
    $("#game").classList.add("hidden");
    $("#login").classList.remove("hidden");
    $("#login-form").classList.add("hidden");
    $("#lf-msg").textContent = G.kickedWhy ?? (e.code === 1006 ? "서버와 연결이 끊겼어요." : "연결이 끊겼어요.");
    const b = h("button", { class: "btn primary", onclick: () => location.reload() }, "다시 접속");
    $(".login-card").append(b);
    // 쫓겨난 게 아니면(업데이트 배포·잠깐 끊김) 서버가 살아나는 대로 자동 재접속 = 새 버전 적용
    if (!G.kickedWhy) autoReconnect((t) => ($("#lf-msg").textContent = t));
  };
  G.net = new NetClass(onMessage, (e) => {
    // 쫓겨남(중복 접속·차단) 또는 로그인 만료(4401 등)는 로그인 화면으로, 그 밖의 끊김은 조용히 재연결
    if (G.kickedWhy || [4001, 4002, 4003, 4008].includes(e.code)) return showLost(e);
    reconnect();
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
  cv.addEventListener("mousedown", (e) => { toMouse(e); G.mouse.down[e.button] = true; const i = slotForMouse(e.button); if (i >= 0) tryCast(i); if (e.button === 1) e.preventDefault(); });
  addEventListener("mouseup", (e) => (G.mouse.down[e.button] = false));
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  $("#game").addEventListener("contextmenu", (e) => { if (!e.target.closest?.("input, textarea")) e.preventDefault(); });
  // 채팅 열기 (L 또는 메뉴의 '채팅' 버튼, Enter와 같음): 채팅 기록을 보이고 바로 입력할 수 있게
  //  예전엔 L이 채팅 기록 숨기기/보이기만 해서 '안 열린다'고 느껴졌고, 숨긴 상태가 저장돼 계속 안 보였음 → 저장된 숨김도 풀어 줌
  try { localStorage.removeItem("abyss.chatHidden"); } catch {}
  $("#chat").classList.remove("collapsed");
  G.toggleChat = () => {
    $("#chat").classList.remove("collapsed", "collapsed-tmp");
    document.body.classList.add("chat-open");
    if (G.touch) { if (document.activeElement === chat) chat.blur(); else chat.focus(); return; }
    chat.focus();
  };
  addEventListener("blur", () => { G.keys.clear(); G.mouse.down = [false, false, false]; });
  chat.addEventListener("focus", () => { G.typing = true; G.keys.clear(); document.body.classList.add("chat-open"); });
  chat.addEventListener("blur", () => { G.typing = false; setTimeout(() => { if (document.activeElement !== chat) document.body.classList.remove("chat-open"); }, 150); });
  // 보내기: 한 번만 (조합 끝 + Enter가 겹쳐도 두 번 안 감)
  let pendingEnter = false, sentAt = 0;
  const sendChat = () => {
    if (performance.now() - sentAt < 120) return;
    sentAt = G.chatSentAt = performance.now();
    const t = chat.value.trim();
    const tr = t.match(/^\/(?:거래|trade)\s+(\S+)/i); // /거래 닉네임
    if (tr) send({ t: "trade", op: "request", name: tr[1] }); else if (t) send({ t: "chat", text: t });
    chat.value = ""; chat.blur();
  };
  // 한글 조합 중에 누른 Enter: 윈도우 노트북 등에선 이 Enter 하나로 조합만 끝나고 Enter가 다시 오지 않음
  // → 조합이 끝나는 순간(compositionend) 보내기. 맥처럼 Enter가 한 번 더 오면 위 120ms 막기로 중복 방지
  chat.addEventListener("compositionend", () => { if (pendingEnter) { pendingEnter = false; setTimeout(() => { if (document.activeElement === chat) sendChat(); }, 0); } });
  chat.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.isComposing || e.keyCode === 229)) { pendingEnter = true; e.stopPropagation(); return; }
    if (e.key === "Enter" || e.key === "NumpadEnter") { pendingEnter = false; sendChat(); e.preventDefault(); }
    if (e.key === "Escape") chat.blur();
    e.stopPropagation();
  });
  addEventListener("keydown", (e) => {
    if (G.typing || e.target.tagName === "INPUT") return;
    if (e.code === "Enter" && performance.now() - (G.chatSentAt ?? -1e9) < 250) return; // 방금 보낸 Enter가 한 번 더 들어온 것 (맥 한글 입력)
    if (e.code === "Enter") { document.body.classList.add("chat-open"); $("#chat").classList.remove("collapsed-tmp"); chat.focus(); e.preventDefault(); return; }
    if (e.code === "Escape") { const w = openWins(); if (w.length) closeWin(w[w.length - 1]); return; }
    if ((e.code === "KeyY" || e.code === "KeyN") && document.querySelector("#vote .vb")) { send({ t: "vote", ok: e.code === "KeyY" }); return; }
    if ((e.code === "KeyY" || e.code === "KeyN") && document.querySelector(".invite")) { const b = [...document.querySelectorAll(".invite")].at(-1); b._answer?.(e.code === "KeyY"); return; }
    if (G.capturingKey) return; // 키 설정 창에서 새 키를 기다리는 중
    const si = slotForCode(e.code), pi = potionForCode(e.code);
    if (e.repeat && si < 0) return;
    G.keys.add(e.code);
    if (si >= 0) { tryCast(si); e.preventDefault(); }
    if (pi >= 0) { usePotion(["hp_potion", "mp_potion", "antidote"][pi]); e.preventDefault(); return; }
    if (e.code === "KeyC") toggleWin("char", WIN.openChar);
    if (e.code === "KeyK") toggleWin("skills", WIN.openSkills);
    if (e.code === "KeyI") toggleWin("inv", WIN.openInv);
    if (e.code === "KeyP") toggleWin("party", WIN.openParty);
    if (e.code === "KeyH") toggleWin("help", WIN.openHelp);
    if (e.code === "KeyG") { const o = HUD.interactTarget(); if (o) WIN.openNpc(o); }
    if (e.code === "KeyM") HUD.toggleBigMap();
    if (e.code === "KeyL") { e.preventDefault(); G.toggleChat?.(); return; } // preventDefault: 'l'이 입력칸에 찍히지 않게
    if (e.code === "KeyB") toggleWin("codex", WIN.openCodex);
    if (e.code === "KeyO") toggleWin("keys", WIN.openKeys);
    if (e.code === "KeyT" && si < 0) toggleWin("titles", WIN.openTitles);
    if (e.code === "KeyU" && si < 0) toggleWin("who", WIN.openWho);
    if (e.code === "KeyN") $("#minimap").classList.toggle("hidden-mini");
    if (e.code === "Tab") e.preventDefault();
  });
  addEventListener("keyup", (e) => {
    G.keys.delete(e.code);
    // 한글 입력기가 켜져 있으면 keyup의 code가 비어 오는 경우가 있음 → 이동키가 눌린 채로 남지 않게 전부 뗌
    if (!e.code || e.keyCode === 229) for (const k of [...G.keys]) if (MOVE_KEYS.has(k)) G.keys.delete(k);
  });
  // (예전의 '1.2초 동안 반복 신호 없으면 뗀 것으로 보기'는 삭제: 키 두 개를 누르면 브라우저가 마지막 키만 반복 신호를 보내서,
  //  대각선 이동 중 먼저 누른 키가 풀려 한쪽으로 안 가던 버그였음) → 창 전환·화면 숨김 때 전부 뗌
  document.addEventListener("visibilitychange", () => { if (document.hidden) G.keys.clear(); });
  // 입력창(파티 초대·닉네임 등)을 누르면 이동 입력을 모두 멈춤, 입력창에서 나오면 화면 위치·크기 다시 맞춤 (휴대폰 키보드 때문에 밀린 화면 복구)
  document.addEventListener("focusin", (e) => { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { G.keys.clear(); G.resetStick?.(); G.stick = [0, 0]; } });
  document.addEventListener("focusout", (e) => { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) for (const d of [50, 300, 700]) setTimeout(() => { scrollTo(0, 0); resize(); }, d); });
  // 창의 버튼을 누른 뒤 포커스가 버튼에 남아 키 입력을 먹지 않게
  document.addEventListener("pointerup", (e) => { const b = e.target.closest?.(".win button, .invite button, #vote button"); if (b) setTimeout(() => b.blur(), 0); });
  // 소리: 브라우저 정책상 처음 누를 때 켜짐
  const unlock = () => unlockAudio();
  addEventListener("pointerdown", unlock); addEventListener("keydown", unlock);
  const sb = $("#sound-btn");
  const paintSound = () => { sb.replaceChildren(pixImg(soundOn() ? "sound" : "mute"), ...(G.touch ? [] : [soundOn() ? "소리 켜짐" : "소리 꺼짐"])); sb.classList.toggle("off", !soundOn()); };
  paintSound();
  sb.addEventListener("click", () => { unlockAudio(); toggleSound(); paintSound(); sfx("click"); });
  const kb = $("#shake-btn");
  const paintShake = () => { kb.replaceChildren(pixImg(shakeEnabled() ? "shake" : "still"), ...(G.touch ? [] : [shakeEnabled() ? "흔들림 켜짐" : "흔들림 꺼짐"])); kb.classList.toggle("off", !shakeEnabled()); };
  paintShake();
  kb.addEventListener("click", () => { toggleShake(); paintShake(); sfx("click"); if (shakeEnabled()) addTrauma(0.4); });
  $("#minimap").addEventListener("click", () => HUD.toggleBigMap());
  $("#chat-btn")?.addEventListener("click", () => G.toggleChat?.());
  $("#bigmap").addEventListener("click", () => HUD.toggleBigMap());
  if (!G.touch) { for (const b of document.querySelectorAll("#menu-buttons button[data-win]")) b.prepend(pixImg(b.dataset.win)); $("#chat-btn")?.prepend(pixImg("chat")); }
  for (const b of document.querySelectorAll("#menu-buttons button[data-win]")) {
    const map = { char: WIN.openChar, skills: WIN.openSkills, inv: WIN.openInv, party: WIN.openParty, help: WIN.openHelp, codex: WIN.openCodex, keys: WIN.openKeys, titles: WIN.openTitles, who: WIN.openWho };
    b.addEventListener("click", () => toggleWin(b.dataset.win, map[b.dataset.win]));
  }
}

boot();

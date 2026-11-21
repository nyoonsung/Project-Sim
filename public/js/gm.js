// 관리자 페이지: 서버 현황, 플레이어 검색·상세·수정·지급·킥·밴·채금·이동, 공지, 감사 기록, 보안 로그
import { h, $, tipOn } from "./ui/dom.js";
import { TITLE_DESIGNS } from "/shared/titles.js";
import { itemTip } from "./ui/windows.js";
import { itemIcon } from "./ui/icons.js";
import { CLASS_INFO } from "/shared/classes.js";
import { MATERIALS, RARITIES, SLOT_NAME, SLOTS, WEAPON_TYPES, OFFHAND_TYPES, ARMOR_NAMES, VARIANT_TRAITS, RARITY_OPTS, OPTIONS, MYTHIC_EFFECTS, MYTHIC_TITLE_LIST, ENCHANTS, MAX_ENH, makeItem, optionMax } from "/shared/items.js";
import { ITEMS, TITLE_COLORS } from "/shared/constants.js";

const main = $("#gm-main");
const fmtT = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR") : "-");
const fmtDur = (s) => `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;

async function api(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `오류 ${r.status}`);
  return j;
}
function flash(el, ok, text) { el.className = ok ? "ok-msg" : "err-msg"; el.textContent = text; }

let tab = "overview", timer = null;
const TABS = {
  async overview() {
    const s = await api("/api/gm/overview");
    return [
      h("div", { class: "cards" },
        ...[["접속 중", s.online], ["열린 방", s.rooms.length], ["틱 처리 시간", s.tickMs + "ms"], ["가동 시간", fmtDur(s.uptime)], ["메모리", s.mem + "MB"]].map(([k, v]) => h("div", { class: "card" }, h("div", { class: "v", text: v }), h("div", { class: "k", text: k })))),
      s.announcement ? h("div", { class: "box", text: "📢 고정 공지: " + s.announcement.text }) : null,
      h("h3", { text: "진행 중인 방" }),
      ...s.rooms.map((r) => h("div", { class: "room" },
        h("b", { text: r.kind === "town" ? "마을" : r.kind === "safe" ? `${r.floor}층 안전 구역` : `${r.floor}층 던전` }),
        h("span", { class: "mono", text: `  #${r.id} · 몬스터 ${r.monsters} · ${r.age}초 전 생성${r.boss ? " · 보스: " + r.boss : ""}` }),
        h("div", {}, ...r.players.map((p) => h("span", { class: "badge", text: `${p.name} Lv.${p.lv} ${CLASS_INFO[p.cls]?.name ?? ""} ${p.dead ? "💀" : `${p.hp}/${p.mh}`}` }))))),
    ];
  },
  async players() {
    const q = h("input", { placeholder: "닉네임 검색", value: lastQ });
    const list = await api(`/api/gm/players?q=${encodeURIComponent(lastQ)}`);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { lastQ = q.value.trim(); render(); } });
    return [
      h("div", { class: "toolbar" }, q, h("button", { class: "btn small", onclick: () => { lastQ = q.value.trim(); render(); } }, "검색")),
      h("table", { class: "tbl" },
        h("tr", {}, ...["", "닉네임", "직업", "Lv", "제1 던전 최고 층", "제2 던전 최고 층", "위치", "가입", "최근 접속", "상태"].map((t) => h("th", { text: t }))),
        ...list.list.map((p) => h("tr", { class: "click", onclick: () => openPlayer(p.id) },
          h("td", {}, h("span", { class: "on-dot" + (p.online ? " y" : "") })), h("td", { text: p.username }), h("td", { text: CLASS_INFO[p.cls]?.name ?? "-" }), h("td", { text: p.level ?? "-" }), h("td", { text: p.best_floor ?? "-" }), h("td", { text: p.best2 ?? 0 }),
          h("td", { text: p.online ? (p.room === "town" ? "마을" : `${p.floor}층`) : "-" }), h("td", { text: fmtT(p.created_at) }), h("td", { text: fmtT(p.last_login) }),
          h("td", {}, p.banned_until > Date.now() ? h("span", { class: "badge ban", text: "차단" }) : null, p.muted_until > Date.now() ? h("span", { class: "badge mute", text: "채금" }) : null)))),
    ];
  },
  async notice() {
    const ta = h("textarea", { rows: 3, cols: 60, maxlength: 200, placeholder: "공지 내용 (최대 200자)" });
    const m1 = h("span"), m2 = h("span");
    const bc = h("input", { class: "txt", maxlength: 200, placeholder: "전체 채팅으로 한 번 보낼 메시지" });
    return [
      h("div", { class: "box" }, h("h3", { text: "고정 공지 (화면 위에 계속 표시)" }), ta, h("div", { class: "flexrow" },
        h("button", { class: "btn small primary", onclick: async () => { try { await api("/api/gm/announce", { text: ta.value }); flash(m1, true, "공지를 걸었어요."); } catch (e) { flash(m1, false, e.message); } } }, "공지 걸기"),
        h("button", { class: "btn small", onclick: async () => { await api("/api/gm/announce", { text: "" }); flash(m1, true, "공지를 내렸어요."); } }, "공지 내리기"), m1)),
      h("div", { class: "box" }, h("h3", { text: "전체 메시지" }), h("div", { class: "flexrow" }, bc,
        h("button", { class: "btn small primary", onclick: async () => { try { await api("/api/gm/broadcast", { text: bc.value }); bc.value = ""; flash(m2, true, "보냈어요."); } catch (e) { flash(m2, false, e.message); } } }, "보내기"), m2)),
    ];
  },
  async audit() {
    const { list } = await api("/api/gm/audit");
    return [h("table", { class: "tbl" }, h("tr", {}, ...["시간", "누가", "작업", "대상", "내용"].map((t) => h("th", { text: t }))),
      ...list.map((a) => h("tr", {}, h("td", { text: fmtT(a.at) }), h("td", { text: a.gm_name }), h("td", { text: a.action }), h("td", { text: a.target_name ?? "-" }), h("td", { class: "mono", text: a.detail ?? "" }))))];
  },
  async security() {
    const { list } = await api("/api/gm/security");
    const KIND = { admin_login: "관리자 로그인", admin_key_fail: "관리자 비밀번호 틀림", admin_setup: "관리자 비밀번호 설정", admin_password: "관리자 비밀번호 변경", login_fail: "로그인 실패", login_banned: "차단 계정 로그인", register: "가입", csrf_block: "다른 출처 요청 차단", ws_reject: "웹소켓 거부", ws_flood: "메시지 폭주", ws_bad_frame: "비정상 프레임", ws_bad_json: "잘못된 JSON", ws_bad_msg: "잘못된 메시지", ws_bad_schema: "형식 위반 메시지", ws_kick_abuse: "악용으로 연결 차단", gm_denied: "관리자 아닌 접근", password_change: "비밀번호 변경" };
    return [h("table", { class: "tbl" }, h("tr", {}, ...["시간", "종류", "계정", "IP", "내용"].map((t) => h("th", { text: t }))),
      ...list.map((a) => h("tr", {}, h("td", { text: fmtT(a.at) }), h("td", { text: KIND[a.kind] ?? a.kind }), h("td", { text: a.username ?? "-" }), h("td", { class: "mono", text: a.ip ?? "" }), h("td", { class: "mono", text: a.detail ?? "" }))))];
  },
};
let lastQ = "";

async function openPlayer(id) {
  tab = "player";
  clearInterval(timer);
  for (const b of document.querySelectorAll("nav button")) b.classList.remove("on");
  const d = await api(`/api/gm/player/${id}`);
  const u = d.user, c = d.char;
  const msg = h("div");
  const act = (path, body, after) => async () => { try { const r = await api(`/api/gm/player/${id}/${path}`, body()); flash(msg, true, r.tempPassword ? `임시 비밀번호: ${r.tempPassword}  (플레이어에게 알려 주세요)` : "완료했어요." + (r.item ? ` (${r.item.name})` : "")); if (r.tempPassword) return; after?.(); setTimeout(() => openPlayer(id), 400); } catch (e) { flash(msg, false, e.message); } };
  const field = (lbl, el) => [h("span", { text: lbl }), el];
  const lv = h("input", { type: "number", min: 1, max: 150, value: c?.level ?? 1 });
  const gold = h("input", { type: "number", min: 0, step: 1, value: c?.gold ?? 0 });
  const pts = h("input", { type: "number", min: 0, step: 1, value: c?.unspent ?? 0 });
  const cp = h("select", {}, ...[1, 11, 21, 31, 41, 51, 61, 71, 81, 91].map((f) => h("option", { value: f, selected: c?.checkpoint === f }, `${f}층`)));
  const cls = h("select", {}, ...Object.entries(CLASS_INFO).map(([k, v]) => h("option", { value: k, selected: c?.cls === k }, v.name)));
  const cons = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, h("input", { type: "number", min: 0, max: ITEMS[k].max, value: c?.cons?.[k] ?? 0 })]));
  const rar = h("select", {}, ...RARITIES.map((r) => h("option", { value: r }, r)));
  const titleT = h("input", { type: "text", maxlength: 16, placeholder: "예: 던전의 정복자" });
  const titleD = h("select", { onchange: () => { if (titleD.value) titleT.value = titleD.value; } }, h("option", { value: "" }, "디자인 없음(글자)"), ...Object.keys(TITLE_DESIGNS).map((k) => h("option", { value: k }, `🎨 ${k}`)));
  const titleC = { v: TITLE_COLORS[0] };
  const ilvl = h("input", { type: "number", min: 1, max: 100, value: Math.max(1, c?.best || 1) });
  const slot = h("select", {}, h("option", { value: "" }, "무작위"), ...Object.entries(SLOT_NAME).map(([k, v]) => h("option", { value: k }, v)));
  const banH = h("input", { type: "number", min: 0, value: 24 });
  const banR = h("input", { maxlength: 200, placeholder: "사유" });
  const muteM = h("input", { type: "number", min: 0, value: 30 });
  const warpF = h("input", { type: "number", min: 1, max: 100, value: c?.checkpoint ?? 1 });
  const warpD = h("select", {}, h("option", { value: 1 }, "제1 던전"), h("option", { value: 2 }, "제2 던전 (1~30)"));
  const itemCell = (it, where) => {
    const cv = document.createElement("canvas"); cv.width = 18; cv.height = 18; cv.getContext("2d").drawImage(itemIcon(it), 0, 0);
    const el = h("div", { class: "cell r-" + it.rarity }, cv, it.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null);
    tipOn(el, () => [...itemTip(it), h("div", { class: "tt-sub", text: `uid ${it.uid} · ${where} · 클릭하면 회수` })]);
    el.addEventListener("click", act("remove-item", () => ({ uid: it.uid })));
    return el;
  };
  main.replaceChildren(
    h("div", { class: "toolbar" }, h("button", { class: "btn small", onclick: () => { tab = "players"; render(); } }, "← 목록"),
      h("b", { text: u.username }), h("span", { class: "on-dot" + (d.online ? " y" : "") }),
      d.online ? h("span", { text: `${d.room.kind === "town" ? "마을" : `${d.room.floor}층`} · HP ${d.room.hp}/${d.room.mh}` }) : h("span", { class: "note", text: "오프라인" }),
      u.banned_until > Date.now() ? h("span", { class: "badge ban", text: `차단 ~${fmtT(u.banned_until)} (${u.ban_reason ?? ""})` }) : null,
      u.muted_until > Date.now() ? h("span", { class: "badge mute", text: `채금 ~${fmtT(u.muted_until)}` }) : null),
    msg,
    h("div", { class: "split" },
      h("div", {},
        h("div", { class: "box" }, h("h3", { text: "캐릭터 수정" }),
          h("div", { class: "form" }, ...field("레벨", lv), ...field("골드", gold), ...field("스탯 포인트", pts), ...field("체크포인트", cp), ...field("직업", cls),
            ...Object.entries(cons).flatMap(([k, el]) => field(ITEMS[k].name, el))),
          h("div", { class: "note", text: "골드와 미사용 스탯 포인트는 별도 지급 상한이 없어요. 0 이상의 정수로 입력해 주세요. (직업을 바꾸면 투자한 스탯은 미사용 포인트로 돌아가요.)" }),
          h("button", { class: "btn small primary", onclick: act("edit", () => ({ level: +lv.value, gold: +gold.value, unspent: +pts.value, checkpoint: +cp.value, cls: cls.value, cons: Object.fromEntries(Object.entries(cons).map(([k, el]) => [k, +el.value])) })) }, "저장")),
        exactGiveBox(c, act),
        h("details", { class: "box" }, h("summary", { text: "무작위 아이템 지급" }), h("div", { class: "form" }, ...field("등급", rar), ...field("아이템 레벨", ilvl), ...field("부위", slot)),
          h("button", { class: "btn small primary", onclick: act("give", () => ({ rarity: rar.value, ilvl: +ilvl.value, slot: slot.value || undefined })) }, "무작위로 지급")),
        h("div", { class: "box" }, h("h3", { text: "칭호 (관리자만 줄 수 있음)" }),
          h("div", { class: "form" }, ...field("디자인", titleD), ...field("칭호", titleT), ...field("색", h("div", { class: "flexrow" }, ...TITLE_COLORS.map((col) => { const b = h("button", { class: "btn small swatch" + (titleC.v === col ? " on" : ""), style: { background: col, width: "22px", height: "18px", padding: 0 }, title: col, onclick: () => { titleC.v = col; for (const x of b.parentNode.children) x.classList.toggle("on", x === b); } }); return b; })))),
          h("button", { class: "btn small primary", onclick: act("give-title", () => ({ text: titleT.value, color: titleC.v })) }, "칭호 주기"),
          h("div", { class: "note" }, ...((c?.titles ?? []).length ? c.titles.map((t) => h("span", { class: "gm-title", style: { color: t.color } }, `「${t.text}」${c.title === t.id ? "(장착)" : ""} `, h("button", { class: "btn small danger", onclick: act("remove-title", () => ({ tid: t.id })) }, "회수"))) : ["가진 칭호 없음"]))),
        accountBox(u, act, msg),
        h("div", { class: "box" }, h("h3", { text: "제재 · 이동" }),
          h("div", { class: "form" },
            ...field("차단(시간)", h("div", { class: "flexrow" }, banH, banR, h("button", { class: "btn small danger", onclick: act("ban", () => ({ hours: +banH.value, reason: banR.value })) }, "차단"), h("button", { class: "btn small", onclick: act("ban", () => ({ hours: 0 })) }, "해제"))),
            ...field("채팅 금지(분)", h("div", { class: "flexrow" }, muteM, h("button", { class: "btn small danger", onclick: act("mute", () => ({ minutes: +muteM.value })) }, "채금"), h("button", { class: "btn small", onclick: act("mute", () => ({ minutes: 0 })) }, "해제"))),
            ...field("연결 끊기", h("button", { class: "btn small danger", onclick: act("kick", () => ({ reason: "관리자에 의해 연결이 끊겼어요." })) }, "킥")),
            ...field("비밀번호", h("button", { class: "btn small", onclick: act("reset-password", () => ({})) }, "임시 비밀번호 발급")),
            ...field("마을로", h("button", { class: "btn small", onclick: act("town", () => ({})) }, "마을로 이동")),
            ...field("층 이동", h("div", { class: "flexrow" }, warpD, warpF, h("button", { class: "btn small", onclick: act("warp", () => ({ floor: +warpF.value, dungeon: +warpD.value })) }, "이동"))),
          )),
      ),
      h("div", {},
        c ? h("div", { class: "box" }, h("h3", { text: `${c.name} · Lv.${c.level} ${CLASS_INFO[c.cls]?.name}` }),
          h("div", { class: "note", text: `경험치 ${c.xp} · 골드 ${c.gold.toLocaleString()} · 제1 던전 최고 ${c.best ?? 0}층 · 제2 던전 최고 ${c.best2 ?? 0}층 · 체크포인트 ${c.checkpoint}층 · 처치 ${c.kills} · 쓰러짐 ${c.deaths} · 플레이 ${fmtDur(c.playtime)}${c.cleared ? " · 🏆 정복" : ""}` }),
          h("div", { class: "note", text: "스탯: " + JSON.stringify(c.stats) + ` · 남은 ${c.unspent}` }),
          h("div", { class: "note", text: "스킬: " + c.skills.filter(Boolean).join(", ") }),
          h("h4", { text: "장착" }), h("div", { class: "items" }, ...Object.values(c.equip).filter(Boolean).map((it) => itemCell(it, "장착"))),
          h("h4", { text: `가방 ${c.inv.length}/40` }), h("div", { class: "items" }, ...c.inv.map((it) => itemCell(it, "가방")))) : h("div", { class: "box", text: "캐릭터 없음" }),
        h("div", { class: "box" }, h("h3", { text: "계정" }), h("div", { class: "mono", text: `가입 ${fmtT(u.created_at)} · 최근 접속 ${fmtT(u.last_login)} · IP ${u.last_ip ?? "-"}` })),
        h("div", { class: "box" }, h("h3", { text: "아이템·강화 기록" }), h("table", { class: "tbl" }, ...d.items.map((x) => h("tr", {}, h("td", { text: fmtT(x.at) }), h("td", { text: x.kind }), h("td", { class: "mono", text: x.detail }))))),
        h("div", { class: "box" }, h("h3", { text: "보안 기록" }), h("table", { class: "tbl" }, ...d.security.map((x) => h("tr", {}, h("td", { text: fmtT(x.at) }), h("td", { text: x.kind }), h("td", { class: "mono", text: x.detail ?? "" }))))),
      )));
}

async function render() {
  clearInterval(timer);
  for (const b of document.querySelectorAll("nav button")) b.classList.toggle("on", b.dataset.tab === tab);
  try { main.replaceChildren(...(await TABS[tab]()).filter((x) => x != null)); } catch (e) { main.replaceChildren(h("div", { class: "err-msg", text: e.message })); }
  if (tab === "overview") timer = setInterval(async () => { if (tab === "overview") main.replaceChildren(...(await TABS.overview()).filter((x) => x != null)); }, 3000);
}

async function boot() {
  const post = async (path, body) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? null : j.error ?? "실패했어요.";
  };
  // 내 컴퓨터 서버 창의 주소(#key=...)로 들어오면 자동 로그인, 주소창에서 키는 바로 지움
  const m = location.hash.match(/key=([A-Za-z0-9_-]+)/);
  if (m) { history.replaceState(null, "", "/gm"); await post("/api/admin/login", { key: m[1] }); }
  const st = await fetch("/api/admin/me", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}));
  if (!st.admin) {
    $("#gm-login").classList.remove("hidden");
    if (st.setup) {
      $("#gm-note").textContent = "처음이에요! 이 서버의 관리자 비밀번호를 정해 주세요. (8자 이상, 영문+숫자) 이 비밀번호를 아는 사람만 관리자 페이지에 들어올 수 있어요.";
      $("#gm-key").placeholder = "새 관리자 비밀번호";
      $("#gm-key").autocomplete = "new-password";
      $("#gm-key2").classList.remove("hidden");
      $("#gm-key2").required = true;
      $("#gm-go").textContent = "관리자 비밀번호 정하기";
    }
    $("#gm-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("#gm-key").value;
      if (st.setup && pw !== $("#gm-key2").value) { $("#gm-msg").textContent = "두 비밀번호가 달라요."; return; }
      const err = st.setup ? await post("/api/admin/setup", { password: pw }) : await post("/api/admin/login", { key: pw });
      if (err) $("#gm-msg").textContent = err; else location.reload();
    });
    return;
  }
  $("#gm-who").textContent = "관리자";
  $("#gm-out").addEventListener("click", async () => { await post("/api/admin/logout", {}); location.reload(); });
  $("#gm-pw").addEventListener("click", async () => {
    const next = prompt("새 관리자 비밀번호 (8자 이상, 영문+숫자)");
    if (!next) return;
    const err = await post("/api/admin/password", { next });
    alert(err ?? "관리자 비밀번호를 바꿨어요.");
  });
  for (const b of document.querySelectorAll("nav button")) b.addEventListener("click", () => { tab = b.dataset.tab; render(); });
  render();
}
window.addEventListener("hashchange", () => { if (/key=/.test(location.hash)) location.reload(); });
boot();

// ── 아이템 직접 만들어 지급: 부위 → 종류 → 등급·레벨·강화 → 옵션(종류·값) → 신화 효과·이름 → 인챈트, 오른쪽에 미리보기
const isPct = (k) => OPTIONS[k].fmt(0.1).includes("%");
function exactGiveBox(c, act) {
  const field = (lbl, el) => [h("span", { text: lbl }), el];
  const st = { slot: "weapon", type: "sword", variant: 0, rarity: "전설", ilvl: Math.max(1, c?.level || 1), enh: 0, opts: [], mythic: Object.keys(MYTHIC_EFFECTS)[0], title: MYTHIC_TITLE_LIST[0], ench: "", mat: "" };
  const form = h("div", { class: "form" }), preview = h("div", { class: "gm-preview" });
  const sel = (val, list, on) => { const e = h("select", { onchange: () => on(e.value) }, ...list.map(([v, t]) => h("option", { value: v, ...(String(v) === String(val) ? { selected: true } : {}) }, t))); return e; };
  const num = (val, min, max, on, step = 1) => h("input", { type: "number", min, max, step, value: val, oninput: (e) => on(e.target.value) });
  const ri = () => RARITIES.indexOf(st.rarity);
  const defVal = (k) => { const m = optionMax(k, st.ilvl, ri()); return isPct(k) ? +(m * 100).toFixed(1) : m; };
  const fitOpts = () => {
    const n = RARITY_OPTS[ri()], keys = Object.keys(OPTIONS);
    st.opts = st.opts.slice(0, n);
    while (st.opts.length < n) { const k = keys.find((x) => !st.opts.some((o) => o.k === x)); st.opts.push({ k, v: defVal(k) }); }
  };
  const spec = () => ({ ...st, opts: st.opts.map((o) => ({ k: o.k, v: isPct(o.k) ? Number(o.v) / 100 : Number(o.v) })), ench: st.ench || null, mat: st.mat === "" ? null : +st.mat });
  const draw = () => {
    fitOpts();
    const types = st.slot === "weapon" ? Object.entries(WEAPON_TYPES).map(([k, v]) => [k, `${v.name} (${v.cls.filter((x) => x !== "adventurer").map((x) => CLASS_INFO[x]?.name ?? x).join("·") || "모험가"})`])
      : st.slot === "offhand" ? Object.entries(OFFHAND_TYPES).map(([k, v]) => [k, v.name])
      : ARMOR_NAMES[st.slot].map((nm, i) => [i, `${nm} — ${VARIANT_TRAITS[st.slot][i].desc}`]);
    if (st.slot === "weapon" && !WEAPON_TYPES[st.type]) st.type = "sword";
    if (st.slot === "offhand" && !OFFHAND_TYPES[st.type]) st.type = "shield";
    const rows = [
      ["부위", sel(st.slot, SLOTS.map((k) => [k, SLOT_NAME[k]]), (v) => { st.slot = v; draw(); })],
      ["종류", st.slot === "weapon" || st.slot === "offhand" ? sel(st.type, types, (v) => { st.type = v; draw(); }) : sel(st.variant, types, (v) => { st.variant = +v; draw(); })],
      ["재료(이름)", sel(st.mat, [["", "레벨에 맞춤 (자동)"], ...MATERIALS.map((m, i) => [i, `${m} (${i * 10 + 1}~${i * 10 + 10}층 재료)`])], (v) => { st.mat = v; upd(); })],
      ["등급", sel(st.rarity, RARITIES.map((r) => [r, r]), (v) => { st.rarity = v; for (const o of st.opts) o.v = defVal(o.k); draw(); })],
      ["아이템 레벨", h("input", { type: "number", min: 1, max: 100, value: st.ilvl, onchange: (e) => { st.ilvl = Math.max(1, Math.min(100, +e.target.value || 1)); for (const o of st.opts) o.v = defVal(o.k); draw(); } })],
      ["강화", num(st.enh, 0, MAX_ENH, (v) => { st.enh = +v || 0; upd(); })],
      ...st.opts.map((o, i) => [`옵션 ${i + 1}`, h("div", { class: "flexrow" },
        sel(o.k, Object.entries(OPTIONS).filter(([k]) => k === o.k || !st.opts.some((x) => x.k === k)).map(([k, v]) => [k, v.name + (isPct(k) ? " (%)" : "")]), (v) => { o.k = v; o.v = defVal(v); draw(); }),
        num(o.v, 0, 9999, (v) => { o.v = v; upd(); }, isPct(o.k) ? 0.1 : 0.1))]),
      ...(st.rarity === "신화" ? [
        ["신화 효과", sel(st.mythic, Object.entries(MYTHIC_EFFECTS).map(([k, v]) => [k, `${v.name} — ${v.desc}`]), (v) => { st.mythic = v; upd(); })],
        ["이름 앞말", sel(st.title, MYTHIC_TITLE_LIST.map((t) => [t, t]), (v) => { st.title = v; upd(); })]] : []),
      ["인챈트", sel(st.ench, [["", "없음"], ...Object.entries(ENCHANTS).map(([k, v]) => [k, `${v.name} — ${v.desc}`])], (v) => { st.ench = v; upd(); })],
    ];
    form.replaceChildren(...rows.flatMap(([k, el]) => field(k, el)));
    upd();
  };
  const upd = () => { const it = makeItem(spec()); preview.replaceChildren(...(it ? itemTip(it) : [h("div", { text: "-" })])); };
  draw();
  return h("div", { class: "box" }, h("h3", { text: "아이템 직접 만들어 지급" }),
    h("div", { class: "gm-give" }, form, preview),
    h("div", { class: "note", text: "옵션 값은 기본으로 그 레벨·등급의 일반 최대치가 들어가요. (최대 3배까지 입력 가능, % 옵션은 % 숫자로) 신화는 받는 사람 레벨에 맞춰 아이템 레벨이 자동으로 바뀌어요." }),
    h("button", { class: "btn small primary", onclick: act("give-exact", () => ({ spec: spec() })) }, "이 아이템 지급"));
}

// ── 닉네임 강제 변경 · 계정 삭제
function accountBox(u, act, msg) {
  const nameIn = h("input", { maxlength: 12, placeholder: "새 닉네임 (2~12자)", value: "" });
  const delIn = h("input", { maxlength: 12, placeholder: `확인: ${u.username} 입력` });
  const del = async () => {
    if (delIn.value !== u.username) return flash(msg, false, `삭제하려면 아래 칸에 닉네임 '${u.username}'을(를) 그대로 입력하세요.`);
    if (!confirm(`정말 ${u.username} 계정을 삭제할까요?\n캐릭터·아이템·골드가 모두 사라지고 되돌릴 수 없어요.`)) return;
    try {
      await api(`/api/gm/player/${u.id}/delete-account`, { confirm: delIn.value });
      flash(msg, true, `${u.username} 계정을 삭제했어요.`);
      setTimeout(() => { tab = "players"; render(); }, 900);
    } catch (e) { flash(msg, false, e.message); }
  };
  return h("div", { class: "box" }, h("h3", { text: "닉네임 · 계정" }),
    h("div", { class: "form" },
      h("span", { text: "닉네임 변경" }), h("div", { class: "flexrow" }, nameIn, h("button", { class: "btn small primary", onclick: act("rename", () => ({ name: nameIn.value })) }, "강제 변경")),
      h("span", { text: "계정 삭제" }), h("div", { class: "flexrow" }, delIn, h("button", { class: "btn small danger", onclick: del }, "계정 삭제"))),
    h("div", { class: "note", text: "닉네임 변경은 1시간 제한 없이 바로 바뀌고, 플레이어는 새 닉네임으로 로그인해야 해요. 계정 삭제는 캐릭터까지 완전히 지우며 되돌릴 수 없어요(기록은 감사 로그에 남아요)." }));
}

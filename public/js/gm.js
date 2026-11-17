// GM 패널: 서버 현황, 플레이어 검색·상세·수정·지급·킥·밴·채금·이동, 공지, 감사 기록, 보안 로그
import { h, $, tipOn } from "./ui/dom.js";
import { itemTip } from "./ui/windows.js";
import { itemIcon } from "./ui/icons.js";
import { CLASS_INFO } from "/shared/classes.js";
import { RARITIES, SLOT_NAME } from "/shared/items.js";
import { ITEMS } from "/shared/constants.js";

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
        h("tr", {}, ...["", "닉네임", "직업", "Lv", "최고 층", "위치", "가입", "최근 접속", "상태"].map((t) => h("th", { text: t }))),
        ...list.list.map((p) => h("tr", { class: "click", onclick: () => openPlayer(p.id) },
          h("td", {}, h("span", { class: "on-dot" + (p.online ? " y" : "") })), h("td", { text: p.username }), h("td", { text: CLASS_INFO[p.cls]?.name ?? "-" }), h("td", { text: p.level ?? "-" }), h("td", { text: p.best_floor ?? "-" }),
          h("td", { text: p.online ? (p.room === "town" ? "마을" : `${p.floor}층`) : "-" }), h("td", { text: fmtT(p.created_at) }), h("td", { text: fmtT(p.last_login) }),
          h("td", {}, p.role === "gm" ? h("span", { class: "badge gm", text: "GM" }) : null, p.banned_until > Date.now() ? h("span", { class: "badge ban", text: "차단" }) : null, p.muted_until > Date.now() ? h("span", { class: "badge mute", text: "채금" }) : null)))),
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
    return [h("table", { class: "tbl" }, h("tr", {}, ...["시간", "GM", "작업", "대상", "내용"].map((t) => h("th", { text: t }))),
      ...list.map((a) => h("tr", {}, h("td", { text: fmtT(a.at) }), h("td", { text: a.gm_name }), h("td", { text: a.action }), h("td", { text: a.target_name ?? "-" }), h("td", { class: "mono", text: a.detail ?? "" }))))];
  },
  async security() {
    const { list } = await api("/api/gm/security");
    const KIND = { login_fail: "로그인 실패", login_banned: "차단 계정 로그인", register: "가입", csrf_block: "다른 출처 요청 차단", ws_reject: "웹소켓 거부", ws_flood: "메시지 폭주", ws_bad_frame: "비정상 프레임", ws_bad_json: "잘못된 JSON", ws_bad_msg: "잘못된 메시지", ws_bad_schema: "형식 위반 메시지", ws_kick_abuse: "악용으로 연결 차단", gm_denied: "GM 권한 없는 접근", password_change: "비밀번호 변경" };
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
  const act = (path, body, after) => async () => { try { const r = await api(`/api/gm/player/${id}/${path}`, body()); flash(msg, true, "완료했어요." + (r.item ? ` (${r.item.name})` : "")); after?.(); setTimeout(() => openPlayer(id), 400); } catch (e) { flash(msg, false, e.message); } };
  const field = (lbl, el) => [h("span", { text: lbl }), el];
  const lv = h("input", { type: "number", min: 1, max: 150, value: c?.level ?? 1 });
  const gold = h("input", { type: "number", min: 0, value: c?.gold ?? 0 });
  const pts = h("input", { type: "number", min: 0, value: c?.unspent ?? 0 });
  const cp = h("select", {}, ...[1, 11, 21, 31, 41, 51, 61, 71, 81, 91].map((f) => h("option", { value: f, selected: c?.checkpoint === f }, `${f}층`)));
  const cls = h("select", {}, ...Object.entries(CLASS_INFO).map(([k, v]) => h("option", { value: k, selected: c?.cls === k }, v.name)));
  const cons = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, h("input", { type: "number", min: 0, max: ITEMS[k].max, value: c?.cons?.[k] ?? 0 })]));
  const rar = h("select", {}, ...RARITIES.map((r) => h("option", { value: r }, r)));
  const ilvl = h("input", { type: "number", min: 1, max: 100, value: Math.max(1, c?.best || 1) });
  const slot = h("select", {}, h("option", { value: "" }, "무작위"), ...Object.entries(SLOT_NAME).map(([k, v]) => h("option", { value: k }, v)));
  const banH = h("input", { type: "number", min: 0, value: 24 });
  const banR = h("input", { maxlength: 200, placeholder: "사유" });
  const muteM = h("input", { type: "number", min: 0, value: 30 });
  const warpF = h("input", { type: "number", min: 1, max: 100, value: c?.checkpoint ?? 1 });
  const newPw = h("input", { type: "password", placeholder: "새 비밀번호 (8자+, 영문+숫자)" });
  const itemCell = (it, where) => {
    const cv = document.createElement("canvas"); cv.width = 18; cv.height = 18; cv.getContext("2d").drawImage(itemIcon(it), 0, 0);
    const el = h("div", { class: "cell r-" + it.rarity }, cv, it.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null);
    tipOn(el, () => [...itemTip(it), h("div", { class: "tt-sub", text: `uid ${it.uid} · ${where} · 클릭하면 회수` })]);
    el.addEventListener("click", act("remove-item", () => ({ uid: it.uid })));
    return el;
  };
  main.replaceChildren(
    h("div", { class: "toolbar" }, h("button", { class: "btn small", onclick: () => { tab = "players"; render(); } }, "← 목록"),
      h("b", { text: u.username }), u.role === "gm" ? h("span", { class: "badge gm", text: "GM" }) : null, h("span", { class: "on-dot" + (d.online ? " y" : "") }),
      d.online ? h("span", { text: `${d.room.kind === "town" ? "마을" : `${d.room.floor}층`} · HP ${d.room.hp}/${d.room.mh}` }) : h("span", { class: "note", text: "오프라인" }),
      u.banned_until > Date.now() ? h("span", { class: "badge ban", text: `차단 ~${fmtT(u.banned_until)} (${u.ban_reason ?? ""})` }) : null,
      u.muted_until > Date.now() ? h("span", { class: "badge mute", text: `채금 ~${fmtT(u.muted_until)}` }) : null),
    msg,
    h("div", { class: "split" },
      h("div", {},
        h("div", { class: "box" }, h("h3", { text: "캐릭터 수정" }),
          h("div", { class: "form" }, ...field("레벨", lv), ...field("골드", gold), ...field("스탯 포인트", pts), ...field("체크포인트", cp), ...field("직업", cls),
            ...Object.entries(cons).flatMap(([k, el]) => field(ITEMS[k].name, el))),
          h("div", { class: "note", text: "직업을 바꾸면 투자한 스탯이 미사용 포인트로 돌아가요." }),
          h("button", { class: "btn small primary", onclick: act("edit", () => ({ level: +lv.value, gold: +gold.value, unspent: +pts.value, checkpoint: +cp.value, cls: cls.value, cons: Object.fromEntries(Object.entries(cons).map(([k, el]) => [k, +el.value])) })) }, "저장")),
        h("div", { class: "box" }, h("h3", { text: "아이템 지급" }), h("div", { class: "form" }, ...field("등급", rar), ...field("아이템 레벨", ilvl), ...field("부위", slot)),
          h("button", { class: "btn small primary", onclick: act("give", () => ({ rarity: rar.value, ilvl: +ilvl.value, slot: slot.value || undefined })) }, "지급")),
        h("div", { class: "box" }, h("h3", { text: "제재 · 이동" }),
          h("div", { class: "form" },
            ...field("차단(시간)", h("div", { class: "flexrow" }, banH, banR, h("button", { class: "btn small danger", onclick: act("ban", () => ({ hours: +banH.value, reason: banR.value })) }, "차단"), h("button", { class: "btn small", onclick: act("ban", () => ({ hours: 0 })) }, "해제"))),
            ...field("채팅 금지(분)", h("div", { class: "flexrow" }, muteM, h("button", { class: "btn small danger", onclick: act("mute", () => ({ minutes: +muteM.value })) }, "채금"), h("button", { class: "btn small", onclick: act("mute", () => ({ minutes: 0 })) }, "해제"))),
            ...field("연결 끊기", h("button", { class: "btn small danger", onclick: act("kick", () => ({ reason: "GM에 의해 연결이 끊겼어요." })) }, "킥")),
            ...field("마을로", h("button", { class: "btn small", onclick: act("town", () => ({})) }, "마을로 이동")),
            ...field("층 이동", h("div", { class: "flexrow" }, warpF, h("button", { class: "btn small", onclick: act("warp", () => ({ floor: +warpF.value })) }, "이동"))),
            ...field("비밀번호", h("div", { class: "flexrow" }, newPw, h("button", { class: "btn small", onclick: act("reset-password", () => ({ password: newPw.value })) }, "재설정"))),
            ...field("권한", h("div", { class: "flexrow" }, h("button", { class: "btn small", onclick: act("role", () => ({ role: "gm" })) }, "GM 지정"), h("button", { class: "btn small", onclick: act("role", () => ({ role: "player" })) }, "일반으로"))))),
      ),
      h("div", {},
        c ? h("div", { class: "box" }, h("h3", { text: `${c.name} · Lv.${c.level} ${CLASS_INFO[c.cls]?.name}` }),
          h("div", { class: "note", text: `경험치 ${c.xp} · 골드 ${c.gold.toLocaleString()} · 최고 ${c.best}층 · 체크포인트 ${c.checkpoint}층 · 처치 ${c.kills} · 쓰러짐 ${c.deaths} · 플레이 ${fmtDur(c.playtime)}${c.cleared ? " · 🏆 정복" : ""}` }),
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
  try { main.replaceChildren(...(await TABS[tab]())); } catch (e) { main.replaceChildren(h("div", { class: "err-msg", text: e.message })); }
  if (tab === "overview") timer = setInterval(async () => { if (tab === "overview") main.replaceChildren(...(await TABS.overview())); }, 3000);
}

async function boot() {
  const me = await fetch("/api/me", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null));
  if (!me || me.role !== "gm") {
    $("#gm-login").classList.remove("hidden");
    $("#gm-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("#gm-user").value, password: $("#gm-pass").value }) });
      const j = await r.json();
      if (!r.ok) return ($("#gm-msg").textContent = j.error);
      if (j.user.role !== "gm") return ($("#gm-msg").textContent = "GM 계정이 아니에요.");
      location.reload();
    });
    return;
  }
  $("#gm-who").textContent = `${me.name} (GM)`;
  for (const b of document.querySelectorAll("nav button")) b.addEventListener("click", () => { tab = b.dataset.tab; render(); });
  render();
}
boot();

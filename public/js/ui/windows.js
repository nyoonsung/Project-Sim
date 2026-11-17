// 창: 캐릭터, 스킬, 가방·장비, 파티, 도움말, 상점, 대장간(강화), 전직소, 던전 관문, 게시판, 훈련 교관
import { G, send, canAuto, setAuto } from "../game.js";
import { profLevel, profPow, profCost, isUncapped } from "/shared/prof.js";
import { h, openWin, refreshWin, closeWin, isOpen, tipOn } from "./dom.js";
import { itemIcon } from "./icons.js";
import { CLASS_INFO, STATS, stageOf, stageLevel, xpToNext } from "/shared/classes.js";
import { SKILLS, skillsOf, unlockStage } from "/shared/skills.js";
import { deriveStats } from "/shared/stats.js";
import { SKILL_SLOTS, SLOT_KEYS, ITEMS, GRADE_COLOR } from "/shared/constants.js";
import { RARITY_COLOR, SLOT_NAME, OPTIONS, MYTHIC_EFFECTS, WEAPON_TYPES, OFFHAND_TYPES, enhanceOdds, enhanceCost, enhMul, sellPrice, canEquip, MAX_ENH } from "/shared/items.js";
import { sprite, playerLook } from "../render/sprites.js";

const fmtPct = (v) => (v * 100).toFixed(1) + "%";
const RES_NAME = { mp: "MP", ki: "내력", holy: "성광", parts: "부품", gap: "틈" };

function iconEl(it) {
  const c = document.createElement("canvas");
  c.width = 18; c.height = 18;
  c.getContext("2d").drawImage(itemIcon(it), 0, 0);
  return c;
}

// ── 툴팁
/** 숙련도 막대: Lv, 경험치, 현재 보너스 */
export function profBlock(sk, long = false) {
  const p = profLevel(G.char?.prof?.[sk.id] ?? 0, sk.id);
  const unc = isUncapped(sk.id);
  const pct = p.max ? 100 : Math.floor((p.cur / p.need) * 100);
  const bonus = p.lv ? `위력 +${Math.round(profPow(p.lv) * 100)}%${sk.cost?.mp ? ` · 마나 -${(profCost(p.lv) * 100).toFixed(1).replace(/\.0$/, "")}%` : ""}` : unc ? "한도 없이 계속 성장 · 던전에서 싸우며 쓰면 올라요" : "던전에서 적과 싸우며 쓰면 올라요";
  return h("div", { class: "prof" + (p.lv >= 10 ? " t2" : p.lv >= 5 ? " t1" : "") },
    h("div", { class: "prof-top" }, h("span", { class: "prof-lv", text: p.max ? "숙련 MAX" : `숙련 Lv.${p.lv}${unc ? " ∞" : ""}` }), h("span", { class: "prof-b", text: bonus })),
    h("div", { class: "prof-bar" }, h("i", { style: { width: pct + "%" } })),
    long ? h("div", { class: "tt-sub", text: p.max ? "최고 숙련! 이펙트 최고 단계" : `다음 레벨까지 ${p.need - p.cur} · ${unc ? "한도 없음(Lv.10 뒤로는 레벨마다 위력 +1%)" : "Lv.5·10에서 이펙트 강화"} · 쿨타임은 줄지 않아요` }) : null);
}

export function skillTip(sk) {
  if (!sk) return [];
  const cost = Object.entries(sk.cost ?? {}).map(([k, v]) => `${RES_NAME[k]} ${v}`).join(", ");
  const cd = sk.kind === "basic" ? `공격 속도 ${sk.aspd}초` : sk.kind === "passive" ? (sk.passive?.trigger?.icd ? `발동 내부 쿨타임 ${sk.passive.trigger.icd}초` : "상시") : `쿨타임 ${sk.cd}초`;
  const kind = { basic: "기본 공격", active: "액티브", passive: "패시브", ultimate: "궁극기" }[sk.kind];
  const el = h("div", {},
    h("div", { class: "tt-name", text: sk.name }),
    h("div", { class: "tt-sub" }, h("span", { class: "grade-" + sk.grade, text: sk.grade }), ` · ${kind} · ${cd}${cost ? " · " + cost : ""}${sk.cast ? ` · 시전 ${sk.cast}초` : ""}${sk.stance ? ` · ${sk.stance} 자세` : ""}`),
    h("div", { text: sk.desc }),
    h("div", { class: "tt-sub", text: "제한: " + sk.limit }),
    sk.kind !== "passive" ? profBlock(sk, true) : null);
  return [el];
}

export function itemTip(it, compare) {
  const els = [h("div", { class: "tt-name", style: { color: RARITY_COLOR[it.rarity] } }, `${it.name}${it.enh ? ` +${it.enh}` : ""}`)];
  const type = it.slot === "weapon" ? WEAPON_TYPES[it.type]?.name : it.slot === "offhand" ? OFFHAND_TYPES[it.type]?.name : SLOT_NAME[it.slot];
  els.push(h("div", { class: "tt-sub", text: `${it.rarity} ${SLOT_NAME[it.slot]} · ${type} · 아이템 레벨 ${it.ilvl}` }));
  const m = enhMul(it.enh);
  const names = { atk: "공격력", def: "방어력", hp: "최대 HP", mp: "최대 MP", crit: "치명타 확률", aspd: "공격 속도" };
  for (const [k, v] of Object.entries(it.base)) {
    const val = k === "crit" || k === "aspd" ? `+${fmtPct(v)}` : `+${Math.round(v * m)}`;
    let cmp = "";
    if (compare && compare !== it && compare.base[k] != null && !(k === "crit" || k === "aspd")) {
      const d = Math.round(v * m) - Math.round(compare.base[k] * enhMul(compare.enh));
      if (d) cmp = d > 0 ? ` ▲${d}` : ` ▼${-d}`;
    }
    els.push(h("div", {}, `${names[k] ?? k} ${val}`, cmp ? h("span", { class: cmp.includes("▲") ? "tt-cmp-up" : "tt-cmp-down", text: cmp }) : ""));
  }
  for (const o of it.opts) els.push(h("div", { class: "tt-opt", text: `${OPTIONS[o.k].name} ${OPTIONS[o.k].fmt(o.v)}` }));
  if (it.mythic) els.push(h("div", { class: "tt-myth", text: `◆ ${MYTHIC_EFFECTS[it.mythic].name}: ${MYTHIC_EFFECTS[it.mythic].desc}` }));
  const allowed = it.slot === "weapon" ? WEAPON_TYPES[it.type].cls : it.slot === "offhand" ? OFFHAND_TYPES[it.type].cls : null;
  if (allowed) els.push(h("div", { class: "tt-sub", text: "착용: " + allowed.map((c) => CLASS_INFO[c].name).join(", ") }));
  if (it.enh < MAX_ENH) { const o = enhanceOdds(it.enh); els.push(h("div", { class: "tt-sub", text: `다음 강화: 성공 ${fmtPct(o.success)} · 파괴 1% · 비용 ${enhanceCost(it)}G` })); }
  els.push(h("div", { class: "tt-sub", text: `판매가 ${sellPrice(it)}G${it.locked ? " · 🔒 잠김" : ""}` }));
  return [h("div", {}, ...els)];
}

// ── 캐릭터 (C)
function renameRow() {
  const inp = h("input", { maxlength: 12, placeholder: "새 닉네임 (2~12자)", class: "rename-in" });
  const go = () => { const v = inp.value.trim(); if (v) send({ t: "rename", name: v }); };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
  inp.addEventListener("focus", () => { G.typing = true; G.keys.clear(); });
  inp.addEventListener("blur", () => (G.typing = false));
  return h("details", { class: "rename" }, h("summary", { text: "닉네임 변경" }),
    h("div", { class: "flexrow" }, inp, h("button", { class: "btn small primary", onclick: go }, "변경")),
    h("div", { class: "note", text: "닉네임을 바꾸면 로그인 아이디도 새 닉네임으로 바뀌어요. (비밀번호는 그대로, 1시간에 한 번)" }));
}

export function openChar() {
  openWin("char", "캐릭터", () => {
    const c = G.char;
    if (!c) return [];
    const info = CLASS_INFO[c.cls];
    const st = deriveStats(c);
    const stage = stageOf(c.cls, c.level);
    const rank = info.ranks[stage];
    const rows = info.stats.map((k) => {
      const can = c.unspent > 0;
      return h("div", { class: "statrow" },
        h("span", { class: "sn", text: STATS[k].name }), h("span", { class: "sv", text: c.stats[k] ?? 0 }), h("span", { class: "sd", text: STATS[k].desc }),
        h("button", { class: "btn small", disabled: !can, onclick: () => send({ t: "stat", key: k, n: 1 }) }, "+1"),
        h("button", { class: "btn small", disabled: !can, onclick: () => send({ t: "stat", key: k, n: Math.min(10, c.unspent) }) }, "+10"));
    });
    const next = stage + 1 < info.ranks.length ? `다음 단계 ${info.ranks[stage + 1]}: Lv.${stageLevel(c.cls, stage + 1)}` : "최종 단계";
    return [
      h("div", { class: "flexrow" }, h("b", { text: `${c.name}` }), h("span", { text: `Lv.${c.level} ${info.name}` }), h("span", { class: "grade-영웅", text: c.cls === "adventurer" ? "" : `· ${rank}` })),
      renameRow(),
      h("div", { class: "note", text: c.cls === "adventurer" ? "10층 보스를 처치하면 안전 구역의 전직소에서 전직할 수 있어요. 전직하면 지금까지 투자한 스탯이 전부 돌아와요." : `${info.position} · ${next}` }),
      h("h4", { text: `능력치 (남은 포인트 ${c.unspent})` }),
      ...rows,
      h("h4", { text: "최종 수치" }),
      h("table", {}, ...[
        ["최대 HP", st.maxHp.toLocaleString()], ["최대 MP", st.maxMp], ["공격력", Math.round(st.atk).toLocaleString()], ["방어력", st.def],
        ["물리/주문 배율", `${fmtPct(st.phys)} / ${fmtPct(st.mag)}`], ["주는 피해", "+" + fmtPct(st.dmg)], ["받는 피해 감소", fmtPct(st.dr)],
        ["치명타 확률 (상한 50%)", fmtPct(st.crit)], ["치명타 피해 (상한 200%)", fmtPct(st.critDmg)], ["공격 속도", fmtPct(st.aspd)], ["이동 속도", Math.round(st.move)],
        ["성장 단계 보너스", "+" + fmtPct(st.stageBonus - 1)],
      ].map(([a, b]) => h("tr", {}, h("td", { text: a }), h("td", { text: b })))),
      h("div", { class: "note", text: `최고 층 ${c.best} · 체크포인트 ${c.checkpoint}층 · 처치 ${c.kills} · 쓰러짐 ${c.deaths}${c.cleared ? " · 🏆 던전 정복" : ""}` }),
    ];
  }, { w: 420 });
}

// ── 스킬 (K)
let selSkill = null;
export function openSkills() {
  openWin("skills", "스킬", () => {
    const c = G.char;
    if (!c) return [];
    const stage = stageOf(c.cls, c.level);
    const n = CLASS_INFO[c.cls].ranks.length;
    const list = [...skillsOf("common"), ...(c.cls === "adventurer" ? [] : skillsOf(c.cls))];
    const safe = G.mapKind === "town" || G.mapKind === "safe";
    const slots = h("div", { class: "flexrow" }, ...c.skills.map((id, i) => {
      const sk = id && SKILLS[id];
      const el = h("div", { class: "slot" + (sk ? "" : " empty"), onclick: () => {
        if (!safe) return G.ui.toast("스킬 교체는 마을이나 안전 구역에서만 할 수 있어요.", "info");
        const next = c.skills.slice();
        if (selSkill) { const j = next.indexOf(selSkill); if (j >= 0) next[j] = null; next[i] = selSkill; selSkill = null; }
        else next[i] = null;
        send({ t: "skills", list: next });
      } }, h("span", { class: "key", text: SLOT_KEYS[i] === "SHIFT" ? "⇧" : SLOT_KEYS[i] }), h("span", { class: "nm", text: sk?.name ?? "" }), sk && G.autoSkills.has(sk.id) && canAuto(sk) ? h("span", { class: "auto-dot", text: "A" }) : null);
      if (sk) el.style.borderColor = GRADE_COLOR[sk.grade];
      if (sk) tipOn(el, () => skillTip(sk));
      return el;
    }));
    const groups = ["기본", "일반", "희귀", "영웅", "전설"];
    const cards = [];
    for (const gname of groups) {
      const items = list.filter((s) => (gname === "기본" ? s.cls === "common" : s.cls !== "common" && s.grade === gname));
      if (!items.length) continue;
      cards.push(h("h4", { text: gname === "기본" ? "공용 스킬 (모험가 기본기)" : `${gname} 스킬` }));
      cards.push(h("div", { class: "skill-list" }, ...items.map((s) => {
        const need = unlockStage(s, n);
        const locked = s.cls !== "common" && stage < need;
        const equipped = c.skills.includes(s.id);
        const cost = Object.entries(s.cost ?? {}).map(([k, v]) => `${RES_NAME[k]} ${v}`).join(" ");
        return h("div", { class: `sk${locked ? " locked" : ""}${selSkill === s.id ? " sel" : ""}${equipped ? " equipped" : ""}`, onclick: () => { if (!locked) { selSkill = selSkill === s.id ? null : s.id; refreshWin("skills"); } } },
          h("div", { class: "sk-top" }, h("b", { class: "grade-" + s.grade, text: s.name }), " ", h("span", { class: "meta", text: { basic: "기본 공격", active: "액티브", passive: "패시브", ultimate: "궁극기" }[s.kind] }),
            canAuto(s) && !locked ? h("button", { class: "auto-tg" + (G.autoSkills.has(s.id) ? " on" : ""), title: "자동: 쿨타임이 돌면 가까운 적에게 알아서 사용 (회복은 체력 70% 아래일 때)", onclick: (e) => { e.stopPropagation(); setAuto(s.id, !G.autoSkills.has(s.id)); refreshWin("skills"); } }, G.autoSkills.has(s.id) ? "자동" : "수동") : null),
          h("div", { class: "meta", text: `${s.kind === "basic" ? `공격 속도 ${s.aspd}s` : s.kind === "passive" ? "패시브" : `쿨 ${s.cd}s`}${cost ? " · " + cost : ""}${s.stance ? " · " + s.stance : ""}${locked ? ` · 🔒 ${CLASS_INFO[c.cls].ranks[need]} 필요(Lv.${stageLevel(c.cls, need)})` : ""}` }),
          h("div", { class: "desc", text: s.desc }),
          s.kind !== "passive" && !locked ? profBlock(s) : null);
      })));
    }
    return [
      h("div", { class: "note", text: "공용 스킬을 뺀 스킬은 [수동/자동]을 누르면 자동 사용으로 바꿀 수 있어요. 자동이면 쿨타임이 돌 때 가까운 적에게 알아서 써요. (언제든 바꿀 수 있음)" }),
      h("div", { class: "note", text: safe ? "스킬을 고른 뒤 아래 칸을 누르면 장착돼요. 장착한 칸을 그냥 누르면 비워요. 종류 구분 없이 8칸에 자유롭게 장착해요." : "⚠ 던전 전투 중에는 스킬을 바꿀 수 없어요. (마을·안전 구역에서 교체)" }),
      slots, ...cards,
    ];
  }, { w: 640 });
}

// ── 가방·장비 (I)
let selItem = null;
export function openInv() {
  openWin("inv", "가방 · 장비", () => {
    const c = G.char;
    if (!c) return [];
    const nearShop = nearNpc("shop"), nearSmith = nearNpc("smithy");
    const eq = h("div", { class: "equip-slots" }, ...["weapon", "offhand", "helmet", "armor", "trinket"].map((slot) => {
      const it = c.equip[slot];
      const el = h("div", { class: "cell" + (it ? " r-" + it.rarity : "") + (selItem === it?.uid ? " sel" : ""), onclick: () => { if (it) { selItem = it.uid; refreshWin("inv"); } } },
        it ? iconEl(it) : h("span", { class: "lbl", text: SLOT_NAME[slot] }), it?.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null);
      el.addEventListener("dblclick", () => it && send({ t: "unequip", slot }));
      if (it) tipOn(el, () => itemTip(it));
      return el;
    }));
    const grid = h("div", { class: "inv-grid" }, ...Array.from({ length: 40 }, (_, i) => {
      const it = c.inv[i];
      const el = h("div", { class: "cell" + (it ? " r-" + it.rarity : "") + (it && selItem === it.uid ? " sel" : ""), onclick: () => { if (it) { selItem = it.uid; refreshWin("inv"); } } },
        it ? iconEl(it) : null, it?.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null, it?.locked ? h("span", { class: "lock", text: "🔒" }) : null);
      if (it) {
        el.addEventListener("dblclick", () => send({ t: "equip", uid: it.uid }));
        el.addEventListener("contextmenu", (e) => { e.preventDefault(); if (nearShop) send({ t: "sell", uid: it.uid }); });
        tipOn(el, () => itemTip(it, c.equip[it.slot]));
      }
      return el;
    }));
    const sel = c.inv.find((x) => x.uid === selItem) ?? Object.values(c.equip).find((x) => x?.uid === selItem);
    const actions = sel ? h("div", { class: "flexrow" },
      h("b", { style: { color: RARITY_COLOR[sel.rarity] }, text: sel.name + (sel.enh ? ` +${sel.enh}` : "") }),
      c.inv.includes(sel) ? h("button", { class: "btn small", disabled: !canEquip(sel, c.cls), onclick: () => send({ t: "equip", uid: sel.uid }) }, "장착") : h("button", { class: "btn small", onclick: () => send({ t: "unequip", slot: sel.slot }) }, "해제"),
      c.inv.includes(sel) ? h("button", { class: "btn small", disabled: !nearShop || sel.locked, onclick: () => send({ t: "sell", uid: sel.uid }) }, `판매 ${sellPrice(sel)}G`) : null,
      h("button", { class: "btn small", disabled: !nearSmith, onclick: () => { G.enhSel = sel.uid; openSmithy(); } }, "강화"),
      h("button", { class: "btn small", onclick: () => send({ t: "lock", uid: sel.uid }) }, sel.locked ? "잠금 해제" : "잠금")) : h("div", { class: "note", text: "아이템을 누르면 선택돼요. 두 번 누르면 장착/해제, 상인 근처에서 오른쪽 클릭하면 판매해요." });
    return [h("div", { class: "flexrow" }, h("span", { text: `💰 ${c.gold.toLocaleString()} G` }), h("span", { class: "note", text: `가방 ${c.inv.length}/40` })), h("h4", { text: "장착 중" }), eq, actions, h("h4", { text: "가방" }), grid];
  }, { w: 420 });
}

// ── 파티 (P)
export function openParty() {
  openWin("party", "파티", () => {
    const input = h("input", { class: "txt", placeholder: "초대할 닉네임", maxlength: 12 });
    const leader = G.party.find((m) => m.leader)?.name === G.name;
    return [
      G.party.length ? h("div", {}, ...G.party.map((m) => h("div", { class: "statrow" },
        h("span", { class: "sn", text: (m.leader ? "★ " : "") + m.name }), h("span", { class: "sd", text: `Lv.${m.lv} ${CLASS_INFO[m.cls]?.name} · 체크포인트 ${m.cp}층` }),
        leader && m.name !== G.name ? h("button", { class: "btn small", onclick: () => send({ t: "party", op: "promote", name: m.name }) }, "파티장") : null,
        leader && m.name !== G.name ? h("button", { class: "btn small danger", onclick: () => send({ t: "party", op: "kick", name: m.name }) }, "추방") : null))) : h("div", { class: "note", text: "파티가 없어요. 혼자서도 던전에 들어갈 수 있어요." }),
      h("h4", { text: "초대 (마을에서만)" }),
      h("div", { class: "flexrow" }, input, h("button", { class: "btn small primary", onclick: () => input.value && send({ t: "party", op: "invite", name: input.value.trim() }) }, "초대")),
      G.party.length ? h("button", { class: "btn small danger", onclick: () => send({ t: "party", op: "leave" }) }, "파티 나가기") : null,
      h("div", { class: "note", text: "최대 4명. 파티장이 던전 관문에서 입장하면 함께 이동해요. 드롭은 각자 따로 나와요. 채팅에서 /p 로 파티 채팅." }),
    ];
  }, { w: 360 });
}

// ── 도움말 (H)
export function openHelp() {
  openWin("help", "도움말", () => [
    h("h4", { text: "조작" }),
    h("div", { class: "help-grid" }, ...[
      ["WASD / 방향키", "이동"], ["마우스", "조준"], ["좌클릭 · 우클릭", "스킬 1 · 2"], ["Q E R F ⇧ V", "스킬 3~8"], ["1 2 3", "체력 물약 · 마나 물약 · 해독제"],
      ["G", "NPC와 대화"], ["C / K / I / P / H", "캐릭터 / 스킬 / 가방 / 파티 / 도움말"], ["Enter", "채팅"], ["Esc", "창 닫기"],
    ].flatMap(([a, b]) => [h("kbd", { text: a }), h("span", { text: b })])),
    h("h4", { text: "던전" }),
    h("div", { class: "note", text: "1~100층. 5층마다 중간보스, 10층마다 주요 보스가 나와요. 일반층은 큰 투기장에서 몬스터가 웨이브로 몰려와요. 웨이브를 모두 물리치면(90% 처치) 출구 포탈이 열려요. 미니맵을 누르면(M) 큰 지도. 10층 보스를 쓰러뜨리면 안전 구역의 전직소에 갈 수 있고, 다음부터 그 다음 층(11, 21…)에서 바로 시작할 수 있어요." }),
    h("h4", { text: "장비 · 강화" }),
    h("div", { class: "note", text: "등급: 일반 < 희귀 < 영웅 < 전설 < 신화(드롭 0.5%). 쿨타임 감소 효과는 없어요. 강화는 최대 +99, +n→+n+1 성공 확률 (99−n)%, 파괴 확률은 항상 1%예요. 실패하면 단계가 그대로예요." }),
    h("h4", { text: "전직" }),
    h("div", { class: "note", text: "모험가로 시작해 10층 전직소에서 검사·권투사·궁수·도적·마법사·성직자·대장장이 중 하나를 고르거나 보류할 수 있어요. 첫 전직을 확정하면 직업이 고정돼요." }),
    h("div", { class: "flexrow" }, h("button", { class: "btn small danger", onclick: () => G.ui.logout() }, "로그아웃")),
  ], { w: 460 });
}

// ── NPC 창들
function nearNpc(id) {
  const me = G.ents.get(G.you);
  const o = G.objects.find((x) => x.kind === "npc" && x.id === id);
  return !!(me && o && Math.hypot(o.x - me.rx, o.y - me.ry) < 90);
}

export function openShop() {
  openWin("shop", "잡화 상인 미라", () => {
    const c = G.char;
    return [
      h("div", { class: "note", text: "물약을 사거나, 가방(I)에서 아이템을 오른쪽 클릭해 팔 수 있어요." }),
      ...Object.entries(ITEMS).map(([id, it]) => h("div", { class: "statrow" },
        h("span", { class: "sn", text: it.name }), h("span", { class: "sd", text: `${it.desc} (보유 ${c.cons[id] ?? 0}/${it.max})` }),
        h("button", { class: "btn small", onclick: () => send({ t: "buy", item: id, n: 1 }) }, `${it.price}G`),
        h("button", { class: "btn small", onclick: () => send({ t: "buy", item: id, n: 5 }) }, `×5`))),
      h("div", { class: "flexrow" }, h("span", { text: `💰 ${c.gold.toLocaleString()} G` }), h("button", { class: "btn small", onclick: () => openInv() }, "가방 열기")),
    ];
  }, { w: 440 });
}

let lastEnh = null;
export function openSmithy() {
  openWin("smithy", "대장장이 브론 — 강화", () => {
    const c = G.char;
    const all = [...Object.values(c.equip).filter(Boolean), ...c.inv];
    const sel = all.find((x) => x.uid === G.enhSel) ?? null;
    const pick = h("div", { class: "inv-grid" }, ...all.map((it) => {
      const el = h("div", { class: "cell r-" + it.rarity + (sel === it ? " sel" : ""), onclick: () => { G.enhSel = it.uid; lastEnh = null; refreshWin("smithy"); } }, iconEl(it), it.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null);
      tipOn(el, () => itemTip(it));
      return el;
    }));
    let box = h("div", { class: "note", text: "강화할 장비를 고르세요." });
    if (sel) {
      const o = enhanceOdds(sel.enh), cost = enhanceCost(sel);
      box = h("div", { class: "enh-box" },
        h("div", { style: { color: RARITY_COLOR[sel.rarity] }, text: `${sel.name} +${sel.enh}` }),
        sel.enh >= MAX_ENH ? h("div", { text: "최대 강화 +99" }) : h("div", { class: "enh-odds" }, h("span", { class: "s", text: `성공 ${fmtPct(o.success)}` }), h("span", { class: "f", text: `실패 ${fmtPct(o.fail)}` }), h("span", { class: "d", text: `파괴 ${fmtPct(o.destroy)}` })),
        h("div", { class: "note", text: `강화 단계마다 기본 능력치 +2% · 비용 ${cost.toLocaleString()}G (보유 ${c.gold.toLocaleString()}G)` }),
        h("div", { class: "enh-result " + (lastEnh?.result ?? ""), text: lastEnh ? { success: `성공! +${lastEnh.enh}`, fail: "실패… (단계 유지)", destroy: "파괴됐어요…" }[lastEnh.result] : "" }),
        h("button", { class: "btn primary", disabled: sel.enh >= MAX_ENH || c.gold < cost, onclick: () => send({ t: "enhance", uid: sel.uid }) }, `강화하기 (+${sel.enh} → +${sel.enh + 1})`));
    }
    return [box, h("h4", { text: "장비 선택" }), pick];
  }, { w: 420 });
}
export function onEnhance(m) {
  lastEnh = m;
  if (m.result === "destroy") G.enhSel = null;
  if (isOpen("smithy")) refreshWin("smithy");
}

export function openClass() {
  openWin("class", "전직소", () => {
    const c = G.char;
    if (c.cls !== "adventurer") return [h("div", { text: `이미 ${CLASS_INFO[c.cls].name}(으)로 전직했어요. 직업은 고정되고 전직 기능은 잠겨 있어요.` })];
    const cards = Object.entries(CLASS_INFO).filter(([k]) => k !== "adventurer").map(([k, info]) => {
      const cv = document.createElement("canvas");
      const { look, key } = playerLook(k, null, null);
      const s = sprite({ ...look, weapon: info.look.weapon }, key + ":card", "idle", 0, 0.6, 1);
      cv.width = 36; cv.height = 48;
      cv.getContext("2d").drawImage(s.canvas, 18 - s.ox, 46 - s.oy);
      return h("div", { class: "cc", onclick: () => { if (confirmClass(info.name)) send({ t: "class", cls: k }); } },
        cv, h("b", { text: info.name }), h("div", { class: "role", text: info.role }), h("p", { text: info.desc }),
        h("p", { text: "전용 능력치: " + info.stats.map((s) => STATS[s].name).join(", ") }), h("p", { text: `성장 ${info.ranks.length}단계: ${info.ranks[0]} → ${info.ranks[info.ranks.length - 1]}` }));
    });
    return [
      h("div", { class: "note", text: "직업을 고르면 지금까지 투자한 스탯 포인트가 전부 돌아오고, 직업 전용 능력치로 새로 배분해요(1회). 전직은 강제가 아니에요 — 창을 닫으면 모험가로 남아 다음 전직소에서 다시 고를 수 있어요." }),
      h("div", { class: "class-cards" }, ...cards),
    ];
  }, { w: 640 });
}
let confirmAt = 0, confirmName = "";
function confirmClass(name) {
  // 두 번 눌러 확정 (alert/confirm 없이)
  const t = performance.now();
  if (confirmName === name && t - confirmAt < 3000) return true;
  confirmName = name; confirmAt = t;
  G.ui.toast(`${name}(으)로 전직하려면 한 번 더 누르세요. 전직하면 되돌릴 수 없어요.`, "rank");
  return false;
}

export function openGate() {
  openWin("gate", "던전 관문", () => {
    const leaderName = G.party.find((m) => m.leader)?.name;
    const isLeader = !G.party.length || leaderName === G.name;
    const cp = Math.min(G.char.checkpoint, ...G.party.map((m) => m.cp ?? 1));
    const floors = [1];
    for (let f = 11; f <= cp; f += 10) floors.push(f);
    const best = Math.min(G.char.best ?? 0, ...G.party.map((m) => m.best ?? 0));
    const bosses = [];
    for (let f = 5; f <= Math.min(100, best); f += 5) bosses.push(f);
    return [
      h("div", { class: "note", text: G.party.length ? `파티 ${G.party.length}명 · 파티장 ${leaderName}` : "혼자 입장해요. (파티는 P)" }),
      h("h4", { text: "시작 층" }),
      h("div", { class: "floors" }, ...floors.map((f) => h("button", { class: "btn small primary", disabled: !isLeader, onclick: () => { send({ t: "enter", floor: f }); closeWin("gate"); } }, `${f}층`))),
      bosses.length ? h("h4", { text: "보스 재도전" }) : null,
      bosses.length ? h("div", { class: "floors" }, ...bosses.map((f) => h("button", { class: "btn small" + (f % 10 === 0 ? " boss" : ""), disabled: !isLeader, title: f % 10 === 0 ? "주요 보스" : "중간보스", onclick: () => { send({ t: "enter", floor: f }); closeWin("gate"); } }, `${f}층 ${f % 10 === 0 ? "보스" : "중보"}`))) : null,
      !isLeader ? h("div", { class: "note", text: "파티장만 입장할 수 있어요." }) : null,
      h("div", { class: "note", text: "10층 보스를 쓰러뜨리면 다음 체크포인트가 열려요. 한 번 깬 보스층은 언제든 다시 도전할 수 있어요. 파티는 모든 파티원이 열어 둔 층·깬 보스층만 고를 수 있어요." }),
    ];
  }, { w: 360 });
}

export async function openBoard() {
  let list = [];
  try { list = (await (await fetch("/api/ranking")).json()).list ?? []; } catch {}
  openWin("board", "모험가 게시판 — 랭킹", () => [
    h("table", {}, h("tr", {}, h("td", { text: "#" }), h("td", { text: "이름" }), h("td", { text: "직업" }), h("td", { text: "Lv" }), h("td", { text: "최고 층" })),
      ...list.map((r, i) => h("tr", {}, h("td", { text: i + 1 }), h("td", { text: r.username }), h("td", { text: CLASS_INFO[r.cls]?.name ?? "" }), h("td", { text: r.level }), h("td", { text: r.best_floor })))),
  ], { w: 380 });
}

export function openTrainer() {
  openWin("trainer", "훈련 교관", () => {
    const c = G.char;
    const cost = 200 + c.level * 40;
    return [
      h("div", { class: "note", text: "옆의 허수아비를 때리면 5초 동안 공격이 멈출 때 받은 피해와 초당 피해량을 알려 줘요. (기획서의 '60초 단일 보스 연습전' 측정용)" }),
      h("h4", { text: "스탯 초기화" }),
      h("div", { class: "note", text: "전직 때 1회 무료로 돌려받는 것과 별개로, 골드를 내고 다시 배분할 수 있어요." }),
      h("button", { class: "btn small danger", onclick: () => send({ t: "resetStats" }) }, `스탯 초기화 (${cost.toLocaleString()}G)`),
    ];
  }, { w: 380 });
}

export function openNpc(o) {
  ({ gate: openGate, shop: () => { openShop(); openInv(); }, smithy: () => { openSmithy(); openInv(); }, trainer: openTrainer, board: openBoard, class_master: openClass })[o.id]?.();
}

export function refreshAll() {
  for (const id of ["char", "skills", "inv", "party", "shop", "smithy", "class", "gate", "trainer"]) if (isOpen(id)) refreshWin(id);
}

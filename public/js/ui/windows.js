// 창: 캐릭터, 스킬, 가방·장비, 파티, 도움말, 상점, 대장간(강화), 전직소, 던전 관문, 게시판, 훈련 교관
import { G, send, canAuto, setAuto } from "../game.js";
import { skillDetails } from "/shared/skilltext.js";
import { BASIC_SPEED, CLASS_ASPD } from "/shared/constants.js";
const basicGap = (sk) => +((sk.aspd * BASIC_SPEED) / (CLASS_ASPD[G.char?.cls] ?? 1)).toFixed(2);
import { titleDesign } from "/shared/titles.js";
import { Q, setMode, setLessOthers, preset } from "../quality.js";
import { KEYS, keyLabel, bindKey, resetKeys, RESERVED } from "../keys.js";
import { profLevel, profPow, profCost, isUncapped } from "/shared/prof.js";
import { h, openWin, refreshWin, closeWin, isOpen, tipOn } from "./dom.js";
import { itemIcon } from "./icons.js";
import { CLASS_INFO, STATS, stageOf, stageLevel, xpToNext } from "/shared/classes.js";
import { SKILLS, skillsOf, unlockStage } from "/shared/skills.js";
import { deriveStats } from "/shared/stats.js";
import { SKILL_SLOTS, SLOT_KEYS, ITEMS, GRADE_COLOR } from "/shared/constants.js";
import { RARITY_COLOR, SLOT_NAME, OPTIONS, MYTHIC_EFFECTS, WEAPON_TYPES, OFFHAND_TYPES, VARIANT_TRAITS, RARITIES, RARITY_WEIGHTS, RARITY_MUL, MATERIALS, ARMOR_NAMES, repairCost, ENH_PCT, ENCHANTS, enchantOdds, enchantCost, enhanceOdds, enhanceCost, enhMul, sellPrice, canEquip, MAX_ENH } from "/shared/items.js";
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
  const cd = sk.kind === "basic" ? `공격 간격 ${basicGap(sk)}초` : sk.kind === "passive" ? (sk.passive?.trigger?.icd ? `발동 내부 쿨타임 ${sk.passive.trigger.icd}초` : "상시") : `쿨타임 ${sk.cd}초`;
  const kind = { basic: "기본 공격", active: "액티브", passive: "패시브", ultimate: "궁극기" }[sk.kind];
  const el = h("div", {},
    h("div", { class: "tt-name", text: sk.name }),
    h("div", { class: "tt-sub" }, h("span", { class: "grade-" + sk.grade, text: sk.grade }), ` · ${kind} · ${cd}${cost ? " · " + cost : ""}${sk.cast ? ` · 시전 ${sk.cast}초` : ""}${sk.stance ? ` · ${sk.stance} 자세` : ""}`),
    h("div", { text: sk.desc }),
    h("div", { class: "tt-detail" }, ...skillDetails(sk).map((l) => h("div", { text: l }))),
    h("div", { class: "tt-sub", text: "제한: " + sk.limit }),
    sk.kind !== "passive" ? profBlock(sk, true) : null);
  return [el];
}

/** 내구도 막대 */
function durBar(it) {
  const p = Math.max(0, Math.min(1, it.dur / it.maxDur));
  return h("span", { class: "dur-bar" + (it.dur <= 0 ? " broken" : p <= 0.2 ? " low" : "") }, h("i", { style: { width: p * 100 + "%" } }));
}
export function itemTip(it, compare) {
  const els = [h("div", { class: "tt-name", style: { color: RARITY_COLOR[it.rarity] } }, `${it.name}${it.enh ? ` +${it.enh}` : ""}`)];
  const type = it.slot === "weapon" ? WEAPON_TYPES[it.type]?.name : it.slot === "offhand" ? OFFHAND_TYPES[it.type]?.name : SLOT_NAME[it.slot];
  els.push(h("div", { class: "tt-sub", text: `${it.rarity} ${SLOT_NAME[it.slot]} · ${type} · 아이템 레벨 ${it.ilvl}` }));
  const broken = it.dur != null && it.dur <= 0;
  const m = broken ? 0.3 : enhMul(it.enh);
  const names = { atk: "공격력", def: "방어력", hp: "최대 HP", mp: "최대 MP", crit: "치명타 확률", aspd: "공격 속도" };
  if (it.dur != null) {
    els.push(h("div", { class: "tt-dur" + (broken ? " broken" : it.dur <= it.maxDur * 0.2 ? " low" : "") }, durBar(it), ` 내구도 ${Math.floor(it.dur)}/${it.maxDur}${broken ? " — 부서짐! 능력치 30% (대장장이 수선)" : ""}`));
  }
  const trait = VARIANT_TRAITS[it.slot]?.[it.variant ?? 1];
  if (trait && it.slot !== "weapon" && it.slot !== "offhand") els.push(h("div", { class: "tt-trait", text: `특징 · ${trait.desc}` }));
  for (const [k, v] of Object.entries(it.base)) {
    const pct = OPTIONS[k] && !["atk", "def", "hp", "mp", "hpRegen"].includes(k);
    const val = pct ? OPTIONS[k].fmt(v) : `+${Math.round(v * m)}`;
    let cmp = "";
    if (compare && compare !== it && compare.base[k] != null && !pct) {
      const d = Math.round(v * m) - Math.round(compare.base[k] * enhMul(compare.enh));
      if (d) cmp = d > 0 ? ` ▲${d}` : ` ▼${-d}`;
    }
    els.push(h("div", {}, `${names[k] ?? OPTIONS[k]?.name ?? k} ${val}`, cmp ? h("span", { class: cmp.includes("▲") ? "tt-cmp-up" : "tt-cmp-down", text: cmp }) : ""));
  }
  if (it.ench && ENCHANTS[it.ench]) els.push(h("div", { class: "tt-ench" + (it.ench === "mend" ? " mend" : "") + (broken && it.ench !== "mend" ? " off" : ""), text: `✦ 인챈트 · ${ENCHANTS[it.ench].name}: ${ENCHANTS[it.ench].desc}` }));
  const ep = ENH_PCT[it.slot];
  if (ep && it.enh) els.push(h("div", { class: "tt-opt" + (broken ? " off" : ""), text: `강화 보너스 · ${ep.name} +${it.enh}%${broken ? " (부서져서 꺼짐)" : ""}` }));
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
      h("div", { class: "flexrow" }, h("span", { class: "note", text: "칭호: " }), (() => { const tt = c.titles?.find((x) => x.id === c.title); return tt ? titleTag(tt) : h("span", { class: "note", text: "없음" }); })(), h("button", { class: "btn small", onclick: () => openTitles() }, "칭호 (T)")),
      h("h4", { text: "최종 수치" }),
      h("table", {}, ...[
        ["최대 HP", st.maxHp.toLocaleString()], ["최대 MP", st.maxMp], ["공격력", Math.round(st.atk).toLocaleString()], ["방어력", st.def],
        ["물리/주문 배율", `${fmtPct(st.phys)} / ${fmtPct(st.mag)}`], ["주는 피해", "+" + fmtPct(st.dmg)], ["받는 피해 감소", fmtPct(st.dr)],
        ["치명타 확률 (상한 50%)", fmtPct(st.crit)], ["치명타 피해 (상한 200%)", fmtPct(st.critDmg)], ["공격 속도", fmtPct(st.aspd)], ["이동 속도", Math.round(st.move)],
        ["성장 단계 보너스", "+" + fmtPct(st.stageBonus - 1)],
        ...(st.classDmg && st.classDmg !== 1 ? [["직업 피해 배율", "×" + st.classDmg]] : []),
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
      } }, h("span", { class: "key", text: keyLabel(KEYS.slots[i]) }), h("span", { class: "nm", text: sk?.name ?? "" }), sk && G.autoSkills.has(sk.id) && canAuto(sk) ? h("span", { class: "auto-dot", text: "A" }) : null);
      if (sk) el.style.borderColor = GRADE_COLOR[sk.grade];
      if (sk) tipOn(el, () => skillTip(sk));
      return el;
    }));
    const groups = ["기본", "일반", "희귀", "영웅", "전설", "신화"];
    const cards = [];
    for (const gname of groups) {
      const items = list.filter((s) => (gname === "기본" ? s.cls === "common" : s.cls !== "common" && s.grade === gname));
      if (!items.length) continue;
      cards.push(h("h4", { text: gname === "기본" ? "공용 스킬 (모험가 기본기)" : gname === "신화" ? "신화 스킬 (최종 단계)" : `${gname} 스킬` }));
      cards.push(h("div", { class: "skill-list" }, ...items.map((s) => {
        const need = unlockStage(s, n);
        const locked = s.cls !== "common" && stage < need;
        const equipped = c.skills.includes(s.id);
        const cost = Object.entries(s.cost ?? {}).map(([k, v]) => `${RES_NAME[k]} ${v}`).join(" ");
        return h("div", { class: `sk${locked ? " locked" : ""}${selSkill === s.id ? " sel" : ""}${equipped ? " equipped" : ""}`, onclick: () => { if (!locked) { selSkill = selSkill === s.id ? null : s.id; refreshWin("skills"); } } },
          h("div", { class: "sk-top" }, h("b", { class: "grade-" + s.grade, text: s.name }), " ", h("span", { class: "meta", text: { basic: "기본 공격", active: "액티브", passive: "패시브", ultimate: "궁극기" }[s.kind] }),
            canAuto(s) && !locked ? h("button", { class: "auto-tg" + (G.autoSkills.has(s.id) ? " on" : ""), title: "자동: 쿨타임이 돌면 가까운 적에게 알아서 사용 (회복은 체력 70% 아래일 때)", onclick: (e) => { e.stopPropagation(); setAuto(s.id, !G.autoSkills.has(s.id)); refreshWin("skills"); } }, G.autoSkills.has(s.id) ? "자동" : "수동") : null),
          h("div", { class: "meta", text: `${s.kind === "basic" ? `공격 간격 ${basicGap(s)}s` : s.kind === "passive" ? "패시브" : `쿨 ${s.cd}s`}${cost ? " · " + cost : ""}${s.stance ? " · " + s.stance : ""}${locked ? ` · 🔒 ${CLASS_INFO[c.cls].ranks[need]} 필요(Lv.${stageLevel(c.cls, need)})` : ""}` }),
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
export function openInv(pos = {}) {
  openWin("inv", "가방 · 장비", () => {
    const c = G.char;
    if (!c) return [];
    const nearShop = nearNpc("shop"), nearSmith = nearNpc("smithy");
    const multi = G.sellMode;
    const picked = (G.sellPick ??= new Set());
    for (const u of [...picked]) if (!c.inv.some((x) => x.uid === u && !x.locked)) picked.delete(u);
    const pickedItems = c.inv.filter((x) => picked.has(x.uid));
    const pickedGold = pickedItems.reduce((a, x) => a + sellPrice(x), 0);
    const toggleAll = (pred) => { const list = c.inv.filter((x) => !x.locked && pred(x)); const all = list.every((x) => picked.has(x.uid)); for (const x of list) all ? picked.delete(x.uid) : picked.add(x.uid); refreshWin("inv"); };
    const sellBar = multi ? h("div", { class: "sell-bar" },
      h("div", { class: "flexrow" },
        h("button", { class: "btn small", onclick: () => toggleAll((x) => x.rarity === "일반") }, "일반 전부"),
        h("button", { class: "btn small", onclick: () => toggleAll((x) => x.rarity === "일반" || x.rarity === "희귀") }, "희귀 이하"),
        h("button", { class: "btn small", onclick: () => toggleAll((x) => ["일반", "희귀", "영웅"].includes(x.rarity)) }, "영웅 이하"),
        h("button", { class: "btn small", onclick: () => toggleAll((x) => ["일반", "희귀", "영웅", "전설"].includes(x.rarity)) }, "전설 이하"),
        h("button", { class: "btn small", onclick: () => toggleAll((x) => !canEquip(x, c.cls)) }, "못 쓰는 장비"),
        h("button", { class: "btn small", onclick: () => { picked.clear(); refreshWin("inv"); } }, "선택 해제")),
      h("div", { class: "flexrow" },
        h("span", { text: `${picked.size}개 선택 · ${pickedGold.toLocaleString()}G` }),
        h("button", { class: "btn primary small", disabled: !picked.size, onclick: () => {
          const rare = pickedItems.filter((x) => ["영웅", "전설", "신화"].includes(x.rarity) || x.enh >= 5).length;
          if (rare && !G.sellConfirm) { G.sellConfirm = true; G.ui.toast?.(`영웅 이상·강화된 아이템 ${rare}개가 섞여 있어요. 정말 팔려면 한 번 더 누르세요.`); setTimeout(() => (G.sellConfirm = false), 4000); return; }
          G.sellConfirm = false;
          send({ t: "sellMany", uids: [...picked] }); picked.clear();
        } }, "선택 판매"),
        h("button", { class: "btn small", onclick: () => { G.sellMode = false; picked.clear(); refreshWin("inv"); } }, "닫기"))) : null;
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
      const el = h("div", { class: "cell" + (it ? " r-" + it.rarity : "") + (it && selItem === it.uid && !multi ? " sel" : "") + (it && picked.has(it.uid) ? " picked" : ""),
        onclick: () => { if (!it) return; if (multi) { if (it.locked) return G.ui.toast?.("잠긴 아이템은 팔 수 없어요."); picked.has(it.uid) ? picked.delete(it.uid) : picked.add(it.uid); refreshWin("inv"); } else { selItem = it.uid; refreshWin("inv"); } } },
        it ? iconEl(it) : null, it?.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null, it?.locked ? h("span", { class: "lock", text: "🔒" }) : null,
        it?.ench ? h("span", { class: "ench-dot" + (it.ench === "mend" ? " mend" : ""), text: "✦" }) : null,
        it && multi && picked.has(it.uid) ? h("span", { class: "pick", text: "✓" }) : null,
        it?.dur != null && it.dur < it.maxDur ? h("span", { class: "dur-mini" + (it.dur <= 0 ? " broken" : it.dur <= it.maxDur * 0.2 ? " low" : "") }, h("i", { style: { width: Math.max(0, (it.dur / it.maxDur) * 100) + "%" } })) : null);
      if (it) {
        el.addEventListener("dblclick", () => !multi && send({ t: "equip", uid: it.uid }));
        el.addEventListener("contextmenu", (e) => { e.preventDefault(); if (multi || it.locked) return;
          // 영웅 이상·+5 이상은 한 번 더 눌러야 팔림 (어디서든 팔 수 있어서 실수 방지)
          if ((["영웅", "전설", "신화"].includes(it.rarity) || it.enh >= 5) && G.sellOne !== it.uid) { G.sellOne = it.uid; setTimeout(() => G.sellOne === it.uid && (G.sellOne = null), 3000); return G.ui.toast?.(`${it.name}: 한 번 더 오른쪽 클릭하면 팔아요.`); }
          G.sellOne = null; send({ t: "sell", uid: it.uid }); });
        tipOn(el, () => itemTip(it, c.equip[it.slot]));
      }
      return el;
    }));
    const sel = c.inv.find((x) => x.uid === selItem) ?? Object.values(c.equip).find((x) => x?.uid === selItem);
    const actions = sel ? h("div", { class: "flexrow" },
      h("b", { style: { color: RARITY_COLOR[sel.rarity] }, text: sel.name + (sel.enh ? ` +${sel.enh}` : "") }),
      c.inv.includes(sel) ? h("button", { class: "btn small", disabled: !canEquip(sel, c.cls), onclick: () => send({ t: "equip", uid: sel.uid }) }, "장착") : h("button", { class: "btn small", onclick: () => send({ t: "unequip", slot: sel.slot }) }, "해제"),
      c.inv.includes(sel) ? h("button", { class: "btn small", disabled: sel.locked, onclick: () => send({ t: "sell", uid: sel.uid }) }, `판매 ${sellPrice(sel)}G`) : null,
      h("button", { class: "btn small", disabled: !nearSmith, onclick: () => { G.enhSel = sel.uid; openSmithy(); } }, "강화"),
      h("button", { class: "btn small", onclick: () => send({ t: "lock", uid: sel.uid }) }, sel.locked ? "잠금 해제" : "잠금")) : h("div", { class: "note", text: "아이템을 누르면 선택돼요. 두 번 누르면 장착/해제, 오른쪽 클릭하면 어디서든 판매해요." });
    return [h("div", { class: "flexrow" }, h("span", { text: `💰 ${c.gold.toLocaleString()} G` }), h("span", { class: "note", text: `가방 ${c.inv.length}/40` }),
        multi ? null : h("button", { class: "btn small", onclick: () => { G.sellMode = true; refreshWin("inv"); } }, "여러 개 팔기")),
      h("h4", { text: "장착 중" }), eq, multi ? sellBar : actions, h("h4", { text: multi ? "가방 — 팔 아이템을 누르세요" : "가방" }), grid];
  }, { w: 420, ...pos });
}

// ── 파티 (P)
export function openParty() {
  openWin("party", "파티", () => {
    const input = h("input", { class: "txt", placeholder: "초대할 닉네임", maxlength: 12, onkeydown: (e) => { if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && input.value.trim()) { send({ t: "party", op: "invite", name: input.value.trim() }); input.blur(); } } });
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
      ["G", "NPC와 대화"], ["C / K / I / P / H / T / U", "캐릭터 / 스킬 / 가방 / 파티 / 도움말 / 칭호 / 접속자"], ["Enter", "채팅"], ["Esc", "창 닫기"],
    ].flatMap(([a, b]) => [h("kbd", { text: a }), h("span", { text: b })])),
    h("h4", { text: "던전" }),
    h("div", { class: "note", text: "1~100층. 5층마다 중간보스, 10층마다 주요 보스가 나와요. 일반층은 큰 투기장에서 몬스터가 웨이브로 몰려와요. 웨이브를 모두 물리치면(90% 처치) 출구 포탈이 열려요. 미니맵을 누르면(M) 큰 지도. 10층 보스를 쓰러뜨리면 안전 구역의 전직소에 갈 수 있고, 다음부터 그 다음 층(11, 21…)에서 바로 시작할 수 있어요." }),
    h("h4", { text: "장비 · 강화" }),
    h("div", { class: "note", text: "등급: 일반 < 희귀 < 영웅 < 전설 < 신화(드롭 0.5%). 쿨타임 감소 효과는 없어요. 강화는 최대 +99, +n→+n+1 성공 확률 (99−n)%, 파괴 확률은 항상 1%예요(신화는 사라지지 않고 +0으로). 실패하면 단계가 그대로예요." }),
    h("h4", { text: "전직" }),
    h("div", { class: "note", text: "모험가로 시작해 10층 전직소에서 검사·권투사·궁수·도적·마법사·성직자·대장장이 중 하나를 고르거나 보류할 수 있어요. 첫 전직을 확정하면 직업이 고정돼요." }),
    h("div", { class: "flexrow" }, h("button", { class: "btn small danger", onclick: () => G.ui.logout() }, "로그아웃 · 다른 계정으로")),
  ], { w: 460 });
}

// ── NPC 창들
function nearNpc(id) {
  const me = G.ents.get(G.you);
  const o = G.objects.find((x) => x.kind === "npc" && x.id === id);
  return !!(me && o && Math.hypot(o.x - me.rx, o.y - me.ry) < 90);
}

export function openShop(pos = {}) {
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
  }, { w: 440, ...pos });
}

let lastEnh = null;
export function openSmithy(pos = {}) {
  openWin("smithy", "대장장이 브론 — 강화 · 수선", () => {
    const c = G.char;
    const all = [...Object.values(c.equip).filter(Boolean), ...c.inv];
    // 수선: 닳은 무기 목록 + 비용
    const worn = all.filter((it) => it.dur != null && it.dur < it.maxDur);
    const total = worn.reduce((a, it) => a + repairCost(it), 0);
    const repairBox = h("div", { class: "repair-box" },
      h("h4", { text: "장비 수선" }),
      worn.length ? h("div", {}, ...worn.map((it) => h("div", { class: "statrow" },
        h("span", { class: "sn", style: { color: RARITY_COLOR[it.rarity] }, text: it.name + (c.equip.weapon === it ? " (장착)" : "") }),
        h("span", { class: "sd" }, durBar(it), ` ${Math.floor(it.dur)}/${it.maxDur}`),
        h("button", { class: "btn small", disabled: c.gold < repairCost(it), onclick: () => send({ t: "repair", uid: it.uid }) }, `${repairCost(it).toLocaleString()}G`))),
        h("button", { class: "btn primary", disabled: c.gold < total, onclick: () => send({ t: "repair" }) }, `모두 수선 (${total.toLocaleString()}G)`))
        : h("div", { class: "note", text: "모든 장비의 내구도가 가득해요. (무기·장신구는 스킬을 쓸 때, 갑옷·투구·방패는 맞을 때 닳고, 쓰러지면 10% 줄어요. 0이 되면 그 장비 능력치가 30%로 떨어져요.)" }));
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
        sel.enh >= MAX_ENH ? h("div", { text: "최대 강화 +99" }) : h("div", { class: "enh-odds" }, h("span", { class: "s", text: `성공 ${fmtPct(o.success)}` }), h("span", { class: "f", text: `실패 ${fmtPct(o.fail)}` }), h("span", { class: "d", text: sel.rarity === "신화" ? `폭발(+0) ${fmtPct(o.destroy)}` : `파괴 ${fmtPct(o.destroy)}` })),
        h("div", { class: "note", text: `강화 단계마다 기본 능력치 +2%, ${ENH_PCT[sel.slot]?.name ?? "능력치"} +1% · 비용 ${cost.toLocaleString()}G (보유 ${c.gold.toLocaleString()}G)` }),
        h("div", { class: "enh-result " + (lastEnh?.result ?? ""), text: lastEnh ? { success: `성공! +${lastEnh.enh}`, fail: "실패… (단계 유지)", reset: "폭발! 신화라 +0으로 (아이템은 그대로)", destroy: "파괴됐어요…" }[lastEnh.result] : "" }),
        h("button", { class: "btn primary", disabled: sel.enh >= MAX_ENH || c.gold < cost, onclick: () => send({ t: "enhance", uid: sel.uid }) }, `강화하기 (+${sel.enh} → +${sel.enh + 1})`));
    }
    return [repairBox, h("h4", { text: "강화" }), box, h("h4", { text: "장비 선택" }), pick];
  }, { w: 420, ...pos });
}
// ── 마법부여사 (인챈트)
let lastEnch = null;
export function openEnchant(pos = {}) {
  openWin("enchant", "마법부여사 엘라 — 인챈트", () => {
    const c = G.char;
    const all = [...Object.values(c.equip).filter(Boolean), ...c.inv];
    const sel = all.find((x) => x.uid === G.enchSel) ?? null;
    const pick = h("div", { class: "inv-grid" }, ...all.map((it) => {
      const el = h("div", { class: "cell r-" + it.rarity + (sel === it ? " sel" : ""), onclick: () => { G.enchSel = it.uid; lastEnch = null; refreshWin("enchant"); } },
        iconEl(it), it.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null, it.ench ? h("span", { class: "ench-dot" + (it.ench === "mend" ? " mend" : ""), text: "✦" }) : null);
      tipOn(el, () => itemTip(it));
      return el;
    }));
    const odds = h("div", { class: "note" }, "확률: ", ...enchantOdds().map(([k, p], i) => h("span", { class: k === "mend" ? "ench-mend" : "", text: `${i ? " · " : ""}${ENCHANTS[k].name}(${ENCHANTS[k].desc}) ${(p * 100).toFixed(p < 0.01 ? 1 : 2)}%` })));
    let box = h("div", { class: "note", text: "인챈트할 장비를 고르세요. 장비 하나에 인챈트 하나, 다시 하면 새로 뽑아서 바뀌어요." });
    if (sel) {
      const cost = enchantCost(sel), cur = sel.ench && ENCHANTS[sel.ench];
      box = h("div", { class: "enh-box" },
        h("div", { style: { color: RARITY_COLOR[sel.rarity] }, text: `${sel.name}${sel.enh ? " +" + sel.enh : ""}` }),
        h("div", { class: cur ? "tt-ench" + (sel.ench === "mend" ? " mend" : "") : "note", text: cur ? `지금: ✦ ${cur.name} — ${cur.desc}` : "지금: 인챈트 없음" }),
        sel.ench === "mend" ? h("div", { class: "note warn", text: "⚠ 0.1% 수선 인챈트예요. 다시 하면 사라질 수 있어요!" }) : null,
        h("div", { class: "enh-result " + (lastEnch ? "success" : ""), text: lastEnch ? `✦ ${ENCHANTS[lastEnch.ench].name}: ${ENCHANTS[lastEnch.ench].desc}${lastEnch.ench === "mend" ? " — 대박!" : ""}` : "" }),
        h("div", { class: "note", text: `비용 ${cost.toLocaleString()}G (보유 ${c.gold.toLocaleString()}G)` }),
        h("button", { class: "btn primary", disabled: c.gold < cost, onclick: () => {
          if (sel.ench === "mend" && !G.mendConfirm) { G.mendConfirm = true; G.ui.toast?.("수선 인챈트가 사라질 수 있어요. 정말 하려면 한 번 더 누르세요."); setTimeout(() => (G.mendConfirm = false), 4000); return; }
          G.mendConfirm = false; send({ t: "enchant", uid: sel.uid });
        } }, cur ? "다시 인챈트" : "인챈트하기"));
    }
    return [box, odds, h("h4", { text: "장비 선택" }), pick];
  }, { w: 440, ...pos });
}
export function onEnchant(m) {
  lastEnch = m;
  if (isOpen("enchant")) refreshWin("enchant");
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
      best >= 1 && !floors.includes(Math.min(100, best + 1)) ? h("button", { class: "btn primary continue-btn", disabled: !isLeader, onclick: () => { send({ t: "enter", floor: Math.min(100, best + 1) }); closeWin("gate"); } }, `▶ 이어하기: ${Math.min(100, best + 1)}층부터`) : null,
      h("h4", { text: "시작 층" }),
      h("div", { class: "floors" }, ...floors.map((f) => h("button", { class: "btn small primary", disabled: !isLeader, onclick: () => { send({ t: "enter", floor: f }); closeWin("gate"); } }, `${f}층`))),
      bosses.length ? h("h4", { text: "보스 재도전" }) : null,
      bosses.length ? h("div", { class: "floors" }, ...bosses.map((f) => h("button", { class: "btn small" + (f % 10 === 0 ? " boss" : ""), disabled: !isLeader, title: f % 10 === 0 ? "주요 보스" : "중간보스", onclick: () => { send({ t: "enter", floor: f }); closeWin("gate"); } }, `${f}층 ${f % 10 === 0 ? "보스" : "중보"}`))) : null,
      !isLeader ? h("div", { class: "note", text: "파티장만 입장할 수 있어요." }) : null,
      h("div", { class: "note", text: "깬 층의 바로 다음 층부터 이어서 할 수 있어요. 한 번 깬 보스층은 언제든 다시 도전할 수 있어요. 파티는 모든 파티원이 깬 층 기준이에요." }),
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
  // 상점·대장간: 화면이 넓으면 왼쪽엔 상점, 오른쪽엔 가방을 나란히(겹치지 않게). 좁으면 상점만 (가방은 버튼으로)
  const pair = (open, w) => {
    const W = innerWidth, two = W >= w + 420 + 40;
    if (two) { const x0 = Math.max(8, (W - (w + 420 + 12)) / 2); open({ x: x0 }); openInv({ x: x0 + w + 12 }); }
    else open();
  };
  ({ gate: openGate, shop: () => pair(openShop, 440), smithy: () => pair(openSmithy, 420), enchanter: () => pair(openEnchant, 440), trainer: openTrainer, board: openBoard, class_master: openClass })[o.id]?.();
}

export function refreshAll() {
  for (const id of ["char", "skills", "inv", "party", "shop", "smithy", "enchant", "class", "gate", "trainer", "titles", "trade"]) if (isOpen(id)) refreshWin(id);
}

// ───────── 조작 키 설정 (O) ─────────
export function openKeys() {
  const names = ["1번 칸 (기본 공격)", "2번 칸", "3번 칸", "4번 칸", "5번 칸", "6번 칸", "7번 칸 (대시)", "8번 칸"];
  const pots = ["체력 물약", "마나 물약", "해독제"];
  const row = (label, kind, i) => {
    const code = KEYS[kind][i];
    const sid = kind === "slots" ? G.char?.skills?.[i] : null;
    return h("div", { class: "statrow" },
      h("span", { class: "sn", text: label }),
      h("span", { class: "sd", text: sid ? SKILLS[sid]?.name ?? "" : "" }),
      h("button", { class: "btn small keybtn" + (G.capturingKey?.kind === kind && G.capturingKey.i === i ? " wait" : ""), onclick: () => captureKey(kind, i) },
        G.capturingKey?.kind === kind && G.capturingKey.i === i ? "누르세요…" : keyLabel(code)));
  };
  const modes = [["auto", "자동"], ["high", "높음"], ["mid", "보통"], ["low", "낮음"]];
  openWin("keys", "설정", () => [
    h("h4", { text: "계정" }),
    h("div", { class: "flexrow" }, h("span", { class: "note", text: `지금 계정: ${G.name ?? G.char?.name ?? ""} · 계정은 여러 개 만들 수 있어요` }), h("button", { class: "btn small danger", onclick: () => G.ui.logout() }, "로그아웃 · 다른 계정으로")),
    globalThis.__LOCAL_NET ? null : passwordForm(),
    h("h4", { text: "그래픽" }),
    h("div", { class: "seg" }, ...modes.map(([m, n]) => h("button", { class: "btn small" + (Q.mode === m ? " primary" : ""), onclick: () => { setMode(m); refreshWin("keys"); } }, n))),
    h("div", { class: "note", text: Q.mode === "auto" ? `자동: 지금 ${preset().name} (느려지면 알아서 낮추고, 넉넉하면 다시 올려요)` : "낮을수록 빛 번짐·입자·날씨 효과가 줄어 가벼워져요." }),
    h("label", { class: "chk" }, h("input", { type: "checkbox", checked: Q.lessOthers, onchange: (e) => setLessOthers(e.target.checked) }), " 다른 사람 스킬 이펙트 줄이기 (파티 사냥 때 렉 줄이기)"),
    ...(G.touch ? [] : [
      h("h4", { text: "조작 키" }),
      h("div", { class: "note", text: "바꿀 칸을 누르고 원하는 키(또는 마우스 버튼)를 누르세요. 이미 쓰는 키면 서로 바뀌어요. Esc: 취소" }),
      ...names.map((n, i) => row(n, "slots", i)),
      h("h4", { text: "물약" }), ...pots.map((n, i) => row(n, "potions", i)),
      h("div", { class: "note", text: "이동 WASD/방향키 · 캐릭터 C · 스킬 K · 가방 I · 파티 P · 도움말 H · 도감 B · 대화 G · 지도 M · 미니맵 N · 채팅 열기 L(또는 Enter) 은 고정이에요." }),
      h("div", { class: "flexrow" }, h("button", { class: "btn small", onclick: () => { resetKeys(); G.ui.refreshKeys?.(); refreshWin("keys"); } }, "키 기본값으로")),
    ]),
  ], { w: 400 });
}
function captureKey(kind, i) {
  if (G.capturingKey) return;
  G.capturingKey = { kind, i };
  refreshWin("keys");
  const done = (code) => {
    removeEventListener("keydown", onKey, true); removeEventListener("mousedown", onMouse, true);
    setTimeout(() => { G.capturingKey = null; refreshWin("keys"); }, 0);
    if (!code) return;
    if (RESERVED.has(code)) { G.ui.toast?.("그 키는 이동·창 단축키라서 쓸 수 없어요."); return; }
    bindKey(kind, i, code);
    G.ui.refreshKeys?.();
  };
  const onKey = (e) => { e.preventDefault(); e.stopPropagation(); done(e.code === "Escape" ? null : e.code); };
  const onMouse = (e) => { if (e.target.closest?.(".keybtn") && e.button === 0) return; e.preventDefault(); e.stopPropagation(); done("Mouse" + e.button); };
  setTimeout(() => { addEventListener("keydown", onKey, true); addEventListener("mousedown", onMouse, true); }, 0);
}

// ───────── 아이템 도감 (B): 등급·드롭 확률·장비 종류 ─────────
export function openCodex() {
  const pct = (v) => (Number.isInteger(v) ? v : v.toFixed(1)) + "%";
  const tierName = { normal: "일반 몬스터", elite: "정예 몬스터", boss: "보스" };
  const dropCount = { normal: "7% 확률로 1개", elite: "35% 확률로 1개", boss: "중간보스 1~2개 · 주요 보스 2~3개" };
  openWin("codex", "아이템 도감", () => [
    h("h4", { text: "등급별 드롭 확률" }),
    h("div", { class: "note", text: "장비가 하나 떨어질 때 등급이 정해지는 확률이에요. 신화는 어디서나 0.5%." }),
    h("table", { class: "codex-t" },
      h("tr", {}, h("th", { text: "" }), ...RARITIES.map((r) => h("th", { style: { color: RARITY_COLOR[r] }, text: r }))),
      ...Object.keys(RARITY_WEIGHTS).map((t) => h("tr", {}, h("td", { text: tierName[t] }), ...RARITY_WEIGHTS[t].map((w) => h("td", { text: pct(w) }))))),
    h("div", { class: "note" }, ...Object.keys(dropCount).map((t) => h("div", { text: `• ${tierName[t]}: 장비 ${dropCount[t]}` })), h("div", { text: "• 층을 깨면 보상 상자에서 장비 1~2개 + 골드" })),
    h("h4", { text: "등급별 성능" }),
    h("div", { class: "note" }, ...RARITIES.map((r, i) => h("div", { style: { color: RARITY_COLOR[r] }, text: `${r}: 기본 능력치 ×${RARITY_MUL[i]} · 추가 옵션 ${i}개${i === 4 ? " + 신화 고유 효과 · 무기는 주는 피해 +6%" : ""}` }))),
    h("h4", { text: "재료 (아이템 레벨 = 떨어진 층)" }),
    h("div", { class: "note", text: MATERIALS.map((m, i) => `${m} ${i * 10 + 1}~${i * 10 + 10}층`).join(" · ") }),
    h("h4", { text: "무기" }),
    h("div", { class: "note" }, ...Object.values(WEAPON_TYPES).map((w) => h("div", { text: `${w.name}: 공격력 ×${w.mul} · ${w.cls.map((c) => CLASS_INFO[c]?.name ?? c).join("·")}` }))),
    h("h4", { text: "방어구·장신구 종류별 특징" }),
    ...["armor", "helmet", "trinket"].map((slot) => h("div", { class: "note" }, h("b", { text: SLOT_NAME[slot] }),
      ...VARIANT_TRAITS[slot].map((tr, v) => h("div", { text: `• ${ARMOR_NAMES[slot][v]}: ${tr.desc}` })))),
    h("h4", { text: "신화 고유 효과" }),
    h("div", { class: "note" }, ...Object.values(MYTHIC_EFFECTS).map((m) => h("div", { text: `◆ ${m.name}: ${m.desc}` }))),
  ], { w: 520 });
}

export { ENCHANTS };

/** 칭호 표시 (디자인이 있으면 그림, 없으면 색 글자) */
export function titleTag(t) {
  const d = titleDesign(t.text);
  if (d) return h("img", { class: "title-design", src: d.src, alt: t.text, title: t.text });
  return h("span", { class: "title-tag", style: { color: t.color, borderColor: t.color }, text: `「${t.text}」` });
}
// ── 칭호 (T): 장착칸 + 보관함. 칭호는 관리자만 줄 수 있음
export function openTitles() {
  openWin("titles", "칭호", () => {
    const c = G.char;
    const list = c?.titles ?? [];
    const cur = list.find((t) => t.id === c?.title) ?? null;
    const tag = (t) => titleTag(t);
    return [
      h("h4", { text: "장착 중" }),
      h("div", { class: "title-slot" }, cur ? tag(cur) : h("span", { class: "note", text: "비어 있음" }),
        cur ? h("button", { class: "btn small", onclick: () => send({ t: "title", id: null }) }, "해제") : null),
      h("div", { class: "note", text: "장착한 칭호는 닉네임 위에 표시돼요." }),
      h("h4", { text: `보관함 (${list.length})` }),
      list.length ? h("div", { class: "title-list" }, ...list.map((t) => h("div", { class: "statrow" },
        tag(t), h("span", { class: "sd note", text: t.at ? new Date(t.at).toLocaleDateString() : "" }),
        c.title === t.id ? h("span", { class: "note", text: "장착 중" }) : h("button", { class: "btn small primary", onclick: () => send({ t: "title", id: t.id }) }, "장착"))))
        : h("div", { class: "note", text: "아직 칭호가 없어요. 관리자가 준 칭호만 여기에 보관돼요." }),
    ];
  }, { w: 340 });
}

// ── 접속자 (U): 지금 온라인인 플레이어와 위치
let whoQ = "";
export function openWho() {
  send({ t: "who" });
  clearInterval(openWho.tm);
  openWho.tm = setInterval(() => { if (!isOpen("who")) return clearInterval(openWho.tm); send({ t: "who" }); }, 5000);
  openWin("who", "접속자", () => {
    const d = G.who;
    const input = h("input", { class: "txt", placeholder: "닉네임 검색", value: whoQ, oninput: (e) => { whoQ = e.target.value; const pos = e.target.selectionStart; refreshWin("who"); const el = document.querySelector(".win[data-id=who] input"); el?.focus(); el?.setSelectionRange(pos, pos); } });
    if (!d) return [input, h("div", { class: "note", text: "불러오는 중..." })];
    const q = whoQ.trim().toLowerCase();
    const list = d.list.filter((p) => !q || p.n.toLowerCase().includes(q));
    return [
      h("div", { class: "flexrow" }, h("span", { text: `🟢 온라인 ${d.n}명` }), input),
      h("div", { class: "who-list" }, ...list.map((p) => h("div", { class: "statrow" + (p.n === G.name ? " me" : "") },
        h("span", { class: "who-dot" + (p.ld ? " away" : ""), title: p.ld ? "잠깐 끊김" : "온라인" }),
        h("span", { class: "sn" }, p.tt ? h("span", { class: "who-tt", text: `「${p.tt}」` }) : null, p.n, p.p ? h("span", { class: "who-party", text: " 파티" }) : null),
        h("span", { class: "sd", text: `Lv.${p.lv} ${CLASS_INFO[p.c]?.name ?? ""} · ${p.w}` }),
        p.n !== G.name && !p.p ? h("button", { class: "btn small", title: "파티 초대 (마을에서)", onclick: () => send({ t: "party", op: "invite", name: p.n }) }, "초대") : null,
        p.n !== G.name ? h("button", { class: "btn small", title: "거래 신청 (둘 다 마을에서)", onclick: () => send({ t: "trade", op: "request", name: p.n }) }, "거래") : null))),
      list.length ? null : h("div", { class: "note", text: q ? "그 닉네임은 지금 접속해 있지 않아요." : "아무도 없어요." }),
    ];
  }, { w: 420 });
}

// ── 거래: 둘 다 마을에서. 물건·골드를 올리고 → 둘 다 준비 → 둘 다 확정하면 교환
let tradeGold = "";
export function openTrade() {
  openWin("trade", "거래", () => {
    const T = G.trade, c = G.char;
    if (!T || !c) return [h("div", { class: "note", text: "거래가 끝났어요." })];
    const mine = new Set(T.mine.items.map((i) => i.uid));
    const cells = (items, mineSide) => h("div", { class: "trade-grid" }, ...Array.from({ length: 12 }, (_, i) => {
      const it = items[i];
      const el = h("div", { class: "cell" + (it ? " r-" + it.rarity : ""), onclick: () => { if (it && mineSide) send({ t: "trade", op: "set", uids: T.mine.items.map((x) => x.uid).filter((u) => u !== it.uid) }); } },
        it ? iconEl(it) : null, it?.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null, it?.ench ? h("span", { class: "ench-dot" + (it.ench === "mend" ? " mend" : ""), text: "✦" }) : null);
      if (it) tipOn(el, () => itemTip(it, mineSide ? null : c.equip[it.slot]));
      return el;
    }));
    const badge = (sd) => h("span", { class: "trade-badge" + (sd.ok ? " ok" : ""), text: sd.ok ? "거래 요청함" : "고르는 중" });
    const goldIn = h("input", { class: "txt", type: "number", min: 0, max: c.gold, placeholder: "골드", value: tradeGold, oninput: (e) => (tradeGold = e.target.value) });
    const setGold = () => { const g = Math.max(0, Math.min(c.gold, Math.floor(Number(tradeGold) || 0))); tradeGold = String(g); send({ t: "trade", op: "set", gold: g }); };
    goldIn.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") setGold(); });
    // 내 가방: 누르면 거래창에 올리기/내리기
    const bag = h("div", { class: "inv-grid trade-bag" }, ...c.inv.map((it) => {
      const on = mine.has(it.uid);
      const el = h("div", { class: "cell r-" + it.rarity + (on ? " picked" : "") + (it.locked ? " locked" : ""), onclick: () => {
        if (it.locked) return G.ui.toast?.("잠긴 아이템은 거래할 수 없어요.");
        const list = T.mine.items.map((x) => x.uid);
        send({ t: "trade", op: "set", uids: on ? list.filter((u) => u !== it.uid) : [...list, it.uid] });
      } }, iconEl(it), it.enh ? h("span", { class: "enh", text: "+" + it.enh }) : null, it.locked ? h("span", { class: "lock", text: "🔒" }) : null, on ? h("span", { class: "pick", text: "✓" }) : null);
      tipOn(el, () => itemTip(it, c.equip[it.slot]));
      return el;
    }));
    return [
      h("div", { class: "trade-cols" },
        h("div", { class: "trade-col" },
          h("div", { class: "flexrow" }, h("b", { text: "내가 줄 것" }), badge(T.mine)),
          cells(T.mine.items, true),
          h("div", { class: "flexrow" }, h("span", { class: "trade-gold", text: `${T.mine.gold.toLocaleString()} G` }), goldIn, h("button", { class: "btn small", onclick: setGold }, "골드 올리기"))),
        h("div", { class: "trade-col" },
          h("div", { class: "flexrow" }, h("b", { text: `${T.with}님이 줄 것` }), badge(T.theirs)),
          cells(T.theirs.items, false),
          h("div", { class: "flexrow" }, h("span", { class: "trade-gold", text: `${T.theirs.gold.toLocaleString()} G` })))),
      h("div", { class: "flexrow trade-actions" },
        T.theirs.ok && !T.mine.ok
          ? h("button", { class: "btn primary", onclick: () => send({ t: "trade", op: "confirm", ver: G.trade?.ver }) }, "수락하고 교환")
          : h("button", { class: "btn primary", disabled: T.mine.ok, onclick: () => send({ t: "trade", op: "confirm", ver: G.trade?.ver }) }, T.mine.ok ? "상대 수락 기다리는 중…" : "거래하기"),
        T.theirs.ok && !T.mine.ok ? h("button", { class: "btn", onclick: () => send({ t: "trade", op: "reject" }) }, "거절") : null,
        h("button", { class: "btn danger", onclick: () => closeWin("trade") }, "취소")),
      h("div", { class: "note", text: "한 명이 '거래하기'를 누르면 상대에게 수락/거절 창이 떠요. 수락하면 바로 교환돼요. 그 전에 물건이나 골드가 바뀌면 요청이 풀려요. 상대가 올린 아이템을 꼭 확인하세요." }),
      h("h4", { text: `내 가방 — 눌러서 올리기/내리기 (💰 ${c.gold.toLocaleString()} G)` }),
      c.inv.length ? bag : h("div", { class: "note", text: "가방이 비어 있어요." }),
    ];
  }, { w: 640, onClose: () => { if (G.trade) { send({ t: "trade", op: "cancel" }); G.trade = null; } tradeGold = ""; } });
}

// 비밀번호 바꾸기 (설정 창): 현재 비밀번호 확인 → 새 비밀번호(8자 이상) 두 번 → 바뀌면 모든 기기에서 로그아웃, 다시 로그인
function passwordForm() {
  const inp = (ph) => { const e = h("input", { class: "txt", type: "password", placeholder: ph, autocomplete: ph.startsWith("현재") ? "current-password" : "new-password", maxlength: 100 }); e.addEventListener("keydown", (ev) => ev.stopPropagation()); return e; };
  const cur = inp("현재 비밀번호"), nx = inp("새 비밀번호 (8자 이상, 영문+숫자)"), nx2 = inp("새 비밀번호 한 번 더");
  const msg = h("div", { class: "note" });
  const go = async (btn) => {
    if (!cur.value || !nx.value) return (msg.textContent = "현재 비밀번호와 새 비밀번호를 넣어 주세요.");
    if (nx.value !== nx2.value) return (msg.textContent = "새 비밀번호 두 칸이 서로 달라요.");
    if (nx.value.length < 8) return (msg.textContent = "새 비밀번호는 8자 이상이어야 해요.");
    if (!/[A-Za-z]/.test(nx.value) || !/[0-9]/.test(nx.value)) return (msg.textContent = "새 비밀번호에 영문과 숫자를 모두 넣어 주세요.");
    if (nx.value === cur.value) return (msg.textContent = "지금 비밀번호와 같아요.");
    btn.disabled = true; msg.textContent = "바꾸는 중…";
    try {
      const r = await fetch("/api/password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ current: cur.value, next: nx.value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { msg.textContent = j.error ?? "바꾸지 못했어요."; btn.disabled = false; return; }
      cur.value = nx.value = nx2.value = "";
      msg.textContent = "비밀번호가 바뀌었어요. 모든 기기에서 로그아웃돼요. 새 비밀번호로 다시 로그인해 주세요.";
      setTimeout(() => { try { sessionStorage.removeItem("psim_go"); } catch {} location.reload(); }, 2500);
    } catch { msg.textContent = "서버에 연결하지 못했어요."; btn.disabled = false; }
  };
  const btn = h("button", { class: "btn small primary", onclick: (e) => go(e.currentTarget) }, "비밀번호 바꾸기");
  return h("details", { class: "pw-box" }, h("summary", { text: "🔑 비밀번호 바꾸기" }),
    h("div", { class: "pw-form" }, cur, nx, nx2, btn, msg));
}

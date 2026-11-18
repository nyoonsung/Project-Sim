// 장비 아이템: 등급(일반~신화), 옵션, 강화(최대 +99). 쿨타임 감소 효과는 이 게임에 존재하지 않는다.

export const RARITIES = ["일반", "희귀", "영웅", "전설", "신화"];
export const RARITY_COLOR = { 일반: "#c9d1d9", 희귀: "#58a6ff", 영웅: "#d2a8ff", 전설: "#ffb347", 신화: "#ff5a6e" };
// 드롭 등급 확률(합 100). 신화는 항상 0.5%
export const RARITY_WEIGHTS = {
  normal: [62, 26, 9, 2.5, 0.5],
  elite: [40, 38, 16, 5.5, 0.5],
  boss: [22, 42, 26, 9.5, 0.5],
};
export const RARITY_MUL = [1, 1.12, 1.26, 1.42, 1.6];      // 기본 능력치 배율
export const RARITY_OPTS = [0, 1, 2, 3, 4];                // 추가 옵션 수

export const SLOTS = ["weapon", "offhand", "helmet", "armor", "trinket"];
export const SLOT_NAME = { weapon: "무기", offhand: "보조장비", helmet: "투구", armor: "갑옷", trinket: "장신구" };

// 무기 종류: 사용 가능 직업, 리그 무기 모양, 공격력 배율
export const WEAPON_TYPES = {
  club: { name: "몽둥이", cls: ["adventurer", "priest"], rig: "club", mul: 0.95 },
  sword: { name: "장검", cls: ["adventurer", "sword"], rig: "sword", mul: 1.0 },
  greatsword: { name: "대검", cls: ["sword"], rig: "greatsword", mul: 1.08 },
  knuckle: { name: "너클", cls: ["adventurer", "fist"], rig: null, mul: 1.0 },
  bow: { name: "활", cls: ["adventurer", "archer"], rig: "bow", mul: 1.0 },
  dagger: { name: "단검", cls: ["adventurer", "rogue"], rig: "dagger", mul: 0.98 },
  staff: { name: "지팡이", cls: ["adventurer", "mage"], rig: "staff", mul: 1.05 },
  mace: { name: "메이스", cls: ["adventurer", "priest"], rig: "mace", mul: 0.95 },
  hammer: { name: "망치", cls: ["adventurer", "smith"], rig: "hammer", mul: 1.0 },
};
export const OFFHAND_TYPES = {
  shield: { name: "방패", cls: ["adventurer", "sword", "fist", "smith", "priest"] },
  quiver: { name: "화살통", cls: ["adventurer", "archer"] },
  tome: { name: "마도서", cls: ["adventurer", "mage", "priest"] },
  offdagger: { name: "보조 단검", cls: ["adventurer", "rogue"] },
};
// 직업 → 주로 떨어지는 무기·보조장비
export const CLASS_GEAR = {
  adventurer: { w: ["club", "sword", "dagger", "bow", "staff", "knuckle", "mace", "hammer"], o: ["shield", "quiver", "tome", "offdagger"] },
  sword: { w: ["sword", "greatsword"], o: ["shield"] },
  fist: { w: ["knuckle"], o: ["shield"] },
  archer: { w: ["bow"], o: ["quiver"] },
  rogue: { w: ["dagger"], o: ["offdagger"] },
  mage: { w: ["staff"], o: ["tome"] },
  priest: { w: ["mace", "club"], o: ["tome", "shield"] },
  smith: { w: ["hammer"], o: ["shield"] },
};

// 구역별 재료 이름 (아이템 레벨 = 드롭 층)
export const MATERIALS = ["나무", "청동", "철", "강철", "미스릴", "흑철", "아다만", "용골", "성은", "혼돈"];
export const ARMOR_NAMES = { helmet: ["두건", "투구", "철모", "면갑"], armor: ["가죽 갑옷", "사슬 갑옷", "판금 갑옷", "전투복"], trinket: ["반지", "목걸이", "부적", "귀걸이"] };

// 추가 옵션 (쿨타임 감소 없음). v(ilvl, rarityIndex) → 값
export const OPTIONS = {
  atk: { name: "공격력", fmt: (v) => `+${v}`, roll: (l, r, R) => Math.round((2 + l * 0.9) * (0.6 + R() * 0.6) * (1 + r * 0.1)) },
  atkPct: { name: "공격력", fmt: (v) => `+${(v * 100).toFixed(1)}%`, roll: (l, r, R) => +(0.02 + R() * 0.03 + r * 0.004).toFixed(3) },
  def: { name: "방어력", fmt: (v) => `+${v}`, roll: (l, r, R) => Math.round((2 + l * 0.8) * (0.6 + R() * 0.6)) },
  hp: { name: "최대 HP", fmt: (v) => `+${v}`, roll: (l, r, R) => Math.round((12 + l * 8) * (0.6 + R() * 0.6)) },
  mp: { name: "최대 MP", fmt: (v) => `+${v}`, roll: (l, r, R) => Math.round((6 + l * 1.5) * (0.6 + R() * 0.6)) },
  crit: { name: "치명타 확률", fmt: (v) => `+${(v * 100).toFixed(1)}%p`, roll: (l, r, R) => +(0.01 + R() * 0.02 + r * 0.003).toFixed(3) },
  critDmg: { name: "치명타 피해", fmt: (v) => `+${(v * 100).toFixed(1)}%p`, roll: (l, r, R) => +(0.03 + R() * 0.05 + r * 0.006).toFixed(3) },
  aspd: { name: "공격 속도", fmt: (v) => `+${(v * 100).toFixed(1)}%`, roll: (l, r, R) => +(0.02 + R() * 0.03).toFixed(3) },
  move: { name: "이동 속도", fmt: (v) => `+${(v * 100).toFixed(1)}%`, roll: (l, r, R) => +(0.02 + R() * 0.03).toFixed(3) },
  dmg: { name: "주는 피해", fmt: (v) => `+${(v * 100).toFixed(1)}%`, roll: (l, r, R) => +(0.02 + R() * 0.03 + r * 0.004).toFixed(3) },
  dr: { name: "받는 피해 감소", fmt: (v) => `${(v * 100).toFixed(1)}%`, roll: (l, r, R) => +(0.015 + R() * 0.02).toFixed(3) },
  hpRegen: { name: "초당 HP 회복", fmt: (v) => `+${v}`, roll: (l, r, R) => +((0.5 + l * 0.2) * (0.6 + R() * 0.6)).toFixed(1) },
  mpRegen: { name: "MP 회복 속도", fmt: (v) => `+${(v * 100).toFixed(0)}%`, roll: (l, r, R) => +(0.05 + R() * 0.1).toFixed(2) },
  heal: { name: "치유량", fmt: (v) => `+${(v * 100).toFixed(1)}%`, roll: (l, r, R) => +(0.03 + R() * 0.04).toFixed(3) },
};
const OPTION_KEYS = Object.keys(OPTIONS);

// 신화 고유 효과: 너무 사기적이지 않게
export const MYTHIC_EFFECTS = {
  swift_kill: { name: "질주하는 사냥꾼", desc: "적 처치 시 2초간 이동 속도 +15%" },
  thunder_echo: { name: "천둥의 메아리", desc: "치명타 시 15% 확률로 공격력 60%의 번개 추가 피해 (내부 쿨타임 1초)" },
  iron_will: { name: "강철 의지", desc: "HP 30% 이하일 때 받는 피해 -10%" },
  vampiric: { name: "핏빛 갈증", desc: "준 피해의 1.5%만큼 HP 회복 (초당 최대 HP 3% 상한)" },
  mana_font: { name: "마력의 샘", desc: "적 처치 시 최대 MP 3% 회복" },
  guardian: { name: "수호자의 가호", desc: "12초마다 최대 HP 5%의 보호막 (중첩 불가)" },
  berserk: { name: "광전사의 피", desc: "HP 50% 이하일 때 주는 피해 +8%" },
  ember: { name: "잔불", desc: "적중 시 10% 확률로 화상 (3초간 초당 공격력 20%)" },
};
const MYTHIC_KEYS = Object.keys(MYTHIC_EFFECTS);
const MYTHIC_TITLES = ["태초의", "몰락한 왕의", "별을 삼킨", "영원한", "잊힌 신의", "끝없는", "심연을 본", "황혼의"];

const pickW = (R, weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = R() * total;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
  return weights.length - 1;
};
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];

// 방어구 종류별 특징 (이름만 다르고 똑같던 문제 해결). [방어 배율, HP 배율, MP 배율, 덤 능력치]
//  갑옷: 가죽(가볍고 빠름) · 사슬(균형+피해 감소) · 판금(단단하지만 무거움) · 전투복(치명타)
//  투구: 두건(마나) · 투구(균형) · 철모(방어) · 면갑(체력)
//  장신구: 반지(공격) · 목걸이(체력) · 부적(마나·회복) · 귀걸이(치명타)
export const VARIANT_TRAITS = {
  armor: [
    { def: 0.75, hp: 0.9, extra: { move: 0.04 }, desc: "가벼움: 이동 속도 +4%" },
    { def: 1.0, hp: 1.0, extra: { dr: 0.02 }, desc: "균형: 받는 피해 -2%" },
    { def: 1.35, hp: 1.15, extra: { move: -0.03 }, desc: "단단함: 방어·HP 높음, 이동 속도 -3%" },
    { def: 0.85, hp: 0.95, extra: { crit: 0.02 }, desc: "날렵함: 치명타 +2%p" },
  ],
  helmet: [
    { def: 0.7, hp: 0.85, mp: 12, desc: "마나: 최대 MP +" },
    { def: 1.0, hp: 1.0, desc: "균형" },
    { def: 1.3, hp: 0.9, desc: "방어 위주" },
    { def: 0.85, hp: 1.3, desc: "체력 위주" },
  ],
  trinket: [
    { hp: 0.6, mpm: 0.6, extra: { atkPct: 0.02 }, desc: "공격력 +2%" },
    { hp: 1.4, mpm: 0.7, desc: "체력 위주" },
    { hp: 0.7, mpm: 1.6, extra: { mpRegen: 0.08 }, desc: "마나 위주, MP 회복 +8%" },
    { hp: 0.7, mpm: 0.8, extra: { crit: 0.015 }, desc: "치명타 +1.5%p" },
  ],
};
/** 장비 기본 능력치 (variant = 방어구 종류) */
export function baseStats(slot, type, ilvl, rarityIndex, variant = 1) {
  const m = RARITY_MUL[rarityIndex];
  const tr = VARIANT_TRAITS[slot]?.[variant];
  if (tr) {
    let o;
    if (slot === "armor") o = { def: Math.round((4 + ilvl * 1.8) * m * tr.def), hp: Math.round((14 + ilvl * 9) * m * tr.hp) };
    else if (slot === "helmet") o = { def: Math.round((2 + ilvl * 1.0) * m * tr.def), hp: Math.round((8 + ilvl * 5) * m * tr.hp) };
    else o = { hp: Math.round((6 + ilvl * 4) * m * tr.hp), mp: Math.round((4 + ilvl * 1) * m * tr.mpm) };
    if (tr.mp) o.mp = Math.round((tr.mp + ilvl * 1.2) * m);
    return { ...o, ...(tr.extra ?? {}) };
  }
  switch (slot) {
    case "weapon": return { atk: Math.round((5 + ilvl * 2.4) * (WEAPON_TYPES[type]?.mul ?? 1) * m) };
    case "offhand":
      if (type === "shield") return { def: Math.round((3 + ilvl * 1.3) * m), hp: Math.round((10 + ilvl * 6) * m) };
      if (type === "quiver") return { atk: Math.round((1 + ilvl * 0.8) * m), crit: 0.01 };
      if (type === "tome") return { atk: Math.round((1 + ilvl * 0.7) * m), mp: Math.round((10 + ilvl * 2) * m) };
      return { atk: Math.round((1 + ilvl * 0.8) * m), aspd: 0.02 };
    case "helmet": return { def: Math.round((2 + ilvl * 1.0) * m), hp: Math.round((8 + ilvl * 5) * m) };
    case "armor": return { def: Math.round((4 + ilvl * 1.8) * m), hp: Math.round((14 + ilvl * 9) * m) };
    case "trinket": return { hp: Math.round((6 + ilvl * 4) * m), mp: Math.round((4 + ilvl * 1) * m) };
  }
  return {};
}

/** 아이템 이름 */
export function itemName(it) {
  const mat = MATERIALS[Math.min(MATERIALS.length - 1, Math.floor((it.ilvl - 1) / 10))];
  let n;
  if (it.slot === "weapon") n = `${mat} ${WEAPON_TYPES[it.type].name}`;
  else if (it.slot === "offhand") n = `${mat} ${OFFHAND_TYPES[it.type].name}`;
  else n = `${mat} ${ARMOR_NAMES[it.slot][it.variant ?? 0]}`;
  if (it.mythic) n = `${it.title ?? "태초의"} ${n}`;
  return n;
}

/**
 * 장비 생성. R: 0~1 난수 함수(서버는 보안 난수 사용)
 * opts: { ilvl, cls, tier: 'normal'|'elite'|'boss', rarity?: 강제 등급 }
 */
export function rollItem(R, { ilvl, cls = "adventurer", tier = "normal", rarity }) {
  const ri = rarity != null ? RARITIES.indexOf(rarity) : pickW(R, RARITY_WEIGHTS[tier] ?? RARITY_WEIGHTS.normal);
  const slot = pick(R, ["weapon", "weapon", "offhand", "helmet", "armor", "armor", "trinket"]);
  const gear = CLASS_GEAR[cls] ?? CLASS_GEAR.adventurer;
  let type = null, variant = 0;
  if (slot === "weapon") type = R() < 0.75 ? pick(R, gear.w) : pick(R, Object.keys(WEAPON_TYPES));
  else if (slot === "offhand") type = R() < 0.75 ? pick(R, gear.o) : pick(R, Object.keys(OFFHAND_TYPES));
  else variant = Math.floor(R() * 4);
  const it = { slot, type, variant, rarity: RARITIES[ri], ilvl, enh: 0, base: baseStats(slot, type, ilvl, ri, variant), opts: [] };
  const keys = OPTION_KEYS.slice();
  for (let i = 0; i < RARITY_OPTS[ri]; i++) {
    const k = keys.splice(Math.floor(R() * keys.length), 1)[0];
    it.opts.push({ k, v: OPTIONS[k].roll(ilvl, ri, R) });
  }
  if (ri === 4) {
    it.mythic = pick(R, MYTHIC_KEYS);
    it.title = pick(R, MYTHIC_TITLES);
  }
  it.name = itemName(it);
  return it;
}

/** 모험가 시작 장비 */
export function starterGear() {
  const club = { slot: "weapon", type: "club", rarity: "일반", ilvl: 1, enh: 0, base: { atk: 5 }, opts: [], name: "나무 몽둥이" };
  const shield = { slot: "offhand", type: "shield", rarity: "일반", ilvl: 1, enh: 0, base: { def: 3, hp: 12 }, opts: [], name: "나무 방패" };
  return { weapon: club, offhand: shield };
}

/** 장착 가능 여부 */
export function canEquip(it, cls) {
  if (it.slot === "weapon") return WEAPON_TYPES[it.type]?.cls.includes(cls);
  if (it.slot === "offhand") return OFFHAND_TYPES[it.type]?.cls.includes(cls);
  return true;
}

// ── 강화: +n → +n+1 성공 (99-n)%, 파괴 항상 1%, 나머지 실패(유지)
export const MAX_ENH = 99;
export function enhanceOdds(n) {
  const success = Math.max(0, 99 - n) / 100;
  const destroy = 0.01;
  return { success, destroy, fail: Math.max(0, 1 - success - destroy) };
}
export function enhanceCost(it) {
  const ri = RARITIES.indexOf(it.rarity);
  return Math.round((15 + it.ilvl * 4) * (1 + it.enh * 0.18) * (1 + ri * 0.3));
}
/** 강화 단계마다 기본 능력치 +2% */
export function enhMul(enh) {
  return 1 + 0.02 * enh;
}
/** 판매 가격 */
export function sellPrice(it) {
  const ri = RARITIES.indexOf(it.rarity);
  return Math.round((4 + it.ilvl * 2) * Math.pow(2.2, ri) * (1 + it.enh * 0.1));
}

const PCT_KEYS = new Set(["crit", "aspd", "move", "dr", "atkPct", "critDmg", "mpRegen", "dmg", "heal"]);
/** 장착 장비 전체 합산 (서버 판정·클라이언트 표시 공용) */
export function gearTotals(equip) {
  const t = { atk: 0, atkPct: 0, def: 0, hp: 0, mp: 0, crit: 0, critDmg: 0, aspd: 0, move: 0, dmg: 0, dr: 0, hpRegen: 0, mpRegen: 0, heal: 0, mythic: [] };
  for (const it of Object.values(equip ?? {})) {
    if (!it) continue;
    const m = enhMul(it.enh);
    for (const [k, v] of Object.entries(it.base)) t[k] += PCT_KEYS.has(k) ? v : v * m; // 비율 능력치는 강화로 안 커짐
    for (const o of it.opts) t[o.k] += o.v;
    if (it.mythic) t.mythic.push(it.mythic);
  }
  t.atk = Math.round(t.atk); t.def = Math.round(t.def); t.hp = Math.round(t.hp); t.mp = Math.round(t.mp);
  return t;
}

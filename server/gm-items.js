// 관리자 계정용 심연 풀 카탈로그: 모든 장비 유형·변형, 고유 유물, 직업 전용 무기를 생성한다.
import { MAX_LEVEL } from "../shared/constants.js";
import { CLASS_INFO } from "../shared/classes.js";
import {
  RARITY_OPTS, MAX_ENH, WEAPON_TYPES, OFFHAND_TYPES, optionMax,
  makeItem, rollAbyssRelic, makeClassRelic, ensureAbyss, ensureDur,
} from "../shared/items.js";
import { secureRandom } from "./game/secure.js";

const OPTION_PRESETS = Object.freeze({
  weapon: ["atk", "atkPct", "crit", "critDmg", "dmg"],
  offhand: ["atk", "atkPct", "crit", "critDmg", "dr"],
  helmet: ["def", "hp", "critDmg", "dr", "mpRegen"],
  armor: ["def", "hp", "dr", "hpRegen", "move"],
  trinket: ["atkPct", "crit", "critDmg", "dmg", "aspd"],
});
const EFFECT_PRESETS = Object.freeze({
  weapon: ["rift_surge", "eclipse_focus"],
  offhand: ["null_guard", "null_rebound"],
  helmet: ["eclipse_focus", "eclipse_mark"],
  armor: ["chrono_step", "chrono_guard"],
  trinket: ["star_siphon", "star_bloom"],
});

export const MAX_ABYSS_BUNDLE_COUNT =
  Object.keys(WEAPON_TYPES).length +
  Object.keys(OFFHAND_TYPES).length +
  12 + // 투구·갑옷·장신구 각각 네 가지 변형
  5 +  // 고유 심연 유물
  Object.keys(CLASS_INFO).length; // 직업 전용 심연 무기

function maximizeAbyssItem(item) {
  if (!item || item.rarity !== "심연" || item.ilvl !== MAX_LEVEL) {
    throw new Error("심연 장비 생성 값이 올바르지 않아요.");
  }
  const keys = OPTION_PRESETS[item.slot];
  if (!keys || keys.length !== RARITY_OPTS[5]) throw new Error("장비 옵션 구성이 올바르지 않아요.");
  item.opts = keys.map((k) => ({
    k,
    v: +(Math.abs(optionMax(k, MAX_LEVEL, 5)) * 3).toFixed(3),
  }));
  item.enh = MAX_ENH;
  item.ench = "dmg";
  item.locked = true;
  if (!Array.isArray(item.abyssEffects) || item.abyssEffects.length !== 2) {
    item.abyssEffects = [...(EFFECT_PRESETS[item.slot] ?? EFFECT_PRESETS.weapon)];
  }
  ensureAbyss(item);
  ensureDur(item);
  if (item.enh !== 99 || item.opts.length !== 5 || item.dur !== item.maxDur) {
    throw new Error("심연 장비 최종 성능 확인에 실패했어요.");
  }
  return item;
}

export function makeMaxAbyssBundle() {
  const items = [];
  // 모든 무기 종류와 보조장비 종류
  for (const type of Object.keys(WEAPON_TYPES)) {
    items.push(maximizeAbyssItem(makeItem({
      slot: "weapon", type, rarity: "심연", ilvl: MAX_LEVEL, enh: MAX_ENH,
      abyssEffects: EFFECT_PRESETS.weapon,
    })));
  }
  for (const type of Object.keys(OFFHAND_TYPES)) {
    items.push(maximizeAbyssItem(makeItem({
      slot: "offhand", type, rarity: "심연", ilvl: MAX_LEVEL, enh: MAX_ENH,
      abyssEffects: EFFECT_PRESETS.offhand,
    })));
  }
  // 투구·갑옷·장신구의 네 가지 변형을 모두 지급
  for (const slot of ["helmet", "armor", "trinket"]) {
    for (let variant = 0; variant < 4; variant++) {
      items.push(maximizeAbyssItem(makeItem({
        slot, variant, rarity: "심연", ilvl: MAX_LEVEL, enh: MAX_ENH,
        abyssEffects: EFFECT_PRESETS[slot],
      })));
    }
  }
  // 무작위 추첨으로 다섯 종류의 고유 심연 유물을 하나씩 모은다.
  const relics = new Set();
  for (let i = 0; i < 1000 && relics.size < 5; i++) {
    const item = rollAbyssRelic(secureRandom, { ilvl: MAX_LEVEL, cls: "adventurer" });
    if (!item || relics.has(item.relic)) continue;
    relics.add(item.relic);
    items.push(maximizeAbyssItem(item));
  }
  if (relics.size !== 5) throw new Error("고유 심연 유물 다섯 종류를 모두 생성하지 못했어요.");
  // 1차 직업 8종의 레벨 250 직업 전용 심연 무기
  for (const cls of Object.keys(CLASS_INFO)) {
    const item = makeClassRelic(cls, MAX_LEVEL);
    if (!item) throw new Error(`${cls} 직업 전용 심연 무기 생성에 실패했어요.`);
    items.push(maximizeAbyssItem(item));
  }
  if (items.length !== MAX_ABYSS_BUNDLE_COUNT) throw new Error("심연 풀세트 수량 검증에 실패했어요.");
  return items;
}

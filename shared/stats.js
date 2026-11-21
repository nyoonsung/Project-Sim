// 레벨·직업·배분 스탯·성장 단계·장비·패시브로 최종 능력치를 계산 (서버가 실제 판정, 클라이언트는 표시용)
import { CLASS_INFO, STATS, stageOf, stageBonus } from "./classes.js";
import { BASE_MOVE_SPEED, CRIT } from "./constants.js";
import { gearTotals } from "./items.js";
import { SKILLS } from "./skills.js";

// 직업별 피해량 배율 (1.0 = 기준 피해량)
export const CLASS_DMG = {
  sword: 0.7,
  archer: 1.0,
  rogue: 0.9,
  mage: 0.8,
  priest: 0.7,
  fist: 0.6,
  smith: 0.5,
};

// 직업별 유지력 배율 (최대 HP·방어·회피·저항·피해 감소·재생·회복·보호막에 적용)
export const CLASS_SUSTAIN = {
  sword: 0.7,
  archer: 0.5,
  rogue: 0.5,
  mage: 0.6,
  priest: 0.7,
  fist: 0.8,
  smith: 1.0,
};
const MOVE_MUL = { adventurer: 1, sword: 1, fist: 1.02, archer: 1.02, rogue: 1.12, mage: 1.0, priest: 0.98, smith: 0.92 };

/** 장착한 패시브 스킬의 상시 능력치 */
export function passiveMods(equipped) {
  const m = {};
  for (const id of equipped ?? []) {
    const s = SKILLS[id];
    if (s?.kind === "passive" && s.passive?.mods) for (const [k, v] of Object.entries(s.passive.mods)) m[k] = (m[k] ?? 0) + v;
  }
  return m;
}

export function deriveStats(ch) {
  const info = CLASS_INFO[ch.cls] ?? CLASS_INFO.adventurer;
  const L = ch.level;
  const sum = {};
  for (const [k, pts] of Object.entries(ch.stats ?? {})) {
    const def = STATS[k];
    if (!def || !info.stats.includes(k)) continue;
    for (const [fx, v] of Object.entries(def.fx)) sum[fx] = (sum[fx] ?? 0) + v * pts;
  }
  const gear = gearTotals(ch.equip);
  const pm = passiveMods(ch.skills);
  const stage = stageOf(ch.cls, L);
  const sb = stageBonus(ch.cls, stage);
  const g = (k) => sum[k] ?? 0;
  const p = (k) => pm[k] ?? 0;
  const sustain = CLASS_SUSTAIN[ch.cls] ?? 1;
  const maxHp = Math.round(((((120 + 22 * L) * info.hpMul + g("hp")) * (1 + (sb - 1) * 0.5) + gear.hp) * (1 + p("hpPct") + gear.hpPct)) * sustain);
  const def = Math.round(((((5 + 2.2 * L) * info.defMul + g("def")) * (1 + (sb - 1) * 0.5) + gear.def) * (1 + p("defPct") + gear.defPct)) * sustain);
  return {
    stage,
    stageBonus: sb,
    maxHp,
    maxMp: Math.round(info.mpBase + 3 * L + g("mp") + gear.mp),
    def,
    atk: ((12 + 3.2 * L) * sb + gear.atk) * (1 + gear.atkPct),
    phys: 1 + g("phys"),
    mag: 1 + g("mag"),
    dmg: gear.dmg + p("dmg"),
    dr: Math.min(0.4, gear.dr * sustain),
    aspd: Math.min(1.6, 1 + g("aspd") + gear.aspd + p("aspd")),
    cast: Math.min(1.5, (info.castMul ?? 1) + g("cast")),
    steady: Math.min(0.6, g("steady")),
    crit: Math.min(CRIT.CHANCE_CAP, CRIT.BASE_CHANCE + g("crit") + gear.crit),
    critDmg: Math.min(CRIT.DAMAGE_CAP, CRIT.BASE_DAMAGE + gear.critDmg),
    move: BASE_MOVE_SPEED * (MOVE_MUL[ch.cls] ?? 1) * (1 + Math.min(0.4, g("move") + gear.move)),
    mpRegen: (1.2 + 0.08 * L) * (info.mpRegenMul ?? 1) * (1 + g("mpRegen") + gear.mpRegen),
    hpRegen: gear.hpRegen * sustain,
    res: Math.min(0.5, g("res")) * sustain,
    heal: (1 + g("heal") + gear.heal) * sustain,
    threat: 1 + g("threat"),
    counter: 1 + g("counter"),
    kiGain: 1 + g("kiGain"),
    weak: g("weak"),
    vital: g("vital"),
    evade: Math.min(0.3, (info.evadeBase ?? 0) + g("evade")) * sustain,
    device: 1 + g("device"),
    shield: (1 + g("shield")) * sustain,
    mythic: gear.mythic,
    abyssEffects: gear.abyssEffects,
    dmgType: info.dmgType,
    classDmg: CLASS_DMG[ch.cls] ?? 1,
    classSustain: sustain,
  };
}

/** 방어도에 의한 피해 감소율 (공격자 레벨 기준) */
export function defReduction(def, attackerLevel) {
  return def / (def + 60 + 12 * attackerLevel);
}

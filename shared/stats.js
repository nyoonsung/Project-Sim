// 레벨·직업·배분 스탯·성장 단계·장비·패시브로 최종 능력치를 계산 (서버가 실제 판정, 클라이언트는 표시용)
import { CLASS_INFO, STATS, stageOf, stageBonus } from "./classes.js";
import { blessingMods } from "./astra.js";
import { BASE_MOVE_SPEED, CRIT } from "./constants.js";
import { gearTotals } from "./items.js";
import { passivesOf } from "./skills.js";
import { CLASS2_MUL, PATHS } from "./classes2.js";

// 직업 피해 배율: 도적 아래 다섯 직업의 피해 기여도를 1.5배 상향한다.
export const CLASS_DMG = {
  adventurer: 2.0, // 모험가 전용 스킬과 함께: 전직 직업의 약 85~90% (에르덴 섬 클리어 가능 수준)
  sword: 1.80, // 기존 대비 1.5배
  archer: 0.5985, // 0.57 → 0.5985 (+5%)
  rogue: 1.30, // 1.62에서 약 20% 하향
  mage: 1.08864, // 기존 대비 1.5배
  priest: 2.2275, // 2.025 → 2.2275 (+10%)
  fist: 10.53, // 8.10 → 10.53 (+30%)
  smith: 6.909, // 7.35 → 6.909 (-6%)
};
// 2차 전직 후에 추가로 붙는 직업 피해 보정 (2차 경로 구성 차이로 벌어진 250레벨 격차 보정)
export const CLASS2_DMG = { priest: 2.47, fist: 1.61 };
const MOVE_MUL = { adventurer: 1, sword: 1, fist: 1.02, archer: 1.02, rogue: 1.12, mage: 1.0, priest: 0.98, smith: 0.92 };

/** 해금된 패시브 스킬의 상시 능력치 (스킬칸 장착 불필요) */
export function passiveMods(ch) {
  const m = {};
  for (const s of passivesOf(ch)) {
    if (s.passive?.mods) for (const [k, v] of Object.entries(s.passive.mods)) m[k] = (m[k] ?? 0) + v;
  }
  // 3차: 성좌의 축복 (PvP용 캐릭터엔 astra가 없어 적용되지 않음)
  for (const [k, v] of Object.entries(blessingMods(ch))) m[k] = (m[k] ?? 0) + v;
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
  const pm = passiveMods(ch);
  const stage = stageOf(ch.cls, L);
  const sb = stageBonus(ch.cls, stage);
  const g = (k) => sum[k] ?? 0;
  const p = (k) => pm[k] ?? 0;
  // 2차 전직: 1차 전직 때보다 2배 강하게 (공격력·HP ×2, 방어 ×1.5)
  const c2 = ch.cls2 && PATHS[ch.cls2] ? CLASS2_MUL : null;
  const maxHp = Math.round((((120 + 22 * L) * info.hpMul + g("hp")) * (1 + (sb - 1) * 0.5) + gear.hp) * (1 + p("hpPct") + gear.hpPct) * (c2?.hp ?? 1));
  const def = Math.round((((5 + 2.2 * L) * info.defMul + g("def")) * (1 + (sb - 1) * 0.5) + gear.def) * Math.max(0.2, 1 + p("defPct") + gear.defPct) * (info.defFinal ?? 1) * (c2?.def ?? 1));
  // 철골단련(금강무사): 방어력 일부를 공격력으로 환산
  const defToAtk = pm.defToAtk ?? 0;
  return {
    stage,
    stageBonus: sb,
    maxHp,
    maxMp: Math.round(info.mpBase + 3 * L + g("mp") + gear.mp),
    def,
    atk: (((12 + 3.2 * L) * sb + gear.atk) * (1 + gear.atkPct) + def * defToAtk) * (c2?.atk ?? 1),
    phys: 1 + g("phys"),
    mag: 1 + g("mag"),
    dmg: gear.dmg + p("dmg"),
    dr: Math.min(0.4, gear.dr + p("dr")),
    aspd: Math.min(1.6, 1 + g("aspd") + gear.aspd + p("aspd")),
    cast: Math.min(1.5, (info.castMul ?? 1) + g("cast")),
    steady: Math.min(0.6, g("steady")),
    crit: Math.min(CRIT.CHANCE_CAP, CRIT.BASE_CHANCE + g("crit") + gear.crit + p("crit")),
    critDmg: Math.min(CRIT.DAMAGE_CAP, CRIT.BASE_DAMAGE + gear.critDmg + p("critDmg")),
    move: BASE_MOVE_SPEED * (MOVE_MUL[ch.cls] ?? 1) * (1 + Math.min(0.4, g("move") + gear.move) + p("move")),
    mpRegen: (1.2 + 0.08 * L) * (info.mpRegenMul ?? 1) * (1 + g("mpRegen") + gear.mpRegen),
    hpRegen: gear.hpRegen,
    res: Math.min(0.5, g("res")),
    heal: 1 + g("heal") + gear.heal + p("heal"),
    threat: 1 + g("threat"),
    counter: 1 + g("counter"),
    kiGain: 1 + g("kiGain"),
    weak: g("weak"),
    vital: g("vital"),
    evade: Math.min(0.3, (info.evadeBase ?? 0) + g("evade")),
    device: 1 + g("device"),
    shield: 1 + g("shield"),
    mythic: gear.mythic,
    abyssEffects: gear.abyssEffects,
    vmods: gear.vmods ?? {},
    cls2: c2 ? ch.cls2 : null,
    dmgType: info.dmgType,
    classDmg: (CLASS_DMG[ch.cls] ?? 1) * (c2 ? CLASS2_DMG[ch.cls] ?? 1 : 1),
  };
}

/** 방어도에 의한 피해 감소율 (공격자 레벨 기준) */
export function defReduction(def, attackerLevel) {
  return def / (def + 60 + 12 * attackerLevel);
}

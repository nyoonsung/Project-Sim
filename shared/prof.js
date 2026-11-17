// 스킬 숙련도: 스킬을 실제 전투에서 쓸수록 오름 (마을·허공에 쓰면 안 오름)
//  - Lv.1~10: 레벨마다 위력(피해·치유·보호막) +2%, 마나 소모 -1.5%  → Lv.10: 위력 +20%, 마나 -15%
//  - 한도 없는 스킬(찌르기): Lv.10 뒤로도 계속 오름. 11레벨부터는 레벨마다 위력 +1% (마나 감소는 -15%에서 멈춤)
//    필요 경험치가 계속 커져서 레벨이 갈수록 천천히 오름 (Lv.20 = 위력 +30%, Lv.30 = +40%)
//  - 쿨타임은 절대 줄지 않음 (이 게임 규칙)
//  - Lv.5·Lv.10에서 이펙트가 한 단계씩 화려해짐
//  - 나중에 직업 경지를 올릴 때 숙련도 조건으로 씀 (profOf / meetsProf)
export const PROF_MAX = 10;
export const PROF_POW = 0.02;
export const PROF_POW_AFTER = 0.01;
export const PROF_COST = 0.015;
/** 한도 없이 계속 성장하는 스킬 */
export const UNCAPPED = new Set(["c_thrust"]);
export const isUncapped = (id) => UNCAPPED.has(id);

/** n-1 → n 레벨에 필요한 숙련 경험치 */
export const profNeed = (n) => Math.round(60 * Math.pow(n, 1.6));
const CUM = [0];
const cum = (n) => { while (CUM.length <= n) CUM.push(CUM[CUM.length - 1] + profNeed(CUM.length)); return CUM[n]; };
export const PROF_TOTAL = cum(PROF_MAX);

/** 경험치 → { lv, cur(이번 레벨에서 쌓인 양), need(이번 레벨에 필요한 양), max } */
export function profLevel(xp = 0, id = null) {
  const cap = id && UNCAPPED.has(id) ? 9999 : PROF_MAX;
  let lv = 0;
  while (lv < cap && xp >= cum(lv + 1)) lv++;
  return lv >= cap ? { lv, cur: 0, need: 0, max: true } : { lv, cur: xp - cum(lv), need: profNeed(lv + 1), max: false };
}
/** 위력 보너스(비율): Lv.10까지 2%씩, 그 뒤(한도 없는 스킬) 1%씩 */
export const profPow = (lv) => (lv <= PROF_MAX ? lv * PROF_POW : PROF_MAX * PROF_POW + (lv - PROF_MAX) * PROF_POW_AFTER);
/** 마나 감소(비율): 최대 15% */
export const profCost = (lv) => Math.min(lv, PROF_MAX) * PROF_COST;
/** 한 번 쓸 때 얻는 숙련 경험치: 쿨타임이 긴 스킬일수록 많이 (자주 쓰는 평타와 균형) */
export function profGain(sk) {
  if (sk.kind === "basic") return 1;
  return Math.max(2, Math.round(1 + (sk.cd ?? 1)));
}
/** 이펙트 단계: 0(기본) · 1(Lv.5~) · 2(Lv.10~) */
export const profTier = (lv) => (lv >= 10 ? 2 : lv >= 5 ? 1 : 0);
/** 캐릭터의 스킬 숙련 레벨 */
export const profOf = (ch, id) => profLevel(ch?.prof?.[id] ?? 0, id).lv;
/** 경지 승급 등에서: 스킬들 중 n개 이상이 lv 이상인가 */
export function meetsProf(ch, ids, lv, n = ids.length) { return ids.filter((id) => profOf(ch, id) >= lv).length >= n; }

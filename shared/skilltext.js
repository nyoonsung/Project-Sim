import { PLAYER_HIT } from "./constants.js";
// 스킬 상세 설명: 스킬 데이터(steps)를 읽어서 피해 배율·범위·지속시간·상태이상 등을 사람이 읽는 문장으로
const pct = (v) => `${Math.round(v * 100)}%`;
const sec = (v) => `${+(+v).toFixed(2)}초`;
const STATUS = {
  burn: "화상", shock: "감전", weaken: "약화(방어력 감소)", slow: "둔화", blind: "실명(적 공격 빗나감)", vitalmark: "급소 표식",
  stun: "기절", freeze: "빙결", root: "속박", poison: "중독", down: "넘어뜨림", huntmark: "사냥 표식", bleed: "출혈", curse: "저주",
};
const MODS = {
  dmg: "주는 피해", dr: "받는 피해 감소", aspd: "공격 속도", move: "이동 속도", crit: "치명타 확률", critDmg: "치명타 피해",
  atkPct: "공격력", defPct: "방어력", hpPct: "최대 HP", heal: "치유량", pen: "방어 관통", range: "사거리", mpRegen: "MP 회복",
  evade: "회피", steady: "시전 안정", threat: "위협", kiGain: "내력 획득", res: "상태이상 저항", cast: "시전 속도", defToAtk: "방어력→공격력 환산",
};
function statusText(s) {
  if (!s) return null;
  const n = STATUS[s.type] ?? s.type;
  const v = s.v != null ? ` ${pct(s.v)}` : s.pow != null ? ` (초당 공격력 ${pct(s.pow)})` : "";
  return `${n}${v} ${s.dur ? sec(s.dur) : ""}`.trim();
}
function modsText(mods) {
  return Object.entries(mods ?? {}).map(([k, v]) => `${MODS[k] ?? k} ${v > 0 ? "+" : ""}${Math.abs(v) < 2 ? pct(v) : v}`).join(", ");
}
function ccText(st) {
  const out = [];
  if (st.cc) out.push(typeof st.cc === "object" ? statusText(st.cc) : `행동 불가 ${sec(st.cc)}`);
  if (st.status) out.push(statusText(st.status));
  if (st.knock) out.push(`밀쳐냄 ${st.knock}`);
  if (st.groggy) out.push(`그로기 게이지 +${st.groggy}`);
  if (st.interrupt) out.push("시전 끊기");
  if (st.pull) out.push("끌어당김");
  // 2차 전직 타격 옵션
  if (st.lifesteal) out.push(`흡혈 ${pct(st.lifesteal)}`);
  if (st.lowHp) out.push(`생명력이 낮을수록 최대 +${pct(st.lowHp)}`);
  if (st.perDef) out.push("방어력 비례 강화");
  if (st.mark) out.push(`표식 +${st.mark.n ?? 1}(최대 ${st.mark.max ?? 5})`);
  if (st.vsMark) out.push(`표식 1당 +${pct(st.vsMark)}`);
  if (st.markBurst) out.push(`표식 폭발(1당 공격력 ${pct(st.markBurst.pow)})`);
  if (st.vsDot) out.push(`지속 피해 대상 +${pct(st.vsDot)}`);
  if (st.burstDot) out.push("지속 피해 즉시 폭발");
  if (st.backstab) out.push(`배후 +${pct(st.backstab)}`);
  if (st.stealthHit) out.push(`은신 중 +${pct(st.stealthHit)}`);
  if (st.spendR2) out.push(`전직 자원 최대 ${st.spendR2.max} 소모(1당 +${pct(st.spendR2.per)})`);
  if (st.spendKi) out.push(`내력 최대 ${st.spendKi.max} 추가 소모(1당 +${pct(st.spendKi.per)})`);
  if (st.pullIn) out.push("끌어당김");
  if (st.curse) out.push(`저주 ${sec(st.curse)}`);
  if (st.vsCurse) out.push(`저주 대상 +${pct(st.vsCurse)}`);
  if (st.vsAir) out.push(`공중 대상 +${pct(st.vsAir)}`);
  if (st.vsShred) out.push(`파쇄 중첩당 +${pct(st.vsShred)}`);
  if (st.pen) out.push(`방어 관통 ${pct(st.pen)}`);
  return out.filter(Boolean);
}

/** 한 단계(step)를 문장 하나로 */
function stepLine(st) {
  const tgt = (max) => (max ? `최대 ${max}명` : "범위 안 모두");
  const pow = st.pow ? `공격력 ${pct(st.pow)} 피해` : "";
  const extra = ccText(st);
  const tail = extra.length ? ` · ${extra.join(", ")}` : "";
  const crit = st.critBonus ? ` · 치명타 확률 +${pct(st.critBonus)}` : "";
  switch (st.do) {
    case "melee": return `근접 부채꼴(사거리 ${Math.round(st.range * PLAYER_HIT.melee + PLAYER_HIT.meleeReach)}, ${(st.arc ?? 60) + PLAYER_HIT.meleeArc}°) ${tgt(st.max)}에게 ${pow}${st.hits > 1 ? ` × ${st.hits}회` : ""}${crit}${st.chain ? ` · 주변 적에게 연쇄` : ""}${st.execute ? " · 체력 낮은 적에게 추가 피해" : ""}${tail}`;
    case "proj": return `투사체${st.count > 1 ? ` ${st.count}발` : ""}(사거리 ${st.range}${st.pierce ? `, ${st.pierce === true ? "관통" : `${st.pierce}명 관통`}` : ""}${st.explode ? `, 폭발 반경 ${st.explode.radius ?? st.explode}` : ""}): ${pow}${st.burst > 1 ? ` × ${st.burst}연발` : ""}${crit}${st.pen ? ` · 방어 관통 ${pct(st.pen)}` : ""}${tail}`;
    case "line": return `직선(길이 ${st.length}, 폭 ${st.width}): ${pow}${st.telegraph ? ` · ${sec(st.telegraph)} 뒤 발동` : ""}${tail}`;
    case "circle": return `자기 주변 반경 ${Math.round(st.radius * PLAYER_HIT.area)} ${tgt(st.max)}에게 ${pow || "효과"}${tail}`;
    case "area": return `지정한 곳 반경 ${Math.round(st.radius * PLAYER_HIT.area)}: ${pow}${st.ticks > 1 ? ` × ${st.ticks}회(${sec(st.interval ?? 0.5)}마다)` : ""}${st.telegraph ? ` · ${sec(st.telegraph)} 뒤 발동` : ""}${st.healAllies ? " · 아군 회복" : ""}${tail}`;
    case "zone": return `장판 반경 ${st.radius}, ${sec(st.dur)} 동안${st.pow ? ` ${sec(st.interval ?? 0.5)}마다 공격력 ${pct(st.pow)} 피해` : ""}${st.heal ? ` · 아군 회복` : ""}${st.dr ? ` · 받는 피해 -${pct(st.dr)}` : ""}${tail}`;
    case "dash": return `${st.dist}만큼 ${st.side ? "옆으로" : "앞으로"} 돌진${st.hit?.pow ? ` · 부딪힌 적에게 공격력 ${pct(st.hit.pow)} 피해` : ""}${st.through ? " · 적을 통과" : ""}`;
    case "blink": return `${st.dist}만큼 순간이동`;
    case "heal": return `${st.target === "ally" ? "아군" : st.target === "party" ? "파티" : "자신"} 회복${st.pctMax ? ` 최대 HP의 ${pct(st.pctMax)}` : ""}${st.pow ? ` + 공격력 ${pct(st.pow)}` : ""}${st.hot ? ` · 지속 회복 ${sec(st.hot.dur)}` : ""}`;
    case "shield": return `${st.target === "party" || st.radius ? "주변 아군" : st.target === "ally" ? "아군" : "자신"}에게 보호막${st.pctMax ? ` 최대 HP의 ${pct(st.pctMax)}` : ""}${st.pow ? ` + 공격력 ${pct(st.pow)}` : ""}${st.dur ? ` (${sec(st.dur)})` : ""}`;
    case "buff": return `${st.target === "party" ? "파티" : st.target === "ally" ? "아군" : "자신"} 강화 ${st.dur ? sec(st.dur) : ""}${st.mods ? `: ${modsText(st.mods)}` : ""}${st.nextHit ? " · 다음 공격 강화" : ""}`;
    case "parry": return `${sec(st.dur)} 동안 정면(${st.arc ?? 120}°) 공격 막기${st.counter ? ` · 막으면 반격 공격력 ${pct(st.counter.pow ?? st.counter)}` : ""}`;
    case "taunt": return `반경 ${st.radius} 적을 ${sec(st.dur)} 동안 도발`;
    case "channel": return `${sec(st.dur)} 동안 집중(움직이면 끊김)${st.mpPct ? ` · 초당 MP ${pct(st.mpPct)} 소모` : ""}`;
    case "device": return `${{ mine: "지뢰", drone: "드론", turret: "포탑", wall: "방벽", golem: "골렘", moth: "기계 나방" }[st.kind] ?? "장치"} 설치 (${sec(st.dur)}${st.pow ? `, 공격력 ${pct(st.pow)}` : ""}${st.hp ? `, 내구 ${st.hp}` : ""})`;
    case "custom": return st.pow ? `특수 효과: 공격력 ${pct(st.pow)}${st.ticks ? ` × ${st.ticks}회` : st.n ? ` × ${st.n}회` : ""}${st.final ? ` + 마무리 ${pct(st.final)}` : ""}${st.dur ? `, ${sec(st.dur)}` : ""}${tail}` : st.dur ? `특수 효과 ${sec(st.dur)}` : "특수 효과";
    default: return null;
  }
}

/** 스킬 상세 줄 목록 (툴팁·스킬 창에서 사용) */
export function skillDetails(sk) {
  if (!sk) return [];
  const lines = [];
  if (sk.kind === "passive") {
    if (sk.passive?.mods) lines.push(`상시: ${modsText(sk.passive.mods)}`);
    if (sk.passive?.trigger) lines.push(`조건부 발동${sk.passive.trigger.icd ? ` (내부 쿨타임 ${sec(sk.passive.trigger.icd)})` : ""}`);
    if (sk.passive?.p2) lines.push("2차 전직 패시브 — 장착하면 효과 발동");
    return lines;
  }
  const head = [];
  if (sk.range) head.push(`사거리 ${sk.range}`);
  if (sk.aim === "self") head.push("자신 중심");
  else if (sk.aim === "ally") head.push("아군 대상");
  else if (sk.aim === "dir") head.push("조준 방향");
  else if (sk.aim === "point") head.push("지정 위치");
  if (sk.cast) head.push(`시전 ${sec(sk.cast)}`);
  if (sk.hpCost) head.push(`생명력 ${pct(sk.hpCost)} 소모`);
  if (sk.moveSkill) head.push("이동기");
  if (head.length) lines.push(head.join(" · "));
  for (const st of sk.steps ?? []) { const l = stepLine(st); if (l) lines.push("• " + l); }
  return lines;
}

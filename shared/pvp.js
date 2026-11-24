// PvP 결투장 규칙 (서버·클라이언트 공용)
//  핵심: 레벨·능력치·장비는 같은 기준선으로 평준화하고, 승부는 스킬 선택·거리 조절·회피 타이밍·직업 상성으로 가른다.
//  PvE 계수와 분리된 PvP 전용 배율만 여기서 조정한다 (던전 밸런스에 영향 없음).
import { CLASS_INFO } from "./classes.js";

export const PVP = {
  level: 150,              // 모두 Lv.150 (1차 전직 최종 단계, 1차 스킬 전부 해금)
  points: 447,             // 스탯 예산 = Lv.150 캐릭터와 같음 ((150-1)×3)
  statMax: 250,            // 한 스탯에 넣을 수 있는 최대치 (극단 세팅 방지)
  // 경기 방식: 1대1, 3판 2선승 (무승부 판이 나오면 최대 5판)
  winRounds: 2,
  maxRounds: 5,
  roundTime: 90,           // 한 판 제한 시간(초)
  prepTime: 3,             // 판 시작 전 준비(이동·스킬 불가)
  zoneAt: 40,              // 40초부터 중앙 거점 활성화
  zoneR: 92,               // 거점 반지름(px)
  zoneDmgPerSec: 0.02,     // 거점을 혼자 점유하면 1초마다 피해 +2% (최대 +40%)
  zoneDmgMax: 0.4,
  stormAt: 65,             // 65초부터 거점 밖에 있으면 초당 최대 체력 3% 피해 (도망 방지)
  stormPerSec: 0.03,
  // 수치 보정
  dmg: 0.02,               // PvP 전체 피해 배율: PvE 계수를 그대로 쓰면 1~2초에 끝나서 크게 낮춤 (한 판 중앙값 약 35초)
  heal: 0.35,              // 치유·자연 회복 배율
  shield: 0.6,             // 보호막 배율
  hitCap: 0.32,            // 한 대 피해 상한 (최대 체력 대비) → 한 방에 끝나지 않게
  evadeCap: 0.15,
  critCap: 0.35,
  critDmgCap: 1.8,
  resCap: 0.25,
  // 제어(기절·빙결·넘어짐·속박): 지속시간 단축 + 연속 제어 점감 → 아무것도 못 하는 시간을 제한
  ccDur: 0.6,
  ccMax: 1.6,
  ccDr: [1, 0.55, 0.3],    // 15초 안에 거듭 걸리면 지속시간 감소, 4번째부터 면역
  ccDrWindow: 15,
  ccImmune: 1.2,           // 제어가 끝난 뒤 짧은 면역(초)
  slowMax: 0.4,
  slowDurMax: 2.5,
  // 직업별 PvP 전용 보정. PvE 직업 배율(권투사 ×10.5, 궁수 ×0.6 …)과 스킬 계수 차이를 상쇄해
  //  '서로 체력을 깎는 속도'가 같도록 맞춘 뒤, 봇 1대1 모의전에서 직업별 승률 44~58%가 되게 다듬은 값
  //  (라운드 시작 때 고유 자원이 가득 찬 상태 기준)
  classDmg: { sword: 1.61, fist: 0.225, archer: 1.62, rogue: 1.74, mage: 3.65, priest: 0.6, smith: 0.42 },
  classHp: { sword: 1.0, fist: 1.0, archer: 1.0, rogue: 1.0, mage: 1.0, priest: 1.0, smith: 1.0 },
  classHeal: { sword: 1.0, fist: 1.0, archer: 1.0, rogue: 1.0, mage: 1.0, priest: 0.25, smith: 1.0 }, // 직업별 치유 보정 (성직자가 자힐로 끝없이 버티지 않게)
  // 순위
  startRating: 1000,
  queueSpread: 120,        // 처음엔 ±120 안에서 찾고, 1초마다 15씩 넓힘
  queueSpreadPerSec: 15,
};

export const PVP_CLASSES = ["sword", "fist", "archer", "rogue", "mage", "priest", "smith"];
export const canPvp = (cls) => PVP_CLASSES.includes(cls);

// 스탯 프리셋: 직업마다 [주력, 보조, 보조2, 치명] 순서의 4개 스탯 중 방어 스탯을 골라 비율로 나눔
const DEF_KEY = { sword: "vit2", fist: "tough", archer: "vit3", rogue: "surv", mage: "spi2", priest: "vit2", smith: "dura" };
export const PVP_PRESETS = {
  atk: { name: "공격형", desc: "주력 스탯·치명 위주" },
  bal: { name: "균형형", desc: "주력·생존을 고르게" },
  def: { name: "생존형", desc: "체력·방어 위주" },
};
export function presetStats(cls, preset = "bal") {
  const keys = CLASS_INFO[cls]?.stats ?? [];
  if (keys.length < 4) return {};
  const [main] = keys, crit = keys.includes("crit") ? "crit" : keys[3];
  const def = DEF_KEY[cls] ?? keys[1];
  const other = keys.find((k) => k !== main && k !== crit && k !== def) ?? keys[2];
  const W = preset === "atk" ? { [main]: 0.55, [crit]: 0.3, [def]: 0.15 }
    : preset === "def" ? { [def]: 0.5, [main]: 0.35, [crit]: 0.15 }
      : { [main]: 0.45, [def]: 0.3, [crit]: 0.15, [other]: 0.1 };
  const out = {};
  let left = PVP.points;
  for (const [k, w] of Object.entries(W)) { const n = Math.min(PVP.statMax, Math.floor(PVP.points * w)); out[k] = (out[k] ?? 0) + n; left -= n; }
  // 남은 점수는 상한에 안 걸린 스탯부터 채움
  for (const k of [main, def, crit, other]) { if (left <= 0) break; const room = PVP.statMax - (out[k] ?? 0); const n = Math.min(room, left); if (n > 0) { out[k] = (out[k] ?? 0) + n; left -= n; } }
  return out;
}
/** 직접 배분한 PvP 스탯 검사 → 올바르면 정리된 객체, 아니면 오류 문자열 */
export function checkPvpStats(cls, stats) {
  const keys = CLASS_INFO[cls]?.stats ?? [];
  if (!stats || typeof stats !== "object") return "스탯 값이 잘못됐어요.";
  const out = {};
  let sum = 0;
  for (const [k, v] of Object.entries(stats)) {
    if (!keys.includes(k)) return "이 직업에서 쓸 수 없는 스탯이에요.";
    if (!Number.isInteger(v) || v < 0 || v > PVP.statMax) return `한 스탯에는 0~${PVP.statMax}점까지 넣을 수 있어요.`;
    if (v) out[k] = v;
    sum += v;
  }
  if (sum > PVP.points) return `스탯 합계는 ${PVP.points}점을 넘을 수 없어요.`;
  return out;
}

/** 순위 등급 */
export const PVP_TIERS = [
  { min: 1700, name: "마스터", color: "#ff5a7a" },
  { min: 1500, name: "다이아몬드", color: "#7ae0ff" },
  { min: 1300, name: "플래티넘", color: "#5af0c0" },
  { min: 1100, name: "골드", color: "#ffd35a" },
  { min: 900, name: "실버", color: "#c8d0e0" },
  { min: -Infinity, name: "브론즈", color: "#d08a50" },
];
export const pvpTier = (rating) => PVP_TIERS.find((t) => rating >= t.min);

/** 레이팅(Elo): 결과 score 1=승, 0.5=무, 0=패. 배치 10판은 변동 폭이 큼 */
export function eloDelta(my, other, score, games = 10) {
  const exp = 1 / (1 + Math.pow(10, (other - my) / 400));
  const K = games < 10 ? 40 : my >= 1600 ? 24 : 32;
  return Math.round(K * (score - exp));
}

export function newPvpRecord() {
  return { rating: PVP.startRating, best: PVP.startRating, w: 0, l: 0, d: 0, streak: 0, games: 0, preset: "bal", stats: null, skills: null };
}

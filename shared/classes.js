// 직업·능력치·성장 단계 데이터 (기획서 1장·4장 기준)

// 능력치 정의: 1포인트당 효과. 효과 키는 shared/stats.js 에서 계산
export const STATS = {
  str:   { name: "힘", desc: "근접·물리 피해 증가", fx: { phys: 0.010 } },
  agi:   { name: "민첩", desc: "물리 피해·공격 속도 증가", fx: { phys: 0.006, aspd: 0.0025 } },
  vit:   { name: "체력", desc: "최대 HP·방어 증가", fx: { hp: 14, def: 0.4 } },
  int:   { name: "지능", desc: "주문 피해·최대 MP 증가", fx: { mag: 0.010, mp: 4 } },
  spi:   { name: "정신", desc: "MP 회복·상태이상 저항", fx: { mpRegen: 0.015, res: 0.004, mp: 2 } },
  crit:  { name: "치명", desc: "치명타 확률 +0.25%p (상한 50%)", fx: { crit: 0.0025 } },
  // 직업 전용
  str2:  { name: "근력", desc: "근접 물리 피해·위협 증가", fx: { phys: 0.011, threat: 0.004 } },
  vit2:  { name: "활력", desc: "최대 HP·방어 증가", fx: { hp: 16, def: 0.5 } },
  swm:   { name: "검술 숙련", desc: "연계 효율(내력 수급)·공격 속도 증가", fx: { aspd: 0.003, kiGain: 0.008 } },
  tough: { name: "강인", desc: "최대 HP·방어 크게 증가", fx: { hp: 18, def: 0.6 } },
  grit:  { name: "투지", desc: "반격 피해·위협 유지 증가", fx: { counter: 0.012, threat: 0.01 } },
  agi2:  { name: "민첩", desc: "물리 피해·공격 속도 증가", fx: { phys: 0.010, aspd: 0.0025 } },
  prec:  { name: "정밀", desc: "표식 대상 약점 피해·물리 피해 증가", fx: { weak: 0.010, phys: 0.003 } },
  vit3:  { name: "체력", desc: "최대 HP·방어 증가", fx: { hp: 14, def: 0.4 } },
  agi3:  { name: "민첩", desc: "이동·공격 속도, 물리 피해 증가", fx: { phys: 0.008, aspd: 0.002, move: 0.001 } },
  vital: { name: "급소", desc: "표식 대상·측후방 추가 피해", fx: { vital: 0.012 } },
  surv:  { name: "생존력", desc: "최대 HP·회피 증가", fx: { hp: 11, evade: 0.0015 } },
  int2:  { name: "지능", desc: "주문 피해·최대 MP 증가", fx: { mag: 0.011, mp: 4 } },
  focus: { name: "집중", desc: "시전 속도·시전 안정 증가", fx: { cast: 0.004, steady: 0.006 } },
  spi2:  { name: "정신", desc: "MP 회복·상태이상 저항", fx: { mpRegen: 0.018, res: 0.004, mp: 3 } },
  faith: { name: "신앙", desc: "치유량·신성 피해 증가", fx: { heal: 0.012, mag: 0.007 } },
  dura:  { name: "내구", desc: "최대 HP·방어 크게 증가", fx: { hp: 18, def: 0.7 } },
  eng:   { name: "공학", desc: "장치 내구·보호 효과 증가", fx: { device: 0.02, shield: 0.01 } },
};

// 성장 단계 (기획서 그대로, 상·중·하는 각 1단계)
const tiers3 = (names) => names.flatMap((n) => [`${n}(하)`, `${n}(중)`, `${n}(상)`]);

export const CLASS_INFO = {
  adventurer: {
    name: "모험가", role: "기본", position: "전직 전 기본 상태",
    desc: "던전에 첫발을 내딛은 모험가. 10층 전직소에서 직업을 고를 수 있다.",
    stats: ["str", "agi", "vit", "int", "spi", "crit"],
    hpMul: 1.0, defMul: 1.0, mpBase: 60, dmgType: "phys", resource: null,
    ranks: ["모험가"],
    look: { armor: ["#d9c7a5", "#b09a72", "#857152", "#5c4d39"], core: ["#6b5a48", "#4c3f33", "#33291f"], mark: "#e0b04a", weapon: "sword", head: "band", headColor: "#a33b2e" },
  },
  sword: {
    name: "검사", role: "근접 딜러", position: "체력이 비교적 높은 근접 딜러",
    desc: "자세 전환과 내력 관리, 반격과 검술 연계. 탱커보다 생존력이 높은 공격수.",
    stats: ["str2", "vit2", "swm", "crit"],
    hpMul: 1.24, defMul: 1.1, mpBase: 40, dmgType: "phys", resource: "ki",
    ranks: tiers3(["소드 러너", "소드 유저", "소드 익스퍼트", "소드마스터"]),
    look: { armor: ["#e8edf6", "#a9b6cc", "#6f7f9c", "#47536b"], core: ["#2f5ea8", "#22447a", "#152b4f"], mark: "#5aa9ff", weapon: "sword", head: null },
  },
  fist: {
    name: "권투사", role: "탱커", position: "반격·위협 탱커",
    desc: "반격·방어·위협 관리로 적을 붙잡고, 콤보와 상태이상 연계로 꾸준히 공격.",
    stats: ["str2", "tough", "grit", "crit"],
    hpMul: 1.4, defMul: 1.35, mpBase: 40, dmgType: "phys", resource: "ki",
    ranks: [...tiers3(["입문 권투사", "정식 권투사"]), "권사", "권성", "권왕"],
    look: { armor: ["#f2c79b", "#d49a6a", "#a8704a", "#6e452c"], core: ["#b8322a", "#86221c", "#561410"], mark: "#ffcc40", weapon: null, head: "band", headColor: "#e33b2e" },
  },
  archer: {
    name: "궁수", role: "원거리 딜러", position: "원거리 딜러",
    desc: "활 연사, 약점 저격, 속박. 거리 유지와 지속 화력.",
    stats: ["agi2", "prec", "vit3", "crit"],
    hpMul: 0.96, defMul: 0.9, mpBase: 90, dmgType: "phys", resource: null,
    ranks: tiers3(["아처 러너", "아처 유저", "아처 익스퍼트", "아처 마스터"]),
    look: { armor: ["#c3d98a", "#93ad5c", "#667d3c", "#435427"], core: ["#7a5a32", "#5a4024", "#3a2814"], mark: "#e8f080", weapon: "bow", head: "hood", headColor: "#4f6b2c" },
  },
  rogue: {
    name: "도적", role: "근접 딜러", position: "저체력·고기동 딜러",
    desc: "회피·돌진·측후방 기습으로 공격을 피하고 짧은 창에 폭딜.",
    stats: ["agi3", "vital", "surv", "crit"],
    hpMul: 0.88, defMul: 0.85, mpBase: 60, dmgType: "phys", resource: "gap",
    ranks: [...tiers3(["로그", "어쌔신", "팬텀"]), "섀도우 로드"],
    look: { armor: ["#8a8fa8", "#62667e", "#45485c", "#2c2e3c"], core: ["#3a2a4a", "#2a1e36", "#1a1224"], mark: "#c040ff", weapon: "dagger", head: "hood", headColor: "#2a2438" },
  },
  mage: {
    name: "마법사", role: "원거리 딜러", position: "시전형 원소 마법 딜러",
    desc: "원소 마법과 광역 피해. 강력한 대신 위치·마나·시전 시간을 관리.",
    stats: ["int2", "focus", "spi2", "crit"],
    hpMul: 1.03, defMul: 0.9, mpBase: 140, dmgType: "mag", resource: null,
    ranks: ["1서클", "2서클", "3서클", "4서클", "5서클", "6서클", "7서클", "8서클", "9서클"],
    look: { armor: ["#9db4ff", "#6f86e0", "#4a5cb0", "#2e3a78"], core: ["#3b2a78", "#2a1d58", "#1a1238"], mark: "#7ff0ff", weapon: "staff", head: "hat", headColor: "#3b2a78" },
  },
  priest: {
    name: "성직자", role: "지원가·힐러", position: "지원가·힐러",
    desc: "직접 회복, 보호, 정화, 파티 버프. 피해 기여보다 파티 생존과 강화에 집중.",
    stats: ["faith", "spi2", "vit2", "crit"],
    hpMul: 1.05, defMul: 1.0, mpBase: 120, dmgType: "mag", resource: "holy",
    ranks: ["부제", "보좌신부", "주임신부", "몬시뇰", "보좌주교", "부교구장 주교", "교구장 주교", "대주교", "추기경", "교황"],
    look: { armor: ["#fffbe8", "#e8dfc0", "#c2b48a", "#8c7f58"], core: ["#d4a82a", "#a07a18", "#6a500c"], mark: "#fff080", weapon: "mace", head: "mitre", headColor: "#f4ecd0" },
  },
  smith: {
    name: "대장장이", role: "탱커", position: "방벽·장치 탱커",
    desc: "높은 방어력, 도발, 방벽과 장치로 전열을 만들고 파티를 보호.",
    stats: ["str2", "dura", "eng", "crit"],
    hpMul: 1.5, defMul: 1.6, mpBase: 50, dmgType: "phys", resource: "parts",
    ranks: ["1성", "2성", "3성", "4성", "5성", "6성", "7성", "8성", "9성"],
    look: { armor: ["#c8a27a", "#9c7652", "#6e5236", "#463220"], core: ["#5c5f6a", "#40424c", "#2a2b33"], mark: "#ff8a30", weapon: "hammer", head: "helm", headColor: "#7a7f8c" },
  },
};

export const CLASS_CHANGE_LEVEL = 10;   // 전직 직후 단계 1 시작 레벨 기준
export const STAGE_SPAN = 100;          // 단계가 퍼져 있는 레벨 구간 (10 → 110)
export const STAGE_TOTAL_BONUS = 0.4;   // 마지막 단계까지의 총 전투력 보너스 (직업 간 동일)

/** 직업과 레벨로 현재 성장 단계(0부터) — 단계 수가 다른 직업도 같은 레벨 구간에 비례 배치 */
export function stageOf(cls, level) {
  const info = CLASS_INFO[cls];
  if (!info || cls === "adventurer") return 0;
  const n = info.ranks.length;
  const step = STAGE_SPAN / n;
  return Math.max(0, Math.min(n - 1, Math.floor((level - CLASS_CHANGE_LEVEL) / step)));
}
/** 단계 i에 도달하는 레벨 */
export function stageLevel(cls, i) {
  const n = CLASS_INFO[cls].ranks.length;
  return Math.ceil(CLASS_CHANGE_LEVEL + i * (STAGE_SPAN / n));
}
/** 단계 보너스 배율: 단계 수가 많으면 단계당 상승 폭이 작다 */
export function stageBonus(cls, stage) {
  const n = CLASS_INFO[cls]?.ranks.length ?? 1;
  if (n <= 1) return 1;
  return 1 + (STAGE_TOTAL_BONUS * stage) / (n - 1);
}

/** 레벨업에 필요한 경험치 */
export function xpToNext(level) {
  // 레벨 ≈ 층 × 0.8 정도로 따라가도록 (층당 경험치 곡선에 맞춤)
  return Math.round((130 + 12 * level) * Math.pow(1.045, level - 1));
}

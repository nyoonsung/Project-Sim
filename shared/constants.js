// 서버와 클라이언트가 함께 쓰는 상수. (브라우저에서는 /shared/constants.js 로 불러옴)

export const TILE = 32;               // 타일 한 칸 = 32px (캐릭터 24x38 리그와 비율을 맞춤)
export const TICK_RATE = 20;          // 서버 시뮬레이션 초당 횟수
export const TICK_DT = 1 / TICK_RATE;
export const VIEW_W = 640;            // 내부 렌더 해상도
export const VIEW_H = 360;

export const MAX_LEVEL = 250; // 2차 업데이트: 150 → 250
export const MAX_FLOOR = 100;
export const MAX_PARTY = 4;
export const SKILL_SLOTS = 12;        // 전체 장착 칸 (패시브 제외, 종류 구분 없음)
export const INVENTORY_SLOTS = 100;   // 가방 보관 칸
export const STAT_POINTS_PER_LEVEL = 3;

// 타일 종류
export const T = {
  VOID: 0,      // 바깥(검은 공간)
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,      // 보스방 입구 등 (열리면 FLOOR처럼 통과)
  WATER: 4,     // 통과 불가, 투사체는 통과
  PIT: 5,       // 통과 불가, 투사체는 통과
  DECO: 6,      // 바닥 장식(통과 가능)
  GRASS: 7,     // 마을 잔디
  PATH: 8,      // 마을 길
  PLAZA: 9,     // 마을 광장 돌바닥
};
export const SOLID = new Set([T.VOID, T.WALL, T.WATER, T.PIT]);
export const BLOCKS_SHOT = new Set([T.VOID, T.WALL]);

// 플레이어 몸 판정 반지름(px)
export const PLAYER_RADIUS = 9;
export const BASE_MOVE_SPEED = 120;   // px/s

// 치명타 규칙 (기획서 4장 표 그대로)
export const CRIT = {
  BASE_CHANCE: 0.05,
  PER_POINT: 0.0025,
  CHANCE_CAP: 0.5,
  BASE_DAMAGE: 1.5,
  DAMAGE_CAP: 2.0,
};

// 스킬 등급 (약한 것 → 강한 것)
export const GRADES = ["일반", "희귀", "영웅", "전설"];
export const GRADE_COLOR = { 일반: "#c9d1d9", 희귀: "#58a6ff", 영웅: "#d2a8ff", 전설: "#ffb347", 신화: "#ff5a6e", "2차": "#5af0d0" };

// 키 배치: 장착 칸 1~12 (9~12번은 숫자 4~7 기본 배정)
export const SLOT_KEYS = ["LMB", "RMB", "Q", "E", "R", "F", "SHIFT", "V", "4", "5", "6", "7"];

// 소모품
export const ITEMS = {
  hp_potion: { name: "체력 물약", desc: "최대 체력의 35%를 즉시 회복한다.", price: 30, cd: 15, max: 20 },
  antidote: { name: "해독제", desc: "중독·화상·출혈을 해제한다.", price: 20, cd: 10, max: 10 },
  mp_potion: { name: "마나 물약", desc: "최대 MP의 40%를 즉시 회복한다.", price: 25, cd: 15, max: 20 },
};

// 직업 id
export const CLASSES = ["adventurer", "sword", "fist", "archer", "rogue", "mage", "priest", "smith"];

// 칭호: 관리자만 줄 수 있음. 글자 1~16자, 색은 이 목록 중 하나
export const TITLE_COLORS = ["#ffd35a", "#ff5a6e", "#c8a0ff", "#7af0a0", "#7ad0ff", "#ffffff", "#ff9a30", "#ff8ad8"];
export const TITLE_MAX = 16;

// 기본 공격 간격 배율 (스킬 데이터의 aspd × 이 값). 0.75 = 25% 빠르게
export const BASIC_SPEED = 0.75;

// ── 판정 보정: 플레이어 공격은 넉넉하게, 보스 공격은 빡빡하게
export const PLAYER_HIT = { melee: 1.3, meleeReach: 16, meleeArc: 20, proj: 4, area: 1.15 }; // 근접 사거리 ×1.3 +16px, 각도 +20°, 투사체 판정 +4px, 범위 ×1.15
export const BOSS_HIT = { shrink: 8, proj: 4 }; // 보스 장판은 예고보다 8px 안쪽, 보스 탄 판정 반지름 4

// 직업별 기본 공격 속도 배율 (궁수 1.5배 빠름)
export const CLASS_ASPD = { archer: 1.5 };

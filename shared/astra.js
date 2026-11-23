// 3차 대형 업데이트: 세 번째 섬 「아스트라엘」 — 별이 떨어진 섬, 성좌의 시련
//  · 베르단 섬 뱃사공(또는 에르덴 뱃사공)에게서 건너감: Lv.200 + 베르단 제1 던전 50층 돌파
//  · 별자리 관측소에서 13성좌 중 하나를 골라 5층짜리 시련(4개 층 + 성좌의 수호성)을 치름. 성좌마다 규칙이 다름
//  · 처음 밝힌 별 → 그 성좌의 축복(장착 3칸, 별가루로 1~5단계 강화) + 「성좌의 서」 이야기 한 장
//  · 열두 별을 모두 밝히면 열세 번째 「뱀주인자리」(별을 삼킨 자)가 열림 → 클리어 시 축복 칸 +1, 칭호
//  · 성좌들은 싸움에 끼어들지 않는다. 이야기와 속삭임으로만 말을 건다.
import { VERDAN_ZONES, VERDAN_BOSSES } from "./verdan.js";

export const ASTRA = {
  island: "astra", name: "아스트라엘", town: "아스트라엘 · 별무덤 마을",
  needLevel: 200, needBest3: 50, stages: 5, count: 13,
  blessSlots: 3, blessSlotsMax: 4, blessMax: 5,
  title: { text: "별을 되찾은 자", color: "#c8a0ff" },
};
export const blessUpCost = (lv) => [0, 60, 120, 220, 360][lv] ?? Infinity; // lv → lv+1 별가루

// rule: 시련 규칙 (몬스터·플레이어 배율과 특수 규칙). 보스는 hp·dmg 배율만 적용
export const CONSTELLATIONS = [
  { id: 1, key: "aries", name: "양자리", sign: "♈", star: "하말", title: "돌진의 별", color: "#ff7a5a",
    rule: { name: "돌진", desc: "몬스터가 30% 빠르고 15% 아프게 때린다. 대신 내 이동 속도 +15%.", mobSpeed: 1.3, mobDmg: 1.15, move: 0.15 },
    bless: { name: "돌진의 축복", desc: "이동 속도 +2%, 주는 피해 +1% (단계당)", mods: { move: 0.02, dmg: 0.01 } },
    whisper: ["…멈추지 마라. 멈추는 순간, 별은 식는다.", "앞으로. 언제나 앞으로.", "내 뿔은 꺾였으나, 너의 발걸음은 아직 꺾이지 않았구나."] },
  { id: 2, key: "taurus", name: "황소자리", sign: "♉", star: "알데바란", title: "견고한 별", color: "#c8a060",
    rule: { name: "견고", desc: "몬스터 체력 +60%, 대신 공격력 -20%.", mobHp: 1.6, mobDmg: 0.8 },
    bless: { name: "견고의 축복", desc: "최대 체력 +3% (단계당)", mods: { hpPct: 0.03 } },
    whisper: ["무거운 것은 쉽게 쓰러지지 않는다.", "천천히, 그러나 끝까지.", "나는 이 섬의 땅이 되었다. 너는 그 위를 걷고 있지."] },
  { id: 3, key: "gemini", name: "쌍둥이자리", sign: "♊", star: "카스토르", title: "갈라지는 별", color: "#ffe07a",
    rule: { name: "분열", desc: "일반 몬스터가 쓰러지면 한 번 둘로 갈라진다(약한 분신).", split: true },
    bless: { name: "분신의 축복", desc: "공격 속도 +2% (단계당)", mods: { aspd: 0.02 } },
    whisper: ["하나는 둘이 되고, 둘은 다시 하나를 찾는다.", "동생은 하늘에, 나는 땅에. 우리는 서로를 부른다.", "갈라진 것을 미워하지 마라. 그것도 한때 하나였으니."] },
  { id: 4, key: "cancer", name: "게자리", sign: "♋", star: "아쿠벤스", title: "껍질의 별", color: "#7ad0e0",
    rule: { name: "껍질", desc: "몬스터는 체력이 절반 아래로 떨어지기 전까지 받는 피해 -40%.", shell: 0.4 },
    bless: { name: "껍질의 축복", desc: "받는 피해 -1.2% (단계당)", mods: { dr: 0.012 } },
    whisper: ["단단한 껍질 아래엔 언제나 부드러운 것이 숨는다.", "깨뜨려라. 끝까지 버티는 것이 껍질의 일이고, 깨뜨리는 것은 너의 일이다.", "나는 집을 지켰다. 지키지 못한 것은… 하늘이었다."] },
  { id: 5, key: "leo", name: "사자자리", sign: "♌", star: "레굴루스", title: "왕의 별", color: "#ffb030",
    rule: { name: "왕의 사냥", desc: "정예 몬스터가 두 배로 나온다. 정예를 쓰러뜨릴 때마다 10초간 피해 +5% (최대 10중첩).", elite: 0.25, eliteBuff: 0.05 },
    bless: { name: "위엄의 축복", desc: "주는 피해 +2.5% (단계당)", mods: { dmg: 0.025 } },
    whisper: ["왕은 강한 자를 피하지 않는다.", "포효하라. 그 소리가 별에 닿을 때까지.", "내 갈기는 불타 사라졌다. 그러나 왕의 심장은 남았다."] },
  { id: 6, key: "virgo", name: "처녀자리", sign: "♍", star: "스피카", title: "정화의 별", color: "#c8ffd0",
    rule: { name: "정화", desc: "내가 받는 치유 +50%, 대신 몬스터가 주는 피해 +20%.", heal: 1.5, mobDmg: 1.2 },
    bless: { name: "정화의 축복", desc: "치유량 +6%, 최대 체력 +1% (단계당)", mods: { heal: 0.06, hpPct: 0.01 } },
    whisper: ["상처는 부끄러운 것이 아니다. 낫지 않으려는 마음이 부끄러운 것이지.", "이삭 하나에도 별빛은 깃든다.", "나는 씨앗을 뿌렸다. 별이 떨어진 땅에도 봄은 온다."] },
  { id: 7, key: "libra", name: "천칭자리", sign: "♎", star: "주벤엘게누비", title: "균형의 별", color: "#e0e0ff",
    rule: { name: "균형", desc: "내 체력이 높을수록 주는 피해가 크고(최대 +25%), 낮을수록 받는 피해가 줄어든다(최대 -30%).", libra: true },
    bless: { name: "균형의 축복", desc: "방어력 +4%, 주는 피해 +1% (단계당)", mods: { defPct: 0.04, dmg: 0.01 } },
    whisper: ["모든 것은 기울어진다. 다시 바로 세우는 것은 너다.", "얻은 만큼 잃고, 잃은 만큼 얻는다.", "저울의 한쪽에 별을, 다른 한쪽에 너를. …아직은 별이 무겁구나."] },
  { id: 8, key: "scorpio", name: "전갈자리", sign: "♏", star: "안타레스", title: "독침의 별", color: "#ff4060",
    rule: { name: "독침", desc: "몬스터에게 맞으면 독에 걸린다. 대신 내 치명타 확률 +10%.", poison: true, crit: 0.1 },
    bless: { name: "독침의 축복", desc: "치명타 확률 +1.2% (단계당)", mods: { crit: 0.012 } },
    whisper: ["가장 작은 것이 가장 깊이 찌른다.", "붉은 심장은 식지 않는다. 독조차 따뜻하지.", "나는 사냥꾼을 쓰러뜨린 별이다. 너는 무엇을 쓰러뜨리겠느냐."] },
  { id: 9, key: "sagittarius", name: "궁수자리", sign: "♐", star: "카우스 아우스트랄리스", title: "사냥의 별", color: "#7ab0ff",
    rule: { name: "사냥", desc: "투사체·원거리 스킬 피해 +30%. 몬스터가 25% 빠르다.", ranged: 0.3, mobSpeed: 1.25 },
    bless: { name: "사냥의 축복", desc: "치명타 피해 +4% (단계당)", mods: { critDmg: 0.04 } },
    whisper: ["보이지 않는 과녁을 겨누는 자만이 별을 맞힌다.", "숨을 멈추고, 놓아라.", "내 화살은 은하를 따라 흐른다. 언젠가 너의 하늘에도 닿겠지."] },
  { id: 10, key: "capricorn", name: "염소자리", sign: "♑", star: "데네브 알게디", title: "인내의 별", color: "#a0a8c0",
    rule: { name: "인내", desc: "자연 회복이 멈춘다. 대신 적을 쓰러뜨릴 때마다 최대 체력 2% 회복.", noRegen: true, killHeal: 0.02 },
    bless: { name: "인내의 축복", desc: "최대 체력 +2%, 받는 피해 -0.6% (단계당)", mods: { hpPct: 0.02, dr: 0.006 } },
    whisper: ["험한 길은 오르는 자의 것이다.", "쉬지 않고 오른 산꼭대기에서만 별이 가깝다.", "나는 바다와 산 사이에 있었다. 너는 어디쯤에 서 있느냐."] },
  { id: 11, key: "aquarius", name: "물병자리", sign: "♒", star: "사달멜리크", title: "흐르는 별", color: "#5ae0ff",
    rule: { name: "별비", desc: "10초마다 근처에 별비가 내려 그 안에 서 있으면 회복된다. 몬스터 체력 +25%.", starfall: true, mobHp: 1.25 },
    bless: { name: "흐름의 축복", desc: "치유량 +4%, 공격 속도 +1% (단계당)", mods: { heal: 0.04, aspd: 0.01 } },
    whisper: ["흐르는 것은 막을 수 없다. 함께 흐를 뿐.", "목마른 자에게 별을 붓는다.", "물병은 비었다. 그러나 비어 있기에 다시 채울 수 있다."] },
  { id: 12, key: "pisces", name: "물고기자리", sign: "♓", star: "알리샤", title: "꿈의 별", color: "#b890ff",
    rule: { name: "꿈결", desc: "주기적으로 어둠이 내려 시야가 좁아진다. 몬스터 공격력 +10%.", darkness: true, mobDmg: 1.1 },
    bless: { name: "꿈의 축복", desc: "치명타 +0.6%, 치명타 피해 +2.5%, 이동 속도 +1% (단계당)", mods: { crit: 0.006, critDmg: 0.025, move: 0.01 } },
    whisper: ["눈을 감아도 별은 보인다.", "꿈과 바다는 같은 색이다.", "두 물고기는 끈으로 묶여 있다. 놓치지 않으려고. …너도 무언가를 놓치지 않으려 여기 왔겠지."] },
  { id: 13, key: "ophiuchus", name: "뱀주인자리", sign: "⛎", star: "라스알하게", title: "별을 삼킨 자", color: "#ff5ad0", hidden: true,
    rule: { name: "삼켜진 하늘", desc: "열두 별의 힘이 뒤섞인다: 몬스터 체력 +30%·공격력 +15%, 맞으면 독, 주기적인 어둠.", mobHp: 1.3, mobDmg: 1.15, poison: true, darkness: true },
    bless: null,
    whisper: ["…열셋. 기록되지 않은 열세 번째.", "너도 별을 원하는가. 나처럼.", "삼킨 별들이 울고 있다. 시끄럽군."] },
];
export const CONST_BY_KEY = Object.fromEntries(CONSTELLATIONS.map((c) => [c.key, c]));
/** 층 → 성좌 번호(1~13)·단계(1~5) */
export const astraOf = (floor) => ({ c: Math.min(13, Math.max(1, Math.ceil(floor / 5))), stage: ((Math.max(1, floor) - 1) % 5) + 1 });
export const trialFloor = (c, stage = 1) => (c - 1) * 5 + stage;
/** 오늘의 성좌: 날짜(한국 시간)마다 하나 — 별가루 2배 */
export const todayConstellation = (ms = Date.now()) => (Math.floor((ms + 9 * 3600_000) / 86400_000) % 12) + 1;

// 시련 지역: 베르단 섬 후반 지역의 몬스터 구성을 빌려 쓰고(난이도: 베르단 45층 → 100층 상당), 이름·색은 성좌
export const astraVerdanZone = (c) => Math.min(9, 4 + Math.floor(c / 2)); // 0-기반 베르단 지역 번호
export const ASTRA_BOSSES = {};
export const ASTRA_ZONES = CONSTELLATIONS.map((k) => {
  const base = VERDAN_ZONES[astraVerdanZone(k.id)];
  const srcId = k.id === 13 ? VERDAN_ZONES[9].boss : base.boss;
  const src = VERDAN_BOSSES[srcId];
  const id = "ab_" + k.key;
  ASTRA_BOSSES[id] = { ...src, name: k.id === 13 ? "별을 삼킨 자 · 오피우코스" : `${k.name}의 수호성 · ${k.star}`, mid: false, astraSrc: srcId, astra: k.key, hp: (src.hp ?? 120000) * (k.id === 13 ? 1.3 : 1) };
  return { ...base, name: `${k.name} 시련 — ${k.title}`, accent: k.color, monsters: base.monsters, mid: id, boss: id, astra: k.key };
});

export const STORY = {
  prologue: {
    title: "서장 — 별이 떨어진 밤",
    text: [
      "에르덴의 노인들은 말한다. 아주 오래전, 하늘의 별이 한꺼번에 떨어진 밤이 있었다고.",
      "그 별들이 떨어진 곳이 바로 이 섬, 아스트라엘이다. 밤마다 땅이 은빛으로 숨을 쉬고, 바람에서 쇠와 꽃 냄새가 난다.",
      "별자리 관측소의 기록관 엘시는 당신을 보자마자 오래된 성도(星圖)를 펼쳤다. 열두 개의 빈 자리. 그리고 지워진 듯한 열세 번째 자리.",
      "\"성좌들은 하늘을 지키던 존재들이에요. 직접 칼을 들지는 않아요. 다만 이야기할 뿐이죠. 그 이야기를 끝까지 들어 줄 사람이 필요했어요.\"",
    ],
  },
  chapters: {
    aries: { title: "제1장 — 꺾인 뿔", text: ["양자리는 가장 먼저 떨어진 별이었다. 하늘에서 가장 빨랐기에, 가장 먼저 사냥당했다.", "\"나를 삼킨 것은 그림자였다. 뱀처럼 긴, 별빛을 먹는 그림자.\"", "첫 번째 별이 다시 켜지자 성도의 한쪽 끝이 붉게 물들었다."] },
    taurus: { title: "제2장 — 땅이 된 별", text: ["황소자리는 떨어진 뒤 움직이지 않았다. 섬의 언덕 하나가 그대로 그의 등이었다.", "\"하늘로 돌아가고 싶지 않았다. 여기서 누군가 걸어 주길 기다렸지.\"", "기록관은 언덕 위에 작은 돌을 하나 얹었다. 감사의 표시라고 했다."] },
    gemini: { title: "제3장 — 두 개의 이름", text: ["쌍둥이 중 하나는 땅으로, 하나는 아직 하늘에 남았다.", "\"폴룩스가 나를 부른다. 매일 밤, 같은 시각에.\"", "당신은 처음으로 밤하늘에서 희미하게 깜빡이는 대답을 보았다."] },
    cancer: { title: "제4장 — 집을 지킨 자", text: ["게자리는 떨어지는 순간까지 무언가를 껍질 안에 품고 있었다.", "그것은 작은 은빛 알, 다음 세대의 별이었다.", "\"지키지 못한 하늘 대신, 이것만은 지켰다.\" 기록관은 그 알을 관측소 등불 옆에 두었다."] },
    leo: { title: "제5장 — 왕의 심장", text: ["사자자리는 그림자와 정면으로 싸운 유일한 별이었다.", "\"이기지 못했다. 그러나 물어뜯었다. 그 녀석의 몸에 내 이빨 자국이 남아 있을 것이다.\"", "그 말은, 그림자가 아직 어딘가에 살아 있다는 뜻이기도 했다."] },
    virgo: { title: "제6장 — 별이 떨어진 땅의 봄", text: ["처녀자리가 떨어진 자리에는 은빛 보리가 자란다.", "섬 사람들은 그 보리로 빵을 구워 여행자에게 나눠 준다.", "\"상처 위에도 무언가는 자란다. 그걸 보여 주고 싶었다.\""] },
    libra: { title: "제7장 — 기울어진 저울", text: ["천칭자리는 성좌들 사이의 다툼을 재던 별이었다.", "\"그림자가 처음 나타났을 때, 우리는 서로를 의심했다. 저울은 그날 처음 부러졌다.\"", "열두 별이 흩어진 진짜 이유는, 그림자보다 그 의심이었는지도 모른다."] },
    scorpio: { title: "제8장 — 붉은 심장", text: ["전갈자리의 심장 안타레스는 떨어진 뒤에도 붉게 뛰었다.", "\"독은 미움이 아니다. 지키려는 것의 다른 이름이지.\"", "그는 그림자의 이름을 처음으로 입에 올렸다. 오피우코스. 기록되지 않은 열세 번째 성좌."] },
    sagittarius: { title: "제9장 — 은하를 겨누는 화살", text: ["궁수자리는 마지막 화살을 하늘에 남겨 두었다.", "\"언젠가 누군가 이 섬의 별을 모두 밝히면, 그 화살이 길을 비출 것이다.\"", "관측소 꼭대기의 망원경이, 아무도 손대지 않았는데 스스로 방향을 바꿨다."] },
    capricorn: { title: "제10장 — 바다와 산 사이", text: ["염소자리는 반은 산양, 반은 물고기였다. 어디에도 완전히 속하지 못했다.", "\"그래서 끝까지 오를 수 있었다. 돌아갈 곳이 없었으니까.\"", "에르덴에서, 베르단에서, 그리고 여기까지 온 당신의 길도 그랬다."] },
    aquarius: { title: "제11장 — 빈 물병", text: ["물병자리는 별빛을 담아 섬 전체에 부었다. 그래서 이 섬의 밤은 은빛이다.", "\"물병은 비었다. 이제 남은 것은 너희가 채울 몫이다.\"", "기록관은 처음으로 웃었다. \"이제 하나 남았네요. 아니, 둘인가요.\""] },
    pisces: { title: "제12장 — 묶인 두 물고기", text: ["물고기자리는 끈으로 서로를 묶은 두 별이었다. 그림자가 하나를 삼키려 하자 다른 하나가 끈을 놓지 않았다.", "\"그래서 둘 다 떨어졌다. 후회하지 않는다.\"", "열두 번째 별이 켜지자, 성도의 지워진 자리가 검게 번들거리며 깨어났다."] },
    ophiuchus: { title: "종장 — 별을 삼킨 자", text: ["오피우코스는 원래 별들을 치료하던 성좌였다. 아픈 별을 삼켜 고쳐서 돌려보내는.", "어느 날 그는 돌려보내지 않았다. 너무 많은 별이 아팠고, 그는 혼자였다.", "\"…삼킨 별들이 이제야 조용하군.\" 쓰러진 그의 몸에서 열두 줄기 빛이 하늘로 돌아갔다.", "성좌들은 끝까지 칼을 들지 않았다. 다만 당신에게 이야기를 건넸고, 당신은 끝까지 들었다.", "그날 밤, 에르덴과 베르단에서도 하늘이 조금 더 밝아졌다고 한다."] },
  },
};

/** 장착한 축복의 능력치 합 */
export function blessingMods(ch) {
  const a = ch?.astra;
  if (!a?.equip) return {};
  const m = {};
  for (const key of a.equip) {
    const k = CONST_BY_KEY[key];
    const lv = a.bless?.[key] ?? 0;
    if (!k?.bless || lv <= 0) continue;
    for (const [s, v] of Object.entries(k.bless.mods)) m[s] = (m[s] ?? 0) + v * lv;
  }
  return m;
}
export const blessSlots = (ch) => (ch?.astra?.stars?.ophiuchus ? ASTRA.blessSlotsMax : ASTRA.blessSlots);
export function newAstraRecord() {
  return { pass: false, stars: {}, bless: {}, equip: [], dust: 0, clears: {}, seen: [] };
}

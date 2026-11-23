// 2차 전직 (2차 업데이트 기획서 5·6장): 베르단 섬 2차 전직소, 레벨 170부터.
// 1차 직업(cls)은 그대로 두고 2차 전직 경로(cls2)를 더한다 → 기존 직업 자원·스킬·장비 규칙은 그대로 쓰고,
// 2차 전직 스킬 9개(9등급 → 1등급)가 레벨 170·176·…·218에 하나씩 열린다.

export const CLASS2_LEVEL = 170;
/** 성장 등급 해금표: 9등급 170 → 1등급 218 (6레벨 간격) */
export const TIER_LEVEL = { 9: 170, 8: 176, 7: 182, 6: 188, 5: 194, 4: 200, 3: 206, 2: 212, 1: 218 };
/** 2차 전직 기본 배율: 1차 전직 때보다 2배 강하게 (공격력·최대 HP 2배, 방어력 1.5배 — 방어는 감소율 곡선 때문에 1.5배로도 체감 2배 가까이) */
export const CLASS2_MUL = { atk: 2, hp: 2, def: 1.5 };

// 경로별 2차 전직 스킬 피해 배율: 시뮬레이션(같은 레벨·장비, 단일·5마리)으로 1차 전직 대비 약 2.2배가 되도록 맞춘 값.
//  2차 전직 스킬·소환수·설치물·2차 패시브 추가타에만 적용 (1차 직업 스킬은 영향 없음)
export const PATH_DMG = {
  darkknight: 0.97, swordmaster: 0.81, vajra: 0.184, striker: 0.351, archmage: 0.874, warlock: 0.843,
  arcanearcher: 0.74, windwalker: 0.873, sentinel: 1.25, nightblade: 1.05, assassin: 1.44, trickster: 1.05,
  inquisitor: 1.0, heretic: 0.775, volcano: 0.264, mechanic: 0.595, king: 1.25,
};
// res2: 2차 전직 고유 자원 (없으면 null). 이름·최대치
export const PATHS = {
  darkknight: { base: "sword", name: "다크나이트", sub: "암흑기사", role: "흡혈 브루저", res2: null, color: "#c0304a",
    desc: "생명력을 태워 어둠의 검기를 날리고 적중 피해를 흡혈하는 고위험 브루저. 생명력이 낮을수록 강해진다." },
  swordmaster: { base: "sword", name: "소드마스터", sub: "검성", role: "검식 연계 딜러", res2: null, color: "#7ab8ff",
    desc: "일섬 → 회전연참 → 쇄도검의 세 검식을 완성해 방어 관통 발도와 검기 파동을 터뜨리는 정통 검객." },
  vajra: { base: "fist", name: "가디언 몽크", sub: "금강무사", role: "방어형 딜탱", res2: { name: "호흡", max: 100 }, color: "#e8c060",
    desc: "방어력을 주먹 공격력으로 바꾸고 아군 피해를 대신 짊어지는 금강불괴의 육탄 탱커. 기세는 내력으로 쌓는다." },
  striker: { base: "fist", name: "스트라이커", sub: "섬광권사", role: "돌격 격투가", res2: null, color: "#ffe070",
    desc: "초고속 러시와 공중 연계, 방어 관통 정권으로 보스의 그로기를 깎는 돌격형 격투가." },
  archmage: { base: "mage", name: "아크메이지", sub: "대마법사", role: "원소 마법사", res2: null, color: "#7fd8ff",
    desc: "화염·빙결·번개를 번갈아 엮어 마나와 보호막을 얻고, 긴 영창의 광역 폭발로 전장을 정리한다." },
  warlock: { base: "mage", name: "워록", sub: "흑마법사", role: "저주·소환", res2: null, color: "#a060e0",
    desc: "저주와 역병을 퍼뜨리고 지옥사냥개·악마 군주를 부르며 생명력을 흡수하는 솔로형 흑마법사." },
  arcanearcher: { base: "archer", name: "아케인 아처", sub: "마궁수", role: "마법 궁수", res2: null, color: "#b090ff",
    desc: "마력 화살로 관통·폭발시키고 사냥 표식으로 마나를 순환하며 화살비로 무리를 제압한다." },
  windwalker: { base: "archer", name: "윈드워커", sub: "질풍사수", role: "초고속 연사", res2: { name: "바람의 박자", max: 100 }, color: "#60e0c0",
    desc: "연사로 바람의 박자를 쌓아 바람 칼날을 부르고, 깃바람 도약으로 공격을 피하는 질풍의 궁수." },
  sentinel: { base: "archer", name: "센티넬 아처", sub: "저격수", role: "저격", res2: { name: "조준 에너지", max: 100 }, color: "#e0d080",
    desc: "제자리 조준으로 에너지를 모아 방어를 관통하고, 차징 사격과 종결탄으로 보스를 저격한다." },
  nightblade: { base: "rogue", name: "나이트블레이드", sub: "그림자 칼날", role: "표식 암살", res2: null, color: "#8060c0",
    desc: "표창으로 그림자 표식을 새기고 어둠 속 순간이동으로 표식을 터뜨리는 고위험 암살자." },
  assassin: { base: "rogue", name: "어쌔신", sub: "암살자", role: "은신 기습", res2: null, color: "#c04060",
    desc: "은신과 배후 첫 타격, 맹독으로 단일 대상을 무너뜨리는 정통 암살자." },
  trickster: { base: "rogue", name: "트릭스터", sub: "독무사", role: "지속 피해", res2: null, color: "#70c050",
    desc: "맹독과 출혈을 겹치고 연막과 분신으로 표적을 흔들며 지속 피해를 터뜨리는 도적." },
  inquisitor: { base: "priest", name: "인퀴지터", sub: "심판관", role: "전투 성직자", res2: null, color: "#ffe8a0",
    desc: "메이스와 성서로 전선에서 싸우며 적중을 회복으로 바꾸고 신성 기절로 교전을 끊는 전투 성직자." },
  heretic: { base: "priest", name: "이단사제", sub: "예언자", role: "변칙 술사", res2: { name: "예언의 잔향", max: 100 }, color: "#d060a0",
    desc: "피해를 늦추는 예언, 타락한 성화, 공격을 흡혈로 바꾸는 심판의 낙인을 다루는 변칙 술사." },
  volcano: { base: "smith", name: "볼케이노", sub: "용광로 파괴자", role: "공성 탱커", res2: null, color: "#ff7030",
    desc: "양손 워해머로 용암 지대를 만들고 적을 끌어모아 방어력·공격력을 영구 파쇄하는 화염 공성 탱커." },
  mechanic: { base: "smith", name: "메카닉", sub: "공성공학자", role: "설치형 탱커", res2: { name: "증기 압력", max: 100 }, color: "#60c8ff",
    desc: "자동 포탑·강철 골렘·바리케이드로 전장을 설계하고 증기 압력을 과부하로 터뜨리는 전술 탱커." },
  king: { base: "adventurer", name: "모험가의 왕", sub: "개척자", role: "균형형 솔로", res2: { name: "개척의 기세", max: 100 }, color: "#ffd35a",
    desc: "에르덴 섬을 모험가로 돌파한 자만이 오르는 길. 공용 기본기를 숙련해 개척의 기세를 쌓고 터뜨린다." },
};

/** 1차 직업 → 고를 수 있는 2차 전직 */
export function pathsFor(cls) {
  return Object.entries(PATHS).filter(([, p]) => p.base === cls).map(([id]) => id);
}
/** 이 캐릭터가 지금 2차 전직을 할 수 있는지와 이유 */
export function canClass2(ch, path) {
  const p = PATHS[path];
  if (!p) return "알 수 없는 전직이에요.";
  if (ch.cls2) return "이미 2차 전직을 마쳤어요.";
  if ((ch.level ?? 1) < CLASS2_LEVEL) return `레벨 ${CLASS2_LEVEL}부터 2차 전직을 할 수 있어요.`;
  if (p.base !== ch.cls) return `${p.name}은(는) 다른 1차 직업의 전직이에요.`;
  if (path === "king" && !ch.cleared) return "모험가의 왕은 에르덴 섬(제1 던전 100층)을 모험가로 돌파한 캐릭터만 고를 수 있어요.";
  return null;
}
/** 2차 전직 표시 이름 */
export function className2(ch) {
  const p = ch?.cls2 && PATHS[ch.cls2];
  return p ? `${p.name}` : null;
}

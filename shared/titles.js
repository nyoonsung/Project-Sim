// 칭호 디자인: 칭호 이름(글자)에 그림을 묶어 둠 → 그 칭호를 누구에게 주든 항상 이 그림으로 표시
//   w: 게임 화면(640px 기준)에서 닉네임 위에 그릴 폭. 쇼아라의 블라드는 제공 원본 비율(192:108)을 유지.
export const TITLE_DESIGNS = {
  "세계의 신": { src: "/assets/titles/world_god.png", w: 70, ratio: 300 / 104 },
  "최초의 대적자": { src: "/assets/titles/first_rival.png", w: 64, ratio: 300 / 91 },
  "신궁神弓": { src: "/assets/titles/shinryu_shingung.png", w: 62, ratio: 123 / 41 },
  "헤파이스토스": { src: "/assets/titles/hephaestus.png", w: 62, ratio: 124 / 41 },
  "쇼아라의 블라드": { src: "/assets/titles/shoara-vlad.png", w: 62, ratio: 192 / 108 },
  "모험가의 왕": { src: "/assets/titles/adventurer_king.png", w: 68, ratio: 320 / 100 },
};
export const titleDesign = (text) => (text ? TITLE_DESIGNS[text] ?? null : null);

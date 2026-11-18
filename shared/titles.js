// 칭호 디자인: 칭호 이름(글자)에 그림을 묶어 둠 → 그 칭호를 누구에게 주든 항상 이 그림으로 표시
//   w: 게임 화면(640px 기준)에서 닉네임 위에 그릴 폭
export const TITLE_DESIGNS = {
  "세계의 신": { src: "/assets/titles/world_god.png", w: 70, ratio: 300 / 104 },
};
export const titleDesign = (text) => (text ? TITLE_DESIGNS[text] ?? null : null);

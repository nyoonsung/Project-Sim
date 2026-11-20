// 정렬된 월드 오브젝트의 깊이 보정.
export function objectDepthY(o, players = []) {
  const baseY = o.flatY ?? (o.kind === "torch" ? o.y - 20 : o.flat ? o.y - 14 : o.y);
  if (o.kind !== "dummy") return baseY;

  let depthY = baseY;
  for (const p of players) {
    if (p.dead) continue;
    const px = p.rx ?? p.x, py = p.ry ?? p.y;
    // 훈련 허수아비와 플레이어 스프라이트가 겹치면 플레이어를 항상 앞에 그린다.
    if (Math.abs(px - o.x) <= 18 && Math.abs(py - o.y) <= 40) {
      depthY = Math.min(depthY, py - 1);
    }
  }
  return depthY;
}

// 이동·충돌 (서버 판정과 클라이언트 예측이 같은 코드를 씀)
import { TILE, SOLID, BLOCKS_SHOT } from "./constants.js";

export function tileAt(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
  return map.tiles[ty * map.w + tx];
}
export function solidAt(map, px, py) {
  const t = tileAt(map, Math.floor(px / TILE), Math.floor(py / TILE));
  if (t === 3 && map.doorsOpen) return false;
  return SOLID.has(t) || t === 3;
}
export function blocksShot(map, px, py) {
  const t = tileAt(map, Math.floor(px / TILE), Math.floor(py / TILE));
  if (t === 3 && !map.doorsOpen) return true;
  return BLOCKS_SHOT.has(t);
}

// 원(반지름 r)이 벽과 겹치는지: 원 둘레 8점 + 중심 검사
const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
export function circleHitsWall(map, x, y, r) {
  if (solidAt(map, x, y)) return true;
  for (const [cx, cy] of RING) if (solidAt(map, x + cx * r, y + cy * r)) return true;
  return false;
}

/** 축 분리 이동: 벽에 닿으면 미끄러진다. 결과 위치 반환 */
export function moveCircle(map, x, y, dx, dy, r) {
  // 한 번에 너무 멀리 가면 벽을 뚫으므로 쪼개서 이동
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.8)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!circleHitsWall(map, x + sx, y, r)) x += sx;
    if (!circleHitsWall(map, x, y + sy, r)) y += sy;
  }
  return [x, y];
}

/** 플레이어 입력 한 번(1틱) 적용: 입력은 -1..1 방향 */
export function applyInput(map, x, y, mx, my, speed, dt, r) {
  let len = Math.hypot(mx, my);
  if (len < 0.01) return [x, y];
  if (len > 1) { mx /= len; my /= len; len = 1; }
  return moveCircle(map, x, y, mx * speed * dt, my * speed * dt, r);
}

/** 두 점 사이 시야(벽 없음) 여부 */
export function lineOfSight(map, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / (TILE / 3));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocksShot(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

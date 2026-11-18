// 색 빛번짐: 색마다 부드러운 원 그림을 한 번 만들어 두고(캐시), 매 프레임 모은 빛을 '더하기' 합성으로 그린다.
// 어둠(조명) 계산에도 같은 목록을 써서 빛나는 곳은 밝게 뚫린다. 그라디언트를 매번 만들지 않아 가볍다.
const cache = new Map();
let list = [];

function sprite(color) {
  let c = cache.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.25, color + "aa"); gr.addColorStop(0.6, color + "33"); gr.addColorStop(1, color + "00");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  cache.set(color, c);
  return c;
}
const norm = (c) => (c.length === 4 ? "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(0, 7));

export function beginGlows() { list = []; }
/** 월드 좌표 (x, y)에 반지름 r, 색, 세기 a(0~1) */
export function addGlow(x, y, r, color, a = 0.5) { if (list.length < 400) list.push(x, y, r, norm(color), a); }
export function forEachGlow(fn) { for (let i = 0; i < list.length; i += 5) fn(list[i], list[i + 1], list[i + 2], list[i + 3], list[i + 4]); }
/** 빛 번짐 그리기. 절반 해상도 버퍼에 모아 그린 뒤 한 번에 '더하기' 합성 → 큰 빛이 많아도 칠하는 픽셀이 1/4.
 *  버퍼는 월드 짝수 좌표에 고정해서 화면이 1px 움직여도 빛이 깜박이지 않음. */
let buf = null, bctx = null;
export const GLOW_LIMITS = { max: 400 };
export function drawGlows(ctx, cx, cy, W, H) {
  if (!list.length) return;
  const icx = Math.round(cx), icy = Math.round(cy);
  const bx = icx - (((icx % 2) + 2) % 2), by = icy - (((icy % 2) + 2) % 2);
  const bw = Math.ceil(W / 2) + 1, bh = Math.ceil(H / 2) + 1;
  if (!buf || buf.width !== bw || buf.height !== bh) { buf = new OffscreenCanvas(bw, bh); bctx = buf.getContext("2d"); }
  bctx.globalCompositeOperation = "source-over";
  bctx.globalAlpha = 1;
  bctx.clearRect(0, 0, bw, bh);
  bctx.globalCompositeOperation = "lighter";
  bctx.imageSmoothingEnabled = true;
  let n = 0;
  for (let i = 0; i < list.length && n < GLOW_LIMITS.max; i += 5) {
    const x = list[i] - bx, y = list[i + 1] - by, r = list[i + 2];
    if (x < -r || y < -r || x > W + r || y > H + r) continue;
    n++;
    bctx.globalAlpha = Math.min(1, list[i + 4]);
    bctx.drawImage(sprite(list[i + 3]), (x - r) / 2, (y - r) / 2, r, r);
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(buf, bx - cx, by - cy, bw * 2, bh * 2);
  ctx.restore();
}

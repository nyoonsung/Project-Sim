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

// ── 고정 빛 캐시: 가로등·창문·수정처럼 움직이지 않는 빛은 처음 한 번만 256px 조각(타일)에 그려 두고 재사용
//    (매 프레임 수십 개를 다시 그리던 비용 제거). key를 준 빛 = 고정 빛
export const CH = 256;
const statics = new Map();      // key → { g: [[x,y,r,c,a]...], sealed }
let fresh = [];                 // 이번 프레임에 처음 등록된 고정 빛
export const glowChunks = new Map(), lightChunks = new Map();
let staticGen = 0;
export const staticList = function* () { for (const s of statics.values()) if (s.sealed) for (const g of s.g) yield g; };
export function resetStaticGlows() { statics.clear(); fresh = []; glowChunks.clear(); lightChunks.clear(); staticGen++; }
function dirty(g) {
  const [x, y, r] = g, R = r * 1.3;
  for (let cy = Math.floor((y - R) / CH); cy <= Math.floor((y + R) / CH); cy++)
    for (let cx = Math.floor((x - R) / CH); cx <= Math.floor((x + R) / CH); cx++) { glowChunks.delete(cx + "," + cy); lightChunks.delete(cx + "," + cy); }
}
export function beginGlows() {
  list = [];
  for (const k of fresh) { const s = statics.get(k); if (!s) continue; s.sealed = true; for (const g of s.g) dirty(g); }
  fresh = [];
}
/** 월드 좌표 (x, y)에 반지름 r, 색, 세기 a(0~1). key: 고정 빛이면 그 물체(한 번 등록되면 캐시에서 그림) */
export function addGlow(x, y, r, color, a = 0.5, key = null) {
  const c = norm(color);
  if (key != null) {
    let st = statics.get(key);
    if (st?.sealed) return;
    if (!st) { st = { g: [], sealed: false }; statics.set(key, st); fresh.push(key); }
    st.g.push([x, y, r, c, a]);
  }
  if (list.length < 400) list.push(x, y, r, c, a);
}
/** 고정 빛 색 조각 (절반 해상도 128×128) */
function glowChunk(cx, cy) {
  const k = cx + "," + cy;
  let c = glowChunks.get(k);
  if (c !== undefined) return c;
  const x0 = cx * CH, y0 = cy * CH;
  let any = false;
  const cv = new OffscreenCanvas(CH / 2, CH / 2), g = cv.getContext("2d");
  g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true;
  for (const [x, y, r, col, a] of staticList()) {
    if (x + r < x0 || y + r < y0 || x - r > x0 + CH || y - r > y0 + CH) continue;
    any = true;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(sprite(col), (x - r - x0) / 2, (y - r - y0) / 2, r, r);
  }
  c = any ? cv : null;
  glowChunks.set(k, c);
  return c;
}
export function forEachChunk(cx, cy, W, H, fn) {
  for (let y = Math.floor(cy / CH); y <= Math.floor((cy + H) / CH); y++) for (let x = Math.floor(cx / CH); x <= Math.floor((cx + W) / CH); x++) fn(x, y);
}
export function forEachGlow(fn) { for (let i = 0; i < list.length; i += 5) if (fn(list[i], list[i + 1], list[i + 2], list[i + 3], list[i + 4]) === false) break; }
/** 빛 번짐 그리기. 절반 해상도 버퍼에 모아 그린 뒤 한 번에 '더하기' 합성 → 큰 빛이 많아도 칠하는 픽셀이 1/4.
 *  버퍼는 월드 짝수 좌표에 고정해서 화면이 1px 움직여도 빛이 깜박이지 않음. */
let buf = null, bctx = null;
export const GLOW_LIMITS = { max: 400 };
export function drawGlows(ctx, cx, cy, W, H) {
  if (!list.length && !statics.size) return;
  const icx = Math.round(cx), icy = Math.round(cy);
  const bx = icx - (((icx % 2) + 2) % 2), by = icy - (((icy % 2) + 2) % 2);
  const bw = Math.ceil(W / 2) + 1, bh = Math.ceil(H / 2) + 1;
  if (!buf || buf.width !== bw || buf.height !== bh) { buf = new OffscreenCanvas(bw, bh); bctx = buf.getContext("2d"); }
  bctx.globalCompositeOperation = "source-over";
  bctx.globalAlpha = 1;
  bctx.clearRect(0, 0, bw, bh);
  // 고정 빛은 미리 그려 둔 조각을 붙이기만
  bctx.imageSmoothingEnabled = true;
  forEachChunk(bx, by, W + 2, H + 2, (x, y) => { const c = glowChunk(x, y); if (c) bctx.drawImage(c, (x * CH - bx) / 2, (y * CH - by) / 2); });
  bctx.globalCompositeOperation = "lighter";
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

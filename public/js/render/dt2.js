// 0x72 DungeonTileset II (CC0) 아틀라스: 한 장(dt2.png)을 불러와 프레임을 잘라 쓰고,
// 색 입히기(곱하기 + 밝히기)와 흰색 번쩍임 버전을 미리 만들어 캐시한다 (매 프레임 재계산 없음).
let IMG = null, POS = null;
const cache = new Map();

export async function loadDT2() {
  if (IMG) return;
  const img = new Image();
  img.src = "/assets/dt2.png";
  const [pos] = await Promise.all([fetch("/assets/dt2.json").then((r) => r.json()), img.decode()]);
  IMG = img; POS = pos;
}
export const dtReady = () => !!IMG;
export const has = (name) => !!POS?.[name];

/** 애니메이션 프레임 수 (name_f0, name_f1, …) */
const counts = new Map();
export function frameCount(base) {
  if (!counts.has(base)) { let n = 0; while (POS?.[`${base}_f${n}`]) n++; counts.set(base, n); }
  return counts.get(base);
}
/** 시간 t에 해당하는 애니메이션 프레임 이름 */
export function animName(base, t, fps = 8) {
  const n = frameCount(base);
  return n ? `${base}_f${Math.floor(t * fps) % n}` : base;
}

const hex = (s) => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/**
 * 프레임 캔버스 (1배). tint = { m: 곱할 색, s: 밝힐 색(screen), sat: 채도 0~1 } 또는 null
 * white = true면 실루엣을 흰색으로 (피격 번쩍임)
 */
export function frame(name, tint = null, white = false) {
  const key = name + "|" + (tint ? tint.m + tint.s + (tint.sat ?? "") : "") + (white ? "|w" : "");
  let c = cache.get(key);
  if (c) return c;
  const p = POS?.[name];
  if (!p) return null;
  const [x, y, w, h] = p;
  c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(IMG, x, y, w, h, 0, 0, w, h);
  if (white) {
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  } else if (tint) {
    const d = g.getImageData(0, 0, w, h), a = d.data;
    const m = tint.m ? hex(tint.m) : [255, 255, 255], sc = tint.s ? hex(tint.s) : [0, 0, 0], sat = tint.sat ?? 1;
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      let r = a[i], gg = a[i + 1], b = a[i + 2];
      if (sat !== 1) { const l = r * 0.3 + gg * 0.59 + b * 0.11; r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat; }
      r = (r * m[0]) / 255; gg = (gg * m[1]) / 255; b = (b * m[2]) / 255;
      // screen: 1 - (1-a)(1-b)
      a[i] = 255 - ((255 - r) * (255 - sc[0])) / 255;
      a[i + 1] = 255 - ((255 - gg) * (255 - sc[1])) / 255;
      a[i + 2] = 255 - ((255 - b) * (255 - sc[2])) / 255;
    }
    g.putImageData(d, 0, 0);
  }
  cache.set(key, c);
  return c;
}
/** 발밑(아래 가운데)을 기준으로 2배 크기로 그리기 */
export function drawFoot(ctx, name, x, y, { tint = null, white = false, scale = 2, flip = false, alpha = 1 } = {}) {
  const c = frame(name, tint, white);
  if (!c) return null;
  const w = c.width * scale, h = c.height * scale;
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  if (flip) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(c, Math.round(-w / 2), Math.round(-h), w, h); ctx.restore(); }
  else ctx.drawImage(c, Math.round(x - w / 2), Math.round(y - h), w, h);
  if (alpha !== 1) ctx.globalAlpha /= alpha;
  return c;
}

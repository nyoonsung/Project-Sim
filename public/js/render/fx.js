// pixelfx 이펙트: 필요할 때 불러오고(지연 로딩), 월드 프레임에 그리거나, 반복 이펙트는 미리 구워서 이미지로 그린다
import { createFrame, clearFrame, createFx, composite } from "../../vendor/pixelfx/core/index.js";

const mods = new Map();
const pending = new Map();

export function loadFx(id) {
  if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) return Promise.resolve(null);
  if (mods.has(id)) return Promise.resolve(mods.get(id));
  if (!pending.has(id)) pending.set(id, (globalThis.__FX_REGISTRY ? globalThis.__FX_REGISTRY[id]?.() ?? Promise.reject(new Error("no fx")) : import(`../../vendor/pixelfx/fx/${id}.js`)).then((m) => { mods.set(id, m); return m; }).catch((e) => { console.warn("fx load", id, e); mods.set(id, null); return null; }));
  return pending.get(id);
}
export const fxModule = (id) => mods.get(id);
export function preloadFx(ids) { return Promise.all([...new Set(ids.filter(Boolean))].map(loadFx)); }

/** 방향(라디안) → pixelfx 배치: 왼쪽을 보면 좌우 반전 후 회전 */
export function orient(a) {
  if (a == null) return { flip: false, angle: 0 };
  const flip = Math.cos(a) < 0;
  return { flip, angle: flip ? a - Math.PI : a };
}

// ── 구운 반복 애니메이션 (몬스터 생물, 횃불, 투사체 등)
const baked = new Map();
export function baked_(id, palette = null, fps = 15) {
  const key = id + "|" + (palette ? palette.join(",") : "");
  if (baked.has(key)) return baked.get(key);
  const mod = mods.get(id);
  if (!mod) { loadFx(id); return null; }
  const meta = mod.meta;
  const [w, h] = meta.size, [ox, oy] = meta.origin;
  const opts = { x: ox, y: oy, seed: 7 };
  if (palette) opts.palette = palette;
  const inst = createFx(mod, opts);
  const frame = createFrame(w, h);
  const n = Math.max(1, Math.round(meta.duration * fps));
  const frames = [];
  // 시뮬레이션형은 한 바퀴 미리 돌려서 안정화
  if (mod.create) for (let i = 0; i < n; i++) inst.update(1 / fps);
  let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
  const imgs = [];
  for (let i = 0; i < n; i++) {
    clearFrame(frame);
    inst.draw(frame);
    const img = new ImageData(w, h);
    composite(frame, img.data, null);
    // 내용 범위
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
    imgs.push(img);
    inst.update(1 / fps);
  }
  if (bx1 < bx0) { bx0 = 0; by0 = 0; bx1 = 1; by1 = 1; }
  const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
  for (const img of imgs) {
    const full = new OffscreenCanvas(w, h);
    full.getContext("2d").putImageData(img, 0, 0);
    const c = new OffscreenCanvas(cw, ch);
    c.getContext("2d").drawImage(full, -bx0, -by0);
    frames.push(c);
  }
  const b = { frames, fps, ox: ox - bx0, oy: oy - by0, w: cw, h: ch, loop: !!meta.loop, dur: meta.duration };
  baked.set(key, b);
  return b;
}
export function bakedFrame(b, t) {
  if (!b) return null;
  const i = b.loop ? Math.floor(t * b.fps) % b.frames.length : Math.min(b.frames.length - 1, Math.floor(t * b.fps));
  return b.frames[i];
}

// ── 실시간 이펙트 레이어 (카메라 크기 프레임 하나에 모아 그림)
export class FxLayer {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.frame = createFrame(w, h);
    this.img = new ImageData(w, h);
    this.canvas = new OffscreenCanvas(w, h);
    this.ctx = this.canvas.getContext("2d");
    this.list = [];
    this.scaled = [];
  }
  /** id 이펙트를 월드 좌표 (x, y)에. o: { a(방향), pal, s(배율), follow(유닛 id), life } */
  spawn(id, x, y, o = {}) {
    const mod = mods.get(id);
    if (!mod) { loadFx(id).then((m) => m && this.spawn(id, x, y, o)); return; }
    const { flip, angle } = orient(o.a);
    const opts = { x, y, flip, angle, seed: (Math.random() * 1e6) | 0 };
    if (o.pal) opts.palette = o.pal;
    const inst = createFx(mod, opts);
    const e = { inst, follow: o.follow ?? null, until: o.life ? performance.now() / 1000 + o.life : null, s: o.s && o.s !== 1 ? o.s : 1, dy: o.dy ?? 0 };
    if (e.s !== 1) {
      const [w, h] = mod.meta.size;
      e.frame = createFrame(w, h);
      e.img = new ImageData(w, h);
      e.cv = new OffscreenCanvas(w, h);
      e.ox = mod.meta.origin[0]; e.oy = mod.meta.origin[1];
      e.wx = x; e.wy = y;
      inst.options.x = e.ox; inst.options.y = e.oy;
      this.scaled.push(e);
    } else this.list.push(e);
    if (this.list.length + this.scaled.length > 160) (this.list.length ? this.list : this.scaled).shift();
    return e;
  }
  update(dt, ents) {
    const now = performance.now() / 1000;
    const step = (arr) => arr.filter((e) => {
      if (e.follow != null) {
        const u = ents.get(e.follow);
        if (u) { if (e.s === 1) { e.inst.options.x = u.rx; e.inst.options.y = u.ry + e.dy; } else { e.wx = u.rx; e.wy = u.ry + e.dy; } }
      }
      e.inst.update(dt);
      if (e.until && now > e.until) e.inst.stop();
      return !e.inst.done();
    });
    this.list = step(this.list);
    this.scaled = step(this.scaled);
  }
  render(ctx, camX, camY) {
    if (this.list.length) {
      const f = this.frame;
      f.ox = Math.floor(camX); f.oy = Math.floor(camY);
      clearFrame(f);
      for (const e of this.list) e.inst.draw(f);
      composite(f, this.img.data, null);
      this.ctx.putImageData(this.img, 0, 0);
      ctx.drawImage(this.canvas, 0, 0);
    }
    for (const e of this.scaled) {
      clearFrame(e.frame);
      e.inst.draw(e.frame);
      composite(e.frame, e.img.data, null);
      e.cv.getContext("2d").putImageData(e.img, 0, 0);
      const s = e.s;
      ctx.drawImage(e.cv, Math.round(e.wx - camX - e.ox * s), Math.round(e.wy - camY - e.oy * s), e.cv.width * s, e.cv.height * s);
    }
  }
  clear() { this.list = []; this.scaled = []; }
}

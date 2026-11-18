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

// 한가할 때 이펙트 굽기 (한 번에 하나, 첫 사용 뒤)
const bakedReady = new Map(), bakeQueue = new Map();
let baking = false;
function scheduleBake(id, pal, key) {
  if (bakedReady.has(key) || bakeQueue.has(key)) return;
  bakeQueue.set(key, [id, pal]);
  pump();
}
function pump() {
  if (baking || !bakeQueue.size) return;
  baking = true;
  // 한가할 때 굽되, 이펙트가 쏟아져 한가할 틈이 없어도 0.12초 안에는 반드시 구움
  // (예전엔 바쁠수록 굽기가 밀려서, 모든 이펙트가 매 프레임 픽셀 계산으로 그려져 렉이 커지는 악순환)
  const idle = globalThis.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 120 }) : (f) => setTimeout(f, 30);
  idle(() => {
    const [key, [id, pal]] = bakeQueue.entries().next().value;
    bakeQueue.delete(key);
    try { const b = baked_(id, pal, 20); if (b) bakedReady.set(key, b); } catch (e) { console.warn("bake", id, e); bakedReady.set(key, null); }
    baking = false;
    pump();
  });
}
export function prebake(ids) { for (const id of ids) if (id && mods.get(id)) scheduleBake(id, null, id + "|"); }
/** 아직 안 구운(매 프레임 픽셀 계산하는) 이펙트가 동시에 이만큼 넘으면 새로 띄우지 않음 → 최악의 경우에도 프레임 유지 */
export const FX_LIMITS = { live: 8 };

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
    this.bk = []; // 구운 프레임으로 재생하는 이펙트 (가장 가벼움)
    this.every = 1; this.n = 0; this.acc = 0; // every=2면 2프레임에 한 번만 계산 (날씨 등 배경)
  }
  /** id 이펙트를 월드 좌표 (x, y)에. o: { a(방향), pal, s(배율), follow(유닛 id), life } */
  spawn(id, x, y, o = {}) {
    const mod = mods.get(id);
    if (!mod) { loadFx(id).then((m) => m && this.spawn(id, x, y, o)); return; }
    const { flip, angle } = orient(o.a);
    // 최적화: 이미 구워 둔 이펙트는 이미지로 재생 (매 프레임 계산 없음). 처음 쓰는 이펙트는 이번엔 실시간, 한가할 때 굽기
    const bkey = id + "|" + (o.pal ? o.pal.join(",") : "");
    const b = id.startsWith("weather/") ? null : bakedReady.get(bkey);
    if (b) {
      const now = performance.now() / 1000;
      const e = { b, t0: now, x, y, s: o.s ?? 1, flip, angle, follow: o.follow ?? null, dy: o.dy ?? 0, until: o.life ? now + o.life : null };
      this.bk.push(e);
      if (this.bk.length > 220) this.bk.shift();
      return e;
    }
    if (!id.startsWith("weather/")) scheduleBake(id, o.pal ?? null, bkey);
    if (!id.startsWith("weather/") && this.list.length + this.scaled.length >= FX_LIMITS.live) return null;
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
    if (this.every > 1) { this.acc += dt; if (this.n % this.every) return; dt = this.acc; this.acc = 0; }
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
    this.bk = this.bk.filter((e) => {
      if (e.follow != null) { const u = ents.get(e.follow); if (u) { e.x = u.rx; e.y = u.ry + e.dy; } }
      const age = now - e.t0;
      if (e.until && now > e.until) return false;
      return e.b.loop ? true : age < e.b.frames.length / e.b.fps;
    });
  }
  render(ctx, camX, camY) {
    if (this.every > 1 && this.n++ % this.every && this.list.length && !this.scaled.length && !this.bk.length) { ctx.drawImage(this.canvas, 0, 0); return; }
    const now = performance.now() / 1000;
    for (const e of this.bk) {
      const f = bakedFrame(e.b, now - e.t0);
      if (!f) continue;
      const x = e.x - camX, y = e.y - camY;
      if (x < -200 || y < -200 || x > this.w + 200 || y > this.h + 200) continue;
      if (!e.angle && !e.flip && e.s === 1) { ctx.drawImage(f, Math.round(x - e.b.ox), Math.round(y - e.b.oy)); continue; }
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (e.angle) ctx.rotate(e.angle);
      if (e.flip) ctx.scale(-1, 1);
      if (e.s !== 1) ctx.scale(e.s, e.s);
      ctx.drawImage(f, -e.b.ox, -e.b.oy);
      ctx.restore();
    }
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
  clear() { this.list = []; this.scaled = []; this.bk = []; }
}

// ── 날씨 굽기: 10~12초짜리 반복 화면 효과를 초당 8장, 절반 해상도로 미리 구워 두고 이미지로만 재생
//    (예전엔 화면 전체를 매 프레임 픽셀 계산 → 성역 구역(빛줄기) 등에서 큰 렉)
const weatherLoops = new Map();
export function weatherLoop(id) {
  if (weatherLoops.has(id)) return weatherLoops.get(id);
  const mod = mods.get(id);
  if (!mod) { loadFx(id); return null; }
  const [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
  const fps = 8, n = Math.max(1, Math.round(mod.meta.duration * fps));
  const inst = createFx(mod, { x: ox, y: oy, seed: 11 });
  if (mod.create) for (let i = 0; i < n; i++) inst.update(1 / fps); // 시뮬레이션형은 한 바퀴 돌려 안정화
  const frame = createFrame(w, h), img = new ImageData(w, h), full = new OffscreenCanvas(w, h), fctx = full.getContext("2d");
  const L = { frames: [], n, fps, w, h, done: false };
  weatherLoops.set(id, L);
  const step = () => {
    for (let k = 0; k < 4 && L.frames.length < n; k++) {
      clearFrame(frame); inst.draw(frame); composite(frame, img.data, null); fctx.putImageData(img, 0, 0);
      const c = new OffscreenCanvas(w / 2, h / 2), g = c.getContext("2d");
      g.imageSmoothingEnabled = true; g.drawImage(full, 0, 0, w / 2, h / 2);
      L.frames.push(c);
      inst.update(1 / fps);
    }
    if (L.frames.length < n) (globalThis.requestIdleCallback ? requestIdleCallback(step, { timeout: 200 }) : setTimeout(step, 30));
    else L.done = true;
  };
  step();
  return L;
}

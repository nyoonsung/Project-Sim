// pixelfx 이펙트: 필요할 때 불러오고(지연 로딩), 월드 프레임에 그리거나, 반복 이펙트는 미리 구워서 이미지로 그린다
import { createFrame, clearFrame, createFx, composite } from "../../vendor/pixelfx/core/index.js";

const mods = new Map();
const pending = new Map();

export function loadFx(id) {
  if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) return Promise.resolve(null);
  if (mods.has(id)) return Promise.resolve(mods.get(id));
  if (!pending.has(id)) pending.set(id, (globalThis.__FX_REGISTRY ? globalThis.__FX_REGISTRY[id]?.() ?? Promise.reject(new Error("no fx")) : import(/* @vite-ignore */ `/vendor/pixelfx/fx/${id}.js`)).then((m) => { mods.set(id, m); return m; }).catch((e) => { console.warn("fx load", id, e); mods.set(id, null); return null; }));
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
/** 굽기를 한 단계씩 (yield마다 잠깐 쉼) → 한가한 시간에 조금씩 굽고, 급하면 한 번에 */
function* bakeSteps(id, palette, fps) {
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
  if (mod.create) for (let i = 0; i < n; i++) { inst.update(1 / fps); if (i % 8 === 7) yield; }
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
    yield;
  }
  if (baked.has(key)) return baked.get(key); // 그 사이 다른 곳에서 다 구웠으면
  if (bx1 < bx0) { bx0 = 0; by0 = 0; bx1 = 1; by1 = 1; }
  const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
  const full = new OffscreenCanvas(w, h), fg = full.getContext("2d");
  for (const img of imgs) {
    fg.putImageData(img, 0, 0);
    const c = new OffscreenCanvas(cw, ch);
    c.getContext("2d").drawImage(full, -bx0, -by0);
    frames.push(c);
  }
  const b = { frames, fps, ox: ox - bx0, oy: oy - by0, w: cw, h: ch, loop: !!meta.loop, dur: meta.duration };
  baked.set(key, b);
  return b;
}
/** 바로 필요할 때: 한 번에 끝까지 구움 */
export function baked_(id, palette = null, fps = 15) {
  const key = id + "|" + (palette ? palette.join(",") : "");
  if (baked.has(key)) return baked.get(key);
  const g = bakeSteps(id, palette, fps);
  let r;
  do r = g.next(); while (!r.done);
  return r.value;
}
export function bakedFrame(b, t) {
  if (!b) return null;
  const i = b.loop ? Math.floor(t * b.fps) % b.frames.length : Math.min(b.frames.length - 1, Math.floor(t * b.fps));
  return b.frames[i];
}

// 한가할 때 이펙트 굽기 (한 번에 하나, 첫 사용 뒤)
const bakedReady = new Map(), bakeQueue = new Map();
let baking = false;
function scheduleBake(id, pal, key, urgent = false) {
  if (bakedReady.has(key) || job?.key === key) return;
  if (bakeQueue.has(key)) {
    if (!urgent) return;
    bakeQueue.delete(key);
  }
  if (urgent) {
    // 지금 화면에 나온 이펙트는 미리 굽기 목록보다 먼저
    const rest = [...bakeQueue]; bakeQueue.clear(); bakeQueue.set(key, [id, pal]); for (const [k, v] of rest) bakeQueue.set(k, v);
  } else bakeQueue.set(key, [id, pal]);
  pump();
}
let job = null; // { key, gen }
function pump() {
  if (baking || (!bakeQueue.size && !job)) return;
  baking = true;
  // 한가한 시간에만 조금씩 굽고(프레임을 끊지 않음), 한가할 틈이 없어도 0.12초마다 조금은 진행
  // (예전엔 이펙트 하나를 통째로 구워서 수십 ms씩 화면이 멈칫했음)
  const idle = globalThis.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 120 }) : (f) => setTimeout(() => f({ timeRemaining: () => 6, didTimeout: false }), 30);
  idle((dl) => {
    const until = performance.now() + (dl.didTimeout ? 3 : Math.min(12, Math.max(2, dl.timeRemaining() - 1)));
    do {
      if (!job) {
        if (!bakeQueue.size) break;
        const [key, [id, pal]] = bakeQueue.entries().next().value;
        bakeQueue.delete(key);
        const sz = mods.get(id)?.meta?.size ?? [0, 0];
        job = { key, gen: bakeSteps(id, pal, sz[0] * sz[1] > 40000 ? 12 : 20) }; // 큰 이펙트는 12fps로 (굽는 시간·메모리 절약)
      }
      try {
        const r = job.gen.next();
        if (r.done) { if (r.value) bakedReady.set(job.key, r.value); else bakedReady.set(job.key, null); job = null; }
      } catch (e) { console.warn("bake", job.key, e); bakedReady.set(job.key, null); job = null; }
    } while (performance.now() < until);
    baking = false;
    pump();
  });
}
export function prebake(ids) { for (const id of ids) if (id && mods.get(id)) scheduleBake(id, null, id + "|"); }
/** 아직 안 구운(매 프레임 픽셀 계산하는) 이펙트가 동시에 이만큼 넘으면 새로 띄우지 않음 → 최악의 경우에도 프레임 유지 */
export const FX_LIMITS = { live: 8 };

/** 이펙트가 원점에서 그릴 수 있는 최대 거리 (회전해도 안전하게 모서리까지) */
function reachOf(inst) {
  const m = inst.mod?.meta ?? inst.meta;
  if (!m?.size) return 400;
  const [w, h] = m.size, [ox, oy] = m.origin ?? [w / 2, h / 2];
  return Math.ceil(Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy))) + 2;
}
function clearRect(f, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) { const i = y * f.w; f.color.fill(0, i + x0, i + x1); f.light.fill(0, i + x0, i + x1); }
}
/** pixelfx composite(bg 없음)과 같은 계산을 사각형 안에서만 */
function compositeRect(f, out, x0, y0, x1, y1) {
  const C = f.color, L = f.light, W = f.w;
  for (let y = y0; y < y1; y++) {
    for (let i = y * W + x0, end = y * W + x1; i < end; i++) {
      const c = C[i], l = L[i] & 0xffffff, j = i * 4;
      if (!c && !l) { out[j + 3] = 0; continue; }
      let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255, a = c >>> 24;
      if (l) {
        const lr = l & 255, lg = (l >>> 8) & 255, lb = (l >>> 16) & 255;
        if (a < 255) {
          const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
          const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
          if (na > 0) { r = Math.min(255, pr / na); g = Math.min(255, pg / na); b = Math.min(255, pb / na); a = na * 255; }
        } else { r = Math.min(255, r + lr); g = Math.min(255, g + lg); b = Math.min(255, b + lb); }
      }
      out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = a;
    }
  }
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
    this.bk = []; // 구운 프레임으로 재생하는 이펙트 (가장 가벼움)
    this.every = 1; this.n = 0; this.acc = 0; // every=2면 2프레임에 한 번만 계산 (날씨 등 배경)
  }
  /** id 이펙트를 월드 좌표 (x, y)에. o: { a(방향), pal, s(배율), follow(유닛 id), life } */
  spawn(id, x, y, o = {}) {
    const mod = mods.get(id);
    if (!mod) { loadFx(id).then((m) => m && this.spawn(id, x, y, o)); return; }
    const { flip, angle } = orient(o.a);
    const requestedLife = Number.isFinite(o.life) && o.life > 0 ? o.life : null;
    const life = requestedLife ?? (mod.meta?.loop && !id.startsWith("weather/") ? Math.min(3, Math.max(0.8, mod.meta.duration ?? 1.2)) : null);
    // 최적화: 이미 구워 둔 이펙트는 이미지로 재생 (매 프레임 계산 없음). 처음 쓰는 이펙트는 이번엔 실시간, 한가할 때 굽기
    const bkey = id + "|" + (o.pal ? o.pal.join(",") : "");
    const b = id.startsWith("weather/") ? null : bakedReady.get(bkey);
    if (b) {
      const now = performance.now() / 1000;
      const e = { b, t0: now, x, y, s: o.s ?? 1, flip, angle, follow: o.follow ?? null, dy: o.dy ?? 0, until: life ? now + life : null };
      this.bk.push(e);
      if (this.bk.length > 220) this.bk.shift();
      return e;
    }
    if (!id.startsWith("weather/")) scheduleBake(id, o.pal ?? null, bkey, true);
    if (!id.startsWith("weather/") && this.list.length + this.scaled.length >= FX_LIMITS.live) return null;
    // 붐빌 때 남의 이펙트는 다 구워진 것만 (매 프레임 픽셀 계산하는 실시간 이펙트는 내 것에만)
    if (o.other && (globalThis.__crowdK ?? 1) < 1) return null;
    const opts = { x, y, flip, angle, seed: (Math.random() * 1e6) | 0 };
    if (o.pal) opts.palette = o.pal;
    const inst = createFx(mod, opts);
    const e = { inst, follow: o.follow ?? null, until: life ? performance.now() / 1000 + life : null, s: o.s && o.s !== 1 ? o.s : 1, dy: o.dy ?? 0,
      bkey: id.startsWith("weather/") ? null : bkey, flip, angle, t0: performance.now() / 1000 };
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
    // 굽기가 끝난 실시간 이펙트는 구운 이미지 재생으로 갈아탐 (매 프레임 픽셀 계산 → 그림 한 장)
    const swap = (arr) => arr.filter((e) => {
      const b = e.bkey && bakedReady.get(e.bkey);
      if (!b) return true;
      const x = e.s === 1 ? e.inst.options.x : e.wx, y = e.s === 1 ? e.inst.options.y : e.wy;
      const nb = { b, t0: e.t0, x, y, s: e.s, flip: e.flip, angle: e.angle, follow: e.follow, dy: e.dy, until: e.until };
      this.bk.push(nb); e.swapped = nb; // 장판이 일찍 끝나면 구운 쪽도 같이 끝내려고
      return false;
    });
    if (this.list.length) this.list = swap(this.list);
    if (this.scaled.length) this.scaled = swap(this.scaled);
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
      // 최적화: 화면 전체(23만 픽셀)가 아니라 이펙트들이 있는 범위만 합성·전송
      let x0 = this.w, y0 = this.h, x1 = 0, y1 = 0;
      for (const e of this.list) {
        const r = (e.R ??= reachOf(e.inst));
        const cx = e.inst.options.x - f.ox, cy = e.inst.options.y - f.oy;
        if (cx - r < x0) x0 = cx - r; if (cy - r < y0) y0 = cy - r; if (cx + r > x1) x1 = cx + r; if (cy + r > y1) y1 = cy + r;
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(this.w, Math.ceil(x1)); y1 = Math.min(this.h, Math.ceil(y1));
      if (x1 > x0 && y1 > y0) {
        const full = (x1 - x0) * (y1 - y0) > this.w * this.h * 0.6;
        if (full) clearFrame(f); else clearRect(f, x0, y0, x1, y1);
        for (const e of this.list) e.inst.draw(f);
        if (full) { composite(f, this.img.data, null); this.ctx.putImageData(this.img, 0, 0); ctx.drawImage(this.canvas, 0, 0); }
        else {
          compositeRect(f, this.img.data, x0, y0, x1, y1);
          this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
          ctx.drawImage(this.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
        }
      }
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
/** 디버그: 굽기 대기열 상태 */
export function bakeStats() { return { queue: bakeQueue.size, ready: bakedReady.size, job: job?.key ?? null, keys: [...bakeQueue.keys()].slice(0, 5) }; }

// 소리 엔진 (Web Audio 합성, 음원 파일 없음)
//  · 효과음 버스와 배경음악 버스를 따로 두고 각각 볼륨 조절
//  · 공용 잔향(리버브)·좌우 메아리(핑퐁 딜레이)로 공간감
//  · 악기(V.*)는 넘겨받은 출력 노드의 context를 써서, 실시간·오프라인(검사용) 어디서든 같은 소리를 냄
const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} };
const clamp01 = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export const AU = {
  ctx: null, bus: null,
  on: get("abyss-sound", "1") !== "0",
  bgmOn: get("abyss-bgm", "1") !== "0",
  sfxVol: clamp01(+get("abyss-sfxvol", "80") / 100, 0.8),
  bgmVol: clamp01(+get("abyss-bgmvol", "60") / 100, 0.6),
};
const listeners = new Set();
export const onAudio = (f) => listeners.add(f);
const notify = () => { for (const f of listeners) try { f(); } catch {} };

// ── 잔향 임펄스: 좌우가 다른 감쇠 잡음 (bright: 높을수록 밝은 잔향)
function impulse(ctx, sec, decay, bright, pre = 0.012) {
  const rate = ctx.sampleRate, len = Math.floor(rate * sec), buf = ctx.createBuffer(2, len, rate), p0 = Math.floor(rate * pre);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let lp = 0;
    for (let i = p0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; d[i] = lp * Math.pow(1 - i / len, decay); }
  }
  return buf;
}
export function panner(ctx, v = 0) {
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = v; return p; }
  return ctx.createGain();
}
function pingPong(ctx, dest) {
  const inp = ctx.createGain(), dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 2400; fb.gain.value = 0.36;
  dl.delayTime.value = dr.delayTime.value = 0.32;
  const pl = panner(ctx, -0.75), pr = panner(ctx, 0.75);
  inp.connect(dl); dl.connect(pl).connect(dest); dl.connect(dr); dr.connect(pr).connect(dest); dr.connect(fb).connect(lp).connect(dl);
  return { inp, set(sec) { const t = ctx.currentTime; dl.delayTime.setTargetAtTime(sec, t, 0.05); dr.delayTime.setTargetAtTime(sec, t, 0.05); } };
}
/** 버스 묶음: 출력 → 압축기 → 스피커. 효과음·음악 각각 잔향을 가짐 */
export function makeBus(ctx, dest = ctx.destination) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.22;
  const out = ctx.createGain(); out.connect(comp).connect(dest);
  const sfx = ctx.createGain(); sfx.connect(out);
  const sfxVerb = ctx.createConvolver(); sfxVerb.buffer = impulse(ctx, 1.5, 3.4, 0.45);
  const sv = ctx.createGain(); sv.gain.value = 0.9; sfxVerb.connect(sv).connect(sfx);
  const music = ctx.createGain(); music.connect(out);
  const musicVerb = ctx.createConvolver(); musicVerb.buffer = impulse(ctx, 2.6, 2.3, 0.32, 0.02);
  musicVerb.connect(music);
  const musicDelay = pingPong(ctx, music);
  return { ctx, out, sfx, sfxVerb, music, musicVerb, musicDelay };
}

export function unlockAudio() {
  if (AU.ctx) { if (AU.ctx.state === "suspended" && !document.hidden) AU.ctx.resume().catch(() => {}); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  let ctx;
  try { ctx = new C({ latencyHint: "interactive" }); } catch { try { ctx = new C(); } catch { return; } }
  AU.ctx = ctx;
  AU.bus = makeBus(ctx);
  applyVolumes(true);
  // 화면을 내리면 소리 엔진을 쉬게 함 (배터리·CPU 절약), 돌아오면 다시
  document.addEventListener("visibilitychange", () => { if (!AU.ctx) return; if (document.hidden) AU.ctx.suspend().catch(() => {}); else AU.ctx.resume().catch(() => {}); });
  notify();
}
// 슬라이더 값(0~1)은 귀에 맞게 제곱해서 씀
export function applyVolumes(now = false) {
  if (!AU.bus) return;
  const t = AU.ctx.currentTime, set = (p, v) => (now ? (p.value = v) : p.setTargetAtTime(v, t, 0.05));
  set(AU.bus.out.gain, AU.on ? 1 : 0);
  set(AU.bus.sfx.gain, 0.8 * AU.sfxVol * AU.sfxVol);
  set(AU.bus.music.gain, AU.bgmOn ? 0.42 * AU.bgmVol * AU.bgmVol : 0);
}
export function setSoundOn(v) { AU.on = !!v; put("abyss-sound", AU.on ? "1" : "0"); applyVolumes(); notify(); }
export function setBgmOn(v) { AU.bgmOn = !!v; put("abyss-bgm", AU.bgmOn ? "1" : "0"); applyVolumes(); notify(); }
export function setSfxVol(v) { AU.sfxVol = clamp01(v, AU.sfxVol); put("abyss-sfxvol", Math.round(AU.sfxVol * 100)); applyVolumes(); }
export function setBgmVol(v) { AU.bgmVol = clamp01(v, AU.bgmVol); put("abyss-bgmvol", Math.round(AU.bgmVol * 100)); applyVolumes(); notify(); }

// ── 악기 ────────────────────────────────────────────────
const noiseBufs = new WeakMap();
function noiseBuf(c) {
  let b = noiseBufs.get(c);
  if (!b) { const len = c.sampleRate; b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; noiseBufs.set(c, b); }
  return b;
}
const curves = new WeakMap();
/** 부드러운 찌그러뜨림 (타격음에 '단단함'을 더함) */
export function shaper(c, amt = 3) {
  const key = c; let m = curves.get(key); if (!m) curves.set(key, (m = {}));
  if (!m[amt]) { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * amt) / Math.tanh(amt); } m[amt] = cv; }
  const w = c.createWaveShaper(); w.curve = m[amt]; return w;
}
// 대부분의 높이·필터 변화는 128샘플마다 한 번 계산(k-rate)해도 귀로는 같고 CPU는 훨씬 덜 씀. FM 변조를 받는 음만 audio-rate
const K = (p) => { try { p.automationRate = "k-rate"; } catch {} return p; };
export function osc(c, type, f, t, stop, detune = 0, fm = false) {
  const o = c.createOscillator(); o.type = type; if (!fm) { K(o.frequency); K(o.detune); } o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.start(t); o.stop(stop); return o;
}
export function gainN(c, v = 0) { const g = c.createGain(); g.gain.value = v; return g; }
export function filt(c, type, f, q = 0.7) { const b = c.createBiquadFilter(); K(b.frequency); K(b.Q); K(b.gain); K(b.detune); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
export function noise(c, t, stop, rate = 1) {
  const s = c.createBufferSource(); s.buffer = noiseBuf(c); s.loop = true; s.playbackRate.value = rate;
  s.start(t, Math.random() * 0.9); s.stop(stop); return s;
}
/** 빠르게 붙고 지수로 사라지는 봉투 */
export function perc(g, t, a, peak, dec) {
  const p = g.gain; p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(Math.max(0.0002, peak), t + a); p.exponentialRampToValueAtTime(0.0001, t + a + dec);
  return t + a + dec + 0.02;
}
/** 붙고(a) 유지하다(hold) 사라짐(rel) */
export function adsr(g, t, a, peak, hold, rel) {
  const p = g.gain, pk = Math.max(0.0002, peak); p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(pk, t + a); p.setValueAtTime(pk, t + a + hold); p.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  return t + a + hold + rel + 0.02;
}
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const V = {
  // 뜯는 현 (류트·기타 느낌)
  pluck(d, t, f, dur, vel, o = {}) {
    const c = d.context, dec = o.decay ?? Math.max(0.28, Math.min(1.4, dur * 1.6)), end = t + dec + 0.06, br = o.bright ?? 6;
    const lp = filt(c, "lowpass", Math.min(12000, f * br), 1.4);
    lp.frequency.setValueAtTime(Math.min(12000, f * br), t); lp.frequency.exponentialRampToValueAtTime(Math.max(180, f * 1.1), t + dec * 0.75);
    osc(c, o.wave ?? "triangle", f, t, end).connect(lp);
    const s2 = gainN(c, 0.16); osc(c, "sawtooth", f, t, end, 6).connect(s2).connect(lp);
    const g = gainN(c); perc(g, t, 0.003, vel, dec); lp.connect(g).connect(d);
  },
  // 하프: 맑고 길게 울림
  harp(d, t, f, dur, vel, o = {}) {
    const c = d.context, dec = o.decay ?? 1.6, end = t + dec + 0.06;
    const g = gainN(c); perc(g, t, 0.004, vel, dec);
    osc(c, "sine", f, t, end).connect(g);
    const h = gainN(c); perc(h, t, 0.002, vel * 0.35, dec * 0.35); osc(c, "triangle", f * 2, t, end).connect(h).connect(d);
    g.connect(d);
  },
  // 종·별빛 (FM 합성)
  bell(d, t, f, dur, vel, o = {}) {
    const c = d.context, dec = o.decay ?? 1.8, end = t + dec + 0.06, ratio = o.ratio ?? 3.5;
    const car = osc(c, "sine", f, t, end, 0, true), mod = osc(c, "sine", f * ratio, t, end), mg = gainN(c);
    mg.gain.setValueAtTime(f * (o.index ?? 2.2), t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.04), t + dec * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = gainN(c); perc(g, t, 0.002, vel, dec); car.connect(g).connect(d);
    const g2 = gainN(c); perc(g2, t, 0.002, vel * 0.22, dec * 0.3); osc(c, "sine", f * 2.76, t, t + dec * 0.3 + 0.05).connect(g2).connect(d);
  },
  // 마림바·목금
  marimba(d, t, f, dur, vel, o = {}) {
    const c = d.context, dec = o.decay ?? 0.42, end = t + dec + 0.05;
    const g = gainN(c); perc(g, t, 0.002, vel, dec); osc(c, "sine", f, t, end).connect(g).connect(d);
    const g2 = gainN(c); perc(g2, t, 0.001, vel * 0.3, 0.05); osc(c, "sine", f * 3.98, t, t + 0.08).connect(g2).connect(d);
  },
  // 피리: 비브라토 + 숨소리
  flute(d, t, f, dur, vel, o = {}) {
    const c = d.context, rel = o.release ?? 0.18, end = t + dur + rel + 0.06;
    const o1 = osc(c, "sine", f, t, end), o2 = osc(c, "triangle", f, t, end, 3);
    const lfo = osc(c, "sine", 5.2, t, end), lg = gainN(c);
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.0065, t + Math.min(0.4, dur * 0.7));
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const g = gainN(c); adsr(g, t, o.attack ?? 0.06, vel, Math.max(0, dur - 0.06), rel);
    const g2 = gainN(c, 0.28); o2.connect(g2).connect(g); o1.connect(g); g.connect(d);
    if (o.breath !== false) { const bp = filt(c, "bandpass", Math.min(9000, f * 2.2), 2), ng = gainN(c); perc(ng, t, 0.02, vel * 0.14, 0.1); noise(c, t, t + 0.16).connect(bp).connect(ng).connect(d); }
  },
  // 금관: 필터가 열리며 '빠아' 하는 소리
  brass(d, t, f, dur, vel, o = {}) {
    const c = d.context, rel = o.release ?? 0.16, end = t + dur + rel + 0.06, br = o.bright ?? 5;
    const lp = filt(c, "lowpass", f * 1.2, 2.2);
    lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(Math.min(12000, f * br), t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(Math.min(9000, f * br * 0.5), t + 0.05 + Math.max(0.06, dur * 0.8));
    osc(c, "sawtooth", f, t, end, -7).connect(lp); osc(c, "sawtooth", f, t, end, 7).connect(lp);
    const g = gainN(c); adsr(g, t, o.attack ?? 0.03, vel * 0.45, Math.max(0, dur - 0.03), rel); lp.connect(g).connect(d);
  },
  // 합창 ('아'/'오' 모음 포먼트)
  choir(d, t, f, dur, vel, o = {}) {
    const c = d.context, att = o.attack ?? 0.35, rel = o.release ?? 0.7, end = t + dur + rel + 0.06;
    const src = gainN(c, 1);
    for (const dt of [-11, 0, 10]) osc(c, "sawtooth", f, t, end, dt).connect(src);
    const oo = o.vowel === "o", f1 = filt(c, "bandpass", oo ? 560 : 760, 5), f2 = filt(c, "bandpass", oo ? 860 : 1150, 6), sum = gainN(c, 1), g2 = gainN(c, 0.6);
    src.connect(f1).connect(sum); src.connect(f2).connect(g2).connect(sum);
    const g = gainN(c); adsr(g, t, att, vel * 1.6, Math.max(0, dur - att), rel); sum.connect(g).connect(d);
  },
  // 깔리는 화음 (현악·신스 패드)
  pad(d, t, f, dur, vel, o = {}) {
    const c = d.context, att = o.attack ?? 0.7, rel = o.release ?? 1.1, end = t + dur + rel + 0.06, w = o.wave ?? "sawtooth";
    const lp = filt(c, "lowpass", o.cutoff ?? 1500, 0.5);
    osc(c, w, f, t, end, -9).connect(lp); osc(c, w, f, t, end, 9).connect(lp);
    const g = gainN(c); adsr(g, t, att, vel * 0.42, Math.max(0, dur - att), rel); lp.connect(g).connect(d);
  },
  // 저음
  bass(d, t, f, dur, vel, o = {}) {
    const c = d.context, rel = o.release ?? 0.09, end = t + dur + rel + 0.06, g = gainN(c);
    adsr(g, t, 0.006, vel, Math.max(0, dur - 0.006), rel);
    if (o.wave === "saw") {
      const lp = filt(c, "lowpass", f * 8, 5); lp.frequency.setValueAtTime(f * 9, t); lp.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.16);
      osc(c, "sawtooth", f, t, end).connect(lp); const s = gainN(c, 0.6); osc(c, "sine", f, t, end).connect(s).connect(g); lp.connect(g);
    } else {
      osc(c, "sine", f, t, end).connect(g); const h = gainN(c, 0.18); osc(c, "triangle", f * 2, t, end).connect(h).connect(g);
    }
    g.connect(d);
  },
  // ── 타악기
  kick(d, t, vel) {
    const c = d.context, g = gainN(c), o = osc(c, "sine", 160, t, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14); perc(g, t, 0.002, vel, 0.32); o.connect(g).connect(d);
    const hp = filt(c, "highpass", 3000), ng = gainN(c); perc(ng, t, 0.001, vel * 0.18, 0.012); noise(c, t, t + 0.04).connect(hp).connect(ng).connect(d);
  },
  snare(d, t, vel) {
    const c = d.context, hp = filt(c, "highpass", 1300), g = gainN(c); perc(g, t, 0.001, vel * 0.6, 0.17); noise(c, t, t + 0.22).connect(hp).connect(g).connect(d);
    const o = osc(c, "triangle", 220, t, t + 0.12), g2 = gainN(c); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); perc(g2, t, 0.001, vel * 0.45, 0.08); o.connect(g2).connect(d);
  },
  hat(d, t, vel, open = false) {
    const c = d.context, hp = filt(c, "highpass", 7800), g = gainN(c); perc(g, t, 0.001, vel * 0.3, open ? 0.22 : 0.035); noise(c, t, t + (open ? 0.3 : 0.06)).connect(hp).connect(g).connect(d);
  },
  shaker(d, t, vel) {
    const c = d.context, bp = filt(c, "bandpass", 6200, 1.2), g = gainN(c); perc(g, t, 0.012, vel * 0.26, 0.055); noise(c, t, t + 0.09).connect(bp).connect(g).connect(d);
  },
  taiko(d, t, vel) {
    const c = d.context, o = osc(c, "sine", 98, t, t + 0.7), g = gainN(c);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.3); perc(g, t, 0.004, vel, 0.6); o.connect(g).connect(d);
    const lp = filt(c, "lowpass", 420), ng = gainN(c); perc(ng, t, 0.002, vel * 0.45, 0.13); noise(c, t, t + 0.18).connect(lp).connect(ng).connect(d);
  },
  tom(d, t, vel, f = 140) {
    const c = d.context, o = osc(c, "sine", f, t, t + 0.35), g = gainN(c); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.22); perc(g, t, 0.002, vel * 0.8, 0.26); o.connect(g).connect(d);
  },
  tick(d, t, vel) {
    const c = d.context, hp = filt(c, "highpass", 2200), g = gainN(c); perc(g, t, 0.001, vel * 0.16, 0.016); osc(c, "square", 2900, t, t + 0.03).connect(hp).connect(g).connect(d);
    const g2 = gainN(c); perc(g2, t, 0.001, vel * 0.1, 0.01); osc(c, "sine", 5300, t, t + 0.02).connect(g2).connect(d);
  },
  clap(d, t, vel) {
    const c = d.context, bp = filt(c, "bandpass", 1500, 1.1), g = gainN(c), p = g.gain;
    p.setValueAtTime(0.0001, t);
    for (const k of [0, 0.011, 0.022]) { p.setValueAtTime(vel * 0.5, t + k); p.exponentialRampToValueAtTime(0.02, t + k + 0.009); }
    p.setValueAtTime(vel * 0.45, t + 0.033); p.exponentialRampToValueAtTime(0.0001, t + 0.17);
    noise(c, t, t + 0.2).connect(bp).connect(g).connect(d);
  },
  crash(d, t, vel) {
    const c = d.context, hp = filt(c, "highpass", 4200), g = gainN(c); perc(g, t, 0.003, vel * 0.34, 1.5); noise(c, t, t + 1.6).connect(hp).connect(g).connect(d);
    const bp = filt(c, "bandpass", 9000, 2), g2 = gainN(c); perc(g2, t, 0.002, vel * 0.18, 0.6); noise(c, t, t + 0.7, 0.9).connect(bp).connect(g2).connect(d);
  },
  rim(d, t, vel) {
    const c = d.context, g = gainN(c); perc(g, t, 0.001, vel * 0.3, 0.03); osc(c, "triangle", 880, t, t + 0.05).connect(g).connect(d);
    const bp = filt(c, "bandpass", 2600, 3), ng = gainN(c); perc(ng, t, 0.001, vel * 0.25, 0.02); noise(c, t, t + 0.04).connect(bp).connect(ng).connect(d);
  },
  // 쓸어 올리는/내리는 잡음 (바람·휘두름)
  sweep(d, t, f0, f1, dur, vel, o = {}) {
    const c = d.context, bp = filt(c, o.type ?? "bandpass", f0, o.q ?? 1.2), g = gainN(c);
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    if (o.swell) adsr(g, t, dur * 0.5, vel, 0, dur * 0.5); else perc(g, t, o.attack ?? 0.01, vel, dur);
    noise(c, t, t + dur + 0.05, o.rate ?? 1).connect(bp).connect(g).connect(d);
  },
};

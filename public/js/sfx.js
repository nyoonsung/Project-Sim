// 효과음 설계: 한 소리 = 여러 겹(딱 하는 첫소리 + 묵직한 몸통 + 재질 + 잔향)
// 모든 함수는 (bus, 시각, 옵션, ...인자) 를 받아 실시간·오프라인 어디서든 같은 소리를 냄
import { V, osc, gainN, filt, noise, perc, shaper, panner } from "./audio.js";

const rp = (v = 0.07) => 1 + (Math.random() - 0.5) * 2 * v;
/** 출력: 좌우 위치(pan) + 잔향 보내기(wet) */
function out(b, o = {}, wet = 0, vol = 1) {
  const c = b.sfx.context, p = panner(c, o.pan ?? 0), g = gainN(c, vol * (o.vol ?? 1));
  g.connect(p); p.connect(b.sfx);
  if (wet) { const w = gainN(c, wet); p.connect(w).connect(b.sfxVerb); }
  return g;
}
/** 몸통 '쿵': 사인이 빠르게 내려가며 살짝 찌그러짐 */
function thump(d, t, f0, f1, dec, vel, drive = 2.5) {
  const c = d.context, o = osc(c, "sine", f0, t, t + dec + 0.06), g = gainN(c), sh = shaper(c, drive);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dec * 0.6); perc(g, t, 0.002, vel, dec); o.connect(sh).connect(g).connect(d);
}
/** 걸러 낸 잡음 한 번 */
function burst(d, t, type, f, q, dec, vel, a = 0.001) {
  const c = d.context, fl = filt(c, type, f, q), g = gainN(c); perc(g, t, a, vel, dec); noise(c, t, t + a + dec + 0.04).connect(fl).connect(g).connect(d);
}
/** 지지직 (전기): 톱니파 높이를 마구 바꿈 */
function zap(d, t, dur, vel, f = 1800) {
  const c = d.context, o = osc(c, "sawtooth", f, t, t + dur + 0.05), bp = filt(c, "bandpass", 2400, 0.8), g = gainN(c);
  for (let k = 1; k < 12; k++) o.frequency.setValueAtTime(f * (0.2 + Math.random() * 1.6), t + (dur * k) / 12);
  perc(g, t, 0.002, vel, dur); o.connect(bp).connect(g).connect(d);
}
/** 위로 휘는 소리 (마법 시전) */
function chirp(d, t, f0, f1, dur, vel) {
  const c = d.context, o = osc(c, "sine", f0, t, t + dur + 0.05, 0, true), m = osc(c, "sine", f0 * 2.5, t, t + dur + 0.05), mg = gainN(c, f0 * 0.8), g = gainN(c);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur); m.frequency.exponentialRampToValueAtTime(f1 * 2.5, t + dur);
  m.connect(mg).connect(o.frequency); perc(g, t, 0.01, vel, dur); o.connect(g).connect(d);
}
const pick = (a) => a[(Math.random() * a.length) | 0];

// ── 스킬 속성 층 (휘두르기·쏘기·시전 위에 얹음)
const ELEM = {
  fire(b, t, o, k) {
    const d = out(b, o, 0.15);
    V.sweep(d, t, 240, 2600, 0.32, 0.42 * k, { type: "lowpass", q: 0.9, attack: 0.04 });
    thump(d, t, 65, 120, 0.26, 0.28 * k, 3);
    for (let i = 0; i < 6; i++) burst(d, t + Math.random() * 0.34, "bandpass", 2400 + Math.random() * 2600, 2, 0.012, 0.13 * k);
  },
  ice(b, t, o, k) {
    const d = out(b, o, 0.45), notes = [2093, 2637, 3136, 3951].sort(() => Math.random() - 0.5).slice(0, 3);
    notes.forEach((f, i) => V.bell(d, t + i * 0.022, f * rp(0.01), 0.1, 0.05 * k, { decay: 0.75, ratio: 1.41, index: 1.2 }));
    burst(d, t, "highpass", 7000, 0.7, 0.2, 0.1 * k, 0.03);
    V.tick(d, t + 0.01, 0.8 * k);
  },
  bolt(b, t, o, k) {
    const d = out(b, o, 0.2);
    zap(d, t, 0.19, 0.2 * k);
    burst(d, t, "highpass", 1800, 0.7, 0.09, 0.5 * k);
    thump(d, t + 0.02, 90, 38, 0.32, 0.34 * k, 4);
  },
  holy(b, t, o, k) {
    const d = out(b, o, 0.6);
    for (const f of [523.3, 659.3, 784]) V.choir(d, t, f, 0.32, 0.06 * k, { attack: 0.03, release: 0.5 });
    V.bell(d, t + 0.02, 1568, 0.1, 0.06 * k, { decay: 1.1, ratio: 2, index: 1 });
    V.sweep(d, t, 3000, 8000, 0.4, 0.07 * k, { type: "highpass", swell: true });
  },
  shadow(b, t, o, k) {
    const d = out(b, o, 0.4);
    V.pad(d, t, 110, 0.22, 0.4 * k, { cutoff: 900, attack: 0.1, release: 0.3 });
    V.pad(d, t, 116.5, 0.22, 0.3 * k, { cutoff: 700, attack: 0.1, release: 0.3 });
    V.sweep(d, t, 200, 1400, 0.3, 0.3 * k, { type: "lowpass", swell: true });
    thump(d, t + 0.05, 70, 30, 0.32, 0.38 * k, 3);
  },
  nature(b, t, o, k) {
    const d = out(b, o, 0.2);
    V.marimba(d, t, 330 * rp(), 0.05, 0.22 * k); V.marimba(d, t + 0.035, 494 * rp(), 0.05, 0.16 * k);
    V.sweep(d, t, 900, 2200, 0.22, 0.2 * k, { q: 1.4 });
    for (let i = 0; i < 3; i++) { const tt = t + 0.05 + Math.random() * 0.2, c = d.context, s = osc(c, "sine", 300, tt, tt + 0.08), g = gainN(c); s.frequency.exponentialRampToValueAtTime(820, tt + 0.04); perc(g, tt, 0.002, 0.09 * k, 0.05); s.connect(g).connect(d); }
  },
  wind(b, t, o, k) {
    const d = out(b, o, 0.15);
    V.sweep(d, t, 700, 3200, 0.3, 0.34 * k, { q: 1.6, swell: true });
    V.sweep(d, t + 0.1, 3000, 900, 0.26, 0.15 * k, { q: 1.2 });
  },
  arcane(b, t, o, k) {
    const d = out(b, o, 0.5);
    chirp(d, t, 420, 1500, 0.2, 0.14 * k);
    [1568, 2093, 2637].sort(() => Math.random() - 0.5).forEach((f, i) => V.bell(d, t + 0.03 + i * 0.035, f, 0.1, 0.045 * k, { decay: 0.5, ratio: 2, index: 1 }));
    V.sweep(d, t, 5000, 9000, 0.26, 0.07 * k, { type: "highpass", swell: true });
  },
  earth(b, t, o, k) {
    const d = out(b, o, 0.12);
    thump(d, t, 92, 34, 0.32, 0.6 * k, 4);
    burst(d, t, "lowpass", 520, 0.8, 0.26, 0.42 * k);
  },
};

export const SFX = {
  /** 타격: flavor = slash(베기)·blunt(둔기·주먹)·pierce(화살)·arcane(마법)·holy·forge */
  hit(b, t, o, k = 1, flavor = "slash") {
    const d = out(b, o, 0.12), p = rp();
    burst(d, t, "highpass", 2600 * p, 0.7, 0.022, 0.5 * k);
    switch (flavor) {
      case "blunt": case "holy": case "forge":
        thump(d, t, 135 * p, 40, 0.17 * k, 0.78 * k, 3.5);
        burst(d, t, "lowpass", 720 * p, 0.8, 0.1, 0.44 * k);
        if (flavor === "forge") V.bell(d, t + 0.003, 880 * p, 0.1, 0.09 * k, { decay: 0.4, ratio: 2.4, index: 1.6 });
        if (flavor === "holy") V.bell(d, t + 0.01, 1568 * p, 0.1, 0.05 * k, { decay: 0.45, ratio: 2, index: 0.8 });
        break;
      case "pierce":
        thump(d, t, 330 * p, 90, 0.07, 0.48 * k);
        burst(d, t, "bandpass", 2100 * p, 1.5, 0.045, 0.32 * k);
        V.marimba(d, t, 520 * p, 0.05, 0.14 * k, { decay: 0.06 });
        break;
      case "arcane":
        thump(d, t, 240 * p, 60, 0.1, 0.48 * k);
        zap(d, t, 0.07, 0.1 * k, 2600);
        burst(d, t, "highpass", 6500, 0.7, 0.12, 0.14 * k);
        break;
      default: // slash
        thump(d, t, 178 * p, 55, 0.12 * k, 0.58 * k);
        burst(d, t, "bandpass", 1100 * p, 0.9, 0.07, 0.34 * k);
        V.bell(d, t + 0.004, 1900 * p, 0.1, 0.05 * k, { decay: 0.16, ratio: 2.71, index: 1.4 });
        V.sweep(d, t, 4500, 1500, 0.06, 0.1 * k, { q: 0.8 });
    }
  },
  crit(b, t, o, flavor) {
    SFX.hit(b, t, o, 1.25, flavor);
    const d = out(b, o, 0.35);
    V.bell(d, t + 0.006, 2637 * rp(0.02), 0.1, 0.15, { decay: 0.6, ratio: 1.5, index: 0.8 });
    thump(d, t, 95, 32, 0.36, 0.55, 3);
    V.sweep(d, t, 2200, 9000, 0.2, 0.12, { q: 0.9 });
  },
  kill(b, t, o) {
    const d = out(b, o, 0.3);
    thump(d, t, 210 * rp(), 34, 0.38, 0.7, 4);
    V.sweep(d, t, 1800, 300, 0.28, 0.3, { q: 0.8 });
    V.sweep(d, t + 0.04, 400, 2600, 0.45, 0.09, { q: 1.4, swell: true });
    V.bell(d, t + 0.06, 1318, 0.1, 0.045, { decay: 0.5, ratio: 2, index: 0.8 });
    V.bell(d, t + 0.11, 1976, 0.1, 0.04, { decay: 0.6, ratio: 2, index: 0.8 });
  },
  bosskill(b, t, o) {
    const d = out(b, o, 0.5);
    thump(d, t, 120, 24, 1.3, 1, 3);
    burst(d, t, "lowpass", 1400, 0.7, 1.6, 0.55, 0.004);
    V.crash(d, t, 0.9); V.taiko(d, t, 0.9); V.taiko(d, t + 0.2, 0.7);
    [261.6, 329.6, 392, 523.3].forEach((f, i) => V.brass(d, t + 0.18 + i * 0.06, f, 1.0 - i * 0.06, 0.26));
    [1046, 1318, 1568, 2093, 2637].forEach((f, i) => V.bell(d, t + 0.25 + i * 0.07, f, 0.1, 0.07, { decay: 1.2, ratio: 2, index: 1 }));
  },
  hurt(b, t, o) {
    const d = out(b, o, 0.05);
    thump(d, t, 195 * rp(), 70, 0.14, 0.52, 3);
    burst(d, t, "bandpass", 760, 0.9, 0.09, 0.3);
    const c = d.context, s = osc(c, "sawtooth", 230, t, t + 0.16), lp = filt(c, "lowpass", 900), g = gainN(c);
    s.frequency.exponentialRampToValueAtTime(105, t + 0.12); perc(g, t, 0.004, 0.12, 0.11); s.connect(lp).connect(g).connect(d);
  },
  swing(b, t, o, el) {
    const d = out(b, o, 0.08), p = rp(0.1);
    V.sweep(d, t, 600 * p, 3400 * p, 0.15, 0.3, { q: 1.1, attack: 0.035 });
    V.sweep(d, t, 300, 900, 0.12, 0.12, { type: "lowpass" });
    if (o.blade) V.bell(d, t + 0.02, 3100 * p, 0.1, 0.022, { decay: 0.15, ratio: 1.41, index: 0.6 });
    if (el && ELEM[el]) ELEM[el](b, t + 0.02, o, 0.5);
  },
  dash(b, t, o, el) {
    const d = out(b, o, 0.1);
    V.sweep(d, t, 280, 2800, 0.22, 0.34, { q: 1, attack: 0.03 });
    V.sweep(d, t, 5000, 9000, 0.2, 0.06, { type: "highpass" });
    thump(d, t, 70, 140, 0.16, 0.16, 2);
    if (el && ELEM[el]) ELEM[el](b, t + 0.03, o, 0.5);
  },
  shoot(b, t, o, el) {
    const d = out(b, o, 0.08), p = rp(0.05);
    V.pluck(d, t, 196 * p, 0.1, 0.3, { decay: 0.16, bright: 10 });
    const c = d.context, s = osc(c, "sine", 1100 * p, t, t + 0.1), g = gainN(c);
    s.frequency.exponentialRampToValueAtTime(260, t + 0.07); perc(g, t, 0.002, 0.1, 0.07); s.connect(g).connect(d);
    V.sweep(d, t + 0.01, 6000, 2500, 0.12, 0.12, { q: 0.7 });
    if (el && ELEM[el]) ELEM[el](b, t + 0.02, o, 0.5);
  },
  magic(b, t, o, el) { (ELEM[el] ?? ELEM.arcane)(b, t, o, 1); },
  coin(b, t, o) {
    const d = out(b, o, 0.25);
    V.bell(d, t, 1568, 0.1, 0.07, { decay: 0.35, ratio: 2, index: 0.9 });
    V.bell(d, t + 0.055, 2093, 0.1, 0.07, { decay: 0.45, ratio: 2, index: 0.9 });
  },
  item(b, t, o) {
    const d = out(b, o, 0.5);
    [1046, 1318, 1568, 2093].forEach((f, i) => V.bell(d, t + i * 0.045, f, 0.1, 0.06, { decay: 0.7, ratio: 2, index: 1 }));
    V.sweep(d, t, 4000, 10000, 0.5, 0.06, { type: "highpass", swell: true });
  },
  level(b, t, o) {
    const d = out(b, o, 0.55);
    [523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => V.bell(d, t + i * 0.05, f, 0.1, 0.06, { decay: 0.8, ratio: 2, index: 1 }));
    for (const f of [523.3, 659.3, 784, 1046.5]) V.brass(d, t + 0.32, f, 0.55, 0.2);
    V.crash(d, t + 0.32, 0.4); V.taiko(d, t + 0.32, 0.5);
  },
  potion(b, t, o) {
    const d = out(b, o, 0.3), c = d.context;
    for (const k of [0, 0.07, 0.14]) { const tt = t + k, s = osc(c, "sine", 280 * rp(0.15), tt, tt + 0.1), g = gainN(c); s.frequency.exponentialRampToValueAtTime(720, tt + 0.06); perc(g, tt, 0.003, 0.13, 0.06); s.connect(g).connect(d); }
    V.harp(d, t + 0.2, 1046.5, 0.3, 0.08, { decay: 0.8 }); V.harp(d, t + 0.26, 1318.5, 0.3, 0.07, { decay: 0.9 });
  },
  wave(b, t, o) {
    const d = out(b, o, 0.5);
    for (const f of [110, 164.8, 220]) V.brass(d, t, f, 0.9, 0.3, { attack: 0.15, bright: 4 });
    V.taiko(d, t, 0.8); V.taiko(d, t + 0.25, 0.65);
  },
  warn(b, t, o) {
    const d = out(b, o, 0.2), c = d.context;
    [[988, 0], [740, 0.1]].forEach(([f, k]) => { const s = osc(c, "triangle", f, t + k, t + k + 0.12), g = gainN(c); perc(g, t + k, 0.005, 0.12, 0.09); s.connect(g).connect(d); });
    thump(d, t, 90, 50, 0.2, 0.3);
  },
  notice(b, t, o) {
    const d = out(b, o, 0.3);
    V.bell(d, t, 1318.5, 0.1, 0.06, { decay: 0.5, ratio: 2, index: 0.8 }); V.bell(d, t + 0.07, 1760, 0.1, 0.06, { decay: 0.6, ratio: 2, index: 0.8 });
  },
  click(b, t, o) {
    const d = out(b, o, 0), c = d.context;
    const g = gainN(c); perc(g, t, 0.001, 0.05, 0.025); osc(c, "triangle", 1500, t, t + 0.04).connect(g).connect(d);
    const g2 = gainN(c); perc(g2, t, 0.001, 0.03, 0.015); osc(c, "sine", 2600, t, t + 0.03).connect(g2).connect(d);
  },
};

// 스킬 → 속성 (fx 경로의 접두어·motif·elem에서 가장 많이 나온 것)
const ELEM_OF = new Map();
const PREFIX = { fire: "fire", ice: "ice", lightning: "bolt", holy: "holy", shadow: "shadow", nature: "nature", arcane: "arcane" };
const MOTIF = { flame: "fire", meteor: "fire", dragon: "fire", forge: "earth", lightning: "bolt", holy: "holy", heart: "holy", moon: "holy", shadow: "shadow", smoke: "shadow", poison: "nature", vines: "nature", wind: "wind", rain: "ice", wave: "ice", rune: "arcane", orbit: "arcane", vortex: "arcane", impact: "earth" };
export function elemOf(sk) {
  if (!sk) return null;
  if (ELEM_OF.has(sk.id)) return ELEM_OF.get(sk.id);
  const cnt = {};
  const add = (e, n = 1) => { if (e) cnt[e] = (cnt[e] ?? 0) + n; };
  if (sk.elem) add(sk.elem === "bolt" ? "bolt" : sk.elem, 3);
  add(MOTIF[sk.motif], 2);
  try { for (const m of JSON.stringify(sk.fx ?? {}).matchAll(/"([a-z]+)\//g)) add(PREFIX[m[1]]); } catch {}
  let best = null, bn = 0;
  for (const [e, n] of Object.entries(cnt)) if (n > bn) { best = e; bn = n; }
  ELEM_OF.set(sk.id, best);
  return best;
}
export const SFX_NAMES = Object.keys(SFX);

// ── 효과음 녹음 재생 (CPU 절약)
// 처음 몇 번은 실시간 합성, 그동안 뒤에서 같은 소리를 3가지로 녹음해 두고 이후엔 녹음을 재생.
// 녹음은 [마른 소리, 잔향으로 보낼 소리] 두 채널 → 재생할 때 좌우 위치·잔향은 실시간으로 (공간감 유지)
// 실시간 합성은 소리 하나에 노드 20~40개, 녹음 재생은 5개.
const SC = new Map(); let scBytes = 0, scBusy = 0; const scJobs = [];
const VARIANTS = 3, SFX_RATE = 32000;
const SFX_LEN = { bosskill: 3.0, level: 2.0, wave: 1.4, item: 1.0, potion: 1.3, holy: 1.4 };
function scPump() {
  while (scBusy < 2 && scJobs.length) {
    const j = scJobs.shift(); scBusy++;
    let ctx;
    try {
      ctx = new OfflineAudioContext(2, Math.ceil(j.len * SFX_RATE), SFX_RATE);
      const merge = ctx.createChannelMerger(2);
      const mono = () => { const g = ctx.createGain(); g.channelCount = 1; g.channelCountMode = "explicit"; g.channelInterpretation = "speakers"; return g; };
      const dry = mono(), wet = mono();
      dry.connect(merge, 0, 0); wet.connect(merge, 0, 1); merge.connect(ctx.destination);
      SFX[j.name]({ sfx: dry, sfxVerb: wet }, 0, { ...j.o, pan: 0 }, ...j.a);
    } catch { scBusy--; j.e.busy = false; continue; }
    ctx.startRendering().then((buf) => {
      // 끝의 무음 잘라내기
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      let n = buf.length - 1; while (n > 0 && Math.abs(L[n]) < 2e-4 && Math.abs(R[n]) < 2e-4) n--;
      n = Math.min(buf.length, n + 64);
      const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: SFX_RATE });
      out.copyToChannel(L.subarray(0, n), 0); out.copyToChannel(R.subarray(0, n), 1);
      j.e.bufs.push(out); scBytes += n * 8;
    }).catch(() => {}).finally(() => { scBusy--; j.e.busy = false; scPump(); });
  }
}
let active = 0;
/** 효과음 재생: 녹음이 있으면 녹음, 없으면 실시간 합성 + 녹음 예약. 동시에 너무 많으면 가벼운 소리부터 생략 */
export function playSfx(b, name, t, o, a, key) {
  const light = name === "swing" || name === "hit" || name === "shoot" || name === "coin";
  if (active > (light ? 14 : 24)) return;
  let e = SC.get(key);
  if (!e) { if (scBytes > 24e6 || SC.size > 400) { SC.clear(); scBytes = 0; } SC.set(key, (e = { bufs: [], busy: false })); }
  if (e.bufs.length && (e.bufs.length >= VARIANTS || Math.random() < 0.7)) {
    const c = b.sfx.context, buf = e.bufs[(Math.random() * e.bufs.length) | 0];
    const s = c.createBufferSource(), sp = c.createChannelSplitter(2), g = gainN(c, o.vol ?? 1), p = panner(c, o.pan ?? 0), w = gainN(c, o.vol ?? 1);
    s.buffer = buf; s.playbackRate.value = 0.97 + Math.random() * 0.06;
    s.connect(sp); sp.connect(g, 0); sp.connect(w, 1); g.connect(p).connect(b.sfx); w.connect(b.sfxVerb);
    s.start(t);
    active++; s.onended = () => { active--; s.disconnect(); };
  } else {
    SFX[name](b, t, o, ...a);
    active++; setTimeout(() => active--, 400);
  }
  if (!e.busy && e.bufs.length < VARIANTS && typeof OfflineAudioContext !== "undefined") {
    e.busy = true;
    scJobs.push({ e, name, o, a, len: (SFX_LEN[name] ?? SFX_LEN[a.find((x) => typeof x === "string")] ?? 0.9) + 0.1 });
    scPump();
  }
}
/** 미리 녹음: [이름, 인자들, 옵션, 열쇠] 목록 (재생 없이 녹음만, 한가할 때) */
export function prewarmSfx(list) {
  if (typeof OfflineAudioContext === "undefined") return;
  for (const [name, a, o, key] of list) {
    if (!SFX[name]) continue;
    let e = SC.get(key);
    if (!e) SC.set(key, (e = { bufs: [], busy: false }));
    if (e.busy || e.bufs.length) continue;
    e.busy = true;
    scJobs.push({ e, name, o, a, len: (SFX_LEN[name] ?? SFX_LEN[a.find((x) => typeof x === "string")] ?? 0.9) + 0.1 });
  }
  scPump();
}
/** 검사용 */
export const sfxCacheStats = () => ({ keys: SC.size, bytes: scBytes, busy: scBusy, jobs: scJobs.length, active });

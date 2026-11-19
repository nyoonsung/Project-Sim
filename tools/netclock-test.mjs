// 다른 유닛 움직임 부드러움 시뮬레이션: 예전 방식(도착 시각 + 고정 0.1초) vs 새 방식(서버 시각 + 자동 여유)
//   node tools/netclock-test.mjs
// 서버: 0.05초마다 틱 (타이머 흔들림 + 시계 약간 느림), 유닛은 120px/s로 걷다가 가끔 멈춤
// 인터넷: 기본 지연 + 흔들림 + 가끔 큰 끊김(뒤 패킷까지 줄줄이 밀림). 화면: 60fps(프레임 간격 약간 흔들림)
import { makeClock } from "../public/js/netclock.js";

const TICK = 0.05, SPD = 120;
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function scenario({ base, jit, spikeP, spike, srvJit = 0.012, drift = 0.997 }) {
  // 유닛 경로: 3초 걷고 0.7초 멈춤 반복
  const posAt = (st) => { const c = st % 3.7; return SPD * (Math.floor(st / 3.7) * 3 + Math.min(c, 3)); };
  const packets = []; let lastArr = 0;
  for (let k = 1; k < 1200; k++) {
    const srvT = (k * TICK) / drift + rnd() * srvJit; // 실제 시각에 서버가 틱 k를 보냄
    let arr = srvT + base + rnd() * jit + (rnd() < spikeP ? spike * (0.5 + rnd()) : 0);
    arr = Math.max(arr, lastArr + 0.0005); lastArr = arr; // 순서 유지 (TCP)
    const prev = posAt((k - 1) * TICK), x = posAt(k * TICK);
    if (x !== prev || k % 40 === 0) packets.push({ k, x, arr }); // 서버는 바뀐 것만 보냄 (2초마다 전체)
  }
  return { packets, posAt };
}

function run(sc, mode) {
  const { packets, posAt } = sc;
  let t = 2, i = 0, lastFrame = t;
  const buf = []; let ex = 0;
  const clock = makeClock(TICK, () => t);
  const sp = [], lag = []; let prevX = null, prevT = null;
  while (t < 55) {
    t += 1 / 60 + (rnd() - 0.5) * 0.004;
    while (i < packets.length && packets[i].arr <= t) {
      const p = packets[i++];
      const stamp = mode === "old" ? p.arr : clock.onPacket(p.k, p.arr);
      // (게임 코드와 같은 규칙) 한동안 안 왔던 유닛은 직전 위치를 한 틱 전에 찍어 둠
      if (buf.length && stamp - buf.at(-1)[0] > 0.12) buf.push([stamp - (mode === "old" ? 0.05 : TICK), ex]);
      if (mode !== "old" && buf.length && stamp <= buf.at(-1)[0]) buf.pop();
      buf.push([stamp, p.x]); ex = p.x;
      if (buf.length > 12) buf.shift();
    }
    const dt = t - lastFrame; lastFrame = t;
    const rt = mode === "old" ? t - 0.1 : clock.renderTime(dt, t);
    let x = ex;
    if (buf.length >= 2 && rt >= buf[0][0]) {
      let j = buf.length - 2;
      while (j > 0 && buf[j][0] > rt) j--;
      const a = buf[j], c = buf[j + 1];
      const k = Math.max(0, Math.min(1, (rt - a[0]) / Math.max(1e-3, c[0] - a[0])));
      x = a[1] + (c[1] - a[1]) * k;
    }
    if (prevX != null && t > 6) {
      // 실제로 걷고 있던 구간만 평가 (멈춤 앞뒤 0.4초 제외)
      const st = (t - 0.2) * 0.997, c = st % 3.7;
      if (c > 0.4 && c < 2.6) { sp.push((x - prevX) / dt); lag.push((posAt(t * 0.997) - x) / SPD); }
    }
    prevX = x; prevT = t;
  }
  const n = sp.length, stall = sp.filter((v) => v < SPD * 0.4).length, jump = sp.filter((v) => v > SPD * 1.8).length;
  const dev = sp.reduce((a, v) => a + Math.abs(v - SPD), 0) / n / SPD;
  const L = lag.reduce((a, v) => a + v, 0) / lag.length;
  return { stall: stall / n, jump: jump / n, dev, lag: L };
}

const CASES = [
  { name: "안정 (유선)", base: 0.03, jit: 0.005, spikeP: 0, spike: 0 },
  { name: "보통 와이파이", base: 0.04, jit: 0.03, spikeP: 0.01, spike: 0.08 },
  { name: "불안정 와이파이", base: 0.05, jit: 0.07, spikeP: 0.02, spike: 0.15 },
  { name: "학교·카페 와이파이", base: 0.06, jit: 0.12, spikeP: 0.03, spike: 0.2 },
];
let fails = 0;
const pct = (x) => (x * 100).toFixed(1).padStart(5) + "%";
console.log("상황              | 방식 | 멈칫  | 튐    | 속도 오차 | 보이는 지연");
for (const c of CASES) {
  seed = 7; const sc = scenario(c);
  const o = run(sc, "old"), n = run(sc, "new");
  for (const [m, r] of [["예전", o], ["새것", n]]) console.log(`${c.name.padEnd(14)} | ${m} | ${pct(r.stall)} | ${pct(r.jump)} | ${pct(r.dev)}    | ${(r.lag * 1000).toFixed(0)}ms`);
  const bad = o.stall + o.jump, good = n.stall + n.jump;
  if (!(good <= bad + 0.002)) { fails++; console.log("  ✗ 새 방식이 더 끊김"); }
  if (c.jit <= 0.005 && n.lag > o.lag + 0.03) { fails++; console.log("  ✗ 안정적인 인터넷에서 지연이 너무 늘어남"); }
}
console.log(fails ? "FAIL" : "ALL PASS");
process.exit(fails ? 1 : 0);

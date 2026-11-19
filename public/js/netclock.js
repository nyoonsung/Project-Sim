// 서버 시계 맞추기 (재생 버퍼)
//  다른 유닛 위치를 '도착한 시각'이 아니라 '서버가 계산한 시각(틱 번호)'에 맞춰 이어 그림
//  → 인터넷이 들쭉날쭉해서 패킷이 몰려 오거나 늦게 와도 일정한 속도로 부드럽게 움직임 (대형 온라인 게임 방식)
//  여유 시간은 최근 4초 동안 실제로 얼마나 늦게 왔는지(상위 5%)를 재서 자동으로: 안정적이면 짧게(반응 빠름), 불안하면 길게(끊김 없음)
//  여유가 바뀔 때는 아주 천천히(재생 속도 ±5% 이내) 바꿔서 유닛이 갑자기 빨라지거나 멈칫하지 않게
export function makeClock(TICK_DT, now) {
  const C = { samples: [], target: null, P: null, delay: 0.1, n: 0 };
  C.reset = () => { C.samples.length = 0; C.target = null; C.P = null; };
  /** 스냅샷을 받을 때: 서버 틱 번호 → 서버 시각(초) */
  C.onPacket = (k, t = now()) => {
    const st = k * TICK_DT, s = t - st;
    if (C.target == null || Math.abs(s - C.target) > 1.5) { C.samples.length = 0; C.target = C.P = s + 0.1; }
    C.samples.push(s);
    if (C.samples.length > 80) C.samples.shift();
    if (++C.n % 4 === 0 || C.samples.length < 8) {
      // 최근 4초 중 가장 빨리 온 것 = 실제 최소 지연 (서버·내 시계가 조금씩 어긋나도 4초 안에 따라감)
      let lo = Infinity; for (const x of C.samples) if (x < lo) lo = x;
      const late = C.samples.map((x) => x - lo).sort((a, b) => a - b);
      const p95 = late[Math.floor(late.length * 0.95)] ?? 0;
      C.delay = Math.min(0.26, Math.max(0.065, TICK_DT + p95 + 0.012));
      C.target = lo + C.delay;
    }
    return st;
  };
  /** 매 프레임: 지금 화면에 그릴 서버 시각 */
  C.renderTime = (dt, t = now()) => {
    if (C.P == null) return -1e9;
    const d = C.target - C.P;
    if (Math.abs(d) > 0.3) C.P = C.target;
    else C.P += Math.max(-0.05 * dt, Math.min(0.05 * dt, d));
    return t - C.P;
  };
  return C;
}

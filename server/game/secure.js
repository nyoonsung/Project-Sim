// 보안 난수: 드롭·강화 확률은 예측 불가능한 난수(Web Crypto)로만 굴린다 (Node·브라우저 공용)
const buf = new Uint32Array(1024);
let pos = buf.length;
/** 0 이상 1 미만 (암호학적 난수) */
export function secureRandom() {
  if (pos >= buf.length) { globalThis.crypto.getRandomValues(buf); pos = 0; }
  return buf[pos++] / 4294967296;
}

// 보안 난수: 드롭·강화 확률은 예측 불가능한 난수로만 굴린다
import { randomBytes } from "node:crypto";

let pool = randomBytes(4096), pos = 0;
/** 0 이상 1 미만 (암호학적 난수) */
export function secureRandom() {
  if (pos + 4 > pool.length) { pool = randomBytes(4096); pos = 0; }
  const v = pool.readUInt32BE(pos);
  pos += 4;
  return v / 4294967296;
}

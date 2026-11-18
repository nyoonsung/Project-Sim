// 장비 내구도 닳기 (던전에서만). 정수 단위로 바뀔 때만 클라이언트에 알림
import { DUR_CAST, DUR_HIT, DUR_DEATH, SLOT_NAME } from "../../shared/items.js";
import { refreshStats } from "./player.js";

function wear(room, u, slot, amt) {
  const s = u.session, it = s?.char.equip[slot];
  if (!it || it.dur == null || it.dur <= 0 || !amt || it.ench === "mend") return false; // 수선 인챈트: 안 닳음
  const before = it.dur;
  it.dur = Math.max(0, +(it.dur - amt).toFixed(2));
  s.dirty = true;
  if (Math.floor(before) !== Math.floor(it.dur)) s.send({ t: "dur", uid: it.uid, dur: Math.floor(it.dur), max: it.maxDur });
  if (before > it.maxDur * 0.2 && it.dur <= it.maxDur * 0.2) s.notice(`${SLOT_NAME[slot]} 내구도가 20% 남았어요. 마을 대장장이에게 수선하세요.`);
  if (it.dur <= 0) { s.notice(`${SLOT_NAME[slot]}이(가) 부서졌어요! 능력치가 크게 줄어요. 대장장이에게 수선하세요.`); return true; }
  return false;
}
const inDungeon = (room) => room?.kind === "dungeon" && !room.map.safe;

/** 스킬을 쓸 때: 무기, 방패가 아닌 보조장비, 장신구 */
export function wearOnCast(room, u) {
  if (!inDungeon(room)) return;
  let broke = false;
  for (const [slot, amt] of Object.entries(DUR_CAST)) {
    if (slot === "offhand" && u.session.char.equip.offhand?.type === "shield") continue;
    broke = wear(room, u, slot, amt) || broke;
  }
  if (broke) { refreshStats(u); room.world.sendChar?.(u.session); }
}
/** 맞을 때: 갑옷, 투구, 방패 */
export function wearOnHit(room, u) {
  if (!inDungeon(room) || !u.session) return;
  let broke = false;
  for (const [slot, amt] of Object.entries(DUR_HIT)) {
    if (slot === "offhand" && u.session.char.equip.offhand?.type !== "shield") continue;
    broke = wear(room, u, slot, amt) || broke;
  }
  if (broke) { refreshStats(u); room.world.sendChar?.(u.session); }
}
/** 쓰러졌을 때: 장착한 장비 모두 최대치의 10% */
export function wearOnDeath(room, u) {
  if (room?.kind !== "dungeon" || !u.session) return;
  let broke = false;
  for (const [slot, it] of Object.entries(u.session.char.equip)) if (it?.dur > 0) broke = wear(room, u, slot, it.maxDur * DUR_DEATH) || broke;
  if (broke) refreshStats(u);
}

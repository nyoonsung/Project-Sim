// 모든 직업의 모든 스킬을 실제 서버 코드로 한 번씩 써 보고 오류를 잡는다
import { Room } from "../server/game/room.js";
import { makeFloor } from "../server/game/dungeon.js";
import { makePlayerUnit, newCharacter, refreshStats } from "../server/game/player.js";
import { SKILL_LIST } from "../shared/skills.js";
const stub = { pickup: () => true, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {} };
let errors = 0, used = 0;
for (const cls of ["adventurer", "sword", "fist", "archer", "rogue", "mage", "priest", "smith"]) {
  const list = SKILL_LIST.filter((s) => s.cls === cls || s.cls === "common");
  const map = makeFloor(20, 7, 1);
  const room = new Room(stub, { id: "s", kind: "dungeon", floor: 20, map });
  const ch = newCharacter("t"); ch.level = 120; ch.cls = cls;
  const sess = { userId: 1, role: "player", char: ch, send() {}, notice() {}, sendMe() {} };
  const u = makePlayerUnit(sess); sess.unit = u; refreshStats(u); u.hp = u.maxHp;
  room.addPlayer(u);
  // 플레이어 옆에 몬스터 배치
  const mons = [...room.units.values()].filter((m) => m.team === "m").slice(0, 6);
  mons.forEach((m, i) => { m.x = u.x + 40 + i * 6; m.y = u.y + (i - 3) * 8; m.aggro = true; });
  for (let i = 0; i < list.length; i += 8) {
    ch.skills = list.slice(i, i + 8).map((s) => s.id);
    while (ch.skills.length < 8) ch.skills.push(null);
    refreshStats(u);
    for (let s = 0; s < 8; s++) {
      const sk = list[i + s];
      if (!sk || sk.kind === "passive") continue;
      u.mp = u.maxMp; u.ki = 100; u.holy = 100; u.parts = 3; u.gap = 3; u.lockUntil = 0; u.cds.clear(); u.casting = null; u.dash = null; u.channel = null;
      u.status.clear();
      const t = mons.find((m) => !m.dead) ?? { x: u.x + 50, y: u.y };
      try {
        room.cast(u, { slot: s, ax: t.x, ay: t.y, tx: u.id });
        for (let k = 0; k < 60; k++) { room.pushInput(u, { s: k, mx: 0, my: 0, ax: t.x, ay: t.y }); room.tick(); room.flush?.call({ ...room, players: new Map() }); }
        used++;
      } catch (e) { errors++; console.log("✗", cls, sk.id, e.stack.split("\n").slice(0, 3).join(" | ")); }
      if (u.dead) { u.dead = false; u.hp = u.maxHp; }
    }
  }
}
console.log(errors ? `오류 ${errors}개` : `스킬 ${used}개 모두 정상 실행`);
process.exit(errors ? 1 : 0);

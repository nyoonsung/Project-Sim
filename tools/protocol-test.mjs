import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLIENT_MESSAGE_TYPES, validateClientMessage } from "../server/net.js";
import { newCharacter, sanitizeChar } from "../server/game/player.js";
import { World } from "../server/game/world.js";

const types = new Set(CLIENT_MESSAGE_TYPES);
const clientFiles = ["public/js/game.js", "public/js/main.js", "public/js/ui/hud.js", "public/js/ui/windows.js"];
const outbound = new Set();
for (const file of clientFiles) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  for (const match of source.matchAll(/send\(\s*\{\s*t:\s*["']([^"']+)["']/g)) outbound.add(match[1]);
}
for (const type of outbound) assert.ok(types.has(type), `클라이언트가 보내는 ${type} 메시지의 서버 검증기가 없음`);

for (const message of [
  { t: "sell", uid: "101" }, { t: "sellMany", uids: ["101", "102"] },
  { t: "equip", uid: "101" }, { t: "enhance", uid: "101" }, { t: "repair", uid: "101" },
  { t: "repair" }, { t: "enchant", uid: "101" }, { t: "mythicReroll", uid: "101" },
  { t: "specialReroll", uid: "101", index: 0 }, { t: "lock", uid: "101" },
  { t: "trade", op: "set", uids: ["101", "102"] }, { t: "trade", op: "set", uids: [] },
]) assert.equal(validateClientMessage(message), true, `문자열 UID 요청 거부: ${message.t}`);
for (const message of [
  { t: "sell", uid: "" }, { t: "sell", uid: "0" }, { t: "sell", uid: "-1" },
  { t: "sell", uid: "101abc" }, { t: "sell", uid: "2147483649" }, { t: "sell", uid: 1.5 },
  { t: "sellMany", uids: ["1", "nope"] }, { t: "trade", op: "set", uids: ["0"] },
]) assert.equal(validateClientMessage(message), false, `잘못된 UID 요청 통과: ${message.t}`);

const legacy = newCharacter("UIDTEST");
legacy.inv.push({ ...legacy.equip.weapon, uid: "3" }, { ...legacy.equip.offhand, uid: "3" });
const clean = sanitizeChar(legacy, "UIDTEST");
const allIds = [...Object.values(clean.equip), ...clean.inv].filter(Boolean).map((it) => it.uid);
assert.ok(allIds.every((uid) => Number.isInteger(uid) && uid >= 1), "문자열 UID 정규화");
assert.equal(new Set(allIds).size, allIds.length, "중복 UID 자동 교정");
assert.ok(clean.nextUid >= 1 && !allIds.includes(clean.nextUid), "nextUid 충돌 없음");

const char = newCharacter("EQUIPTEST");
char.inv.push({ ...char.equip.weapon, uid: "3", name: "테스트 무기" });
const notices = [];
const session = { char, notice: (message) => notices.push(message), userId: 1 };
const unit = { session, hp: 100, maxHp: 100, mp: 100, dead: false, room: null };
session.unit = unit;
World.prototype.equip.call({ sendChar() {} }, session, "3");
assert.equal(char.equip.weapon.uid, "3", "문자열 UID 장착 요청 처리");
assert.ok(char.inv.some((it) => it.uid === 1), "기존 장착 아이템 보존");

console.log(`PROTOCOL / UI ACTION TESTS: ALL PASS (${outbound.size} client message types)`);

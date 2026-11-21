import assert from "node:assert/strict";
import { sellPrice } from "../shared/items.js";
import { World } from "../server/game/world.js";

const notices = [];
let syncs = 0;
const world = {
  sendChar(session) {
    syncs++;
    session.sentGold = session.char.gold;
    session.sentInventory = session.char.inv.map((it) => it.uid);
  },
};
const session = (inv, gold = 0) => ({
  userId: 77,
  char: { inv, gold },
  notice: (message) => notices.push(message),
});

// 일반 단일 판매: 문자열 UID도 숫자 UID와 일치해야 한다.
{
  const item = { uid: 101, name: "낡은 검", rarity: "일반", ilvl: 10, enh: 0 };
  const s = session([item], 25);
  const price = sellPrice(item);
  World.prototype.sell.call(world, s, "101");
  assert.equal(s.char.inv.length, 0);
  assert.equal(s.char.gold, 25 + price);
  assert.deepEqual(s.sentInventory, []);
  assert.equal(s.sentGold, 25 + price);
  assert.match(notices.at(-1), /팔았어요/);
}

// 오래된 저장 데이터에서 ilvl/enh가 빠져도 골드가 NaN이 되지 않고 판매된다.
{
  const legacy = { uid: 102, name: "옛 장비", rarity: "일반" };
  assert.ok(Number.isFinite(sellPrice(legacy)) && sellPrice(legacy) > 0);
  const s = session([legacy], 0);
  World.prototype.sell.call(world, s, 102);
  assert.equal(s.char.inv.length, 0);
  assert.equal(Number.isFinite(s.char.gold), true);
  assert.equal(s.char.gold, sellPrice(legacy));
}

// 잠긴 아이템은 골드·인벤토리를 변경하지 않는다.
{
  const item = { uid: 103, rarity: "일반", ilvl: 10, enh: 0, locked: true };
  const s = session([item], 50);
  World.prototype.sell.call(world, s, 103);
  assert.equal(s.char.inv.length, 1);
  assert.equal(s.char.gold, 50);
  assert.match(notices.at(-1), /잠긴 아이템/);
}

// 오래되거나 이미 팔린 UID는 조용히 실패하지 않고 사용자에게 알려 준다.
{
  const s = session([], 10);
  World.prototype.sell.call(world, s, 999);
  assert.equal(s.char.gold, 10);
  assert.match(notices.at(-1), /찾지 못했어요/);
}

// 일괄 판매: 숫자/문자열 UID 혼용, 중복, 없는 UID, 잠금 아이템을 안전하게 처리.
{
  const items = [
    { uid: 201, rarity: "일반", ilvl: 4, enh: 0 },
    { uid: 202, rarity: "희귀", ilvl: 8, enh: 2 },
    { uid: 203, rarity: "일반", ilvl: 3, enh: 0, locked: true },
  ];
  const s = session(items.slice(), 100);
  const expected = sellPrice(items[0]) + sellPrice(items[1]);
  World.prototype.sellMany.call(world, s, ["201", 202, 202, 999, "203"]);
  assert.deepEqual(s.char.inv.map((it) => it.uid), [203]);
  assert.equal(s.char.gold, 100 + expected);
  assert.match(notices.at(-1), /2개를/);
  assert.match(notices.at(-1), /잠긴 1개 제외/);
}

// 잘못된 일괄 요청도 예외를 내지 않고 다시 선택하라는 안내를 준다.
{
  const s = session([{ uid: 301, rarity: "일반", ilvl: 1, enh: 0 }], 0);
  World.prototype.sellMany.call(world, s, null);
  assert.equal(s.char.inv.length, 1);
  assert.match(notices.at(-1), /다시 선택/);
}

console.log("ITEM SELL TESTS: ALL PASS");

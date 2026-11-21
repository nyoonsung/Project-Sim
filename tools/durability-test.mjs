import assert from "node:assert/strict";
import {
  DURABILITY_VERSION, RARITIES, ensureDur, maxDurability, makeItem, rollItem, starterGear,
  MYTHIC_EFFECTS, ABYSS_EFFECTS, rollMythicEffect, rollAbyssEffect, specialRerollCost, ensureAbyss, rollAbyssRelic,
} from "../shared/items.js";

const expected = [450, 540, 630, 720, 1080, 1200];
for (let i = 0; i < RARITIES.length; i++) {
  const item = { slot: "weapon", rarity: RARITIES[i] };
  assert.equal(maxDurability(item), expected[i], `${RARITIES[i]} max durability`);
}

// Legacy equipment gets upgraded once while retaining its remaining durability percentage.
for (let i = 0; i < RARITIES.length; i++) {
  const oldMax = 100 + i * 20;
  const item = { slot: "weapon", rarity: RARITIES[i], dur: oldMax * 0.4, maxDur: oldMax };
  ensureDur(item);
  assert.equal(item.maxDur, expected[i]);
  assert.equal(item.dur, expected[i] * 0.4);
  assert.equal(item.durV, DURABILITY_VERSION);
  ensureDur(item);
  assert.equal(item.maxDur, expected[i], "migration must not multiply durability twice");
  assert.equal(item.dur, expected[i] * 0.4);
}


// V2 items (the immediately previous 3x/4x durability) retain their remaining percentage.
const previousV2 = [300, 360, 420, 480, 720, 800];
for (let i = 0; i < RARITIES.length; i++) {
  const item = { slot: "armor", rarity: RARITIES[i], dur: previousV2[i] * 0.4, maxDur: previousV2[i], durV: 2 };
  ensureDur(item);
  assert.equal(item.maxDur, expected[i]);
  assert.equal(item.dur, expected[i] * 0.4);
  assert.equal(item.durV, DURABILITY_VERSION);
}

// A broken legacy item remains broken after the migration.
const broken = { slot: "armor", rarity: "신화", dur: 0, maxDur: 180 };
ensureDur(broken);
assert.equal(broken.maxDur, 1080);
assert.equal(broken.dur, 0);

// Newly created, admin-created, and starter equipment all use the new values.
const rolled = rollItem(() => 0.99, { ilvl: 100, cls: "sword", rarity: "신화" });
const made = makeItem({ slot: "weapon", type: "sword", rarity: "신화", ilvl: 100 });
const rolledAbyss = rollItem(() => 0.99, { ilvl: 100, cls: "sword", rarity: "심연" });
const madeAbyss = makeItem({ slot: "weapon", type: "sword", rarity: "심연", ilvl: 100 });
assert.equal(rolled.maxDur, 1080);
assert.equal(made.maxDur, 1080);
assert.equal(rolledAbyss.maxDur, 1200);
assert.equal(madeAbyss.maxDur, 1200);
assert.equal(rolledAbyss.abyssEffects.length, 2);
assert.equal(madeAbyss.abyssEffects.length, 2);
assert.equal(rolledAbyss.opts.length, 5);
assert.equal(madeAbyss.opts.length, 5);
for (const item of Object.values(starterGear())) assert.equal(item.maxDur, expected[0]);

// Every mythic item and each of an abyss item's two effects can be rerolled independently.
const mythicKeys = Object.keys(MYTHIC_EFFECTS);
for (const current of mythicKeys) {
  for (const randomValue of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
    const next = rollMythicEffect(() => randomValue, current);
    assert.ok(MYTHIC_EFFECTS[next], "mythic reroll must return a valid effect");
    assert.notEqual(next, current, "mythic reroll must not keep the current effect");
  }
}
const abyssKeys = Object.keys(ABYSS_EFFECTS);
for (const current of abyssKeys) {
  for (const other of abyssKeys.filter((key) => key !== current)) {
    for (const randomValue of [0, 0.3, 0.6, 0.999]) {
      const next = rollAbyssEffect(() => randomValue, current, other);
      assert.ok(ABYSS_EFFECTS[next], "abyss reroll must return a valid effect");
      assert.notEqual(next, current, "abyss reroll must not keep the selected effect");
      assert.notEqual(next, other, "abyss reroll must not duplicate the other effect");
    }
  }
}
assert.equal(specialRerollCost({ rarity: "신화", ilvl: 1 }), 10_000);
assert.equal(specialRerollCost({ rarity: "신화", ilvl: 100 }), 50_000);
assert.equal(specialRerollCost({ rarity: "심연", ilvl: 1 }), 10_000);
assert.equal(specialRerollCost({ rarity: "심연", ilvl: 150 }), 50_000);
assert.ok(specialRerollCost({ rarity: "심연", ilvl: 75 }) >= 10_000 && specialRerollCost({ rarity: "심연", ilvl: 75 }) <= 50_000);
assert.equal(specialRerollCost({ rarity: "심연", ilvl: 999 }), 50_000, "abyss reroll cost clamps to the level 150 maximum");

// Fixed abyss relics must preserve a valid rerolled effect across character sanitization.
{
  const relic = rollAbyssRelic(() => 0, { ilvl: 50, cls: "adventurer" });
  const [originalA, originalB] = relic.abyssEffects;
  const replacement = Object.keys(ABYSS_EFFECTS).find((key) => key !== originalA && key !== originalB);
  relic.abyssEffects[0] = replacement;
  ensureAbyss(relic);
  assert.equal(relic.abyssEffects[0], replacement, "relic rerolls must survive login migration");
  assert.equal(relic.abyssEffects[1], originalB, "the other relic effect must stay unchanged");
}

// Exercise the actual server handler for every slot and rarity.
{
  const { World } = await import("../server/game/world.js");
  const { SLOTS } = await import("../shared/items.js");
  let testUid = 7000;
  const makeSession = (item, gold = 1_000_000) => {
    const sent = [], notices = [];
    item.uid = testUid++;
    const session = {
      userId: 123, name: "reroll-test", char: { gold, inv: [item], equip: {} },
      unit: { x: 0, y: 0, room: { ev() {} } }, dirty: false,
      send: (msg) => sent.push(msg), notice: (msg) => notices.push(msg),
    };
    return { session, sent, notices };
  };
  const fakeWorld = {
    nearNpc: (_s, id) => id === "enchanter",
    sendChar(s) { s.dirty = true; },
    save(s) { s.dirty = false; },
  };
  for (const slot of SLOTS) {
    const type = slot === "weapon" ? "sword" : slot === "offhand" ? "shield" : undefined;
    const item = makeItem({ slot, type, rarity: "신화", ilvl: 40 });
    const { session, sent, notices } = makeSession(item);
    const before = item.mythic, gold = session.char.gold;
    World.prototype.rerollSpecial.call(fakeWorld, session, item.uid, 0);
    assert.notEqual(item.mythic, before, `mythic ${slot} effect changes`);
    assert.ok(session.char.gold < gold, `mythic ${slot} reroll deducts gold`);
    assert.equal(sent.at(-1)?.t, "specialReroll", `mythic ${slot} result is returned`);
    assert.equal(notices.length, 0, `mythic ${slot} has no server rejection`);
  }
  for (const slot of SLOTS) {
    const type = slot === "weapon" ? "sword" : slot === "offhand" ? "shield" : undefined;
    const item = makeItem({ slot, type, rarity: "심연", ilvl: 60 });
    const { session, sent, notices } = makeSession(item);
    const before = [...item.abyssEffects], gold = session.char.gold;
    World.prototype.rerollSpecial.call(fakeWorld, session, item.uid, 0);
    assert.notEqual(item.abyssEffects[0], before[0], `abyss ${slot} first effect changes`);
    assert.equal(item.abyssEffects[1], before[1], `abyss ${slot} second effect stays unchanged`);
    const first = item.abyssEffects[0];
    World.prototype.rerollSpecial.call(fakeWorld, session, item.uid, 1);
    assert.notEqual(item.abyssEffects[1], before[1], `abyss ${slot} second effect changes`);
    assert.equal(item.abyssEffects[0], first, `abyss ${slot} first effect stays unchanged`);
    assert.ok(session.char.gold < gold, `abyss ${slot} rerolls deduct gold`);
    assert.equal(sent.at(-1)?.t, "specialReroll", `abyss ${slot} result is returned`);
    assert.equal(notices.length, 0, `abyss ${slot} has no server rejection`);
  }
}

console.log("DURABILITY & SPECIAL EFFECT REROLL TESTS: ALL PASS");

import assert from "node:assert/strict";
import { World } from "../server/game/world.js";
import { makePlayerUnit, newCharacter } from "../server/game/player.js";
import { validateClientMessage } from "../server/net.js";

assert.equal(validateClientMessage({ t: "stat", key: "str2", n: 27 }), true);
assert.equal(validateClientMessage({ t: "stat", key: "str2", n: 1_000_000 }), true);
assert.equal(validateClientMessage({ t: "stat", key: "str2", n: 0 }), false);
assert.equal(validateClientMessage({ t: "stat", key: "str2", n: -1 }), false);
assert.equal(validateClientMessage({ t: "stat", key: "str2", n: 1.5 }), false);

const char = newCharacter("StatTester");
char.cls = "sword";
char.unspent = 17;
const session = { userId: 1, name: "StatTester", char };
session.unit = makePlayerUnit(session);
let refreshes = 0;
const world = { sendChar: () => { refreshes++; } };

World.prototype.addStat.call(world, session, "str2", 6);
assert.equal(char.stats.str2, 6);
assert.equal(char.unspent, 11);
World.prototype.addStat.call(world, session, "int2", 50);
assert.equal(char.stats.int2, undefined, "stats from other classes must not be allocated");
assert.equal(char.unspent, 11);
World.prototype.addStat.call(world, session, "str2", 50);
assert.equal(char.stats.str2, 17, "a request larger than the remaining points is safely clamped");
assert.equal(char.unspent, 0);
assert.equal(refreshes, 2);
console.log("STAT ALLOCATION TESTS: ALL PASS");

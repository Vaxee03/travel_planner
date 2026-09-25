import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSettlement } from "../src/lib/settlement.js";

const members = ["a", "b", "c"];

test("one payer, split evenly among everyone", () => {
  const { transfers } = computeSettlement([{ amount: 30000, paidBy: "a" }], members);
  assert.deepEqual(transfers, [
    { from: "b", to: "a", amount: 10000 },
    { from: "c", to: "a", amount: 10000 },
  ]);
});

test("payments cancel out across items", () => {
  const { transfers } = computeSettlement([
    { amount: 30000, paidBy: "a" },
    { amount: 30000, paidBy: "b" },
    { amount: 30000, paidBy: "c" },
  ], members);
  assert.deepEqual(transfers, []);
});

test("splitAmong limits who shares a cost", () => {
  const { transfers } = computeSettlement([{ amount: 20000, paidBy: "a", splitAmong: ["a", "b"] }], members);
  assert.deepEqual(transfers, [{ from: "b", to: "a", amount: 10000 }]);
});

test("uneven amounts still add up to the won", () => {
  const { transfers, balance } = computeSettlement([{ amount: 10000, paidBy: "a" }], members);
  const total = Object.values(balance).reduce((s, v) => s + v, 0);
  assert.equal(total, 0);
  assert.equal(transfers.reduce((s, t) => s + t.amount, 0), 10000 - 3334);
});

test("items without a payer are skipped and counted", () => {
  const { transfers, unassigned } = computeSettlement([{ amount: 5000 }, { amount: 9000, paidBy: "b" }], members);
  assert.equal(unassigned, 1);
  assert.equal(transfers.length, 2);
});

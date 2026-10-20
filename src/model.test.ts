import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionCost,
  project,
  actionsForPlan,
  recommend,
  type Action,
} from "./model";
import { demoContext } from "./contracts";

const hire: Action = {
  id: "hire",
  name: "Test hire",
  kind: "hire",
  annualCost: 12_000,
  setupCost: 2_000,
  startMonth: 3,
  enabled: true,
  why: "",
  success: "",
};

test("a delayed hire includes overhead and setup once, without replacing existing burn", () => {
  const result = project({
    snapshot: { cash: 120_000, netBurn: 5_000 },
    context: demoContext,
    actions: [hire],
  });
  assert.equal(actionCost(hire, demoContext), 14_000);
  assert.equal(result.points[2]?.cash, 110_000);
  assert.equal(result.points[3]?.cash, 101_800);
  assert.equal(result.cashAfter12, 46_000);
  assert.equal(result.annualAllocation, 14_000);
  assert.ok(
    result.runway !== null &&
      Math.abs(result.runway - (12 + 46_000 / 6_200)) < 0.001,
  );
});

test("capital spending hits once and does not become a monthly salary", () => {
  const action: Action = {
    ...hire,
    kind: "capital",
    annualCost: 0,
    setupCost: 20_000,
    startMonth: 2,
  };
  const result = project({
    snapshot: { cash: 100_000, netBurn: 0 },
    context: demoContext,
    actions: [action],
  });
  assert.equal(result.cashAfter12, 80_000);
  assert.equal(result.recurringCost, 0);
  assert.equal(result.runway, null);
});

test("a net inflow does not fabricate a cash-zero date", () => {
  const result = project({
    snapshot: { cash: 100_000, netBurn: -3_000 },
    context: demoContext,
    actions: [],
  });
  assert.equal(result.runway, null);
  assert.equal(result.cashAfter12, 136_000);
});

test("a long finite runway is not shown as unlimited", () => {
  const result = project({
    snapshot: { cash: 1_000_000, netBurn: 1_000 },
    context: demoContext,
    actions: [],
  });
  assert.equal(result.runway, 1_000);
});

test("revenue upside changes only months after the stated start", () => {
  const result = project({
    snapshot: { cash: 100_000, netBurn: 10_000 },
    context: demoContext,
    actions: [],
    upside: 2_000,
    upsideStart: 6,
  });
  assert.equal(result.points[5]?.cash, 50_000);
  assert.equal(result.points[6]?.cash, 42_000);
  assert.equal(result.cashAfter12, -6_000);
});

test("an unaffordable hiring plan falls back to no new commitments", () => {
  const context = { ...demoContext, budget: 1_000 };
  const snapshot = { cash: 700_000, netBurn: 10_000 };
  const result = recommend(context, snapshot);
  assert.equal(result.plan, "lean");
  assert.equal(
    project({ snapshot, context, actions: actionsForPlan(result.plan) })
      .annualAllocation,
    0,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoves, whyForYou } from "./signals";
import type { LiveFlag } from "./contracts";
import { demoContext, snapshotSchema } from "./contracts";
const snapshot = snapshotSchema.parse({
  source: "seapoint",
  organisation: { id: "test-org", name: "Test organisation" },
  fetchedAt: "2026-10-23T12:00:00Z",
  currency: "GBP",
  period: {
    start: "2026-09-01",
    end: "2026-10-01",
    label: "Sept 2026",
    months: 1,
  },
  cash: 1000000,
  grossBurn: 60000,
  revenue: 10000,
  netBurn: 50000,
  transactionCount: 100,
  comparison: {
    label: "Aug 2026",
    netBurn: 50000,
    transactionCount: 90,
    complete: true,
  },
  accounts: [
    {
      id: "bank",
      name: "Test bank",
      currency: "GBP",
      nativeBalance: 100000,
      available: 100000,
      institution: "Test",
      kind: "BANKING",
      amount: 100000,
    },
  ],
  latestTransactionDate: "2026-10-23",
  supplierBills: [],
  spending: [],
  unpaidInvoices: 0,
  unpaidInvoiceCount: 0,
  payroll: null,
  warnings: [],
});

function flag(id: string, rag: LiveFlag["rag"]): LiveFlag {
  const horizon = rag === "red" ? "today" : rag === "amber" ? "week" : "month";
  return {
    id,
    rag,
    horizon,
    title: id,
    headline: `${id} headline`,
    metric: "metric",
    detail: [],
    decision: "decide",
    action: { kind: "review_spend", label: "Review" },
    source: "Seapoint",
  };
}

test("moves keep live flags, add runway, and sort red first", () => {
  const moves = buildMoves(
    [flag("idle-cash", "amber"), flag("overdue-bills", "red")],
    snapshot,
    demoContext,
    "lean",
  );
  assert.deepEqual(
    moves.map((m) => `${m.rag}:${m.horizon}:${m.id}`),
    ["red:today:overdue-bills", "amber:week:idle-cash", "green:month:runway"],
  );
  assert.equal(moves.at(-1)!.title, "Runway");
});

test("every move names the business context it depends on", () => {
  const context = { ...demoContext, bufferMonths: 6, minimumRunway: 18 };
  assert.match(whyForYou("idle-cash", context), /6-month cash buffer/);
  assert.match(whyForYou("spending-trend", context), /18 months/);
  assert.match(whyForYou("late-customer", context), /win 10 new retail customers/);
});

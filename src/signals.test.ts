import { test } from "node:test";
import assert from "node:assert/strict";
import { burnRating, buildSignals } from "./signals";
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
test("burn ratings distinguish thresholds, missing evidence and a move from inflow to burn", () => {
  assert.equal(burnRating(110000, 100000, true), "green");
  assert.equal(burnRating(120000, 100000, true), "amber");
  assert.equal(burnRating(121000, 100000, true), "red");
  assert.equal(burnRating(5000, -100, true), "red");
  assert.equal(burnRating(0, null, true), "amber");
  assert.equal(burnRating(1000, 1000, false), "amber");
});
test("the room has exactly six signals, sorts urgency and identifies invented financial stories", () => {
  const signals = buildSignals(snapshot, demoContext, "growth", "2026-10-23");
  assert.equal(signals.length, 6);
  assert.deepEqual(
    signals.map((s) => s.rating),
    ["red", "red", "amber", "amber", "green", "green"],
  );
  for (const id of ["payroll", "collections", "fx", "unusual"])
    assert.equal(signals.find((s) => s.id === id)?.source, "Demo");
  assert.equal(signals.find((s) => s.id === "burn")?.source, "Seapoint");
  assert.equal(signals.find((s) => s.id === "runway")?.source, "Model");
});
test("missing trend evidence cannot produce a green burn flag", () => {
  const burn = buildSignals(
    { ...snapshot, comparison: null },
    demoContext,
    "growth",
    "2026-10-23",
  ).find((s) => s.id === "burn");
  assert.equal(burn?.rating, "amber");
  assert.equal(burn?.metricLabel, "comparison unavailable");
});

test("the observed unusual-spend flag replaces its fixture without changing the six-tile contract", () => {
  const flags = buildSignals(snapshot, demoContext, "growth", "2026-10-23", [
    {
      id: "odd-spend",
      rag: "amber",
      headline: "Software 2.5× usual",
      metric: "£10k in September",
      detail: ["Test historical category comparison"],
      source: "Seapoint test evidence",
    },
  ]);
  const unusual = flags.find((flag) => flag.id === "unusual");
  assert.equal(flags.length, 6);
  assert.equal(unusual?.source, "Seapoint");
  assert.equal(unusual?.metric, "2.5×");
  assert.equal(unusual?.metricLabel, "£10k in September");
  assert.ok(unusual?.evidence.includes("Test historical category comparison"));
  assert.ok(!unusual?.actions[0]?.preparation.includes("£1,800"));
});

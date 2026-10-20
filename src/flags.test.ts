import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFlags,
  currencyExposure,
  idleCash,
  lateCustomer,
  oddSpend,
  overdueBills,
  spendingTrend,
  spendMonths,
  type FlagInputs,
} from "./flags";

function input(overrides: Partial<FlagInputs> = {}): FlagInputs {
  return {
    today: "2026-10-20",
    currency: "GBP",
    accounts: [
      { id: "hsbc", name: "HSBC Business Current", type: "BANKING", currency: "GBP", balance: 486_320, reporting: 486_320, rate: 1, netYieldPct: null },
      { id: "modulr", name: "Northstar Modulr GBP", type: "BANKING", currency: "GBP", balance: 565_400, reporting: 565_400, rate: 1, netYieldPct: null },
      { id: "eur", name: "Northstar Modulr EUR", type: "BANKING", currency: "EUR", balance: 168_400, reporting: 141_880, rate: 0.8425, netYieldPct: null },
      { id: "tsy", name: "Northstar Treasury", type: "INVESTMENT", currency: "GBP", balance: 1_200_687, reporting: 1_200_687, rate: 1, netYieldPct: 3.42 },
    ],
    unpaidBills: [
      { vendor: "Snowflake", reference: "SNF-10", amount: 21_800, currency: "GBP", due: "2026-09-15" },
      { vendor: "Deel", reference: "DEEL-11", amount: 18_640, currency: "GBP", due: "2026-10-30" },
      { vendor: "Paris studio", reference: "PS-1", amount: 9_000, currency: "EUR", due: "2026-10-19" },
      { vendor: "US tool", reference: "US-1", amount: 1_300, currency: "USD", due: "2026-10-10" },
    ],
    monthlySpend: [
      { month: "2026-06-01", total: 135_711 },
      { month: "2026-07-01", total: 124_806 },
      { month: "2026-08-01", total: 137_026 },
      { month: "2026-09-01", total: 162_334 },
    ],
    categorySpend: [
      { category: "Software", month: "2026-06-01", total: 4_500, count: 7 },
      { category: "Software", month: "2026-07-01", total: 4_824, count: 8 },
      { category: "Software", month: "2026-08-01", total: 4_500, count: 7 },
      { category: "Software", month: "2026-09-01", total: 8_848, count: 14 },
      { category: "Meals", month: "2026-06-01", total: 2_350, count: 1 },
      { category: "Meals", month: "2026-07-01", total: 2_350, count: 1 },
      { category: "Meals", month: "2026-08-01", total: 2_350, count: 1 },
      { category: "Meals", month: "2026-09-01", total: 6_750, count: 3 },
    ],
    credits: [
      { payer: "Cormorant Systems", date: "2026-02-18", amount: 7_100 },
      { payer: "Cormorant Systems", date: "2026-04-18", amount: 6_200 },
      { payer: "Cormorant Systems", date: "2026-06-18", amount: 5_300 },
      { payer: "Cormorant Systems", date: "2026-08-18", amount: 4_400 },
      { payer: "Delta Consulting", date: "2026-08-10", amount: 3_360 },
      { payer: "Delta Consulting", date: "2026-09-10", amount: 3_360 },
      { payer: "Delta Consulting", date: "2026-10-10", amount: 3_360 },
    ],
    ...overrides,
  };
}

test("spend months are the last complete month and the three before", () => {
  assert.deepEqual(spendMonths("2026-10-20"), [
    "2026-09-01",
    "2026-08-01",
    "2026-07-01",
    "2026-06-01",
  ]);
  assert.deepEqual(spendMonths("2026-01-05").slice(0, 2), [
    "2025-12-01",
    "2025-11-01",
  ]);
});

test("overdue bills are red, convert EUR, and list USD separately", () => {
  const flag = overdueBills(input())!;
  assert.equal(flag.rag, "red");
  assert.equal(flag.horizon, "today");
  assert.match(flag.metric, /3 bills · oldest 35 days late/);
  assert.match(flag.decision, /£29,382\.50/);
  assert.ok(flag.detail.some((line) => line.includes("US$1,300")));
});

test("bills due within a week are amber when nothing is overdue", () => {
  const flag = overdueBills(
    input({ unpaidBills: [{ vendor: "Deel", reference: "D", amount: 500, currency: "GBP", due: "2026-10-25" }] }),
  )!;
  assert.equal(flag.rag, "amber");
  assert.equal(overdueBills(input({ unpaidBills: [] })), null);
});

test("a regular payer who missed a payment and pays less each time is red", () => {
  const flag = lateCustomer(input())!;
  assert.equal(flag.rag, "red");
  assert.match(flag.headline, /Cormorant Systems 2 days late/);
  assert.match(flag.detail[0], /every 61 days/);
  assert.match(flag.action.email!.body, /£6,200\.00, £5,300\.00, £4,400\.00/);
});

test("a payer on time with steady amounts is not flagged", () => {
  const credits = input().credits.filter((c) => c.payer === "Delta Consulting");
  assert.equal(lateCustomer(input({ credits })), null);
});

test("idle cash keeps three months of spending and rounds the move down", () => {
  const flag = idleCash(input())!;
  assert.equal(flag.rag, "amber");
  assert.match(flag.decision, /Move £420,000\.00 from Northstar Modulr GBP/);
});

test("idle cash is silent without a treasury account", () => {
  const accounts = input().accounts.filter((a) => a.type !== "INVESTMENT");
  assert.equal(idleCash(input({ accounts })), null);
});

test("foreign cash beyond 90 days of bills in that currency is exposure", () => {
  const flag = currencyExposure(input())!;
  assert.match(flag.headline, /€159k unhedged/);
  assert.match(flag.detail[1], /€9,000\.00/);
});

test("spending up 23% is amber and names the biggest driver", () => {
  const flag = spendingTrend(input())!;
  assert.equal(flag.rag, "amber");
  assert.match(flag.headline, /Up 23% in September/);
  assert.match(flag.decision, /Meals|Software/);
});

test("the category furthest above usual is the odd spend", () => {
  const flag = oddSpend(input())!;
  assert.match(flag.headline, /Meals 2\.9× usual/);
  assert.match(flag.detail[1], /3 payments, against about 1/);
});

test("flags sort red first, then by how soon they matter", () => {
  const flags = buildFlags(input());
  assert.equal(flags.length, 6);
  assert.deepEqual(
    flags.map((f) => f.id),
    ["overdue-bills", "late-customer", "odd-spend", "idle-cash", "currency-exposure", "spending-trend"],
  );
});

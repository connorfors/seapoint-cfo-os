import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baselinePeriod,
  sumBurn,
  sumCash,
  aggregateRowSchema,
} from "./finance";

test("cash uses banking cash position and investment total in reporting currency", () => {
  const result = sumCash([
    {
      id: "bank", currency: "GBP", balance: {total: 150, available: 90}, name: "Bank",
      type: "BANKING",
      institution: { name: "Bank" },
      reporting_balance: { currency: "GBP", total: 150, cash_position: 100 },
    },
    {
      id: "treasury", currency: "GBP", name: "Treasury",
      type: "INVESTMENT",
      institution: { name: "Fund" },
      reporting_balance: { currency: "GBP", total: 200 },
    },
    {id: "missing", currency: "EUR", name: "No FX", type: "BANKING", institution: { name: "Bank" } },
  ]);
  assert.equal(result.cash, 300);
  assert.equal(result.missing, 1);
  assert.equal(result.accounts[0]?.available, 90);
  assert.equal(result.accounts[0]?.nativeBalance, 150);
});

test("refunds reduce gross spend; ordinary revenue offsets only net burn", () => {
  const row = (direction: "debit" | "credit", type: string, total: number) =>
    aggregateRowSchema.parse({
      group: { direction, type },
      metrics: { total, count: 1 },
      money: { total: { currency: "GBP", complete: true, excluded_count: 0 } },
    });
  const result = sumBurn(
    [
      row("debit", "PAYMENT", 1_000),
      row("credit", "CARD_REFUND", 100),
      row("credit", "PAYMENT", 400),
    ],
    1,
    "GBP",
  );
  assert.equal(result.grossBurn, 900);
  assert.equal(result.netBurn, 500);
  assert.equal(result.revenue, 400);
});

test("the baseline uses complete calendar months across the year boundary", () => {
  const result = baselinePeriod(new Date("2026-01-20T12:00:00Z"), 3);
  assert.equal(result.start, "2025-10-01");
  assert.equal(result.end, "2026-01-01");
});

test("cash refuses to combine different reporting currencies", () => {
  assert.throws(
    () =>
      sumCash([
        {
          id: "gbp", currency: "GBP", name: "GBP",
          type: "INVESTMENT",
          institution: { name: "Fund" },
          reporting_balance: { currency: "GBP", total: 100 },
        },
        {
          id: "eur", currency: "EUR", name: "EUR",
          type: "INVESTMENT",
          institution: { name: "Fund" },
          reporting_balance: { currency: "EUR", total: 100 },
        },
      ]),
    /mixed reporting currencies/,
  );
});

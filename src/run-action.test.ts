import { test } from "node:test";
import assert from "node:assert/strict";
import { firstAmount, planFor } from "./run-action";
import type { Move } from "./signals";

function move(overrides: Partial<Move>): Move {
  return {
    id: "x",
    rag: "amber",
    horizon: "week",
    title: "",
    headline: "",
    metric: "",
    why: "",
    detail: [],
    decision: "",
    kind: "move_to_treasury",
    actionLabel: "Move to treasury",
    source: "",
    impact: "",
    ...overrides,
  };
}

test("treasury move names the amount and both accounts", () => {
  const plan = planFor(
    move({
      decision: "Move £420,000.00 from Northstar Modulr GBP to Northstar Labs Ltd Treasury.",
    }),
    "HR-4821",
  );
  assert.deepEqual(plan, {
    button: "Transfer £420,000.00 now",
    steps: [
      "Checking the balance in Northstar Modulr GBP",
      "Verifying the payee",
      "Sending £420,000.00",
      "Confirmed",
    ],
    receipt: "£420,000.00 sent to Northstar Labs Ltd Treasury · ref HR-4821",
  });
});

test("transfer without an amount falls back to the action label", () => {
  const plan = planFor(move({ kind: "move_to_treasury", actionLabel: "Move to treasury", decision: "Top up treasury." }));
  assert.equal(plan.button, "Move to treasury");
  assert.equal(plan.steps[0], "Checking the balance in your account");
  assert.match(plan.receipt, /^Money sent to the account · ref HR-\d{4}$/);
});

test("funding payroll names the wallet, the joiner and the run", () => {
  const plan = planFor(
    move({
      kind: "fund_payroll",
      metric: "October payroll, 25 Oct · includes Maya Chen",
      decision: "Transfer £15,684.12 from Northstar Modulr GBP to Deel payroll wallet for October payroll.",
    }),
    "HR-2000",
  );
  assert.equal(plan.button, "Transfer £15,684.12 now");
  assert.deepEqual(plan.steps, [
    "Checking the balance in Northstar Modulr GBP",
    "Adding Maya Chen to October payroll",
    "Sending £15,684.12 to Deel payroll wallet",
    "October payroll funded",
  ]);
  assert.equal(plan.receipt, "£15,684.12 sent to Deel payroll wallet · October payroll funded · ref HR-2000");
});

test("bills and payroll read their source account", () => {
  const bills = planFor(
    move({ kind: "pay_bills", decision: "Pay 2 overdue bills, £40,440, from HSBC Business Current." }),
    "HR-1000",
  );
  assert.equal(bills.button, "Pay £40,440 now");
  assert.equal(bills.steps[0], "Checking the balance in HSBC Business Current");
  assert.equal(bills.receipt, "£40,440 paid from HSBC Business Current · ref HR-1000");

  const payroll = planFor(
    move({ kind: "pay_payroll", decision: "Pay October payroll, £182,300, from Northstar Modulr GBP." }),
    "HR-2000",
  );
  assert.equal(payroll.button, "Run payroll");
  assert.equal(payroll.receipt, "October payroll paid, £182,300 · ref HR-2000");
});

test("currency conversion locks a rate", () => {
  const plan = planFor(
    move({
      kind: "convert_currency",
      decision: "Convert €120,000 to GBP at today's rate, or lock in a forward rate.",
    }),
    "HR-3000",
  );
  assert.equal(plan.button, "Lock in rate now");
  assert.deepEqual(plan.steps, [
    "Fetching a live quote",
    "Comparing spot and forward",
    "Locking the rate",
    "Rate locked",
  ]);
  assert.equal(plan.receipt, "Rate locked on €120,000 · ref HR-3000");
});

test("customer chase sends a reminder to the payer", () => {
  const plan = planFor(
    move({
      kind: "chase_customer",
      decision: "Send Acme Ltd a payment reminder and ask why the amount is falling.",
      email: { subject: "Payment expected 12 Oct", body: "Hi" },
    }),
    "HR-4000",
  );
  assert.equal(plan.button, "Send reminder");
  assert.equal(plan.steps.length, 4);
  assert.equal(plan.steps[3], "Delivered");
  assert.equal(plan.receipt, "Reminder sent to Acme Ltd · ref HR-4000");
});

test("every plan has four steps", () => {
  for (const kind of ["review_spend", "confirm_plan", "unknown"]) {
    assert.equal(planFor(move({ kind })).steps.length, 4);
  }
});

test("firstAmount finds the first money figure", () => {
  assert.equal(firstAmount("Move US$1,300 then £5"), "US$1,300");
  assert.equal(firstAmount("No money here."), null);
});

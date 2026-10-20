import type { Snapshot } from "./contracts";

export type CashAccount = Pick<
  Snapshot["accounts"][number],
  "id" | "name" | "currency" | "available" | "kind"
>;
export type Obligation = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  accountId: string;
  accountName: string;
  due: string;
  transferDays: number;
  bufferDays: number;
};
export const demoToday = "2026-10-23";
export const demoFx = 1.3;

function parseDay(day: string) {
  const value = new Date(`${day}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(value.getTime()) ||
    value.toISOString().slice(0, 10) !== day
  )
    throw new Error("Use a valid calendar date.");
  return value;
}
function businessDay(value: Date, holidays: readonly string[]) {
  return (
    value.getUTCDay() !== 0 &&
    value.getUTCDay() !== 6 &&
    !holidays.includes(value.toISOString().slice(0, 10))
  );
}
export function shiftBusinessDays(
  day: string,
  days: number,
  holidays: readonly string[] = [],
) {
  const date = parseDay(day);
  const direction = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    if (businessDay(date, holidays)) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}
export function paymentTimeline(
  payment: Obligation,
  holidays: readonly string[] = [],
) {
  let due = parseDay(payment.due);
  while (!businessDay(due, holidays)) due.setUTCDate(due.getUTCDate() - 1);
  const payOn = due.toISOString().slice(0, 10);
  const readyBy = shiftBusinessDays(payOn, -payment.bufferDays, holidays);
  return {
    payOn,
    readyBy,
    moveBy: shiftBusinessDays(readyBy, -payment.transferDays, holidays),
  };
}

type ResultBase = {
  payment: Obligation;
  balance: number | null;
  shortfall: number;
  timeline: ReturnType<typeof paymentTimeline>;
};
export type Readiness = ResultBase &
  (
    | { kind: "ready" }
    | { kind: "blocked"; reason: string }
    | {
        kind: "transfer";
        source: CashAccount;
        debit: number;
        fx: boolean;
        overdue: boolean;
      }
  );

// Reserve each payment once. Another account or currency never covers a target implicitly.
export function planPayments(
  accounts: CashAccount[],
  payments: Obligation[],
  asOf: string,
  holidays: readonly string[] = [],
): Readiness[] {
  parseDay(asOf);
  const remaining = new Map(
    accounts.map((account) => [account.id, account.available]),
  );
  return [...payments]
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((payment) => {
      const target = accounts.find(
        (account) => account.id === payment.accountId,
      );
      const balance = target ? (remaining.get(target.id) ?? null) : 0;
      const timeline = paymentTimeline(payment, holidays);
      const shortfall = Math.max(0, payment.amount - (balance ?? 0));
      const base = { payment, balance, shortfall, timeline };
      if (
        target &&
        (target.currency !== payment.currency || target.kind !== "BANKING")
      )
        return {
          ...base,
          kind: "blocked",
          reason:
            "The nominated account cannot fund this currency as a bank payment.",
        };
      if (balance === null)
        return {
          ...base,
          kind: "blocked",
          reason:
            "The target account has no available balance. Confirm availability first.",
        };
      if (!shortfall) {
        remaining.set(payment.accountId, balance - payment.amount);
        return { ...base, kind: "ready" };
      }
      const candidates = accounts
        .filter(
          (account) =>
            account.kind === "BANKING" && account.id !== payment.accountId,
        )
        .map((source) => {
          const fx = source.currency !== payment.currency;
          const debit = !fx
            ? shortfall
            : source.currency === "GBP" && payment.currency === "USD"
              ? shortfall / demoFx
              : null;
          return {
            source,
            fx,
            debit,
            available: remaining.get(source.id) ?? null,
          };
        })
        .filter(
          (item) =>
            item.debit !== null &&
            item.available !== null &&
            item.available >= item.debit,
        )
        .sort(
          (a, b) =>
            Number(a.fx) - Number(b.fx) ||
            (b.available ?? 0) - (a.available ?? 0),
        );
      const funding = candidates[0];
      if (!funding || funding.debit === null || funding.available === null)
        return {
          ...base,
          kind: "blocked",
          reason:
            "No bank account can cover this gap using the demo FX assumption. Review funding and settlement manually.",
        };
      remaining.set(funding.source.id, funding.available - funding.debit);
      remaining.set(payment.accountId, 0);
      return {
        ...base,
        kind: "transfer",
        source: funding.source,
        debit: funding.debit,
        fx: funding.fx,
        overdue: timeline.moveBy < asOf,
      };
    });
}

export function demoPayments(accounts: CashAccount[]): Obligation[] {
  const gbp = accounts
    .filter(
      (account) => account.kind === "BANKING" && account.currency === "GBP",
    )
    .sort((a, b) => (a.available ?? 0) - (b.available ?? 0))[0];
  const eur = accounts.find(
    (account) => account.kind === "BANKING" && account.currency === "EUR",
  );
  return [
    {
      id: "usd-payroll",
      title: "US contractor payroll",
      amount: 24_000,
      currency: "USD",
      accountId: "demo-us-payroll",
      accountName: "US payroll wallet · demo, not connected",
      due: "2026-10-30",
      transferDays: 2,
      bufferDays: 2,
    },
    {
      id: "gbp-supplier",
      title: "Implementation partner",
      amount: 70_000,
      currency: "GBP",
      accountId: gbp?.id ?? "demo-gbp-payables",
      accountName: gbp?.name ?? "GBP payables account · demo, not connected",
      due: "2026-10-29",
      transferDays: 1,
      bufferDays: 1,
    },
    {
      id: "eur-platform",
      title: "EU platform renewal",
      amount: 18_500,
      currency: "EUR",
      accountId: eur?.id ?? "demo-eur-payables",
      accountName: eur?.name ?? "EUR payables account · demo, not connected",
      due: "2026-10-27",
      transferDays: 1,
      bufferDays: 1,
    },
  ];
}

export type Rag = "red" | "amber" | "green";
export type Horizon = "today" | "week" | "month";
export type ActionKind =
  | "pay_bills"
  | "chase_customer"
  | "move_to_treasury"
  | "convert_currency"
  | "review_spend"
  | "fund_payroll"
  | "pay_payroll";

export type Flag = {
  id: string;
  rag: Rag;
  horizon: Horizon;
  title: string;
  headline: string;
  metric: string;
  detail: string[];
  decision: string;
  action: {
    kind: ActionKind;
    label: string;
    email?: { subject: string; body: string };
  };
  source: string;
};

export type FlagInputs = {
  today: string;
  currency: string;
  accounts: {
    id: string;
    name: string;
    type: "BANKING" | "INVESTMENT";
    currency: string;
    balance: number;
    reporting: number | null;
    rate: number | null;
    netYieldPct: number | null;
  }[];
  unpaidBills: {
    vendor: string;
    reference: string;
    amount: number;
    currency: string | null;
    due: string | null;
  }[];
  monthlySpend: { month: string; total: number }[];
  categorySpend: {
    category: string;
    month: string;
    total: number;
    count: number;
  }[];
  credits: { payer: string; date: string; amount: number }[];
  payroll: {
    name: string;
    status: string;
    payDate: string | null;
    net: number;
    currency: string;
  }[];
};

const day = 86_400_000;
const rank: Record<Rag, number> = { red: 0, amber: 1, green: 2 };
/** One scale, not two: red is today, amber this week, green this month. */
export const horizonOf: Record<Rag, Horizon> = {
  red: "today",
  amber: "week",
  green: "month",
};
type Finding = Omit<Flag, "horizon">;

function days(from: string, to: string) {
  return Math.round(
    (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / day,
  );
}
function addDays(date: string, count: number) {
  return new Date(Date.parse(date.slice(0, 10)) + count * day)
    .toISOString()
    .slice(0, 10);
}
function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(date));
}
export function money(value: number, currency: string, compact = false) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    ...(compact ? { notation: "compact" } : {}),
  }).format(value);
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
/** The last complete calendar month, then the three before it. */
export function spendMonths(today: string) {
  const [year, month] = today.split("-").map(Number);
  return [1, 2, 3, 4].map((back) =>
    new Date(Date.UTC(year, month - 1 - back, 1)).toISOString().slice(0, 10),
  );
}

function rateFor(input: FlagInputs, currency: string | null) {
  if (currency === input.currency) return 1;
  return input.accounts.find((a) => a.currency === currency)?.rate ?? null;
}
function mainAccount(input: FlagInputs) {
  return input.accounts
    .filter((a) => a.type === "BANKING" && a.currency === input.currency)
    .sort((a, b) => b.balance - a.balance)[0];
}
function averageSpend(input: FlagInputs) {
  const months = new Set(spendMonths(input.today));
  const totals = input.monthlySpend.filter((m) => months.has(m.month));
  return totals.length
    ? totals.reduce((sum, m) => sum + m.total, 0) / totals.length
    : 0;
}

export function overdueBills(input: FlagInputs): Finding | null {
  const dated = input.unpaidBills.filter((bill) => bill.due);
  const overdue = dated.filter((bill) => bill.due! < input.today);
  const dueSoon = dated.filter(
    (bill) => bill.due! >= input.today && bill.due! <= addDays(input.today, 7),
  );
  const list = overdue.length ? overdue : dueSoon;
  if (!list.length) return null;
  let total = 0;
  const unconverted: string[] = [];
  for (const bill of list) {
    const rate = rateFor(input, bill.currency);
    if (rate === null)
      unconverted.push(money(bill.amount, bill.currency ?? input.currency));
    else total += bill.amount * rate;
  }
  const oldest = Math.max(...list.map((bill) => days(bill.due!, input.today)));
  const from = mainAccount(input);
  const largest = [...list].sort((a, b) => b.amount - a.amount).slice(0, 3);
  return {
    id: "overdue-bills",
    rag: overdue.length ? "red" : "amber",
    title: "Supplier bills",
    headline: overdue.length
      ? `${money(total, input.currency, true)} overdue`
      : `${money(total, input.currency, true)} due this week`,
    metric: overdue.length
      ? `${list.length} bills · oldest ${oldest} days late`
      : `${list.length} bills due in 7 days`,
    detail: [
      ...largest.map(
        (bill) =>
          `${bill.vendor} ${bill.reference}: ${money(bill.amount, bill.currency ?? input.currency)}, due ${shortDate(bill.due!)}`,
      ),
      ...(unconverted.length
        ? [`Not converted (no account in that currency): ${unconverted.join(", ")}`]
        : []),
    ],
    decision: `Pay ${list.length} ${overdue.length ? "overdue" : "upcoming"} bills, ${money(total, input.currency)}${from ? `, from ${from.name}` : ""}.`,
    action: { kind: "pay_bills", label: "Pay these bills" },
    source: "Seapoint supplier invoices, unpaid, by due date",
  };
}

export function lateCustomer(input: FlagInputs): Finding | null {
  const byPayer = new Map<string, { date: string; amount: number }[]>();
  for (const credit of input.credits) {
    const list = byPayer.get(credit.payer) ?? [];
    list.push(credit);
    byPayer.set(credit.payer, list);
  }
  let worst: (Finding & { score: number }) | null = null;
  for (const [payer, payments] of byPayer) {
    if (payments.length < 3) continue;
    payments.sort((a, b) => a.date.localeCompare(b.date));
    const gaps = payments.slice(1).map((p, i) => days(payments[i].date, p.date));
    const every = Math.round(median(gaps));
    if (every < 20) continue;
    const last = payments[payments.length - 1];
    const expected = addDays(last.date, every);
    const late = days(expected, input.today);
    const recent = payments.slice(-3).map((p) => p.amount);
    const shrinking = recent[0] > recent[1] && recent[1] > recent[2];
    if (late < 2 && !shrinking) continue;
    const drop = recent[0] - recent[2];
    const score = (late >= 2 ? late : 0) + (shrinking ? 7 : 0);
    if (worst && worst.score >= score) continue;
    const rag: Rag = late >= 7 || (late >= 2 && shrinking) ? "red" : "amber";
    worst = {
      score,
      id: "late-customer",
      rag,
      title: "Customers paying late",
      headline: late >= 2 ? `${payer} ${late} days late` : `${payer} paying less`,
      metric: shrinking
        ? `Down ${money(drop, input.currency, true)} over 3 payments`
        : `Usually pays every ${every} days`,
      detail: [
        `${payer} usually pays every ${every} days. The next payment was expected on ${shortDate(expected)}.`,
        `Last ${recent.length} payments: ${recent.map((a) => money(a, input.currency)).join(", ")}.`,
        "Headroom sees payments received, not your invoices or payment terms.",
      ],
      decision: `Send ${payer} a payment reminder${shrinking ? " and ask why the amount is falling" : ""}.`,
      action: {
        kind: "chase_customer",
        label: "Send reminder",
        email: {
          subject: `Payment expected ${shortDate(expected)}`,
          body: [
            `Hi ${payer} team,`,
            "",
            `We usually receive your payment around ${shortDate(expected)}, and we have not seen it yet. Could you confirm when it will be sent?`,
            ...(shrinking
              ? [
                  "",
                  `Your last payments were ${recent.map((a) => money(a, input.currency)).join(", ")}. If your usage or plan has changed, we would be glad to talk it through.`,
                ]
              : []),
            "",
            "Thanks,",
          ].join("\n"),
        },
      },
      source: "Seapoint transactions, money in, by payer",
    };
  }
  if (!worst) return null;
  const { score: _score, ...flag } = worst;
  return flag;
}

export function idleCash(input: FlagInputs): Finding | null {
  const treasury = input.accounts.find(
    (a) => a.type === "INVESTMENT" && a.netYieldPct !== null,
  );
  const from = mainAccount(input);
  if (!treasury || !from) return null;
  const spend = averageSpend(input);
  const banking = input.accounts
    .filter((a) => a.type === "BANKING")
    .reduce((sum, a) => sum + (a.reporting ?? 0), 0);
  const buffer = spend * 3;
  const excess = Math.min(banking - buffer, from.balance - spend);
  const amount = Math.floor(excess / 10_000) * 10_000;
  if (amount < 10_000) return null;
  const yearly = (amount * treasury.netYieldPct!) / 100;
  return {
    id: "idle-cash",
    rag: yearly >= 5_000 ? "amber" : "green",
    title: "Idle cash",
    headline: `${money(yearly, input.currency, true)} a year missed`,
    metric: `${money(amount, input.currency, true)} earning 0%`,
    detail: [
      `Current accounts hold ${money(banking, input.currency)}. Three months of spending is ${money(buffer, input.currency)}.`,
      `${treasury.name} pays ${treasury.netYieldPct}% after fees.`,
      "The yield is a recent estimate, not a promise.",
    ],
    decision: `Move ${money(amount, input.currency)} from ${from.name} to ${treasury.name}.`,
    action: { kind: "move_to_treasury", label: "Move to treasury" },
    source: "Seapoint account balances and treasury yield",
  };
}

export function currencyExposure(input: FlagInputs): Finding | null {
  const horizon = addDays(input.today, 90);
  let worst: Finding | null = null;
  let worstExcess = 0;
  for (const account of input.accounts) {
    if (account.type !== "BANKING" || account.currency === input.currency)
      continue;
    if (account.rate === null) continue;
    const needed = input.unpaidBills
      .filter((b) => b.currency === account.currency && (!b.due || b.due <= horizon))
      .reduce((sum, b) => sum + b.amount, 0);
    const spare = account.balance - needed;
    const excess = spare * account.rate;
    if (excess < 25_000 || excess <= worstExcess) continue;
    worstExcess = excess;
    worst = {
      id: "currency-exposure",
      rag: "amber",
      title: "Potential FX loss",
      headline: `${money(excess * 0.05, input.currency, true)} at risk`,
      metric: `if ${account.currency} falls 5% · ${money(spare, account.currency, true)} unhedged`,
      detail: [
        `${account.name} holds ${money(account.balance, account.currency)}.`,
        `Bills in ${account.currency} due in the next 90 days: ${money(needed, account.currency)}.`,
        `A 5% move in the rate changes its value by ${money(excess * 0.05, input.currency)}.`,
        "Seapoint gives today's rate only, so Headroom cannot see recent moves.",
      ],
      decision: `Convert ${money(spare, account.currency)} to ${input.currency} at today's rate, or lock in a forward rate.`,
      action: { kind: "convert_currency", label: "Lock in rate" },
      source: "Seapoint account balances and unpaid invoices",
    };
  }
  return worst;
}

export function spendingTrend(input: FlagInputs): Finding | null {
  const [last, ...before] = spendMonths(input.today);
  const latest = input.monthlySpend.find((m) => m.month === last);
  const prior = input.monthlySpend.filter((m) => before.includes(m.month));
  if (!latest || prior.length < 2) return null;
  const average = prior.reduce((sum, m) => sum + m.total, 0) / prior.length;
  const change = (latest.total - average) / average;
  const rag: Rag = change >= 0.3 ? "red" : change >= 0.15 ? "amber" : "green";
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(last));
  const received = (start: string) =>
    input.credits
      .filter((c) => c.date.slice(0, 7) === start.slice(0, 7))
      .reduce((sum, c) => sum + c.amount, 0);
  const income = received(last);
  const usualIncome =
    before.reduce((sum, m) => sum + received(m), 0) / before.length;
  const masked =
    change >= 0.15 && income - usualIncome >= 0.75 * (latest.total - average);
  const oneOffs = input.credits
    .filter((c) => c.date.slice(0, 7) === last.slice(0, 7))
    .filter((c) => input.credits.filter((o) => o.payer === c.payer).length === 1)
    .map((c) => `${c.payer} (${money(c.amount, input.currency)})`);
  const drivers = input.categorySpend
    .filter((c) => c.month === last)
    .map((c) => {
      const earlier = input.categorySpend.filter(
        (p) => p.category === c.category && before.includes(p.month),
      );
      const base = earlier.reduce((sum, p) => sum + p.total, 0) / prior.length;
      return { category: c.category, delta: c.total - base };
    })
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  return {
    id: "spending-trend",
    rag,
    title: "Monthly burn",
    headline: `Spending ${change >= 0 ? "up" : "down"} ${Math.abs(Math.round(change * 100))}%`,
    metric: masked
      ? `one-off receipts hid it in ${month}`
      : `${money(latest.total, input.currency, true)} in ${month} vs ${money(average, input.currency, true)} usual`,
    detail: [
      `${month} spending: ${money(latest.total, input.currency)}. The three months before averaged ${money(average, input.currency)}.`,
      ...(masked
        ? [
            `Money in was ${money(income, input.currency)}, against ${money(usualIncome, input.currency)} usual, so net burn looks flat.${oneOffs.length ? ` One-off receipts: ${oneOffs.join(", ")}.` : ""}`,
            "Next month, without those receipts, net burn rises by the full increase.",
          ]
        : []),
      ...drivers.map(
        (d) => `${d.category}: up ${money(d.delta, input.currency)} on usual`,
      ),
    ],
    decision: drivers.length
      ? `Review the biggest increase, ${drivers[0].category}, before it becomes the new normal.`
      : "No category stands out. Keep the current plan.",
    action: { kind: "review_spend", label: "Review the increase" },
    source: "Seapoint transactions, money in and out, complete months",
  };
}

export function payrollCover(input: FlagInputs): Finding | null {
  const run = input.payroll
    .filter((r) => ["draft", "needs_approval", "to_pay", "scheduled"].includes(r.status))
    .sort((a, b) => (a.payDate ?? "9999").localeCompare(b.payDate ?? "9999"))[0];
  if (!run) return null;
  const accounts = input.accounts
    .filter((a) => a.type === "BANKING" && a.currency === run.currency)
    .sort((a, b) => b.balance - a.balance);
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  const best = accounts[0];
  const when = run.payDate ? `on ${shortDate(run.payDate)}` : "this month";
  const pay = money(run.net, run.currency);
  if (!best || total < run.net)
    return {
      id: "payroll",
      rag: "red",
      title: "Payroll underfunded",
      headline: `${money(run.net - total, run.currency, true)} short`,
      metric: `${run.name}, ${when}`,
      detail: [
        `${run.name} needs ${pay} in ${run.currency}.`,
        `${run.currency} accounts hold ${money(total, run.currency)}.`,
      ],
      decision: `Fund ${run.currency} accounts with ${money(run.net - total, run.currency)} before payday.`,
      action: { kind: "fund_payroll", label: "Fund payroll" },
      source: "Seapoint pay runs and account balances",
    };
  if (best.balance < run.net)
    return {
      id: "payroll",
      rag: "amber",
      title: "Payroll underfunded",
      headline: `${money(run.net - best.balance, run.currency, true)} in the wrong account`,
      metric: `${run.name}, ${when}`,
      detail: [
        `${run.name} needs ${pay}. No single ${run.currency} account holds it.`,
        `${best.name} holds ${money(best.balance, run.currency)}.`,
      ],
      decision: `Move ${money(run.net - best.balance, run.currency)} into ${best.name} before payday.`,
      action: { kind: "fund_payroll", label: "Move the money" },
      source: "Seapoint pay runs and account balances",
    };
  return {
    id: "payroll",
    rag: "green",
    title: "Payroll funded",
    headline: `${pay} covered`,
    metric: `${run.name}, ${when}`,
    detail: [
      `${run.name} needs ${pay}. ${best.name} holds ${money(best.balance, run.currency)}.`,
      `Status in Seapoint: ${run.status.replace("_", " ")}.`,
    ],
    decision: `Pay ${run.name}, ${pay}, from ${best.name}.`,
    action: { kind: "pay_payroll", label: "Pay the run" },
    source: "Seapoint pay runs and account balances",
  };
}

export function oddSpend(input: FlagInputs): Finding | null {
  const [last, ...before] = spendMonths(input.today);
  let worst: { category: string; total: number; base: number; count: number; usualCount: number } | null = null;
  for (const current of input.categorySpend.filter((c) => c.month === last)) {
    const earlier = input.categorySpend.filter(
      (p) => p.category === current.category && before.includes(p.month),
    );
    if (earlier.length < 2) continue;
    const base = earlier.reduce((sum, p) => sum + p.total, 0) / before.length;
    const usualCount = earlier.reduce((sum, p) => sum + p.count, 0) / before.length;
    if (current.total < base * 1.8 || current.total - base < 1_000) continue;
    if (worst && current.total / base <= worst.total / worst.base) continue;
    worst = { category: current.category, total: current.total, base, count: current.count, usualCount };
  }
  if (!worst) return null;
  const times = worst.total / worst.base;
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(last));
  return {
    id: "odd-spend",
    rag: times >= 3 && worst.total - worst.base >= 5_000 ? "red" : "amber",
    title: "Unusual spending",
    headline: `${worst.category} ${times.toFixed(1)}× usual`,
    metric: `${money(worst.total, input.currency, true)} in ${month}`,
    detail: [
      `${worst.category} cost ${money(worst.total, input.currency)} in ${month}. It usually costs ${money(worst.base, input.currency)} a month.`,
      `${worst.count} payments, against about ${Math.round(worst.usualCount)} in a usual month.`,
    ],
    decision: `Check the ${worst.count} ${worst.category} payments from ${month} and confirm each one was expected.`,
    action: { kind: "review_spend", label: "Check these payments" },
    source: "Seapoint transactions, money out, by category",
  };
}

const rules = [
  payrollCover,
  overdueBills,
  lateCustomer,
  idleCash,
  currencyExposure,
  spendingTrend,
  oddSpend,
];

/** Every flag the data supports, most urgent first. */
export function buildFlags(input: FlagInputs): Flag[] {
  return rules
    .map((rule) => rule(input))
    .filter((finding): finding is Finding => finding !== null)
    .map((finding) => ({ ...finding, horizon: horizonOf[finding.rag] }))
    .sort((a, b) => rank[a.rag] - rank[b.rag]);
}

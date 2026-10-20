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
  /** Months of spending the business keeps in current accounts. */
  bufferMonths?: number;
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
  /** Invoice due day of the month per customer, from the business context. */
  terms?: { customer: string; dueDay: number }[];
  /** Someone joining soon, from the business context. */
  joiner?: {
    name: string;
    role: string;
    startDate: string;
    annualSalary: number;
    currency: string;
  } | null;
  /** Units of the joiner's currency per unit of the reporting currency. */
  joinerRate?: number | null;
  payroll: {
    name: string;
    status: string;
    payDate: string | null;
    /** The pay period as written on the run, e.g. "October 2026". */
    period?: string;
    net: number;
    currency: string;
    people?: number;
    annualSalaries?: number;
  }[];
  /** The account payroll is paid from, when it sits outside Seapoint (e.g. a Deel wallet). */
  payrollWallet?: { name: string; balance: number } | null;
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
  const all = overdue.length ? overdue : dueSoon;
  if (!all.length) return null;
  // The same supplier, reference and amount twice is a duplicate: hold it back, do not pay it twice.
  const seen = new Set<string>();
  const duplicates: typeof all = [];
  const list = all.filter((bill) => {
    const key = `${bill.vendor}|${bill.reference}|${bill.amount}|${bill.currency}`;
    if (seen.has(key)) {
      duplicates.push(bill);
      return false;
    }
    seen.add(key);
    return true;
  });
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
      ...duplicates.map(
        (bill) =>
          `Held back as a duplicate: ${bill.vendor} ${bill.reference}, ${money(bill.amount, bill.currency ?? input.currency)}. It appears twice.`,
      ),
    ],
    decision: `Pay ${list.length} ${overdue.length ? "overdue" : "upcoming"} bills, ${money(total, input.currency)}${from ? `, from ${from.name}` : ""}${duplicates.length ? `, and hold back ${duplicates.length} duplicate` : ""}.`,
    action: { kind: "pay_bills", label: "Pay these bills" },
    source: "Seapoint supplier invoices, unpaid, by due date",
  };
}

function againstTerms(
  input: FlagInputs,
  payer: string,
  payments: { date: string; amount: number }[],
  dueDay: number,
  expected: string,
  shrinking: boolean,
): Finding | null {
  const dueOn = (date: string) => `${date.slice(0, 8)}${String(dueDay).padStart(2, "0")}`;
  const lateness = payments.map((p) => days(dueOn(p.date), p.date));
  const typical = Math.round(median(lateness));
  const consistent = lateness.filter((l) => Math.abs(l - typical) <= 2).length;
  const due = dueOn(expected);
  const overdue = days(due, input.today);
  if (typical < 3 && overdue < 3) return null;
  const since = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(payments[0]!.date),
  );
  const recent = payments.slice(-3).map((p) => money(p.amount, input.currency));
  const ordinal = `${dueDay}${dueDay % 10 === 1 && dueDay !== 11 ? "st" : dueDay % 10 === 2 && dueDay !== 12 ? "nd" : dueDay % 10 === 3 && dueDay !== 13 ? "rd" : "th"}`;
  return {
    id: "late-customer",
    rag: "red",
    title: "Customers paying late",
    headline: `${payer} pays ${typical} days late`,
    metric:
      consistent === payments.length
        ? `Every payment since ${since}${overdue > 0 ? ` · now ${overdue} days overdue` : ""}`
        : `${consistent} of ${payments.length} payments${overdue > 0 ? ` · now ${overdue} days overdue` : ""}`,
    detail: [
      `Your terms: ${payer} invoices are due on the ${ordinal}.`,
      `${consistent} of ${payments.length} payments arrived about ${typical} days after that.`,
      overdue > 0
        ? `This cycle's payment was due on ${shortDate(due)} and has not arrived.`
        : `The next payment is due on ${shortDate(due)}.`,
      ...(shrinking ? [`Last 3 payments: ${recent.join(", ")}. Each one is smaller.`] : []),
    ],
    decision: `Send ${payer} a payment reminder${overdue > 0 ? ` for the ${shortDate(due)} invoice` : ""}, and ask to move their payment run to the ${ordinal}.`,
    action: {
      kind: "chase_customer",
      label: "Send reminder",
      email: {
        subject: `Payment due ${shortDate(due)}`,
        body: [
          `Hi ${payer} team,`,
          "",
          overdue > 0
            ? `Our invoice was due on ${shortDate(due)}, and we have not received payment yet. Could you confirm when it will be sent?`
            : `A reminder that our next invoice is due on ${shortDate(due)}.`,
          "",
          `Our terms are payment by the ${ordinal}. Your last ${payments.length} payments arrived about ${typical} days later. Could your team move your payment run so it lands by the ${ordinal}?`,
          "",
          "Thanks,",
        ].join("\n"),
      },
    },
    source: "Seapoint transactions, money in, against your payment terms",
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
    const term = input.terms?.find(
      (t) => t.customer.trim().toLowerCase() === payer.trim().toLowerCase(),
    );
    if (term) {
      const finding = againstTerms(input, payer, payments, term.dueDay, expected, shrinking);
      if (finding && (!worst || worst.score < 100)) worst = { ...finding, score: 100 };
      continue;
    }
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
  const months = input.bufferMonths ?? 3;
  const buffer = spend * months;
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
      `Current accounts hold ${money(banking, input.currency)}. Your ${months}-month buffer is ${money(buffer, input.currency)}.`,
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

function joinerCover(input: FlagInputs): Finding | null {
  const joiner = input.joiner;
  if (!joiner) return null;
  if (input.payroll.some((r) => r.currency === joiner.currency && open.has(r.status))) return null;
  const cur = joiner.currency;
  const monthly = joiner.annualSalary / 12;
  const payDay = `${joiner.startDate.slice(0, 7)}-25`;
  const held = input.accounts
    .filter((a) => a.type === "BANKING" && a.currency === cur)
    .reduce((sum, a) => sum + a.balance, 0);
  if (held >= monthly || payDay < input.today) return null;
  const short = monthly - held;
  const rate = cur === input.currency ? 1 : (input.joinerRate ?? null);
  const from = mainAccount(input);
  const cost = rate ? Math.ceil((short / rate) * 100) / 100 : null;
  const moveBy = addDays(payDay, -5);
  return {
    id: "payroll",
    rag: "red",
    title: "Payroll underfunded",
    headline: `${money(short, cur, true)} short in ${cur}`,
    metric: `${joiner.name}'s first pay, ${shortDate(payDay)}`,
    detail: [
      `${joiner.name} joins as ${joiner.role} on ${shortDate(joiner.startDate)}, on ${money(joiner.annualSalary, cur)} a year, paid in ${cur}.`,
      `First month's pay is ${money(monthly, cur)}. You hold ${held > 0 ? money(held, cur) : `no ${cur}`}.`,
      rate && rate !== 1
        ? `Seapoint's rate today: 1 ${input.currency} = ${rate.toFixed(4)} ${cur}, so it costs ${money(cost!, input.currency)}.`
        : `No ${input.currency} to ${cur} rate is available.`,
      `Move it by ${shortDate(moveBy)} so it lands before payday on ${shortDate(payDay)}.`,
    ],
    decision:
      cost && from
        ? `Convert ${money(cost, input.currency)} from ${from.name} to ${money(short, cur)} for ${joiner.name}'s first salary.`
        : `Fund ${money(short, cur)} in ${cur} before ${shortDate(moveBy)} for ${joiner.name}'s first salary.`,
    action: { kind: "fund_payroll", label: "Fund payroll" },
    source: "Your new joiner, with Seapoint balances and today's rate",
  };
}

const open = new Set(["draft", "needs_approval", "to_pay", "scheduled"]);
const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Payday for a run: its own date, else the 25th of its period's month, else of this month. */
function payDayOf(run: FlagInputs["payroll"][number], today: string) {
  if (run.payDate) return run.payDate;
  const text = (run.period ?? "").toLowerCase();
  const month = monthNames.findIndex((m) => text.includes(m));
  const year = text.match(/\b(20\d\d)\b/)?.[1];
  if (month >= 0 && year) return `${year}-${String(month + 1).padStart(2, "0")}-25`;
  return `${today.slice(0, 7)}-25`;
}

export function payrollCover(input: FlagInputs): Finding | null {
  const joining = joinerCover(input);
  if (joining) return joining;
  const run = input.payroll
    .filter((r) => open.has(r.status))
    .sort((a, b) => payDayOf(a, input.today).localeCompare(payDayOf(b, input.today)))[0];
  if (!run) return null;
  const cur = run.currency;
  const payDay = payDayOf(run, input.today);
  const label = run.period ? `${run.period.split(" ")[0]} payroll` : run.name;

  // A joiner who starts on or before payday joins this run, at the team's net-to-gross ratio.
  const joiner =
    input.joiner && input.joiner.currency === cur && input.joiner.startDate <= payDay
      ? input.joiner
      : null;
  const ratio =
    run.annualSalaries && run.annualSalaries > 0 ? run.net / (run.annualSalaries / 12) : 0.7;
  const joinerNet = joiner ? Math.round((joiner.annualSalary / 12) * ratio * 100) / 100 : 0;
  const need = run.net + joinerNet;
  const people = (run.people ?? 0) + (joiner ? 1 : 0);

  const accounts = input.accounts
    .filter((a) => a.type === "BANKING" && a.currency === cur)
    .sort((a, b) => b.balance - a.balance);
  const best = accounts[0];
  const wallet = input.payrollWallet ?? null;
  const into = wallet?.name ?? best?.name ?? `a ${cur} account`;
  const held = wallet ? wallet.balance : (best?.balance ?? 0);
  const moveBy = addDays(payDay, -3);
  const lines = [
    `${label} in Seapoint: ${money(run.net, cur)} net for ${run.people ?? "your"} people.`,
    ...(joiner
      ? [
          `${joiner.name} joined as ${joiner.role} on ${shortDate(joiner.startDate)}, on ${money(joiner.annualSalary, cur)} a year: about ${money(joinerNet, cur)} net this month, at your team's net-to-gross ratio.`,
        ]
      : []),
    `Total to fund: ${money(need, cur)} for ${people} people. ${into} holds ${money(held, cur)}.`,
  ];

  if (held < need) {
    const short = Math.round((need - held) * 100) / 100;
    const from = wallet ? best : accounts.find((a) => a !== best && a.balance >= short);
    return {
      id: "payroll",
      rag: "red",
      title: "Payroll underfunded",
      headline: `${money(short, cur, true)} short`,
      metric: `${label}, ${shortDate(payDay)}${joiner ? ` · includes ${joiner.name}` : ""}`,
      detail: [
        ...lines,
        held < run.net / (run.people || 1)
          ? "As things stand, nobody can be paid."
          : `As things stand, payroll falls ${money(short, cur)} short.`,
        `Move it by ${shortDate(moveBy)} so it clears before payday on ${shortDate(payDay)}.`,
      ],
      decision: from
        ? `Transfer ${money(short, cur)} from ${from.name} to ${into} for ${label}.`
        : `Fund ${into} with ${money(short, cur)} for ${label}.`,
      action: { kind: "fund_payroll", label: "Fund payroll" },
      source: wallet
        ? "Seapoint pay runs and balances, your new joiner, and the Deel wallet balance"
        : "Seapoint pay runs and balances, with your new joiner",
    };
  }
  return {
    id: "payroll",
    rag: "green",
    title: "Payroll funded",
    headline: `${money(need, cur)} covered`,
    metric: `${label}, ${shortDate(payDay)}`,
    detail: [...lines, `Status in Seapoint: ${run.status.replace("_", " ")}.`],
    decision: `Pay ${label}, ${money(need, cur)}, from ${into}.`,
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

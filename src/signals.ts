import type { BusinessContext, Snapshot, LiveFlag } from "./contracts";
import { project, actionsForPlan, type PlanId } from "./model";
import {
  demoFx,
  demoPayments,
  planPayments,
  type Readiness,
} from "./readiness";
import { money, date } from "./format";

export type Rating = "red" | "amber" | "green";
export type DecisionDestination = "cash" | "portal" | "strategy" | "evidence";
export type DecisionAction = {
  id: string;
  label: string;
  preparation: string;
  destination: DecisionDestination;
  button: string;
};
export type Signal = {
  id: string;
  title: string;
  rating: Rating;
  metric: string;
  metricLabel: string;
  source: "Demo" | "Seapoint" | "Model";
  horizon: "Today" | "This week" | "This month";
  why: string;
  evidence: string[];
  owner: string;
  decision: string;
  actions: DecisionAction[];
};
export function burnRating(
  current: number,
  previous: number | null,
  complete: boolean,
): Rating {
  if (previous === null || !complete) return "amber";
  if (current > 0 && previous <= 0) return "red";
  const change = previous > 0 ? (current - previous) / previous : 0;
  return change > 0.2 ? "red" : change > 0.1 ? "amber" : "green";
}
function payrollSignal(payment: Readiness | undefined): Signal {
  return {
    id: "payroll",
    title: "Payroll funding",
    rating: payment?.kind === "ready" ? "green" : "red",
    metric: money(payment?.shortfall ?? 24000, "USD"),
    metricLabel: "in the wrong account",
    source: "Demo",
    horizon: "This week",
    owner: "Finance lead",
    why: "The demo payroll is due Friday 30 October. Company-wide cash does not establish whether the nominated USD payroll wallet is funded.",
    evidence: [
      "Fictional commitment: $24,000. USD payroll wallet is not connected.",
      payment?.kind === "transfer"
        ? `Illustrative source: ${payment.source.name}, ${money(payment.debit, payment.source.currency)} at GBP/USD ${demoFx.toFixed(2)}.`
        : "Review a source bank account and confirm destination availability.",
      payment
        ? `Move by ${date(payment.timeline.moveBy, true)}. Ready by ${date(payment.timeline.readyBy, true)}. Pay on ${date(payment.timeline.payOn, true)}.`
        : "Confirm payroll dates.",
      "Two working days settlement plus two working days buffer. No bank holidays, cut-offs or FX fees included.",
    ],
    decision:
      "Approve preparation of a funding instruction. Verify the destination, live quote and arrival date before any real transfer.",
    actions: [
      {
        id: "fund",
        label: "Prepare USD funding instruction",
        preparation:
          "Check the current GBP balance, open and verify the USD wallet, obtain a live quote and confirm arrival before payroll. This request is prepared locally; no transfer is submitted.",
        destination: "cash",
        button: "Open cash checklist",
      },
      {
        id: "verify",
        label: "Ask finance to confirm payroll account",
        preparation:
          "Draft request: Please confirm the payroll destination account, beneficiary and bank cut-off before we fund the USD payroll commitment. This request has not been sent.",
        destination: "cash",
        button: "Review cash readiness",
      },
    ],
  };
}
export function buildSignals(
  snapshot: Snapshot,
  context: BusinessContext,
  selected: PlanId,
  asOf: string,
  liveFlags: readonly LiveFlag[] = [],
): Signal[] {
  const payments = planPayments(
    snapshot.accounts,
    demoPayments(snapshot.accounts),
    asOf,
  );
  const forecast = project({
    snapshot,
    context,
    actions: actionsForPlan(selected),
  });
  const previous = snapshot.comparison;
  const complete =
    previous?.complete === true &&
    !snapshot.warnings.some((w) => w.includes("FX rate"));
  const change =
    previous && previous.netBurn > 0
      ? ((snapshot.netBurn - previous.netBurn) / previous.netBurn) * 100
      : null;
  const burn = burnRating(
    snapshot.netBurn,
    previous?.netBurn ?? null,
    complete,
  );
  const fxDifference = 24000 / 1.3 - 24000 / 1.34;
  const signals: Signal[] = [
    payrollSignal(payments.find((item) => item.payment.id === "usd-payroll")),
    {
      id: "collections",
      title: "Slow-paying customers",
      rating: "red",
      metric: "90 days",
      metricLabel: "on 30-day terms",
      source: "Demo",
      horizon: "Today",
      owner: "CEO + finance lead",
      why: "A fictional customer repeatedly pays 60 days beyond agreed terms. That ties up working capital even when revenue looks healthy.",
      evidence: [
        "Fictional Harbor Group payment history: three invoices, each settled after 90 days. Contract terms: 30 days.",
        "At £9,000 monthly billing, an extra 60 days ties up about £18,000: £9,000 × 60 / 30. This is a steady-state scenario, not an observed outstanding balance.",
        "Related demo flag: a £12,000 supplier payment was released 20 days early. Review the next payment run against due dates.",
        "Seapoint exposes supplier bills, not outbound customer invoice terms. These examples require a receivables ledger and payment matching.",
      ],
      decision:
        "Choose whether to chase the customer, fix a blocked invoice, or change payment timing. None sends a message or changes a payment.",
      actions: [
        {
          id: "chase",
          label: "Draft a customer follow-up",
          preparation:
            "Draft — not sent\nSubject: Harbor Group — invoice payment timing\n\nOur agreed payment terms are 30 days. The last three invoices took 90 days to settle. Please confirm the blocker, the payment date for open invoices, and whether a PO or portal entry is missing. Can we agree a payment process that meets the contract terms?",
          destination: "evidence",
          button: "Review financial evidence",
        },
        {
          id: "invoice",
          label: "Unblock a customer portal invoice",
          preparation:
            "Prepare the fictional Alder Retail invoice using its PO reference, service period and buyer details. The portal simulation requires review before saving a local draft.",
          destination: "portal",
          button: "Open invoice portal demo",
        },
        {
          id: "terms",
          label: "Review early supplier payments",
          preparation:
            "Draft payment policy: schedule approved bills close to their verified due date, allowing settlement time. Review discounts, penalties and supplier relationships before changing timing. Demo opportunity: £12,000 paid 20 days early.",
          destination: "evidence",
          button: "Review supplier bills",
        },
      ],
    },
    {
      id: "fx",
      title: "FX leakage",
      rating: "amber",
      metric: money(fxDifference, "GBP"),
      metricLabel: "extra cost at the demo rate",
      source: "Demo",
      horizon: "This week",
      owner: "Finance lead",
      why: "The same $24,000 costs more GBP when the demo GBP/USD quote falls from 1.34 to 1.30. This flags exposure, not a verified FX loss.",
      evidence: [
        "Both rates are fictional comparison quotes, not live market prices.",
        `At 1.34: ${money(24000 / 1.34, "GBP")}. At 1.30: ${money(24000 / 1.3, "GBP")}. Extra GBP required: ${money(fxDifference, "GBP")}, before fees.`,
        "Seapoint balances alone do not establish execution spreads or whether a rate moved today. Benchmark quotes, transfer fees and dated executions are missing.",
      ],
      decision:
        "Ask finance to obtain spot and forward quotes for confirmed obligations. Compare costs and timing before deciding whether to lock a rate.",
      actions: [
        {
          id: "quote",
          label: "Prepare a quote comparison request",
          preparation:
            "Draft request — not sent: Please quote spot and forward coverage for $24,000 due Friday 30 October. Include all fees, settlement dates, expiry and cancellation terms. Compare against our approved budget rate. No FX trade is booked.",
          destination: "cash",
          button: "Review currency funding",
        },
      ],
    },
    {
      id: "burn",
      title: "Monthly burn",
      rating: burn,
      metric:
        change === null || !complete
          ? money(snapshot.netBurn, snapshot.currency, true)
          : `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
      metricLabel:
        change === null || !complete
          ? "comparison unavailable"
          : `vs ${previous?.label}`,
      source: "Seapoint",
      horizon: "This month",
      owner: "CEO + finance lead",
      why: complete
        ? `Net burn is ${money(snapshot.netBurn, snapshot.currency)} per month in ${snapshot.period.label}. ${burn === "red" ? "It rose by more than 20%; review the drivers before adding commitments." : burn === "amber" ? "It rose by more than 10%; review recurring costs." : "It has not risen by more than the 10% review threshold."}`
        : "Historical burn is available, but a complete comparison is missing. Do not treat an unknown trend as healthy.",
      evidence: [
        `Current baseline: ${snapshot.period.label}, ${snapshot.transactionCount} included transactions, ${money(snapshot.netBurn, snapshot.currency)} monthly net burn.`,
        previous
          ? `Comparison: ${previous.label}, ${previous.transactionCount} transactions, ${money(previous.netBurn, snapshot.currency)} monthly net burn. ${complete ? "FX totals complete." : "Comparison is incomplete."}`
          : "No usable previous-period baseline.",
        "Ratings: red above +20%, amber above +10% or missing comparison, green otherwise. A move from net inflow to burn is red.",
        "Complete historical periods only. Pending payments may enter Seapoint’s runway methodology. This is not a claim about this week’s spend.",
      ],
      decision:
        "Review the largest spending categories and decide which costs require an owner or a budget gate.",
      actions: [
        {
          id: "drivers",
          label: "Review spending drivers",
          preparation:
            "Prepare a cost review using the historical baseline and category totals. Assign an owner to the largest recurring commitments before making cuts.",
          destination: "evidence",
          button: "Open financial evidence",
        },
        {
          id: "plan",
          label: "Compare hiring commitments",
          preparation:
            "Compare each capital plan against existing net burn, the deployment budget and minimum runway. No hire or purchase is approved by this demo.",
          destination: "strategy",
          button: "Compare strategic moves",
        },
      ],
    },
    {
      id: "unusual",
      title: "Unusual spending",
      rating: "amber",
      metric: "4.5×",
      metricLabel: "usual weekly meal spend",
      source: "Demo",
      horizon: "Today",
      owner: "Operations lead",
      why: "A fictional meals category reached £1,800 against a £400 weekly norm. The difference needs an explanation before anyone treats it as waste.",
      evidence: [
        "Demo fixture: £1,800 this week vs £400 typical weekly meals spend. £1,400 above the baseline; 4.5× the norm.",
        "A team event, missing receipt or wrong category could explain the change. This does not establish fraud or a duplicate payment.",
        "A production detector needs matched periods, transaction rows, merchant history and receipts. No actual employee or card is flagged here.",
      ],
      decision:
        "Ask the spend owner for an explanation and receipts. Review transaction coding before changing a budget or card.",
      actions: [
        {
          id: "review",
          label: "Prepare an owner review request",
          preparation:
            "Draft request — not sent: Meals spend is £1,800 against the demo £400 weekly baseline. Please explain any team event, attach receipts and confirm the category. No card is frozen and no employee is accused.",
          destination: "evidence",
          button: "Review financial evidence",
        },
      ],
    },
    {
      id: "runway",
      title: "Runway & next hire",
      rating:
        !forecast.protectsRunway || !forecast.withinBudget
          ? "red"
          : forecast.runway !== null &&
              forecast.runway < context.minimumRunway + 3
            ? "amber"
            : "green",
      metric:
        forecast.runway === null
          ? "Cash positive"
          : `${forecast.runway.toFixed(1)} months`,
      metricLabel: `${context.minimumRunway}-month minimum`,
      source: "Model",
      horizon: "This month",
      owner: "CEO",
      why: `Your chosen plan commits ${money(forecast.annualAllocation, snapshot.currency)} in year one. ${!forecast.withinBudget ? "It exceeds the deployment budget." : !forecast.protectsRunway ? "It breaches the runway floor." : "It fits the stated budget and runway floor."}`,
      evidence: [
        `Budget: ${money(context.budget, snapshot.currency)}. First-year commitments: ${money(forecast.annualAllocation, snapshot.currency)}.`,
        "Live cash and historical net burn underpin a forward model. Proposed salaries, start dates and overhead are assumptions.",
        "No new sales or funding assumed. Recurring commitments continue after twelve months. ROI is unproven.",
        "A historical runway trend requires prior cash balances. This model compares plans; it does not claim runway increased or decreased over time.",
      ],
      decision:
        "Choose which constraint to fund next, then release the budget in stages against a 90-day review gate.",
      actions: [
        {
          id: "capital",
          label: "Compare capital and hiring plans",
          preparation:
            "Prepare the working plan for CEO review. Validate the business constraint, role cost, start date and success measure before any hiring commitment.",
          destination: "strategy",
          button: "Open capital plan",
        },
      ],
    },
  ];
  const observed = liveFlags.find((flag) => flag.id === "odd-spend");
  const unusual = signals.find((signal) => signal.id === "unusual");
  if (observed && unusual) {
    const multiple = observed.headline.match(/(\d+(?:\.\d+)?)×/);
    unusual.source = "Seapoint";
    unusual.rating = observed.rag;
    unusual.metric = multiple ? `${multiple[1]}×` : observed.headline;
    unusual.metricLabel = observed.metric;
    unusual.why =
      observed.headline +
      ". Review the category before treating the increase as waste.";
    unusual.evidence = [
      ...observed.detail,
      observed.source,
      "Historical complete months, not this week. Category assignment and receipts still require review. This does not establish fraud or a duplicate payment.",
    ];
    unusual.actions = [
      {
        id: "review",
        label: "Prepare a spend-owner review request",
        preparation: `Draft request — not sent: ${observed.headline}. ${observed.detail.join(" ")} Please confirm the business purpose, receipts and category. No card is frozen.`,
        destination: "evidence",
        button: "Review financial evidence",
      },
    ];
  }
  const rank: Record<Rating, number> = { red: 0, amber: 1, green: 2 };
  return signals.sort((a, b) => rank[a.rating] - rank[b.rating]);
}

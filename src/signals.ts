import type {FxIntent} from "./fx-contracts";
import type { BusinessContext, LiveFlag, Snapshot } from "./contracts";
import { horizonOf, type Horizon, type Rag } from "./flags";
import { project, actionsForPlan, type PlanId } from "./model";
import { money } from "./format";

/** One tile in the decision room: a live flag, or the runway model. */
export type Move = {
  id: string;
  rag: Rag;
  horizon: Horizon;
  title: string;
  headline: string;
  metric: string;
  why: string;
  detail: string[];
  decision: string;
  /** Engine action kind (pay_bills, chase_customer, move_to_treasury, convert_currency, review_spend, fund_payroll, pay_payroll) or "confirm_plan". */
  kind: string;
  actionLabel: string;
  email?: { subject: string; body: string };
  source: string;
  impact: string;
  fx?: FxIntent;
};

export const horizons: { id: Horizon; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

function lower(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1).replace(/\.$/, "");
}

/** Why this flag matters for this business, in one sentence. */
export function whyForYou(id: string, context: BusinessContext) {
  const company = context.company;
  switch (id) {
    case "overdue-bills":
      return `Late bills cost goodwill with the suppliers ${company} needs while it works to ${lower(context.goal)}.`;
    case "late-customer": {
      const term = context.customerTerms[0];
      return `${term ? `You set ${term.customer}'s terms to the ${term.dueDay}th of the month. ` : ""}Your goal is to ${lower(context.goal)}, and cash from existing customers funds it.`;
    }
    case "idle-cash":
      return `You keep a ${context.bufferMonths}-month cash buffer and assume no new funding, so idle cash should earn while it waits.`;
    case "currency-exposure":
      return context.marketOutlook
        ? `Your EUR cash is internal context. The ${context.marketOutlook.source} is external context. Together they say the euro you hold is likely to buy less in 3 months.`
        : `You sell to ${lower(context.customers.split(".")[0] ?? "customers abroad")}, so foreign cash is a real exposure, not a rounding error.`;
    case "spending-trend":
      return `Your runway floor is ${context.minimumRunway} months. A rise that becomes the new normal moves that date closer.`;
    case "odd-spend":
      return `Every pound that leaks here is a pound not spent on your plan: ${lower(context.bets.split(".")[0] ?? "your next bet")}.`;
    case "payroll": {
      const joiner = context.newJoiner;
      const wallet = context.payrollWallet;
      return joiner
        ? `${joiner.name} joined as ${joiner.role} this month, so this payroll is bigger than last month's.${wallet ? ` It is paid from ${wallet.name}.` : ""}`
        : `${context.team.split(".")[0]}. Payday is the one date that cannot slip.`;
    }
    default:
      return "";
  }
}

const impacts: Record<string, string> = {
  "overdue-bills": "Protects supplier terms",
  "late-customer": "Protects recurring revenue",
  "idle-cash": "Earns interest on idle cash",
  "currency-exposure": "Removes currency risk",
  "spending-trend": "Holds the runway date",
  "odd-spend": "Stops a possible leak",
  payroll: "Keeps payday safe",
};

function fromFlag(flag: LiveFlag, context: BusinessContext): Move {
  return {
    id: flag.id,
    rag: flag.rag,
    horizon: flag.horizon,
    title: flag.title,
    headline: flag.headline,
    metric: flag.metric,
    why: whyForYou(flag.id, context),
    detail: flag.detail,
    decision: flag.decision,
    kind: flag.action.kind,
    actionLabel: flag.action.label,
    email: flag.action.email,
    fx: flag.action.fx,
    source: flag.source,
    impact: impacts[flag.id] ?? "Handled",
  };
}

export function runwayMove(
  snapshot: Snapshot,
  context: BusinessContext,
  plan: PlanId,
): Move {
  const forecast = project({ snapshot, context, actions: actionsForPlan(plan) });
  const rag: Rag =
    !forecast.protectsRunway || !forecast.withinBudget
      ? "red"
      : forecast.runway !== null && forecast.runway < context.minimumRunway + 3
        ? "amber"
        : "green";
  return {
    id: "runway",
    rag,
    horizon: horizonOf[rag],
    title: "Runway",
    headline:
      forecast.runway === null
        ? "Cash positive"
        : `${forecast.runway.toFixed(1)} months`,
    metric: `against your ${context.minimumRunway}-month minimum`,
    why: `You set a ${context.minimumRunway}-month floor. ${!forecast.withinBudget ? "The current plan exceeds the budget." : !forecast.protectsRunway ? "The current plan breaches it." : "The current plan stays above it."}`,
    detail: [
      `First-year commitments in the current plan: ${money(forecast.annualAllocation, snapshot.currency)} against a ${money(context.budget, snapshot.currency)} budget.`,
      "Live cash and net burn from Seapoint. Salaries, start dates and overhead are plan assumptions.",
      "No new sales or funding assumed.",
    ],
    decision:
      "Confirm the plan, and release budget in stages against a 90-day review.",
    kind: "confirm_plan",
    actionLabel: "Confirm the plan",
    source: "Seapoint cash and net burn, with your plan assumptions",
    impact: "Keeps the plan inside the floor",
  };
}

const rank: Record<Rag, number> = { red: 0, amber: 1, green: 2 };

export function buildMoves(
  flags: readonly LiveFlag[],
  snapshot: Snapshot,
  context: BusinessContext,
  plan: PlanId,
): Move[] {
  return [
    ...flags.map((flag) => fromFlag(flag, context)),
    runwayMove(snapshot, context, plan),
  ].sort((a, b) => rank[a.rag] - rank[b.rag]);
}

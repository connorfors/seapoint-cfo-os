import type { Move } from "./signals";

export type ActionPlan = { button: string; steps: string[]; receipt: string };

const MONEY = /(?:US\$|[£€$¥]|\b[A-Z]{3}\s?)\d{1,3}(?:,\d{3})*(?:\.\d+)?/;

export function firstAmount(text: string): string | null {
  return text.match(MONEY)?.[0] ?? null;
}

function match(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() || null;
}

export function randomRef(): string {
  return `HR-${Math.floor(1000 + Math.random() * 9000)}`;
}

const transfers = new Set(["fund_payroll", "move_to_treasury", "pay_bills", "pay_payroll"]);

/** What the one button says, the four steps it runs, and the receipt it leaves. */
export function planFor(move: Move, ref: string = randomRef()): ActionPlan {
  const text = move.decision;
  const amount = firstAmount(text);
  const source = match(text, /\bfrom (.+?)(?= to |,|\.$|$)/);
  const target = match(text, /\b(?:to|into) (.+?)(?= before |\.$|$)/);
  const tag = ` · ref ${ref}`;

  if (transfers.has(move.kind)) {
    const steps = [
      `Checking the balance in ${source ?? "your account"}`,
      "Verifying the payee",
      `Sending ${amount ?? "the payment"}`,
      "Confirmed",
    ];
    if (move.kind === "pay_bills")
      return {
        button: amount ? `Pay ${amount} now` : move.actionLabel,
        steps,
        receipt: `${amount ?? "Bills"} paid${source ? ` from ${source}` : ""}${tag}`,
      };
    if (move.kind === "pay_payroll") {
      const run = match(text, /^Pay (.+?),/);
      return {
        button: "Run payroll",
        steps,
        receipt: `${run ?? "Payroll"} paid${amount ? `, ${amount}` : ""}${tag}`,
      };
    }
    return {
      button: amount ? `Transfer ${amount} now` : move.actionLabel,
      steps,
      receipt: `${amount ?? "Money"} sent to ${target ?? "the account"}${tag}`,
    };
  }

  switch (move.kind) {
    case "convert_currency":
      return {
        button: "Lock in rate now",
        steps: [
          "Fetching a live quote",
          "Comparing spot and forward",
          "Locking the rate",
          "Rate locked",
        ],
        receipt: `Rate locked${amount ? ` on ${amount}` : ""}${tag}`,
      };
    case "chase_customer": {
      const payer = match(text, /^Send (.+?) a payment reminder/);
      return {
        button: "Send reminder",
        steps: [
          "Personalising the email",
          "Attaching the payment history",
          "Sending the reminder",
          "Delivered",
        ],
        receipt: `Reminder sent to ${payer ?? "the customer"}${tag}`,
      };
    }
    case "review_spend":
      return {
        button: "Flag for review",
        steps: [
          "Gathering the payments",
          "Flagging them for review",
          "Notifying the card holder",
          "Review open",
        ],
        receipt: `Review opened with the card holder${tag}`,
      };
    case "confirm_plan":
      return {
        button: "Confirm plan",
        steps: [
          "Checking the runway floor",
          "Staging the budget",
          "Setting the 90-day review",
          "Plan confirmed",
        ],
        receipt: `Plan confirmed, next review in 90 days${tag}`,
      };
    default:
      return {
        button: move.actionLabel,
        steps: ["Checking the details", "Preparing the action", "Running it", "Done"],
        receipt: `${move.actionLabel} done${tag}`,
      };
  }
}

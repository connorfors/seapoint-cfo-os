import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  FX_DEMO_RATE,
  fxBuyAmount,
  fxMoney as money,
  fxQuoteSchema,
  type FxQuoteRequest,
  type FxQuote,
  type FxReceipt,
} from "../src/fx-contracts";
import type { SeapointConnection } from "./mcp";
const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  currency: z.string(),
  institution: z.object({ name: z.string() }),
  balance: z.object({ available: z.number() }).optional(),
});
export class FxError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A local provider adapter. It never calls HSBC or a Seapoint write tool. */
export function createFxDesk({
  clock = Date.now,
}: { clock?: () => number } = {}) {
  const quotes = new Map<string, FxQuote>();
  const receipts = new Map<string, FxReceipt>();
  const keepMs = 30 * 60_000;
  function sweep(now: number) {
    for (const [id, quote] of quotes)
      if (now - Date.parse(quote.createdAt) > keepMs) {
        quotes.delete(id);
        receipts.delete(id);
      }
  }
  async function accounts(client: SeapointConnection, organisation: string) {
    const result = z
      .object({
        data: z.array(accountSchema),
        has_more: z.boolean(),
        next_cursor: z.string().optional(),
      })
      .parse(
        await client.tool("query_accounts", {
          organisation_id: organisation,
          limit: 100,
        }),
      );
    if (result.has_more || result.next_cursor)
      throw new FxError(
        409,
        "The account list is incomplete. Review the organisation before preparing FX.",
      );
    return result.data;
  }
  function checkValueDate(day: string, now: number) {
    const value = new Date(`${day}T00:00:00Z`);
    const today = new Date(now).toISOString().slice(0, 10);
    if (
      day <= today ||
      value.getUTCDay() === 0 ||
      value.getUTCDay() === 6 ||
      value.getTime() > now + 366 * 86400_000
    )
      throw new FxError(
        400,
        "Choose a future weekday within the next year. Bank holidays still require confirmation.",
      );
  }
  return {
    async quote(
      client: SeapointConnection,
      input: FxQuoteRequest,
      now = clock(),
    ) {
      sweep(now);
      checkValueDate(input.valueDate, now);
      if (input.sellCurrency !== "EUR" || input.buyCurrency !== "GBP")
        throw new FxError(400, "This HSBC demo supports EUR to GBP only.");
      if (quotes.size >= 500)
        throw new FxError(
          429,
          "The demo quote desk is full. Try again after older quotes expire.",
        );
      const bank = await accounts(client, input.organisation);
      const source = bank.find(
        (a) =>
          a.id === input.sellAccountId &&
          a.type === "BANKING" &&
          a.currency === input.sellCurrency,
      );
      const target = bank.find(
        (a) =>
          a.id === input.buyAccountId &&
          a.type === "BANKING" &&
          a.currency === input.buyCurrency &&
          /HSBC/i.test(a.institution.name),
      );
      if (!source || !target)
        throw new FxError(
          409,
          "Select an accessible EUR bank account and an HSBC GBP settlement account.",
        );
      if (
        source.balance?.available === undefined ||
        source.balance.available < input.sellAmount
      )
        throw new FxError(
          409,
          "The current source balance cannot cover this demo trade. Refresh the financial data and reduce the amount.",
        );
      if (target.balance?.available === undefined)
        throw new FxError(
          409,
          "HSBC settlement account availability is unknown.",
        );
      const quote = fxQuoteSchema.parse({
        id: `HSBC-Q-DEMO-${randomUUID()}`,
        mode: "demo",
        provider: "HSBC",
        organisation: input.organisation,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 120_000).toISOString(),
        sell: {
          id: source.id,
          name: source.name,
          currency: source.currency,
          available: source.balance.available,
        },
        buy: {
          id: target.id,
          name: target.name,
          currency: target.currency,
          available: target.balance.available,
        },
        sellAmount: input.sellAmount,
        buyAmount: fxBuyAmount(input.sellAmount, FX_DEMO_RATE),
        rate: FX_DEMO_RATE,
        fee: 0,
        valueDate: input.valueDate,
      });
      quotes.set(quote.id, quote);
      return quote;
    },
    async accept(
      client: SeapointConnection,
      organisation: string,
      quoteId: string,
      now = clock(),
    ): Promise<FxReceipt> {
      sweep(now);
      const quote = quotes.get(quoteId);
      if (!quote || quote.organisation !== organisation)
        throw new FxError(
          404,
          "This quote is unavailable for the selected organisation. Request a new quote.",
        );
      const existing = receipts.get(quoteId);
      if (existing) return existing;
      if (Date.parse(quote.expiresAt) <= now)
        throw new FxError(
          410,
          "This quote expired. Request a new quote before confirming.",
        );
      const bank = await accounts(client, organisation);
      const source = bank.find(
        (a) =>
          a.id === quote.sell.id &&
          a.type === "BANKING" &&
          a.currency === quote.sell.currency,
      );
      const target = bank.find(
        (a) =>
          a.id === quote.buy.id &&
          a.type === "BANKING" &&
          a.currency === quote.buy.currency &&
          /HSBC/i.test(a.institution.name),
      );
      if (
        !source ||
        !target ||
        source.balance?.available === undefined ||
        source.balance.available < quote.sellAmount
      )
        throw new FxError(
          409,
          "Account readiness changed after the quote. Refresh and request a new quote.",
        );
      // Recheck after the network read: expiry and retries can race that await.
      const duplicate = receipts.get(quoteId);
      if (duplicate) return duplicate;
      const confirmedNow = Math.max(now, clock());
      if (Date.parse(quote.expiresAt) <= confirmedNow)
        throw new FxError(
          410,
          "This quote expired during verification. Request a new quote.",
        );
      const receipt: FxReceipt = {
        id: `HSBC-DEMO-${randomUUID()}`,
        mode: "demo",
        status: "simulated_lock",
        confirmedAt: new Date(confirmedNow).toISOString(),
        quote,
        summary: `HSBC demo rate locked: ${money(quote.sellAmount, "EUR")} → ${money(quote.buyAmount, "GBP")} at ${quote.rate.toFixed(4)}, value ${quote.valueDate}. No real FX contract booked.`,
        steps: [
          `Verified ${quote.sell.name} and ${quote.buy.name} through Seapoint MCP.`,
          `Received an illustrative HSBC provider quote: 1 EUR = ${quote.rate.toFixed(4)} GBP.`,
          `Reviewed ${money(quote.sellAmount, "EUR")} → ${money(quote.buyAmount, "GBP")} for ${quote.valueDate}.`,
          `Accepted the demo quote and issued a simulated deal receipt. No HSBC trade was placed.`,
        ],
      };
      receipts.set(quoteId, receipt);
      return receipt;
    },
  };
}

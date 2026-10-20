import { z } from "zod";
import { buildFlags, spendMonths, type FlagInputs } from "../src/flags";
import type { SeapointConnection } from "./mcp";

const page = z.object({
  data: z.array(z.unknown()),
  next_cursor: z.string().optional(),
});
const account = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["BANKING", "INVESTMENT"]),
  currency: z.string(),
  balance: z
    .object({ total: z.number(), cash_position: z.number().optional() })
    .optional(),
  reporting_balance: z
    .object({
      currency: z.string(),
      total: z.number(),
      rate: z.number(),
      cash_position: z.number().optional(),
    })
    .optional(),
  treasury: z.object({ net_yield_pct: z.number() }).optional(),
});
const invoice = z.object({
  reference: z.string().nullable().optional(),
  amounts: z.object({ total: z.number(), currency: z.string().nullable().optional() }),
  dates: z.object({ due_date: z.string().nullable().optional() }).optional(),
  vendor: z.object({ name: z.string().nullable().optional() }).optional(),
});
const credit = z.object({
  date: z.string(),
  participant: z.object({ name: z.string() }).nullable().optional(),
  reporting_amount: z.object({ amount: z.number() }).optional(),
});
const group = z.object({
  group: z.object({ date: z.string().optional(), category_id: z.string().nullable().optional() }),
  metrics: z.object({ total: z.number(), count: z.number() }),
});
const category = z.object({ id: z.string(), leaf: z.string() });

async function rows(connection: SeapointConnection, tool: string, args: object) {
  let result = page.parse(await connection.tool(tool, { ...args, limit: 100 }));
  const all = [...result.data];
  for (let pages = 0; result.next_cursor; pages += 1) {
    if (pages >= 20) throw new Error(`${tool} did not finish paging.`);
    result = page.parse(
      await connection.tool(tool, { cursor: result.next_cursor, limit: 100 }),
    );
    all.push(...result.data);
  }
  return all;
}

export async function flagsFor(
  connection: SeapointConnection,
  organisationId: string,
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10);
  const months = spendMonths(today);
  const scope = { organisation_id: organisationId };
  const spendWhere = {
    status: "BOOKED",
    direction: "debit",
    date: { gte: months[3], lt: `${today.slice(0, 7)}-01` },
  };
  const metrics = [
    { function: "sum", field: "reporting_amount", as: "total" },
    { function: "count", as: "count" },
  ];
  const [accounts, bills, monthly, byCategory, categories, credits] =
    await Promise.all([
      rows(connection, "query_accounts", scope),
      rows(connection, "query_invoices", { ...scope, where: { is_paid: false } }),
      rows(connection, "query_transactions", {
        ...scope,
        include_excluded_from_runway: false,
        where: spendWhere,
        aggregate: { group_by: [{ field: "date", interval: "month" }], metrics },
      }),
      rows(connection, "query_transactions", {
        ...scope,
        include_excluded_from_runway: false,
        where: spendWhere,
        aggregate: {
          group_by: [{ field: "category_id" }, { field: "date", interval: "month" }],
          metrics,
        },
      }),
      rows(connection, "query_categories", scope),
      rows(connection, "query_transactions", {
        ...scope,
        where: {
          status: "BOOKED",
          direction: "credit",
          date: { gte: new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10) },
        },
      }),
    ]);

  const parsedAccounts = accounts.map((row) => account.parse(row));
  const currency =
    parsedAccounts.find((a) => a.reporting_balance)?.reporting_balance?.currency ?? "GBP";
  const names = new Map(
    categories.map((row) => category.parse(row)).map((c) => [c.id, c.leaf]),
  );
  const provenance = z.object({
    money: z.object({
      total: z.object({ complete: z.boolean(), currency: z.string() }),
    }),
  });
  for (const row of [...monthly, ...byCategory]) {
    const money = provenance.parse(row).money.total;
    if (!money.complete || money.currency !== currency)
      throw new Error(
        "Spending flags need complete totals in the organisation reporting currency.",
      );
  }
  const input: FlagInputs = {
    today,
    currency,
    accounts: parsedAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balance:
        a.type === "BANKING"
          ? (a.balance?.cash_position ?? a.balance?.total ?? 0)
          : (a.balance?.total ?? 0),
      reporting:
        a.type === "BANKING"
          ? (a.reporting_balance?.cash_position ?? a.reporting_balance?.total ?? null)
          : (a.reporting_balance?.total ?? null),
      rate: a.reporting_balance?.rate ?? null,
      netYieldPct: a.treasury?.net_yield_pct ?? null,
    })),
    unpaidBills: bills.map((row) => {
      const bill = invoice.parse(row);
      return {
        vendor: bill.vendor?.name ?? "Unknown supplier",
        reference: bill.reference ?? "",
        amount: bill.amounts.total,
        currency: bill.amounts.currency ?? null,
        due: bill.dates?.due_date?.slice(0, 10) ?? null,
      };
    }),
    monthlySpend: monthly.map((row) => {
      const g = group.parse(row);
      return { month: g.group.date!.slice(0, 10), total: g.metrics.total };
    }),
    categorySpend: byCategory.map((row) => {
      const g = group.parse(row);
      return {
        category: names.get(g.group.category_id ?? "") ?? "Uncategorised",
        month: g.group.date!.slice(0, 10),
        total: g.metrics.total,
        count: g.metrics.count,
      };
    }),
    credits: credits.flatMap((row) => {
      const c = credit.parse(row);
      return c.participant && c.reporting_amount
        ? [{ payer: c.participant.name, date: c.date.slice(0, 10), amount: c.reporting_amount.amount }]
        : [];
    }),
  };
  return { fetchedAt: now.toISOString(), currency, flags: buildFlags(input) };
}

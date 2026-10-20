import { z } from "zod";
import type { Snapshot, Organisation } from "../src/contracts";
import type { SeapointConnection } from "./mcp";

const balanceSchema = z.object({
  currency: z.string(),
  total: z.number(),
  cash_position: z.number().optional(),
});
export const accountSchema = z.object({
  id: z.string(),
  currency: z.string(),
  balance: z
    .object({ total: z.number().optional(), available: z.number().optional() })
    .optional(),
  name: z.string(),
  type: z.enum(["BANKING", "INVESTMENT"]),
  institution: z.object({ name: z.string() }),
  reporting_balance: balanceSchema.optional(),
});
const categorySchema = z.object({
  id: z.string(),
  group: z.string(),
  leaf: z.string(),
});
const moneySchema = z.object({
  currency: z.string(),
  complete: z.boolean(),
  excluded_count: z.number(),
});
export const aggregateRowSchema = z.object({
  group: z
    .object({
      direction: z.enum(["credit", "debit"]).optional(),
      type: z.string().optional(),
      category_id: z.string().nullable().optional(),
    })
    .optional(),
  metrics: z.object({ total: z.number(), count: z.number() }),
  money: z.object({ total: moneySchema }),
});
const payrollSchema = z.object({
  pay_date: z.string().nullable().optional(),
  employee_count: z.number().optional(),
  currency: z.string(),
  employees: z.array(
    z.object({ annual_salary: z.number().nullable().optional() }),
  ),
});
const pageSchema = z.object({
  data: z.array(z.unknown()),
  next_cursor: z.string().optional(),
  has_more: z.boolean().optional(),
});
const refunds = new Set(["REFUND", "CARD_REFUND", "CARD_CHARGEBACK"]);

async function rows(
  connection: SeapointConnection,
  tool: string,
  args: object,
): Promise<unknown[]> {
  let page = pageSchema.parse(
    await connection.tool(tool, { ...args, limit: 100 }),
  );
  const all = [...page.data];
  const seen = new Set<string>();
  while (page.next_cursor) {
    if (seen.has(page.next_cursor) || seen.size >= 50)
      throw new Error(
        "Seapoint pagination did not finish. The financial baseline is incomplete.",
      );
    seen.add(page.next_cursor);
    page = pageSchema.parse(
      await connection.tool(tool, { cursor: page.next_cursor, limit: 100 }),
    );
    all.push(...page.data);
  }
  if (page.has_more)
    throw new Error(
      "Seapoint reports more results but supplied no cursor. Refresh before using the figures.",
    );
  return all;
}

export function baselinePeriod(now: Date, months: number) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1),
  );
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(end.getTime() - 86_400_000);
  const format = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    months,
    label:
      months === 1
        ? format.format(start)
        : `${format.format(start)} – ${format.format(last)}`,
  };
}

export function sumCash(accounts: z.infer<typeof accountSchema>[]) {
  let currency: string | undefined;
  let cash = 0;
  let missing = 0;
  const included: Snapshot["accounts"] = [];
  for (const account of accounts) {
    const balance = account.reporting_balance;
    const amount =
      account.type === "BANKING" ? balance?.cash_position : balance?.total;
    if (!balance || amount === undefined) {
      missing += 1;
      continue;
    }
    if (currency && currency !== balance.currency)
      throw new Error(
        "Seapoint returned mixed reporting currencies. The cash total cannot be combined.",
      );
    currency = balance.currency;
    cash += amount;
    included.push({
      id: account.id,
      currency: account.currency,
      nativeBalance: account.balance?.total ?? null,
      available: account.balance?.available ?? null,
      name: account.name,
      institution: account.institution.name,
      kind: account.type,
      amount,
    });
  }
  if (!currency || !included.length)
    throw new Error(
      "No account balances are visible to this Seapoint account. Check the organisation and permissions.",
    );
  return { cash, currency, missing, accounts: included };
}

export function sumBurn(
  groups: z.infer<typeof aggregateRowSchema>[],
  months: number,
  currency: string,
) {
  let debits = 0;
  let refundCredits = 0;
  let revenue = 0;
  let count = 0;
  const warnings: string[] = [];
  for (const row of groups) {
    if (row.money.total.currency !== currency)
      throw new Error(
        "The burn figure and cash balance use different currencies.",
      );
    const direction = row.group?.direction;
    if (!direction)
      throw new Error(
        "The transaction aggregate has no direction. The burn figure cannot be calculated.",
      );
    if (direction === "debit") debits += row.metrics.total;
    else if (refunds.has(row.group?.type ?? ""))
      refundCredits += row.metrics.total;
    else revenue += row.metrics.total;
    count += row.metrics.count;
    if (!row.money.total.complete)
      warnings.push(
        `${row.money.total.excluded_count} ${direction} transactions lack an FX rate. The ${direction} total is incomplete.`,
      );
  }
  return {
    grossBurn: (debits - refundCredits) / months,
    revenue: revenue / months,
    netBurn: (debits - refundCredits - revenue) / months,
    transactionCount: count,
    warnings,
  };
}

export async function organisations(
  connection: SeapointConnection,
): Promise<Organisation[]> {
  const result = z
    .object({
      organisations: z.array(z.object({ id: z.string(), name: z.string() })),
    })
    .parse(await connection.tool("get_current_user", {}));
  return result.organisations;
}

export async function financialSnapshot(
  connection: SeapointConnection,
  organisation: Organisation,
): Promise<Snapshot> {
  const scope = { organisation_id: organisation.id };
  const [rawAccounts, rawCategories, methodology] = await Promise.all([
    rows(connection, "query_accounts", scope),
    rows(connection, "query_categories", scope),
    connection.resource("seapoint://finance/methodology/burn-rate"),
    connection.resource("seapoint://finance/methodology/runway"),
  ]);
  const categories = z.array(categorySchema).parse(rawCategories);
  const capital = categories
    .filter(
      (category) =>
        category.group === "Financial Items" &&
        category.leaf === "Capital Investments",
    )
    .map((category) => category.id);
  if (!capital.length)
    throw new Error(
      "The Capital Investments category is missing. Funding cannot be safely excluded from net burn.",
    );
  const cash = sumCash(z.array(accountSchema).parse(rawAccounts));
  const period = baselinePeriod(
    new Date(),
    /burnBasis=3_month_avg/.test(methodology) ? 3 : 1,
  );
  const previous = baselinePeriod(
    new Date(`${period.start}T00:00:00Z`),
    period.months,
  );
  const common = {
    ...scope,
    reporting_currency: cash.currency,
    include_excluded_from_runway: false,
  };
  const baseWhere = {
    date: { gte: period.start, lt: period.end },
    not: { status: ["FAILED", "CANCELLED", "FULL_REVERSAL"] },
  };
  const metrics = [
    { function: "sum", field: "reporting_amount", as: "total" },
    { function: "count", as: "count" },
  ];
  const [
    rawBurn,
    rawSpending,
    invoices,
    payroll,
    billRows,
    activity,
    priorBurn,
  ] = await Promise.all([
    rows(connection, "query_transactions", {
      ...common,
      where: {
        ...baseWhere,
        or: [
          { direction: "debit" },
          { direction: "credit", type: [...refunds] },
          { direction: "credit", not: { category_id: capital } },
        ],
      },
      aggregate: {
        group_by: [{ field: "direction" }, { field: "type" }],
        metrics,
      },
    }),
    rows(connection, "query_transactions", {
      ...common,
      where: { ...baseWhere, direction: "debit" },
      aggregate: { group_by: [{ field: "category_id" }], metrics },
    }),
    rows(connection, "query_invoices", {
      ...scope,
      reporting_currency: cash.currency,
      where: { is_paid: false },
      aggregate: { metrics },
    })
      .then((data) => ({
        kind: "available" as const,
        data: z.array(aggregateRowSchema).parse(data),
      }))
      .catch(() => ({ kind: "unavailable" as const })),
    rows(connection, "query_payroll", scope)
      .then((data) => ({
        kind: "available" as const,
        data: z.array(payrollSchema).parse(data),
      }))
      .catch(() => ({ kind: "unavailable" as const })),
    rows(connection, "query_invoices", {
      ...scope,
      where: { is_paid: false },
    })
      .then((data) =>
        z
          .array(
            z.object({
              id: z.string(),
              reference: z.string().optional(),
              vendor: z.object({ name: z.string().optional() }).optional(),
              amounts: z
                .object({
                  total: z.number().optional(),
                  currency: z.string().optional(),
                })
                .optional(),
              dates: z.object({ due_date: z.string().optional() }).optional(),
            }),
          )
          .parse(data),
      )
      .catch(() => null),
    rows(connection, "query_transactions", {
      ...scope,
      include_internal_transfers: true,
      where: { status: "BOOKED" },
      aggregate: {
        metrics: [{ function: "max", field: "date", as: "latest" }],
      },
    })
      .then(
        (data) =>
          z
            .array(
              z.object({
                metrics: z.object({ latest: z.string().nullable() }),
              }),
            )
            .parse(data)[0]?.metrics.latest ?? null,
      )
      .catch(() => null),
    rows(connection, "query_transactions", {
      ...common,
      where: {
        ...baseWhere,
        date: { gte: previous.start, lt: previous.end },
        or: [
          { direction: "debit" },
          { direction: "credit", type: [...refunds] },
          { direction: "credit", not: { category_id: capital } },
        ],
      },
      aggregate: {
        group_by: [{ field: "direction" }, { field: "type" }],
        metrics,
      },
    })
      .then((data) =>
        sumBurn(
          z.array(aggregateRowSchema).parse(data),
          previous.months,
          cash.currency,
        ),
      )
      .catch(() => null),
  ]);
  const burn = sumBurn(
    z.array(aggregateRowSchema).parse(rawBurn),
    period.months,
    cash.currency,
  );
  if (!burn.transactionCount)
    throw new Error(
      `No financial activity is available for ${period.label}. A zero-spend baseline would be misleading.`,
    );
  const warnings = [...burn.warnings];
  if (cash.missing)
    warnings.push(
      `${cash.missing} accounts have no visible reporting balance and are excluded from cash.`,
    );
  warnings.push(
    "Connected card liabilities can be unavailable. Missing debt may overstate cash and runway.",
  );
  const spending = z
    .array(aggregateRowSchema)
    .parse(rawSpending)
    .map((row) => {
      if (!row.money.total.complete)
        warnings.push(
          "Some spending categories lack FX rates. Category totals are incomplete.",
        );
      return {
        category:
          categories.find((category) => category.id === row.group?.category_id)
            ?.leaf ?? "Uncategorised",
        amount: row.metrics.total / period.months,
      };
    })
    .sort((a, b) => b.amount - a.amount);
  const invoice = invoices.kind === "available" ? invoices.data[0] : undefined;
  if (!invoice || !invoice.money.total.complete)
    warnings.push("The open-invoice total is unavailable or incomplete.");
  const latestPayroll =
    payroll.kind === "available"
      ? payroll.data
          .filter((run) => run.pay_date)
          .sort((a, b) => (b.pay_date ?? "").localeCompare(a.pay_date ?? ""))[0]
      : undefined;
  return {
    source: "seapoint",
    organisation,
    fetchedAt: new Date().toISOString(),
    currency: cash.currency,
    period,
    cash: cash.cash,
    comparison:
      priorBurn && priorBurn.transactionCount > 0
        ? {
            label: previous.label,
            netBurn: priorBurn.netBurn,
            transactionCount: priorBurn.transactionCount,
            complete: priorBurn.warnings.length === 0,
          }
        : null,
    ...burn,
    accounts: cash.accounts,
    latestTransactionDate: activity,
    supplierBills:
      billRows?.map((bill) => ({
        id: bill.id,
        vendor: bill.vendor?.name ?? "Supplier not extracted",
        reference: bill.reference ?? "No reference",
        amount: bill.amounts?.total ?? null,
        currency: bill.amounts?.currency ?? null,
        due:
          bill.dates?.due_date &&
          /^\d{4}-\d{2}-\d{2}$/.test(bill.dates.due_date)
            ? bill.dates.due_date
            : null,
      })) ?? null,
    spending,
    unpaidInvoices: invoice?.metrics.total ?? null,
    unpaidInvoiceCount: invoice?.metrics.count ?? null,
    payroll: latestPayroll?.pay_date
      ? {
          date: latestPayroll.pay_date,
          employeeCount:
            latestPayroll.employee_count ?? latestPayroll.employees.length,
          annualSalaries: latestPayroll.employees.reduce(
            (sum, employee) => sum + (employee.annual_salary ?? 0),
            0,
          ),
          currency: latestPayroll.currency,
        }
      : null,
    warnings: [...new Set(warnings)],
  };
}

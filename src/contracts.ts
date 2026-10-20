import { z } from "zod";

export const organisationSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Organisation = z.infer<typeof organisationSchema>;

export const snapshotSchema = z.object({
  source: z.literal("seapoint"),
  organisation: organisationSchema,
  fetchedAt: z.string(),
  currency: z.string(),
  period: z.object({
    start: z.string(),
    end: z.string(),
    label: z.string(),
    months: z.number(),
  }),
  cash: z.number(),
  comparison: z
    .object({
      label: z.string(),
      netBurn: z.number(),
      transactionCount: z.number(),
      complete: z.boolean(),
    })
    .nullable(),
  grossBurn: z.number(),
  revenue: z.number(),
  netBurn: z.number(),
  transactionCount: z.number(),
  accounts: z.array(
    z.object({
      id: z.string(),
      currency: z.string(),
      nativeBalance: z.number().nullable(),
      available: z.number().nullable(),
      name: z.string(),
      institution: z.string(),
      kind: z.string(),
      amount: z.number(),
    }),
  ),
  latestTransactionDate: z.string().nullable(),
  supplierBills: z
    .array(
      z.object({
        id: z.string(),
        vendor: z.string(),
        reference: z.string(),
        amount: z.number().nullable(),
        currency: z.string().nullable(),
        due: z.string().nullable(),
      }),
    )
    .nullable(),
  spending: z.array(z.object({ category: z.string(), amount: z.number() })),
  unpaidInvoices: z.number().nullable(),
  unpaidInvoiceCount: z.number().nullable(),
  payroll: z
    .object({
      date: z.string(),
      employeeCount: z.number(),
      annualSalaries: z.number(),
      currency: z.string(),
    })
    .nullable(),
  warnings: z.array(z.string()),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const contextSchema = z.object({
  company: z.string().min(1).max(100),
  product: z.string().min(1).max(600),
  goal: z.string().min(1).max(300),
  bottleneck: z.enum(["growth", "founder", "delivery"]),
  team: z.string().min(1).max(300),
  notes: z.string().max(1200),
  customers: z.string().min(1).max(600),
  pricing: z.string().min(1).max(600),
  funding: z.string().min(1).max(600),
  deals: z.string().min(1).max(600),
  raising: z.string().min(1).max(600),
  pipeline: z.string().min(1).max(600),
  roadmap: z.string().min(1).max(600),
  bets: z.string().min(1).max(600),
  budget: z.number().min(0).max(100_000_000),
  minimumRunway: z.number().min(1).max(60),
  employerOverhead: z.number().min(0).max(1),
});
export type BusinessContext = z.infer<typeof contextSchema>;

export const demoContext: BusinessContext = {
  company: "Northstar Labs",
  product:
    "Workflow software for operations teams at growing retail businesses. We turn spreadsheets, approvals and supplier follow-ups into one shared workspace.",
  goal: "Build a repeatable sales engine and win 10 new retail customers in the next 12 months.",
  bottleneck: "growth",
  team: "Two founders, three engineers, one designer and one operations lead. The CEO still runs every sales conversation.",
  notes:
    "Fictional hackathon brief. Customers like the product, but pipeline depends on founder introductions. Protect product delivery. No new funding is assumed.",
  customers:
    "12 UK and European retail operators. Buyers are operations directors; finance and procurement approve enterprise contracts.",
  pricing:
    "£2,500 monthly base plus usage. Enterprise contracts start at £36,000 annually, billed quarterly. Illustrative prices, not observed revenue.",
  funding:
    "£2.5m seed round raised in 2025. Historical funding is fictional; cash comes from the selected Seapoint organisation.",
  deals:
    "Alder Retail: £36,000 annual contract signed; first £9,000 invoice awaits a PO and supplier-portal entry. Two £48,000 pilots are in legal review.",
  raising:
    "Considering a £3m round in nine months. No proceeds enter the cash forecast. First prove a repeatable route to customers.",
  pipeline:
    "24 qualified accounts, 8 discovery calls, 3 pilots. Founder introductions supply most opportunities. No pipeline value counts as available cash.",
  roadmap:
    "Launch self-serve onboarding in six weeks, then procurement integrations. Keep the three engineers focused on delivery.",
  bets: "Run a 90-day GTM experiment. Test enterprise invoice automation before hiring another operations role. Gate a US expansion on paid demand.",
  budget: 700_000,
  minimumRunway: 12,
  employerOverhead: 0.2,
};

export const liveFlagsSchema = z.object({
  fetchedAt: z.string(),
  currency: z.string(),
  flags: z.array(
    z.object({
      id: z.string(),
      rag: z.enum(["red", "amber", "green"]),
      headline: z.string(),
      metric: z.string(),
      detail: z.array(z.string()),
      source: z.string(),
    }),
  ),
});
export type LiveFlag = z.infer<typeof liveFlagsSchema>["flags"][number];

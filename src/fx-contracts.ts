import { z } from "zod";
const amount = z.number().positive().max(100_000_000).multipleOf(0.01);
export const fxIntentSchema = z.object({
  sellAccountId: z.string(),
  sellAmount: amount,
  sellCurrency: z.string().length(3),
  buyCurrency: z.string().length(3),
});
export type FxIntent = z.infer<typeof fxIntentSchema>;
export const fxQuoteRequestSchema = fxIntentSchema.extend({
  organisation: z.string().min(1),
  buyAccountId: z.string().min(1),
  valueDate: z.iso.date(),
});
export type FxQuoteRequest = z.infer<typeof fxQuoteRequestSchema>;
const account = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  available: z.number().nonnegative(),
});
export const fxQuoteSchema = z.object({
  id: z.string(),
  mode: z.literal("demo"),
  provider: z.literal("HSBC"),
  organisation: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  sell: account,
  buy: account,
  sellAmount: amount,
  buyAmount: amount,
  rate: z.number().positive(),
  fee: z.literal(0),
  valueDate: z.iso.date(),
});
export type FxQuote = z.infer<typeof fxQuoteSchema>;
export const fxAcceptSchema = z.object({
  organisation: z.string().min(1),
  quoteId: z.string().min(1),
});
export const fxReceiptSchema = z.object({
  id: z.string(),
  mode: z.literal("demo"),
  status: z.literal("simulated_lock"),
  confirmedAt: z.iso.datetime(),
  quote: fxQuoteSchema,
  summary: z.string(),
  steps: z.array(z.string()).min(1),
});
export type FxReceipt = z.infer<typeof fxReceiptSchema>;
export const FX_DEMO_RATE = 0.8425;
export function fxBuyAmount(sellAmount: number, rate: number) {
  return Math.round(sellAmount * rate * 100) / 100;
}
export function forwardValueDate(now = new Date()) {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth() + 3;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), last)));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6)
    day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

export function fxMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

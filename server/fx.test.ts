import { test } from "node:test";
import assert from "node:assert/strict";
import { createFxDesk } from "./fx";
import {
  fxQuoteRequestSchema,
  forwardValueDate,
  fxBuyAmount,
} from "../src/fx-contracts";
import type { SeapointConnection } from "./mcp";
const start = Date.parse("2026-10-20T12:00:00Z");
const input = fxQuoteRequestSchema.parse({
  organisation: "test-org",
  sellAccountId: "eur",
  buyAccountId: "hsbc",
  sellCurrency: "EUR",
  buyCurrency: "GBP",
  sellAmount: 1000.5,
  valueDate: "2027-01-20",
});
function bank() {
  const rows = [
    {
      id: "eur",
      name: "EUR operations",
      type: "BANKING",
      currency: "EUR",
      institution: { name: "Test bank" },
      balance: { available: 20000 },
    },
    {
      id: "hsbc",
      name: "HSBC GBP",
      type: "BANKING",
      currency: "GBP",
      institution: { name: "HSBC" },
      balance: { available: 10000 },
    },
  ];
  let hasMore = false;
  const calls: string[] = [];
  const client: SeapointConnection = {
    isAlive: () => true,
    close: () => {},
    resource: async () => "",
    tool: async (name, args) => {
      calls.push(name);
      assert.deepEqual(args, { organisation_id: "test-org", limit: 100 });
      assert.equal(name, "query_accounts");
      return { data: rows, has_more: hasMore };
    },
  };
  return {
    rows,
    client,
    calls,
    incomplete() {
      hasMore = true;
    },
  };
}
test("a demo quote uses verified accounts, rounds the receive amount and never calls a write tool", async () => {
  const { client, calls } = bank(),
    desk = createFxDesk({ clock: () => start });
  const quote = await desk.quote(client, input);
  assert.equal(quote.mode, "demo");
  assert.equal(quote.provider, "HSBC");
  assert.equal(quote.buyAmount, 842.92);
  assert.equal(
    Date.parse(quote.expiresAt) - Date.parse(quote.createdAt),
    120000,
  );
  const receipt = await desk.accept(client, "test-org", quote.id);
  assert.equal(receipt.status, "simulated_lock");
  assert.match(receipt.id, /^HSBC-DEMO-/);
  assert.equal(receipt.steps.length, 4);
  assert.match(receipt.summary, /No real FX contract booked/);
  assert.deepEqual(calls, ["query_accounts", "query_accounts"]);
});
test("accept retries return one receipt, including concurrent accepts", async () => {
  const { client } = bank(),
    desk = createFxDesk({ clock: () => start });
  const quote = await desk.quote(client, input);
  const [a, b] = await Promise.all([
    desk.accept(client, "test-org", quote.id),
    desk.accept(client, "test-org", quote.id),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await desk.accept(client, "test-org", quote.id)).id, a.id);
});
test("expired quotes and wrong-organisation accepts fail", async () => {
  let now = start;
  const { client } = bank(),
    desk = createFxDesk({ clock: () => now });
  const quote = await desk.quote(client, input);
  await assert.rejects(
    () => desk.accept(client, "another-org", quote.id),
    /unavailable/,
  );
  now += 120001;
  await assert.rejects(
    () => desk.accept(client, "test-org", quote.id),
    /expired/,
  );
});
test("a changed balance or missing HSBC settlement account blocks acceptance", async () => {
  const { client, rows } = bank(),
    desk = createFxDesk({ clock: () => start });
  const quote = await desk.quote(client, input);
  rows[0].balance.available = 100;
  await assert.rejects(
    () => desk.accept(client, "test-org", quote.id),
    /readiness changed/,
  );
  rows[0].balance.available = 20000;
  rows[1].institution.name = "Another bank";
  await assert.rejects(
    () => desk.accept(client, "test-org", quote.id),
    /readiness changed/,
  );
});
test("incomplete accounts, missing availability and invalid settlement dates block quotes", async () => {
  const fixture = bank(),
    desk = createFxDesk({ clock: () => start });
  fixture.incomplete();
  await assert.rejects(() => desk.quote(fixture.client, input), /incomplete/);
  const fresh = bank();
  fresh.rows[0].balance.available = 0;
  await assert.rejects(() => desk.quote(fresh.client, input), /cannot cover/);
  await assert.rejects(
    () => desk.quote(fresh.client, { ...input, valueDate: "2026-10-24" }),
    /future weekday/,
  );
  await assert.rejects(
    () => desk.quote(fresh.client, { ...input, sellCurrency: "USD" }),
    /EUR to GBP only/,
  );
});
test("quote expiry is rechecked after the account read", async () => {
  let now = start;
  const fixture = bank(),
    desk = createFxDesk({ clock: () => now });
  const quote = await desk.quote(fixture.client, input);
  const client = {
    ...fixture.client,
    tool: async (name: string, args: unknown) => {
      const result = await fixture.client.tool(name, args);
      now += 120001;
      return result;
    },
  };
  await assert.rejects(
    () => desk.accept(client, "test-org", quote.id),
    /expired during verification/,
  );
});
test("dates clamp short months and skip weekends; money uses cents", () => {
  assert.equal(
    forwardValueDate(new Date("2026-11-30T12:00:00Z")),
    "2027-03-01",
  );
  assert.equal(fxBuyAmount(1000.5, 0.8425), 842.92);
  assert.equal(
    fxQuoteRequestSchema.safeParse({ ...input, sellAmount: -1 }).success,
    false,
  );
  assert.equal(
    fxQuoteRequestSchema.safeParse({ ...input, sellAmount: 1.001 }).success,
    false,
  );
});

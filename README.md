# Headroom — Seapoint CFO OS

A local hackathon demo for comparing hiring and capital allocation plans against Seapoint financial data.

## Run locally

Requirements: Node.js 22.12 or later, npm, and Codex CLI with MCP app-server support.
This demo was verified with Codex CLI 0.163.0.

```bash
npm ci
codex mcp add seapoint-staging --url https://mcp.seapoint.dev/mcp
npm run dev
```

The Codex command opens the Seapoint approval page. Approve the connection in your own account.
If the server is already configured, use `codex mcp login seapoint-staging` to authenticate it.

Open <http://127.0.0.1:4317>. The API listens on `127.0.0.1:4318`.
Keep both processes running while presenting.

To use another configured MCP connection:

```bash
SEAPOINT_MCP_SERVER=your-server-name npm run dev
```

## Demo walkthrough

1. Open **Business context**. Review the fictional company, goal, team and constraints.
2. Select **Pipeline & growth**, then **Build my plan**.
3. Compare the GTM plan with founder support, product delivery and no new commitments.
4. Change a salary, start month or capital investment. Watch cash and runway change.
5. Use **Test upside** to model an explicit monthly net cash contribution from month six.
6. Change the bottleneck to **Founder capacity** and build the plan again.
7. Open **Financial evidence** to inspect balances, spending and source dates.
8. Use **Export brief** to download the assumptions and selected plan as Markdown.

The default deployment budget is 700,000 in the organisation’s reporting currency.
It is a planning constraint within existing cash. It does not add funding.

## What is live

The server uses the authenticated Seapoint MCP connection through a local Codex app-server process.
It starts an ephemeral protocol session. It does not start a Codex model turn.
Other configured MCP servers are disabled for that process only.

Financial reads include account balances, transaction aggregates, categories, supplier invoices and payroll summaries.
Every query selects one organisation. The interface requires selection when several organisations are available.
Seapoint’s methodology resources determine the complete-month baseline and cash calculation.
Runway always uses net burn. Funding credits do not offset operating burn.
Internal transfers, failed payments and excluded-from-runway transactions do not inflate the baseline.

Only the six financial read tools in `server/mcp.ts` can be called.
The API cannot change bookkeeping records or move money.
Credentials stay in Codex’s credential store. They do not enter browser code or Git.
Financial snapshots stay in server memory for five minutes. Refresh fetches a new snapshot.
The server accepts local hosts and the local interface’s origin only.

## What is fictional

The company narrative, proposed roles, salaries, employer overhead, success criteria and investment amounts are demo assumptions.
They do not come from Seapoint.
Business context is editable and stored in this browser’s local storage.

Suggestions use a transparent local rules engine, not an LLM.
The bottleneck, budget and runway limit determine the suggested approach.
Narrative text remains visible in the brief but is not interpreted by a language model.
Costs, timing and the optional cash-contribution assumption drive the forecast.

New recurring costs continue after the twelve-month chart horizon.
One-time costs apply once, at the stated start month.
The baseline repeats the selected historical monthly net cash flow.
It does not predict revenue, tax timing, inflation, new funding or treasury liquidity.
Open invoices are disclosed separately. They are not deducted again from the recurring spending baseline.

## Check the app

```bash
npm run build
npm test
curl --fail http://127.0.0.1:4318/api/health
```

Health reports readiness only after an authenticated Seapoint read succeeds.
Calculation tests cover delayed hiring, employer costs, one-time capital spend, cash inflows, currency checks and calendar-month boundaries.
See [the verification record](docs/verification.md) for the browser flows checked locally.

## Team collaboration

Work on a feature branch and open a pull request.
Each teammate authenticates their own Seapoint connection.
Keep credentials, financial exports and account records out of Git.
This repository contains application code and fictional assumptions only.
No hosted deployment is configured.

## Demo blockers

- The app reads the wrong organisation or shows an incomplete financial baseline without its caveat.
- Cash or runway disagrees with the displayed costs, dates or currency.
- A fictional business input appears as a Seapoint fact.
- A failed connection appears as zero spending or a healthy connection.
- Credentials or private financial records enter the public repository.

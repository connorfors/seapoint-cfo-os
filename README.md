# Headroom — Seapoint CFO OS

A local hackathon demo that turns financial evidence and a business brief into clear next moves.

## Run locally

Requirements: Node.js 22.12 or later, npm, and Codex CLI with MCP app-server support.
The connection was verified with Codex CLI 0.163.0.

```bash
npm ci
codex mcp add seapoint-staging --url https://mcp.seapoint.dev/mcp
npm run dev
```

Approve the Seapoint connection in your own account.
For an existing connection, authenticate with `codex mcp login seapoint-staging`.
Open <http://127.0.0.1:4317>. The API listens on `127.0.0.1:4318`.
Keep both processes running while presenting.

To select another configured MCP connection:

```bash
SEAPOINT_MCP_SERVER=your-server-name npm run dev
```

## Present the demo

1. Open the decision room: **Your next moves, in order.**
2. Show six tiles with RAG ratings, short headlines and one key metric.
3. Click **Take action now**. Select the action and review the supporting decision.
4. Prepare an approval request, then choose **Approve demo preparation**.
5. Open the prepared checklist, financial evidence, capital plan or invoice portal demonstration.
6. For payroll, show Monday funding, Wednesday readiness and Friday payment. Change the demo clock to show a missed deadline.
7. For customer payments, choose the portal invoice action. Identify the PO fields, fill the form and review the local draft.
8. Open **Business context** to edit the fictional product, customers, pricing, team, funding, deals, raise, pipeline, roadmap and bets.
9. Change the primary constraint or budget. Compare the resulting hiring plan and cash plot.

The six tiles cover payroll funding, slow-paying customers, FX, unusual spend, monthly burn and runway with the next hire.
Details and business understanding stay in the action dialog.
Red means action is needed. Amber means review. Green means the stated rule is within its limit.
Unknown evidence never establishes a healthy trend.

Opus’s flags engine supplies an observed historical unusual-spend flag when one is available.
The server requires complete reporting-currency totals before using those spending flags.
The burn tile compares monthly net burn with the preceding equal-length period.
Its thresholds differ from the flags engine’s gross-spending comparison against three prior months.
The payroll commitment, 90-day customer terms and FX quote movement remain explicit demo scenarios.
The unusual-spend tile uses a labelled meals fixture when no observed flag is available.

The default deployment budget is 700,000 in the organisation’s reporting currency.
It is a constraint within existing cash, not new funding.

## Live evidence

The server uses the authenticated Seapoint MCP connection through a local Codex app-server process.
It starts an ephemeral protocol session, without a Codex model turn.
Other configured MCP servers are disabled for that process only.

Reads include accounts, transaction aggregates, categories, supplier bills and payroll summaries.
Every query selects one organisation.
The interface requires organisation selection when several are available.
Native available balances remain separate from reporting-currency cash totals.
The latest booked transaction is shown as an activity clue, not a bank refresh timestamp.
Old history triggers a visible caution.
Payroll dates remain historical; the app does not silently roll them forward.
Supplier-bill due dates come from extraction and require confirmation.

Seapoint’s methodology resources determine the complete-month baseline and cash calculation.
Runway uses net burn. Funding credits and internal transfers do not offset operating burn.
Refunds reduce gross spend. Failed, cancelled and excluded transactions do not inflate the baseline.

Only the six financial read tools in `server/mcp.ts` can be called.
The API cannot change bookkeeping records, submit invoices or move money.
Credentials stay in Codex’s credential store.
Snapshots stay in server memory for five minutes. Refresh fetches new evidence.
The server binds to loopback and checks the Host and Origin headers.

## Demo assumptions

The editable company brief, proposed hires, salaries, costs and success criteria are fictional.
Business context stays in this browser’s local storage.
Local rules use the primary constraint, budget, runway floor and employer overhead.
An LLM does not interpret the narrative fields.
The interface preserves those fields as visible context.

The three upcoming payment commitments are fictional overlays on the selected live balances.
The fixed demo clock starts on Friday 23 October 2026, independently of the financial snapshot date.
The USD payroll wallet is a fictional destination, not a connected account.
The planner reserves balances once, in payment due-date order.
It then displays cash moves in action-deadline order.
Treasury cannot fund this model automatically.
Missing available balances block readiness.
The only illustrative FX pair is GBP to USD at 1.30, without fees.
Settlement and safety buffers use weekdays. No bank holidays or cut-off times are loaded.
Confirm account setup, current balances, FX quotes, fees and provider timing before real action.

The portal demonstration uses a fixed text purchase-order fixture.
It does not parse a PDF or run a browser agent against an external portal.
The local form shows a fictional £9,000 net invoice and an explicit 20% VAT assumption.
It requires review before saving a session-only result.
No customer invoice is submitted, sent to Seapoint or counted as cash received.
A production implementation needs real document extraction, portal access, duplicate checks and submission receipts.

The capital model repeats the historical monthly net burn and adds proposed commitments.
Recurring costs continue beyond twelve months. Setup costs apply once.
No future sales, funding or investment returns are assumed.
The account-readiness scenario and live supplier bills are separate from that historical model.
They are not deducted again from its recurring baseline.
ROI remains a hypothesis with a stated review gate.

## Check the app

```bash
npm run build
npm test
curl --fail http://127.0.0.1:4318/api/health
```

Health reports readiness only after an authenticated Seapoint read succeeds.
Tests cover working days, currency and account mismatches, repeated cash allocation, hiring costs and runway.
The browser verification record is in [docs/verification.md](docs/verification.md).

## Team collaboration

Work on feature branches and open pull requests.
Each teammate authenticates their own Seapoint connection.
Keep credentials, account records, financial exports and private Drive documents out of Git.
This repository contains code and fictional assumptions only.
The `public-link/` setup from main forwards the public Worker to the presenter’s local dev server.
The existing public address is <https://headroom.cb-63a.workers.dev/>.
It needs the local app, tunnel and presenter’s Seapoint login to remain available.
Anyone with that public link can read the financial evidence exposed by the app.
The app does not add an access code or a separate hosted data store.

The supplied Drive cash-forecast, sales-readiness, spend-readiness and data-freshness guides informed the source separation and review steps.
Their private contents are not bundled in this public repository.

## Demo blockers

- The app reads the wrong organisation or silently combines incompatible currencies.
- Money in another account appears ready without a transfer or account check.
- A working-day deadline, amount, hiring cost or runway disagrees with its displayed assumptions.
- A missing or failed financial read appears as zero spending or verified availability.
- A fictional commitment appears as a Seapoint fact.
- A portal draft appears submitted to a real customer.
- Credentials or private financial records enter the public repository.

# Local verification

Verified on 20 October 2026 against the running local application.
The public Worker address was also checked through its existing tunnel.

## Automated checks

- `npm run build`: TypeScript check and production Vite build.
- `npm test`: 32 calculation, adapter and flag tests.
- `/api/health`: requires an authenticated Seapoint organisation read.

Tests cover calendar-month boundaries, refunds, currency checks, hiring overhead and one-time capital costs.
They also cover weekday deadlines, an explicit holiday, weekend payment adjustment and invalid dates.
Account tests prevent cross-currency readiness, treasury funding and repeated use of the same source or target balance.

## Browser checks

The authenticated app loaded financial evidence without model calls.
The homepage showed the exact heading and six RAG tiles.
Each tile exposed **Take action now**, a short issue and one metric.
The action dialog showed choices, a decision, evidence and business context.
The local approval step produced a preparation result, then opened the funding workflow.
Keyboard focus stayed inside the dialog. Escape restored focus to the initiating tile.
At 320 pixels, the document and dialog fit without horizontal overflow.
The desktop viewport was restored after the check.

Business context:

- Changing the primary constraint to founder capacity changed the suggested plan.
- A small deployment budget changed the recommendation to no new commitments.
- The default fictional brief was restored after testing.
- The capital comparison showed costs, runway, decision gates and a forward cash plot.

Cash readiness:

- The fictional Friday 30 October payroll required funding on Monday 26 October.
- The model showed Wednesday 28 October readiness and a two-working-day payment buffer.
- Moving the demo clock to Tuesday showed a missed deadline and recovery instructions.
- A transfer checklist stated that money had not moved.
- A same-currency funding gap required an inter-account transfer.
- A covered EUR commitment remained distinct from the USD funding gap.

Enterprise invoicing:

- The purchase-order fixture identified the customer, reference, service period, amount and terms.
- The local form received the fixture values.
- Saving without the review checkbox produced a review error.
- Completing review produced a local draft receipt.
- The receipt stated that nothing was submitted or counted as incoming cash.

## Scope and remaining limits

Financial data and account identifiers are excluded from this record.
Customer portals, PDF extraction, bank holidays, FX quotes and real transfers remain unconnected.
The rules do not interpret free-text business narratives.
The demonstration uses fixed future commitments and a separate demo clock.

## Public-link integration

The feature branch includes main’s Worker, tunnel script and flags engine.
The public address loads the same local application through the existing tunnel.
Deployment configuration remains unchanged by this UI work.

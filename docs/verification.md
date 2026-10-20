# Local verification — 20 October 2026

## Verified

- The health endpoint completed an authenticated Seapoint read.
- The browser loaded a financial snapshot with account balances and the last complete month’s transaction aggregates.
- The evidence view displayed the same account count and rounded totals as the API.
- Changing the business bottleneck from growth to founder capacity changed the suggested plan and selected commitments.
- Reducing the planning budget selected the plan with no new commitments.
- Selecting an expensive plan under that smaller budget displayed an over-budget warning.
- Changing an annual salary changed the annual commitment and projected runway.
- Adding an assumed monthly cash contribution changed the chart from month six.
- Export brief downloaded a Markdown file with the selected plan, sources and assumptions.
- Viewport checks at 320, 375, 414 and 768 pixels found no document overflow or clipped controls on the planning view.
- The production build, TypeScript check and calculation tests passed.

Live account values and exported briefs are excluded from this record.

## Limits

Recommendations use local rules. No language model interprets the company narrative.
The user must supply plausible hiring costs and expected outcomes.
Current bank-provider sync timestamps and treasury redemption timing are not modelled.
A failed optional invoice or payroll query appears as unavailable.
There is no hosted deployment or shared team database.

## Release blockers

Stop the demo if the wrong organisation appears, the connection fails, or a calculation contradicts its visible assumptions.
Do not present fictional context as financial evidence.

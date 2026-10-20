# Seapoint CFO OS

A hackathon prototype for turning company context and Seapoint data into financial operating decisions.

## Working hypothesis

A founder needs to decide where the next pound, euro or dollar should go.
The app connects the company goal to its financial position and compares possible actions.
The product scope is still under discussion. This repository starts team collaboration.

## Proposed demo

1. Enter the business context: product, customers, goal, bottleneck, team and constraints.
2. Review and correct that context before generating recommendations.
3. Connect Seapoint and select one organisation.
4. Show the financial baseline with its source dates and missing data.
5. Compare candidate actions, such as hiring a GTM engineer or a founder’s associate.
6. Show each option’s cost, cash impact, assumptions and conditions for success.
7. Change an assumption and compare the results again.

## Questions to settle

- Which single decision should the demo help the founder make?
- What budget, currency, time horizon and minimum runway constrain that decision?
- Which business constraint makes a proposed hire useful?
- What observable result would justify the cost?

## Evidence and assumptions

Seapoint advertises account balances, transaction aggregates, supplier invoices and payroll queries.
Available records depend on the authenticated organisation and its permissions.
Financial data can establish spending and affordability. It cannot establish a hire’s future return.
Payroll net pay excludes employer taxes and pensions. Proposed hiring costs need explicit assumptions.
Keep observed facts, user inputs and projected outcomes distinct.
Read Seapoint’s burn-rate and runway methodology before calculating those figures.
Prevent transfers, mixed currencies or duplicate payroll costs from inflating the baseline.

## Team collaboration

Clone this repository and work on a feature branch. Open a pull request for review.
Use synthetic fixtures for shared examples. Keep credentials and live financial records out of Git.
There is no runnable application yet.

## Demo blockers

- The app uses data from the wrong organisation or presents missing data as complete.
- Cash calculations disagree with their stated inputs, currency or time period.
- Recommendations present assumed hiring returns as observed facts.
- The public repository or demo exposes credentials or private financial records.

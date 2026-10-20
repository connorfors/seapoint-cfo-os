# HSBC FX demo

The currency-exposure action opens an HSBC-style EUR/GBP forward ticket.
Seapoint supplies accessible account names, currencies and available balances.
The server checks these accounts before quoting and again before acceptance.

The provider adapter returns a fixed illustrative rate of 0.8425 GBP per EUR.
The illustrative fee is zero. Quotes expire after two minutes.
A future weekday is required. The default value date is three months away.
Bank holidays, bank eligibility and settlement instructions require a real integration.

Acceptance creates a simulated receipt. It never calls HSBC or a Seapoint write tool.
No money moves, balance changes or real FX contract occur.
Repeated acceptance returns the same receipt while the server retains it.
Server receipts expire after 30 minutes or a process restart.

The confirmation shows the completed steps. The Well done screen retains those steps
and the receipt summary in browser storage. Reopening the completed card shows them again.
Reset demo clears this browser history.

## Verification

Run `npm run build` and `npm test`.
Open the currency-exposure card, request a quote, review it, and confirm the demo lock.
Select Done and check the completed steps on Well done.
Close and reopen the card, then reload. The completed steps must remain visible.
Use a browser without email alerts enabled to avoid sending receipt emails during testing.

Release blockers: the interface claims a real HSBC connection or trade; an inaccessible
account receives a quote; an expired quote is accepted; completed steps disappear after reload.

## Reference

The demo does not reproduce an authenticated HSBC screen.
HSBC describes its real products in [Managing currency risk](https://www.business.hsbc.com/en-gb/products/fx-managing-currency-risk)
and [Making international payments](https://www.business.hsbc.com/en-gb/products/fx-making-international-payments).

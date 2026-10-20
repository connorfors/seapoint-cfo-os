import type { Snapshot } from "../contracts";
import { Back, Tag, date, money } from "./shared";

export function Evidence({
  snapshot,
  back,
}: {
  snapshot: Snapshot;
  back: () => void;
}) {
  const bills = [...(snapshot.supplierBills ?? [])].sort((a, b) =>
    (a.due ?? "9999").localeCompare(b.due ?? "9999"),
  );
  return (
    <>
      <Back onClick={back} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">Show the evidence</p>
          <h1>The financial picture, with its gaps.</h1>
          <p>
            {snapshot.organisation.name} · fetched{" "}
            {new Date(snapshot.fetchedAt).toLocaleString("en-GB")}. Bank refresh
            timestamps are unavailable.
          </p>
        </div>
        <Tag tone="live">Read from Seapoint MCP</Tag>
      </div>
      <section className="panel">
        <h2>Accounts and currencies</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th>Native balance</th>
                <th>Available</th>
                <th>{snapshot.currency} equivalent</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <b>{account.name}</b>
                    <small>{account.institution}</small>
                  </td>
                  <td>{account.kind === "INVESTMENT" ? "Treasury" : "Bank"}</td>
                  <td>
                    {account.nativeBalance === null
                      ? "Unavailable"
                      : money(account.nativeBalance, account.currency)}
                  </td>
                  <td>
                    {account.available === null
                      ? "Unavailable"
                      : money(account.available, account.currency)}
                  </td>
                  <td>{money(account.amount, snapshot.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Treasury contributes to total cash. It does not fund the payment
          readiness model. Redemption timing requires confirmation.
        </p>
      </section>
      <div className="evidence-grid">
        <section className="panel">
          <h2>Operating baseline</h2>
          <dl className="decision-numbers">
            <div>
              <dt>Period</dt>
              <dd>{snapshot.period.label}</dd>
            </div>
            <div>
              <dt>Transactions included</dt>
              <dd>{snapshot.transactionCount}</dd>
            </div>
            <div>
              <dt>Gross spend, after refunds</dt>
              <dd>{money(snapshot.grossBurn, snapshot.currency)}</dd>
            </div>
            <div>
              <dt>Operating cash received</dt>
              <dd>{money(snapshot.revenue, snapshot.currency)}</dd>
            </div>
            <div>
              <dt>Monthly net burn</dt>
              <dd>{money(snapshot.netBurn, snapshot.currency)}</dd>
            </div>
          </dl>
          <p className="footnote">
            Complete-month baseline. Internal transfers and funding credits do
            not reduce operating burn. Pending payments can enter Seapoint’s
            runway methodology.
          </p>
        </section>
        <section className="panel">
          <h2>What still needs context</h2>
          <ul className="gaps">
            <li>
              <b>Customer invoices and POs</b>Not exposed by this MCP. The Alder
              invoice comes from a fictional fixture.
            </li>
            <li>
              <b>Future payroll</b>
              {snapshot.payroll
                ? `Latest visible pay run: ${date(snapshot.payroll.date)} ${new Date(snapshot.payroll.date).getUTCFullYear()}, ${snapshot.payroll.employeeCount} employees. This is historical.`
                : "Unavailable."}{" "}
              USD payroll is a demo assumption.
            </li>
            <li>
              <b>Pipeline, product and strategy</b>Provided by your editable
              business brief.
            </li>
            <li>
              <b>Transfer timing</b>Demo working-day assumptions. Provider and
              bank holidays still need confirmation.
            </li>
          </ul>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="tiny-label">SUPPLIER PAYABLES · SEAPOINT</span>
            <h2>
              {snapshot.unpaidInvoiceCount ?? "Unknown"} unpaid bills ·{" "}
              {snapshot.unpaidInvoices === null
                ? "total unavailable"
                : money(snapshot.unpaidInvoices, snapshot.currency)}
            </h2>
          </div>
        </div>
        <p>
          Read-only review list. Confirm each extracted due date and paid
          status. No payout account is supplied, so account readiness remains
          unconfirmed.
        </p>
        {snapshot.supplierBills === null ? (
          <div className="notice negative">
            Bill details could not load. The aggregate total may still be
            available.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Supplier / reference</th>
                  <th>Extracted due date</th>
                  <th>Amount</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <b>{bill.vendor}</b>
                      <small>{bill.reference}</small>
                    </td>
                    <td>
                      {bill.due
                        ? `${date(bill.due)} ${new Date(bill.due).getUTCFullYear()}`
                        : "Missing · confirm date"}
                    </td>
                    <td>
                      {bill.amount !== null && bill.currency
                        ? money(bill.amount, bill.currency)
                        : "Missing amount or currency"}
                    </td>
                    <td>Verify bill and choose paying account</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <details className="panel">
        <summary>Methodology and limitations</summary>
        <ul>
          {snapshot.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <p>
          Invoice totals are not deducted again from historical net burn. Unpaid
          does not establish a payment instruction or a reliable forecast date.
        </p>
      </details>
    </>
  );
}

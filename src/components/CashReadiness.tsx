import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  FileText,
} from "lucide-react";
import { demoFx, type Readiness } from "../readiness";
import { Back, Tag, date, money } from "./shared";

export function CashView({
  payments,
  asOf,
  setAsOf,
  back,
}: {
  payments: Readiness[];
  asOf: string;
  setAsOf: (day: string) => void;
  back: () => void;
}) {
  const [checklists, setChecklists] = useState<string[]>([]);
  return (
    <>
      <Back onClick={back} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">Right account. Right currency. Right time.</p>
          <h1>Cash ready before it is due.</h1>
          <p>
            Three fictional commitments stress-test your real Seapoint account
            balances.
          </p>
        </div>
        <Tag tone="demo">Payment timing simulation</Tag>
      </div>
      <div className="scenario-bar">
        <label>
          Demo clock
          <select value={asOf} onChange={(e) => setAsOf(e.target.value)}>
            <option value="2026-10-23">Friday 23 Oct 2026</option>
            <option value="2026-10-27">
              Tuesday 27 Oct 2026 · missed payroll move
            </option>
          </select>
        </label>
        <p>
          Live balances are a separate snapshot. No transactions or transfers
          are executed.
        </p>
      </div>
      <div className="notice">
        <strong>Planning assumptions:</strong> weekdays only, no bank holidays
        loaded. GBP → USD at {demoFx.toFixed(2)}, fees excluded. Settlement and
        safety buffers are illustrative. Confirm provider cut-offs, account
        setup and arrival dates.
      </div>
      <div className="payment-list">
        {[...payments]
          .sort((a, b) => {
            const priority = (item: Readiness) =>
              item.kind === "ready" ? "9999" : item.timeline.moveBy;
            return priority(a).localeCompare(priority(b));
          })
          .map((item) => (
            <article
              className={`payment-card ${item.kind === "transfer" && item.overdue ? "late" : ""}`}
              key={item.payment.id}
            >
              <div className="section-heading">
                <div>
                  <span className="tiny-label">
                    DEMO COMMITMENT · {item.payment.currency}
                  </span>
                  <h2>{item.payment.title}</h2>
                </div>
                <Tag tone={item.kind === "ready" ? "live" : "warning"}>
                  {item.kind === "ready"
                    ? "Covered in target account"
                    : item.kind === "blocked"
                      ? "Funding blocked"
                      : item.overdue
                        ? "Move deadline missed"
                        : "Cash move needed"}
                </Tag>
              </div>
              <div className="payment-summary">
                <div>
                  <span>Due {date(item.timeline.payOn, true)}</span>
                  <strong>
                    {money(item.payment.amount, item.payment.currency)}
                  </strong>
                </div>
                <div>
                  <span>Nominated account</span>
                  <b>{item.payment.accountName}</b>
                  <small>
                    {item.balance === null
                      ? "Availability unknown"
                      : `${money(item.balance, item.payment.currency)} available after earlier demo commitments`}
                  </small>
                </div>
                <div>
                  <span>Funding gap</span>
                  <strong className={item.shortfall ? "error-text" : ""}>
                    {money(item.shortfall, item.payment.currency)}
                  </strong>
                </div>
              </div>
              {item.kind === "transfer" && (
                <>
                  <div
                    className="timeline"
                    aria-label={`${item.payment.title} funding timeline`}
                  >
                    <div>
                      <span>01 · MOVE BY</span>
                      <b>{date(item.timeline.moveBy, true)}</b>
                      <small>
                        {item.fx
                          ? "Convert and fund"
                          : "Transfer between banks"}
                      </small>
                    </div>
                    <ArrowRight size={18} />
                    <div>
                      <span>02 · READY BY</span>
                      <b>{date(item.timeline.readyBy, true)}</b>
                      <small>
                        {item.payment.transferDays} working day
                        {item.payment.transferDays === 1 ? "" : "s"} settlement
                      </small>
                    </div>
                    <ArrowRight size={18} />
                    <div>
                      <span>03 · PAY ON</span>
                      <b>{date(item.timeline.payOn, true)}</b>
                      <small>
                        {item.payment.bufferDays} working day
                        {item.payment.bufferDays === 1 ? "" : "s"} safety buffer
                      </small>
                    </div>
                  </div>
                  <div className="funding-route">
                    <ArrowUpRight size={18} />
                    <p>
                      Use <b>{item.source.name}</b>:{" "}
                      {item.fx ? "illustrative debit " : "move "}
                      <b>{money(item.debit, item.source.currency)}</b> to cover{" "}
                      <b>{money(item.shortfall, item.payment.currency)}</b>.{" "}
                      {item.payment.accountId === "demo-us-payroll"
                        ? "Open and verify a USD payroll wallet first. "
                        : ""}
                      {item.overdue
                        ? "The planned deadline has passed. Contact the provider and payroll owner; do not assume on-time arrival."
                        : "Confirm the live balance and transfer quote before proceeding."}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      setChecklists((previous) =>
                        previous.includes(item.payment.id)
                          ? previous
                          : [...previous, item.payment.id],
                      )
                    }
                  >
                    {checklists.includes(item.payment.id) ? (
                      <Check size={15} />
                    ) : (
                      <FileText size={15} />
                    )}
                    Create transfer checklist
                  </button>
                  {checklists.includes(item.payment.id) && (
                    <div className="checklist" role="status">
                      <b>Checklist prepared · money has not moved</b>
                      <ol>
                        <li>
                          Verify the destination account, beneficiary and
                          current source balance.
                        </li>
                        <li>
                          Confirm the {item.fx ? "FX quote, fees and " : ""}
                          provider’s settlement cut-off.
                        </li>
                        <li>
                          {item.overdue
                            ? "Contact the finance owner and provider now to agree a recovery plan."
                            : `Ask the finance owner to approve and execute by ${date(item.timeline.moveBy, true)}.`}
                        </li>
                        <li>
                          Confirm receipt by {date(item.timeline.readyBy, true)}{" "}
                          before releasing payment.
                        </li>
                      </ol>
                    </div>
                  )}
                </>
              )}
              {item.kind === "blocked" && (
                <div className="notice negative">{item.reason}</div>
              )}
              {item.kind === "ready" && (
                <p className="ready-note">
                  <CircleCheck size={16} />
                  The target account covers this commitment in the model.
                  Recheck current availability before payment.
                </p>
              )}
            </article>
          ))}
      </div>
      <p className="footnote">
        Balances are reserved in due-date order. Each payment uses a balance
        once. Bank cash in another currency and treasury funds are not
        automatically spendable. The demo commitments are separate from the
        historical runway model and the live supplier-bill list.
      </p>
      <button className="text-button" onClick={back}>
        Back to next moves <ArrowRight size={15} />
      </button>
    </>
  );
}

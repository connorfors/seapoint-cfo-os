import { useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleCheck, FileText } from "lucide-react";
import { Back, Tag } from "./shared";

export function PortalDemo({ back }: { back: () => void }) {
  const [stage, setStage] = useState<"po" | "extracted" | "filled" | "saved">(
    "po",
  );
  const [po, setPo] = useState("");
  const [reference, setReference] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [validation, setValidation] = useState("");
  function save(event: FormEvent) {
    event.preventDefault();
    if (!po.trim() || !reference.trim()) {
      setValidation("Enter the PO reference and invoice number before saving.");
      return;
    }
    if (!reviewed) {
      setValidation("Review the buyer, PO, amount and tax treatment first.");
      return;
    }
    setValidation("");
    setStage("saved");
  }
  return (
    <>
      <Back onClick={back} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">From contract to customer portal</p>
          <h1>Clear the invoice bottleneck.</h1>
          <p>
            Alder Retail · £9,000 quarterly invoice · fictional enterprise
            customer
          </p>
        </div>
        <Tag tone="demo">Local simulation</Tag>
      </div>
      <div className="notice">
        <strong>Simulated browser workflow.</strong> A fixed purchase-order
        fixture supplies the fields. No PDF parser, external browser agent or
        customer portal is connected. Nothing is submitted externally.
      </div>
      <div
        className="portal-progress"
        aria-label="Invoice preparation progress"
      >
        {[
          "Purchase order",
          "Extract fields",
          "Prepare portal draft",
          "Review invoice",
        ].map((label, index) => (
          <div
            className={
              index <= ["po", "extracted", "filled", "saved"].indexOf(stage)
                ? "active"
                : ""
            }
            key={label}
          >
            <span>{index + 1}</span>
            {label}
          </div>
        ))}
      </div>
      <div className="portal-layout">
        <section className="panel po-document">
          <div className="section-heading">
            <span className="tiny-label">PURCHASE ORDER FIXTURE</span>
            <FileText size={20} />
          </div>
          <h2>Alder Retail Ltd</h2>
          <p className="document-subtitle">Purchase order · PO-ALD-2026-1042</p>
          <dl className="document-fields">
            <div>
              <dt>Supplier</dt>
              <dd>Northstar Labs Ltd</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>Operations workspace · quarterly subscription</dd>
            </div>
            <div>
              <dt>Service period</dt>
              <dd>1 Nov 2026 – 31 Jan 2027</dd>
            </div>
            <div>
              <dt>Buyer entity</dt>
              <dd>Alder Retail Ltd · UK</dd>
            </div>
            <div>
              <dt>Invoice net</dt>
              <dd>£9,000</dd>
            </div>
            <div>
              <dt>VAT assumption · 20%</dt>
              <dd>£1,800</dd>
            </div>
            <div className="total">
              <dt>Total invoice</dt>
              <dd>£10,800 GBP</dd>
            </div>
            <div>
              <dt>Payment terms</dt>
              <dd>30 days after accepted invoice</dd>
            </div>
          </dl>
          <p className="footnote">
            Fictional PO content presented as text. A production agent would
            read the actual document and check tax treatment.
          </p>
          {stage === "po" ? (
            <button className="primary" onClick={() => setStage("extracted")}>
              Run extraction demo <ArrowRight size={16} />
            </button>
          ) : (
            <div className="ready-note">
              <CircleCheck size={17} />
              PO fields identified from the demo fixture.
            </div>
          )}
        </section>
        <section className="panel portal-form">
          <div className="section-heading">
            <div>
              <span className="tiny-label">SUPPLIER PORTAL · SIMULATION</span>
              <h2>
                {stage === "saved"
                  ? "Invoice draft reviewed"
                  : "Prepare Alder’s invoice"}
              </h2>
            </div>
          </div>
          {stage === "po" ? (
            <div className="portal-empty">
              <FileText size={30} />
              <h3>Start with the purchase order.</h3>
              <p>
                Identify the buyer, PO reference, amount and billing period
                before filling the portal.
              </p>
            </div>
          ) : stage === "extracted" ? (
            <>
              <div className="extracted-fields">
                <p>
                  <Check size={16} />
                  Buyer and supplier identified
                </p>
                <p>
                  <Check size={16} />
                  PO reference and service period captured
                </p>
                <p>
                  <Check size={16} />
                  £9,000 net + £1,800 assumed VAT
                </p>
                <p>
                  <Check size={16} />
                  30-day terms identified
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setPo("PO-ALD-2026-1042");
                  setReference("NS-2026-101");
                  setStage("filled");
                }}
              >
                Fill portal draft <ArrowRight size={16} />
              </button>
              <p className="footnote">
                The draft uses fixture values. Human review still checks tax and
                customer requirements.
              </p>
            </>
          ) : stage === "saved" ? (
            <div className="invoice-receipt" role="status">
              <CircleCheck size={40} />
              <h3>Ready for a real portal handoff.</h3>
              <p>
                Invoice {reference} · PO {po}
                <br />
                £10,800 GBP including assumed VAT
              </p>
              <div className="notice">
                Saved in this demo session only. Not submitted, not sent to
                Seapoint, and not counted as incoming cash.
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setStage("po");
                  setReviewed(false);
                  setValidation("");
                }}
              >
                Reset simulation
              </button>
            </div>
          ) : (
            <form onSubmit={save}>
              <label>
                Buyer legal entity
                <input value="Alder Retail Ltd" readOnly />
              </label>
              <div className="form-grid">
                <label>
                  Purchase order reference
                  <input
                    value={po}
                    onChange={(e) => setPo(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Invoice number
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    required
                  />
                </label>
              </div>
              <label>
                Service period
                <input value="1 Nov 2026 – 31 Jan 2027" readOnly />
              </label>
              <div className="form-grid">
                <label>
                  Net amount · GBP
                  <input value="9,000.00" readOnly />
                </label>
                <label>
                  VAT · demo assumption
                  <input value="20% · £1,800.00" readOnly />
                </label>
              </div>
              <div className="invoice-total">
                <span>Invoice total</span>
                <strong>£10,800.00</strong>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed the buyer, PO, amount and tax assumption.
              </label>
              {validation && (
                <p role="alert" className="error-text">
                  {validation}
                </p>
              )}
              <button className="primary" type="submit">
                Save reviewed demo invoice <Check size={15} />
              </button>
            </form>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>What this unlocks</h2>
        <p>
          Operations handles the PO and portal paperwork. The founder stays with
          customers. Finance tracks invoice acceptance before counting a future
          receipt.
        </p>
        <p className="footnote">
          Production seam: connect the customer’s portal, parse the real PO,
          prevent duplicate invoice numbers and store the portal’s submission
          receipt.
        </p>
      </section>
    </>
  );
}

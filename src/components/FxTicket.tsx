import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Check,
  Clock3,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { z } from "zod";
import type { Move } from "../signals";
import type { Snapshot } from "../contracts";
import type { ActionCompletion } from "../run-action";
import {
  forwardValueDate,
  fxMoney,
  fxQuoteRequestSchema,
  fxQuoteSchema,
  fxReceiptSchema,
  type FxQuote,
  type FxReceipt,
} from "../fx-contracts";
import "./fx-ticket.css";
type Screen =
  | { kind: "form" }
  | { kind: "quoting" }
  | { kind: "quoted"; quote: FxQuote }
  | { kind: "accepting"; quote: FxQuote }
  | { kind: "confirmed"; receipt: FxReceipt };
async function post(path: string, data: object): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(
      error.success
        ? error.data.error
        : "The demo FX desk could not complete this request.",
    );
  }
  return body;
}
export function FxTicket({
  move,
  snapshot,
  onDone,
}: {
  move: Move;
  snapshot: Snapshot;
  onDone: (completion: ActionCompletion) => void;
}) {
  const intent = move.fx;
  const sources = snapshot.accounts.filter(
    (a) => a.kind === "BANKING" && a.currency === "EUR" && a.available !== null,
  );
  const destinations = snapshot.accounts.filter(
    (a) =>
      a.kind === "BANKING" &&
      a.currency === "GBP" &&
      /HSBC/i.test(a.institution),
  );
  const [sourceId, setSourceId] = useState(
    intent?.sellAccountId ?? sources[0]?.id ?? "",
  );
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [amount, setAmount] = useState(intent ? String(intent.sellAmount) : "");
  const [valueDate, setValueDate] = useState(forwardValueDate);
  const [screen, setScreen] = useState<Screen>({ kind: "form" });
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const source = sources.find((a) => a.id === sourceId);
  const quote =
    screen.kind === "quoted" || screen.kind === "accepting"
      ? screen.quote
      : null;
  const seconds = quote
    ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - now) / 1000))
    : 0;
  const busy = screen.kind === "quoting" || screen.kind === "accepting";
  const unavailable =
    !sources.length ||
    !destinations.length ||
    intent?.sellCurrency !== "EUR" ||
    intent?.buyCurrency !== "GBP";
  useEffect(() => {
    if (!quote) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [quote?.id]);
  async function getQuote(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    const input = fxQuoteRequestSchema.safeParse({
      organisation: snapshot.organisation.id,
      sellAccountId: sourceId,
      buyAccountId: destinationId,
      sellAmount: Number(amount),
      sellCurrency: "EUR",
      buyCurrency: "GBP",
      valueDate,
    });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Check the trade details.");
      return;
    }
    setScreen({ kind: "quoting" });
    try {
      const result = fxQuoteSchema.parse(
        await post("/api/fx/quotes", input.data),
      );
      setNow(Date.now());
      setScreen({ kind: "quoted", quote: result });
    } catch (error) {
      setScreen({ kind: "form" });
      setError(
        error instanceof Error ? error.message : "The quote could not load.",
      );
    }
  }
  async function accept() {
    if (!quote) return;
    setError("");
    setScreen({ kind: "accepting", quote });
    try {
      const receipt = fxReceiptSchema.parse(
        await post("/api/fx/accept", {
          organisation: snapshot.organisation.id,
          quoteId: quote.id,
        }),
      );
      setScreen({ kind: "confirmed", receipt });
    } catch (error) {
      setScreen({ kind: "quoted", quote });
      setNow(Date.now());
      setError(
        error instanceof Error
          ? error.message
          : "The demo rate lock failed. Request a new quote.",
      );
    }
  }
  return (
    <section
      className="fx-ticket"
      aria-label="HSBC demo dealing ticket"
      aria-busy={busy}
    >
      <div className="fx-provider">
        <span className="fx-bank-mark" aria-hidden="true">
          <Building2 size={22} />
        </span>
        <div>
          <strong>HSBC</strong>
          <span>FX forward · demo dealing ticket</span>
        </div>
        <span className="fx-simulation">Simulation</span>
      </div>
      <p className="fx-boundary">
        Real accounts from Seapoint. Illustrative quote from a local provider
        adapter. HSBC is not connected.
      </p>
      {(screen.kind === "form" || screen.kind === "quoting") && (
        <form onSubmit={getQuote}>
          <label>
            Sell EUR from
            <select
              value={sourceId}
              disabled={busy}
              onChange={(e) => setSourceId(e.target.value)}
              required
            >
              {sources.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="fx-fields">
            <label>
              You sell · EUR
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={source?.available ?? undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              Forward value date
              <input
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
                required
                disabled={busy}
              />
            </label>
          </div>
          <label>
            GBP settlement account
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              required
              disabled={busy}
            >
              {destinations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <p className="fx-account-note">
            {source?.available === null || source?.available === undefined
              ? "Source availability is unknown."
              : `${fxMoney(source.available, "EUR")} available in the last Seapoint snapshot. We recheck before quote acceptance.`}
          </p>
          {unavailable && (
            <p className="fx-error" role="alert">
              This demo needs a structured EUR/GBP exposure, an EUR bank account
              and an HSBC GBP settlement account. Refresh the financial data or
              select another organisation.
            </p>
          )}
          <button
            type="submit"
            className="fx-primary"
            disabled={busy || unavailable}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <RefreshCw size={17} />
            )}{" "}
            {busy ? "Checking Seapoint accounts…" : "Get HSBC demo quote"}
          </button>
        </form>
      )}
      {quote && (
        <div className="fx-quote">
          <div className="fx-quote-heading">
            <b>Review your forward</b>
            <span className={seconds === 0 ? "fx-expired" : ""}>
              <Clock3 size={13} />
              {seconds > 0 ? `Quote expires in ${seconds}s` : "Quote expired"}
            </span>
          </div>
          <div className="fx-exchange">
            <div>
              <span>You sell</span>
              <strong>{fxMoney(quote.sellAmount, "EUR")}</strong>
            </div>
            <ArrowRight size={23} />
            <div>
              <span>You receive</span>
              <strong>{fxMoney(quote.buyAmount, "GBP")}</strong>
            </div>
          </div>
          <dl className="fx-facts">
            <div>
              <dt>Demo rate</dt>
              <dd>1 EUR = {quote.rate.toFixed(4)} GBP</dd>
            </div>
            <div>
              <dt>Value date</dt>
              <dd>
                {new Date(quote.valueDate).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </dd>
            </div>
            <div>
              <dt>Sell account</dt>
              <dd>{quote.sell.name}</dd>
            </div>
            <div>
              <dt>Receive into</dt>
              <dd>{quote.buy.name}</dd>
            </div>
            <div>
              <dt>Demo fee</dt>
              <dd>£0.00 · illustrative</dd>
            </div>
            <div>
              <dt>Quote reference</dt>
              <dd className="fx-reference">{quote.id}</dd>
            </div>
          </dl>
          <p className="fx-account-note">
            Assumes EUR can be funded to HSBC before the value date. Bank
            eligibility, holidays, forward pricing and settlement instructions
            remain unverified.
          </p>
          {seconds === 0 ? (
            <button
              className="fx-primary"
              onClick={() => void getQuote()}
              disabled={busy}
            >
              <RefreshCw size={16} />
              Refresh demo quote
            </button>
          ) : (
            <button
              className="fx-primary"
              onClick={() => void accept()}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <LockKeyhole size={17} />
              )}{" "}
              {busy ? "Verifying and confirming…" : "Lock demo rate with HSBC"}
            </button>
          )}
          <button
            className="text-button"
            onClick={() => {
              setScreen({ kind: "form" });
              setError("");
            }}
            disabled={busy}
          >
            <ArrowLeft size={13} />
            Edit trade details
          </button>
        </div>
      )}
      {screen.kind === "confirmed" && (
        <div className="fx-confirmation" role="status">
          <FileCheck2 size={31} />
          <h3>Demo forward confirmed</h3>
          <p>
            {fxMoney(screen.receipt.quote.sellAmount, "EUR")} →{" "}
            {fxMoney(screen.receipt.quote.buyAmount, "GBP")}
          </p>
          <p className="fx-reference">{screen.receipt.id}</p>
          <ol className="fx-completed">
            {screen.receipt.steps.map((step) => (
              <li key={step}>
                <Check size={15} />
                {step}
              </li>
            ))}
          </ol>
          <button
            className="fx-primary"
            onClick={() =>
              onDone({
                receipt: screen.receipt.summary,
                steps: screen.receipt.steps,
              })
            }
          >
            Done — see completed steps <ArrowRight size={16} />
          </button>
          <p className="fx-account-note">
            Receipt retained on this demo server for 30 minutes. No real HSBC
            contract exists and no account balance changed.
          </p>
        </div>
      )}
      {error && (
        <p className="fx-error" role="alert">
          {error}
        </p>
      )}
      <p className="fx-footnote">
        Demo only. Accepting this ticket creates a simulated receipt, not a
        binding FX trade.
      </p>
    </section>
  );
}

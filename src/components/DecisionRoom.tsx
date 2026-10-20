import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X, CircleCheck, ChevronDown } from "lucide-react";
import type { BusinessContext, Snapshot, LiveFlag } from "../contracts";
import type { PlanId } from "../model";
import { buildSignals, type DecisionDestination } from "../signals";

export function DecisionRoom({
  snapshot,
  context,
  plan,
  asOf,
  liveFlags,
  flagError,
  onNavigate,
}: {
  snapshot: Snapshot;
  context: BusinessContext;
  plan: PlanId;
  asOf: string;
  liveFlags: LiveFlag[];
  flagError: string;
  onNavigate: (destination: DecisionDestination) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [phase, setPhase] = useState<"decision" | "approval" | "approved">(
    "decision",
  );
  const dialog = useRef<HTMLDivElement>(null);
  const signals = buildSignals(snapshot, context, plan, asOf, liveFlags);
  const flag = signals.find((signal) => signal.id === active);
  const action = flag?.actions.find((action) => action.id === choice);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActive(null);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]',
      );
      const first = elements?.[0],
        last = elements?.[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [active]);
  useEffect(() => {
    if (active) dialog.current?.focus();
  }, [phase, active]);
  const meaning = { red: "Action needed", amber: "Review", green: "On track" };
  return (
    <>
      <div className="decision-heading">
        <h1>Your next moves, in order.</h1>
      </div>
      <section className="signal-grid" aria-label="Your six next moves">
        {signals.map((signal) => (
          <article
            key={signal.id}
            className={`signal-tile rag-${signal.rating}`}
            aria-labelledby={`tile-${signal.id}`}
          >
            <div className="signal-top">
              <span className={`rag-badge ${signal.rating}`}>
                <span />
                {signal.rating} · {signal.horizon}
              </span>
              <span className="signal-source">{signal.source}</span>
            </div>
            <h2 id={`tile-${signal.id}`}>{signal.title}</h2>
            <div className="signal-metric">{signal.metric}</div>
            <p className="signal-metric-label">{signal.metricLabel}</p>
            <button
              className="tile-action"
              onClick={() => {
                setActive(signal.id);
                setChoice(signal.actions[0]?.id ?? "");
                setPhase("decision");
              }}
              aria-describedby={`tile-${signal.id}`}
            >
              Take action now <ArrowRight size={16} />
            </button>
          </article>
        ))}
      </section>
      <div className="decision-footer">
        <span>
          <i className="rag-dot red" />
          Act <i className="rag-dot amber" />
          Review <i className="rag-dot green" />
          On track
        </span>
        <button className="text-button" onClick={() => onNavigate("evidence")}>
          View financial evidence <ArrowRight size={13} />
        </button>
      </div>
      {flag && (
        <div className="decision-overlay">
          <div
            className="decision-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-title"
            tabIndex={-1}
            ref={dialog}
          >
            <div className="dialog-top">
              <span className={`rag-badge ${flag.rating}`}>
                <span />
                {meaning[flag.rating]} · {flag.horizon}
              </span>
              <button
                className="close-dialog"
                aria-label="Close decision"
                onClick={() => setActive(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="eyebrow">
              {flag.source === "Demo"
                ? "Illustrative scenario · not a Seapoint finding"
                : flag.source === "Model"
                  ? "Live financial baseline + planning assumptions"
                  : "Seapoint financial evidence"}
            </p>
            <h2 id="decision-title">{flag.title}</h2>
            <div className="dialog-metric">
              {flag.metric}
              <small>{flag.metricLabel}</small>
            </div>
            {phase === "decision" && (
              <>
                <p className="decision-why">{flag.why}</p>
                <h3>What action do you want to take?</h3>
                <div className="decision-choices">
                  {flag.actions.map((option) => (
                    <label
                      className={`decision-choice ${choice === option.id ? "chosen" : ""}`}
                      key={option.id}
                    >
                      <input
                        type="radio"
                        name="decision-action"
                        value={option.id}
                        checked={choice === option.id}
                        onChange={() => setChoice(option.id)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <p className="decision-statement">{flag.decision}</p>
                <button
                  className="primary full-width"
                  disabled={!choice}
                  onClick={() => setPhase("approval")}
                >
                  Prepare approval request <ArrowRight size={16} />
                </button>
              </>
            )}
            {phase === "approval" && action && (
              <div className="approval-review">
                <h3>Approve this preparation?</h3>
                <dl>
                  <div>
                    <dt>Action</dt>
                    <dd>{action.label}</dd>
                  </div>
                  <div>
                    <dt>Approval owner</dt>
                    <dd>{flag.owner} · demo role</dd>
                  </div>
                  <div>
                    <dt>Scope</dt>
                    <dd>Prepare a local draft or checklist</dd>
                  </div>
                </dl>
                <p>{flag.decision}</p>
                <button
                  className="primary full-width"
                  onClick={() => setPhase("approved")}
                >
                  Approve demo preparation <Check size={16} />
                </button>
                <button
                  className="text-button"
                  onClick={() => setPhase("decision")}
                >
                  Change the action
                </button>
              </div>
            )}
            {phase === "approved" && action && (
              <div className="approval-result" role="status">
                <div className="ready-note">
                  <CircleCheck size={20} />
                  <b>Approved in this demo · preparation ready</b>
                </div>
                <h3>{action.label}</h3>
                <pre className="prepared-draft">{action.preparation}</pre>
                <button
                  className="primary full-width"
                  onClick={() => {
                    setActive(null);
                    onNavigate(action.destination);
                  }}
                >
                  {action.button}
                  <ArrowRight size={16} />
                </button>
                <p className="footnote">
                  This local approval is not an approval in Seapoint or your
                  finance system.
                </p>
              </div>
            )}
            <details className="decision-evidence">
              <summary>
                Evidence and assumptions <ChevronDown size={14} />
              </summary>
              {flagError && (
                <p>
                  Live flag read failed: {flagError}. Illustrative tiles remain
                  marked Demo.
                </p>
              )}
              <ul>
                {flag.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p>
                Fetched {new Date(snapshot.fetchedAt).toLocaleString("en-GB")}.
                Latest booked activity:{" "}
                {snapshot.latestTransactionDate
                  ? new Date(snapshot.latestTransactionDate).toLocaleDateString(
                      "en-GB",
                    )
                  : "unavailable"}
                . Bank refresh times are not exposed.
              </p>
            </details>
            <details className="decision-evidence">
              <summary>
                How this fits your business <ChevronDown size={14} />
              </summary>
              <p>
                <b>{context.company}</b>: {context.goal}
              </p>
              <p>
                {context.bottleneck === "growth"
                  ? context.pipeline
                  : context.bottleneck === "founder"
                    ? context.team
                    : context.roadmap}
              </p>
              <p>
                Fictional business brief. Suggestions use explicit rules;
                narrative fields are not interpreted by an LLM.
              </p>
            </details>
            <p className="dialog-disclaimer">
              Demo approval only. Nothing moves money, books FX, freezes cards
              or sends messages.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

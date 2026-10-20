import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { Move } from "../signals";
import { planFor } from "../run-action";
import "./run-action.css";

export { planFor } from "../run-action";

const STEP_MS = 700;
const REDUCED_STEP_MS = 60;
const DONE_DELAY_MS = 900;

type Phase = "ready" | "running" | "done";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function RunAction(props: { move: Move; onDone: (receipt: string) => void }): JSX.Element {
  const { move, onDone } = props;
  const plan = useMemo(() => planFor(move), [move]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [step, setStep] = useState(0);
  const [subject, setSubject] = useState(move.email?.subject ?? "");
  const [body, setBody] = useState(move.email?.body ?? "");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (phase === "ready") return;
    const reduced = prefersReducedMotion();
    if (phase === "running") {
      const timer = window.setTimeout(
        () => {
          if (step + 1 >= plan.steps.length) {
            setStep(plan.steps.length);
            setPhase("done");
          } else setStep(step + 1);
        },
        reduced ? REDUCED_STEP_MS : STEP_MS,
      );
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => onDoneRef.current(plan.receipt),
      reduced ? DONE_DELAY_MS / 2 : DONE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, step, plan.steps.length]);

  const total = plan.steps.length;
  const progress =
    phase === "ready" ? 0 : phase === "done" ? 100 : ((step + 0.5) / total) * 100;
  const live =
    phase === "running"
      ? `Step ${step + 1} of ${total}: ${plan.steps[step]}`
      : phase === "done"
        ? plan.receipt
        : "";

  return (
    <section className={`run-action is-${phase}`} aria-busy={phase === "running"}>
      {phase === "ready" && (
        <div className="run-ready">
          <p className="run-label">What happens</p>
          <p className="run-summary">{move.decision}</p>
          {move.email && (
            <div className="run-email">
              <label className="run-field">
                <span>Subject</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="run-field">
                <span>Message</span>
                <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
            </div>
          )}
          <button
            type="button"
            className="run-button"
            onClick={() => {
              setStep(0);
              setPhase("running");
            }}
          >
            <span>{plan.button}</span>
            <ArrowRight aria-hidden size={18} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {phase !== "ready" && (
        <div className="run-progress">
          <div className="run-bar" aria-hidden>
            <div className="run-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <ol className="run-steps">
            {plan.steps.map((text, i) => {
              const state = i < step || phase === "done" ? "done" : i === step ? "active" : "pending";
              return (
                <li key={text} className={`run-step is-${state}`}>
                  <span className="run-dot" aria-hidden>
                    {state === "done" ? (
                      <Check size={14} strokeWidth={3} />
                    ) : state === "active" ? (
                      <span className="run-spinner" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="run-step-text">{text}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {phase === "done" && (
        <div className="run-done">
          <svg className="run-tick" viewBox="0 0 52 52" aria-hidden>
            <circle className="run-tick-ring" cx="26" cy="26" r="24" />
            <path className="run-tick-mark" d="M15 27 l7 7 l15 -16" />
          </svg>
          <p className="run-receipt">{plan.receipt}</p>
        </div>
      )}

      <p className="run-sr" aria-live="polite" role="status">
        {live}
      </p>
      <p className="run-footnote">Demo mode. No real money moved.</p>
    </section>
  );
}

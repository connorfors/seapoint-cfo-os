import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X, Mail, PartyPopper } from "lucide-react";
import { horizons, type Move } from "../signals";
import type { Horizon } from "../flags";
import { RunAction } from "./RunAction";
import "./decision-room.css";

type Filter = "all" | Horizon;
const doneKey = "headroom-done-v1";
const meaning = { red: "Act today", amber: "Review this week", green: "On track" };

function loadDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
const keyOf = (move: Move) => `${move.id}:${move.headline}`;

export function DecisionRoom({
  moves,
  company,
  loading,
  flagError,
  alertEmail,
  onSendAlert,
  onEvidence,
}: {
  moves: Move[];
  company: string;
  loading: boolean;
  flagError: string;
  alertEmail: string | null;
  onSendAlert: () => Promise<string>;
  onEvidence: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [done, setDone] = useState(loadDone);
  const [active, setActive] = useState<string | null>(null);
  const [phase, setPhase] = useState<"act" | "celebrate">("act");
  const [alertNote, setAlertNote] = useState("");
  const [sending, setSending] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const move = moves.find((m) => m.id === active);
  const handled = moves.filter((m) => done.has(keyOf(m))).length;
  const next = moves.find((m) => m.id !== active && !done.has(keyOf(m)));

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") return setActive(null);
      if (event.key !== "Tab") return;
      const items = dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled),textarea,summary",
      );
      const first = items?.[0];
      const last = items?.[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
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

  function open(id: string) {
    setActive(id);
    setPhase("act");
  }
  function complete(finished: Move) {
    const updated = new Set(done).add(keyOf(finished));
    setDone(updated);
    try {
      localStorage.setItem(doneKey, JSON.stringify([...updated]));
    } catch {
      /* Progress survives this session only. */
    }
    setPhase("celebrate");
  }
  function reset() {
    setDone(new Set());
    localStorage.removeItem(doneKey);
  }
  async function sendAlert() {
    setSending(true);
    setAlertNote("");
    try {
      setAlertNote(await onSendAlert());
    } catch (error) {
      setAlertNote(error instanceof Error ? error.message : "The alert could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const counts = Object.fromEntries(
    horizons.map((h) => [h.id, moves.filter((m) => m.horizon === h.id && !done.has(keyOf(m))).length]),
  ) as Record<Horizon, number>;
  const rows = horizons.filter((h) => filter === "all" || filter === h.id);

  return (
    <div className="room">
      <div className="room-heading">
        <div>
          <h1>Your next moves, in order.</h1>
          <p className="room-sub">
            {moves.length
              ? handled === moves.length
                ? "Everything is handled. Well done."
                : `${handled} of ${moves.length} handled`
              : loading
                ? "Reading your finances…"
                : "Nothing needs you right now."}
          </p>
          <div className="room-progress" aria-hidden="true">
            <span style={{ width: `${moves.length ? (handled / moves.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="room-alerts">
          {alertEmail ? (
            <>
              <span>
                <Mail size={14} /> Alerts on for {alertEmail}
              </span>
              <button className="room-ghost" onClick={() => void sendAlert()} disabled={sending}>
                {sending ? "Sending…" : "Send a test alert"}
              </button>
            </>
          ) : (
            <span className="muted">
              <Mail size={14} /> Email alerts are off
            </span>
          )}
          {alertNote && (
            <small role="status" className="room-alert-note">
              {alertNote}
            </small>
          )}
        </div>
      </div>

      <div className="room-filters" role="group" aria-label="Show moves for">
        {(
          [
            { id: "all", label: "All" },
            ...horizons,
          ] as { id: Filter; label: string }[]
        ).map((f) => (
          <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.id !== "all" && <i className={`dot ${f.id}`} />}
            {f.label}
            {f.id !== "all" && <b>{counts[f.id]}</b>}
          </button>
        ))}
        {handled > 0 && (
          <button className="room-reset" onClick={reset}>
            Reset demo
          </button>
        )}
      </div>

      {flagError && (
        <p className="room-error" role="alert">
          Live flags could not load: {flagError}
        </p>
      )}

      {rows.map((row) => {
        const items = moves.filter((m) => m.horizon === row.id);
        return (
          <section key={row.id} className={`room-row ${row.id}`} aria-labelledby={`row-${row.id}`}>
            <h2 id={`row-${row.id}`}>
              <i className={`dot ${row.id}`} />
              {row.label}
              <span>{items.length ? meaning[items[0]!.rag] : "Nothing here"}</span>
            </h2>
            {items.length > 0 && (
              <div className="room-grid">
                {items.map((m, index) => {
                  const finished = done.has(keyOf(m));
                  return (
                    <article
                      key={m.id}
                      className={`move-card ${m.rag} ${finished ? "finished" : ""}`}
                      style={{ animationDelay: `${index * 60}ms` }}
                      aria-labelledby={`move-${m.id}`}
                    >
                      <header>
                        <h3 id={`move-${m.id}`}>{m.title}</h3>
                        {finished ? (
                          <span className="move-done">
                            <Check size={14} /> Done
                          </span>
                        ) : (
                          <span className={`move-rag ${m.rag}`} role="img" aria-label={m.rag} />
                        )}
                      </header>
                      <p className="move-headline">{m.headline}</p>
                      <p className="move-metric">{m.metric}</p>
                      <div className="move-action">
                        <button
                          className="move-button"
                          onClick={() => open(m.id)}
                          aria-describedby={`preview-${m.id}`}
                        >
                          {finished ? "View what you did" : "Take action now"}
                          <ArrowRight size={16} />
                        </button>
                        <div className="move-preview" role="tooltip" id={`preview-${m.id}`}>
                          <b>What happens</b>
                          {m.decision}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div className="room-footer">
        <button className="text-button" onClick={onEvidence}>
          View financial evidence <ArrowRight size={13} />
        </button>
      </div>

      {move && (
        <div className="room-overlay" onMouseDown={(e) => e.target === e.currentTarget && setActive(null)}>
          <div
            className={`room-dialog ${phase}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            tabIndex={-1}
            ref={dialog}
          >
            <button className="dialog-close" aria-label="Close" onClick={() => setActive(null)}>
              <X size={20} />
            </button>
            {phase === "act" ? (
              <>
                <span className={`dialog-rag ${move.rag}`}>
                  <i /> {meaning[move.rag]}
                </span>
                <h2 id="dialog-title">{move.title}</h2>
                <p className="dialog-headline">
                  {move.headline}
                  <small>{move.metric}</small>
                </p>
                {move.why && (
                  <div className="dialog-why">
                    <b>Why this matters for {company}</b>
                    {move.why}
                  </div>
                )}
                {move.detail.length > 0 && (
                  <ul className="dialog-detail">
                    {move.detail.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                <RunAction move={move} onDone={() => complete(move)} />
                <p className="dialog-source">Source: {move.source}</p>
              </>
            ) : (
              <div className="celebrate" role="status">
                <div className="confetti" aria-hidden="true">
                  {Array.from({ length: 28 }, (_, i) => (
                    <span key={i} style={{ ["--i" as string]: i }} />
                  ))}
                </div>
                <div className="celebrate-badge">
                  <PartyPopper size={34} />
                </div>
                <h2 id="dialog-title">Well done.</h2>
                <p className="celebrate-line">
                  {move.title} is handled. {handled === moves.length ? "That was the last one." : `That is ${handled} of ${moves.length}.`}
                </p>
                <span className="celebrate-impact">
                  <Check size={14} /> {move.impact}
                </span>
                <div className="celebrate-actions">
                  {next ? (
                    <button className="move-button" onClick={() => open(next.id)}>
                      Next: {next.title} <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button className="move-button" onClick={() => setActive(null)}>
                      See your clear board <ArrowRight size={16} />
                    </button>
                  )}
                  <button className="room-ghost" onClick={() => setActive(null)}>
                    Back to my moves
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

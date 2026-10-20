import { ThemeToggle } from "./components/ThemeToggle";
import { CashPlot } from "./components/CashPlot";
import { DecisionRoom } from "./components/DecisionRoom";
import { CashView } from "./components/CashReadiness";
import { Evidence } from "./components/BusinessEvidence";
import { PortalDemo } from "./components/InvoicePortal";
import { money, runway, Tag, Back } from "./components/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Leaf,
  LoaderCircle,
  RefreshCw,
  Building2,
  ExternalLink,
} from "lucide-react";
import { z } from "zod";
import {
  liveFlagsSchema,
  type LiveFlag,
  contextSchema,
  demoContext,
  organisationSchema,
  snapshotSchema,
  type BusinessContext,
  type Organisation,
  type Snapshot,
} from "./contracts";
import {
  actionsForPlan,
  actionCost,
  plans,
  project,
  recommend,
  type PlanId,
} from "./model";
import { demoToday, demoPayments, planPayments } from "./readiness";

type View = "moves" | "context" | "evidence" | "cash" | "strategy" | "portal";
type Load =
  | { kind: "loading" }
  | { kind: "select" }
  | { kind: "error"; message: string }
  | { kind: "ready"; snapshot: Snapshot };
function initialContext(): BusinessContext {
  try {
    const stored = localStorage.getItem("headroom-context-v2");
    if (stored) {
      const parsed = contextSchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* Storage is optional. */
  }
  return demoContext;
}
async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(
      error.success
        ? error.data.error
        : "The local Seapoint connection failed.",
    );
  }
  return body;
}
export function App() {
  const [view, setView] = useState<View>("moves");
  const [context, setContext] = useState(initialContext);
  const [draft, setDraft] = useState(context);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [liveFlags, setLiveFlags] = useState<LiveFlag[]>([]);
  const [flagError, setFlagError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [asOf, setAsOf] = useState(demoToday);
  const [chosen, setChosen] = useState<PlanId | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    let active = true;
    getJson("/api/organisations")
      .then((body) => {
        if (!active) return;
        const entries = z.array(organisationSchema).parse(body);
        setOrganisations(entries);
        if (entries.length === 1 && entries[0])
          setOrganisationId(entries[0].id);
        else if (entries.length) setLoad({ kind: "select" });
        else
          setLoad({
            kind: "error",
            message:
              "No organisations are accessible through this Seapoint connection.",
          });
      })
      .catch((error) => {
        if (active)
          setLoad({
            kind: "error",
            message:
              error instanceof Error ? error.message : "The connection failed.",
          });
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!organisationId) return;
    const request = ++sequence.current;
    setLoad({ kind: "loading" });
    setError("");
    getJson(`/api/snapshot?organisation=${encodeURIComponent(organisationId)}`)
      .then((body) => {
        if (request === sequence.current)
          setLoad({ kind: "ready", snapshot: snapshotSchema.parse(body) });
      })
      .catch((error) => {
        if (request === sequence.current)
          setLoad({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "The baseline could not load.",
          });
      });
  }, [organisationId]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);
  async function refresh() {
    if (!organisationId) return;
    const request = ++sequence.current;
    setRefreshing(true);
    setError("");
    try {
      const body = await getJson(
        `/api/snapshot?organisation=${encodeURIComponent(organisationId)}&refresh=1`,
      );
      if (request === sequence.current)
        setLoad({ kind: "ready", snapshot: snapshotSchema.parse(body) });
    } catch (error) {
      if (request === sequence.current)
        setError(
          error instanceof Error
            ? error.message
            : "Refresh failed. Previous figures remain visible.",
        );
    } finally {
      if (request === sequence.current) setRefreshing(false);
    }
  }
  function saveContext(event: FormEvent) {
    event.preventDefault();
    const parsed = contextSchema.safeParse(draft);
    if (!parsed.success) {
      setSaveError(
        parsed.error.issues[0]?.message ?? "Check the business context.",
      );
      return;
    }
    setContext(parsed.data);
    setChosen(null);
    setSaveError("");
    try {
      localStorage.setItem("headroom-context-v2", JSON.stringify(parsed.data));
    } catch {
      setSaveError(
        "Context is active for this session. Browser storage is unavailable.",
      );
    }
    setView("moves");
  }
  const snapshot = load.kind === "ready" ? load.snapshot : null;
  useEffect(() => {
    if (!snapshot) {
      setLiveFlags([]);
      return;
    }
    let active = true;
    setFlagError("");
    getJson(
      `/api/flags?organisation=${encodeURIComponent(snapshot.organisation.id)}`,
    )
      .then((body) => {
        if (active) setLiveFlags(liveFlagsSchema.parse(body).flags);
      })
      .catch((error) => {
        if (active) {
          setLiveFlags([]);
          setFlagError(
            error instanceof Error
              ? error.message
              : "Live flag details could not load.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [snapshot?.organisation.id, snapshot?.fetchedAt]);
  const recommended = snapshot ? recommend(context, snapshot) : null;
  const selected = chosen ?? recommended?.plan ?? "lean";
  const selectedPlan = plans.find((plan) => plan.id === selected);
  const forecast = snapshot
    ? project({ snapshot, context, actions: actionsForPlan(selected) })
    : null;
  const payments = snapshot
    ? planPayments(snapshot.accounts, demoPayments(snapshot.accounts), asOf)
    : [];
  function go(view: View) {
    if (view === "context") setDraft(context);
    setView(view);
  }
  return (
    <div className="app">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => go("moves")}
          aria-label="Headroom home"
        >
          <span className="brand-symbol">
            <Leaf size={20} />
          </span>
          headroom<span className="brand-caption">CFO workspace</span>
        </button>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "moves", label: "Next moves" },
              { id: "context", label: "Business context" },
              { id: "evidence", label: "Financial evidence" },
            ] satisfies { id: View; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="connection">
          <span className={`dot ${snapshot ? "connected" : ""}`} />
          {snapshot
            ? error
              ? "Snapshot retained · refresh failed"
              : "Seapoint connected"
            : "Connecting Seapoint"}
        </div>
        <ThemeToggle />
      </header>
      <main>
        <div className="workspace-bar">
          <div>
            <Building2 size={15} />
            {organisations.length > 1 ? (
              <label className="sr-only-label">
                Organisation
                <select
                  value={organisationId}
                  onChange={(event) => {
                    setOrganisationId(event.target.value);
                    setRefreshing(false);
                    setChosen(null);
                  }}
                >
                  <option value="">Select organisation</option>
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>{snapshot?.organisation.name ?? "Seapoint workspace"}</span>
            )}
            <span className="separator">/</span>
            <span>Hackathon demo</span>
          </div>
          <button
            className="quiet small"
            onClick={() => void refresh()}
            disabled={!organisationId || refreshing}
          >
            <RefreshCw size={13} className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
        {error && (
          <div className="notice negative" role="alert">
            Refresh failed: {error} Previous figures remain visible.
          </div>
        )}
        {load.kind === "loading" && (
          <div className="empty">
            <LoaderCircle className="spin" size={26} />
            <h1>Reading your financial picture</h1>
            <p>
              Loading accounts, transactions, supplier bills and payroll from
              Seapoint.
            </p>
          </div>
        )}
        {load.kind === "select" && (
          <div className="empty">
            <h1>Choose your organisation</h1>
            <p>Select a Seapoint organisation above to begin.</p>
          </div>
        )}
        {load.kind === "error" && (
          <div className="empty">
            <h1>Seapoint could not load</h1>
            <p role="alert">{load.message}</p>
            <button
              className="primary"
              onClick={() =>
                organisationId ? void refresh() : window.location.reload()
              }
            >
              Try again
            </button>
          </div>
        )}
        {snapshot && (
          <>
            {view === "moves" && (
              <DecisionRoom
                snapshot={snapshot}
                context={context}
                plan={selected}
                asOf={asOf}
                liveFlags={liveFlags}
                flagError={flagError}
                onNavigate={go}
              />
            )}
            {view === "cash" && (
              <CashView
                payments={payments}
                asOf={asOf}
                setAsOf={setAsOf}
                back={() => go("moves")}
              />
            )}
            {view === "portal" && <PortalDemo back={() => go("moves")} />}
            {view === "context" && (
              <>
                <Back onClick={() => go("moves")} />
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">The business behind the numbers</p>
                    <h1>Tell Headroom what matters.</h1>
                    <p>
                      This fictional brief fills the gaps Seapoint cannot see.
                      Edit it for your pitch.
                    </p>
                  </div>
                  <Tag tone="demo">Demo business context</Tag>
                </div>
                <form className="context-form" onSubmit={saveContext}>
                  <div className="form-section">
                    <h2>The company</h2>
                    <div className="form-grid">
                      <label>
                        Company name
                        <input
                          value={draft.company}
                          maxLength={100}
                          required
                          onChange={(e) =>
                            setDraft({ ...draft, company: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Primary constraint
                        <select
                          value={draft.bottleneck}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              bottleneck: contextSchema.shape.bottleneck.parse(
                                e.target.value,
                              ),
                            })
                          }
                        >
                          <option value="growth">Pipeline & growth</option>
                          <option value="founder">Founder capacity</option>
                          <option value="delivery">Product delivery</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  {(
                    [
                      { key: "product", label: "What is the product?" },
                      { key: "customers", label: "Who are the customers?" },
                      { key: "pricing", label: "How is it priced?" },
                      {
                        key: "goal",
                        label: "What should the business achieve?",
                      },
                      { key: "team", label: "Team size and roles" },
                      { key: "funding", label: "Funding to date" },
                      {
                        key: "deals",
                        label: "Current deals and invoice blockers",
                      },
                      { key: "raising", label: "Current raise and milestones" },
                      { key: "pipeline", label: "Sales pipeline" },
                      { key: "roadmap", label: "Product roadmap" },
                      { key: "bets", label: "Experiments and big bets" },
                      { key: "notes", label: "Other context and assumptions" },
                    ] satisfies {
                      key: keyof Pick<
                        BusinessContext,
                        | "product"
                        | "customers"
                        | "pricing"
                        | "goal"
                        | "team"
                        | "funding"
                        | "deals"
                        | "raising"
                        | "pipeline"
                        | "roadmap"
                        | "bets"
                        | "notes"
                      >;
                      label: string;
                    }[]
                  ).map((field) => (
                    <label className="context-field" key={field.key}>
                      {field.label}
                      <textarea
                        value={draft[field.key]}
                        rows={3}
                        required={field.key !== "notes"}
                        onChange={(e) =>
                          setDraft({ ...draft, [field.key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <div className="form-section">
                    <h2>Decision guardrails</h2>
                    <div className="form-grid three">
                      <label>
                        Capital to allocate · {snapshot.currency}
                        <input
                          type="number"
                          min="0"
                          max="100000000"
                          required
                          value={draft.budget}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              budget: e.target.valueAsNumber,
                            })
                          }
                        />
                      </label>
                      <label>
                        Minimum runway · months
                        <input
                          type="number"
                          min="1"
                          max="60"
                          required
                          value={draft.minimumRunway}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              minimumRunway: e.target.valueAsNumber,
                            })
                          }
                        />
                      </label>
                      <label>
                        Employer overhead · %
                        <input
                          type="number"
                          min="0"
                          max="100"
                          required
                          value={Math.round(draft.employerOverhead * 100)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              employerOverhead: e.target.valueAsNumber / 100,
                            })
                          }
                        />
                      </label>
                    </div>
                    <p>
                      Capital comes from existing cash. It does not add £700k to
                      your bank balance.
                    </p>
                  </div>
                  <div className="notice">
                    The local rules use your primary constraint, budget, runway
                    floor and employer overhead. Narrative fields inform the
                    visible brief; an LLM does not interpret them.
                  </div>
                  {saveError && (
                    <p role="alert" className="error-text">
                      {saveError}
                    </p>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => setDraft(demoContext)}
                    >
                      Restore fictional brief
                    </button>
                    <button className="primary" type="submit">
                      Use this business context <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              </>
            )}
            {view === "strategy" && (
              <>
                <Back onClick={() => go("moves")} />
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">Strategy into commitments</p>
                    <h1>Back the constraint. Stage the spend.</h1>
                    <p>{context.goal}</p>
                  </div>
                  <Tag tone="demo">Illustrative salaries and costs</Tag>
                </div>
                <div className="notice">
                  <strong>
                    My starting point:{" "}
                    {plans.find((plan) => plan.id === recommended?.plan)?.title}
                    .
                  </strong>{" "}
                  {recommended?.rationale}
                </div>
                {forecast && (
                  <CashPlot forecast={forecast} currency={snapshot.currency} />
                )}
                <div className="strategy-layout">
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Compare the next 12 months</h2>
                      <button
                        className="text-button"
                        onClick={() => go("context")}
                      >
                        Edit guardrails <ArrowUpRight size={13} />
                      </button>
                    </div>
                    <div className="plan-options">
                      {plans.map((plan) => {
                        const result = project({
                          snapshot,
                          context,
                          actions: actionsForPlan(plan.id),
                        });
                        return (
                          <button
                            key={plan.id}
                            className={`plan-option ${selected === plan.id ? "selected" : ""}`}
                            onClick={() => setChosen(plan.id)}
                            aria-pressed={selected === plan.id}
                          >
                            <span className="plan-marker">
                              {selected === plan.id && <Check size={14} />}
                            </span>
                            <span>
                              <b>{plan.title}</b>
                              <small>{plan.description}</small>
                              <span className="plan-metrics">
                                {money(
                                  result.annualAllocation,
                                  snapshot.currency,
                                )}{" "}
                                allocated <span>·</span> {runway(result.runway)}{" "}
                                runway
                              </span>
                              {(!result.withinBudget ||
                                !result.protectsRunway) && (
                                <span className="error-text">
                                  {!result.withinBudget
                                    ? "Exceeds deployment budget"
                                    : "Below runway floor"}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <aside className="panel decision-panel">
                    <span className="tiny-label">WORKING PLAN</span>
                    <h2>{selectedPlan?.title}</h2>
                    <dl className="decision-numbers">
                      <div>
                        <dt>First-year commitments</dt>
                        <dd>
                          {money(
                            forecast?.annualAllocation ?? 0,
                            snapshot.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Budget left uncommitted</dt>
                        <dd>
                          {money(
                            forecast?.remainingBudget ?? 0,
                            snapshot.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Cash after 12 months</dt>
                        <dd>
                          {money(forecast?.cashAfter12 ?? 0, snapshot.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Modelled runway</dt>
                        <dd>{runway(forecast?.runway ?? null)}</dd>
                      </div>
                    </dl>
                    <p>
                      Existing net burn:{" "}
                      {money(snapshot.netBurn, snapshot.currency)}/month, based
                      on {snapshot.period.label}. No new sales or funding
                      assumed.
                    </p>
                    <button className="primary" onClick={() => go("moves")}>
                      Use this working plan <Check size={15} />
                    </button>
                  </aside>
                </div>
                <section className="panel commitment-panel">
                  <h2>Make the next step concrete</h2>
                  {actionsForPlan(selected)
                    .filter((a) => a.enabled)
                    .map((action) => (
                      <div className="commitment" key={action.id}>
                        <div>
                          <span className="tiny-label">
                            MONTH {action.startMonth} · {action.kind}
                          </span>
                          <h3>{action.name}</h3>
                          <p>{action.success}</p>
                        </div>
                        <div className="commitment-cost">
                          <strong>
                            {money(
                              actionCost(action, context),
                              snapshot.currency,
                            )}
                          </strong>
                          <small>
                            first year ·{" "}
                            {action.kind === "hire"
                              ? `${money(action.annualCost, snapshot.currency)} salary + ${Math.round(context.employerOverhead * 100)}% overhead`
                              : `${money(action.annualCost, snapshot.currency)}/year recurring`}
                            <br />
                            {money(action.setupCost, snapshot.currency)}{" "}
                            one-time
                          </small>
                        </div>
                      </div>
                    ))}
                  {selected === "lean" && (
                    <p>
                      Review costs and the business constraint before adding
                      commitments.
                    </p>
                  )}
                  <div className="notice">
                    Decision gate: fund a 90-day test first. Review qualified
                    pipeline and delivery capacity before a second hire.
                    Expected ROI remains unproven.
                  </div>
                  <p className="footnote">
                    Recurring commitments continue beyond month 12. One-time
                    capital costs apply once. This model repeats historical net
                    burn; it does not time individual bills or account
                    transfers.
                  </p>
                </section>
              </>
            )}
            {view === "evidence" && (
              <Evidence snapshot={snapshot} back={() => go("moves")} />
            )}
          </>
        )}
      </main>
      <footer className="app-footer">
        <span>Headroom / Seapoint hackathon</span>
        <a
          href="https://github.com/connorfors/seapoint-cfo-os"
          target="_blank"
          rel="noreferrer"
        >
          Build with the team <ExternalLink size={12} />
        </a>
      </footer>
    </div>
  );
}

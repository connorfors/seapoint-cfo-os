import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  GitBranch,
  Layers3,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { z } from "zod";
import {
  contextSchema,
  demoContext,
  organisationSchema,
  snapshotSchema,
  type BusinessContext,
  type Organisation,
  type Snapshot,
} from "./contracts";
import {
  actionCost,
  actionsForPlan,
  plans,
  project,
  recommend,
  type Action,
  type PlanId,
} from "./model";

type View = "plan" | "context" | "evidence";
type LoadState =
  | { kind: "loading" }
  | { kind: "select" }
  | { kind: "error"; message: string }
  | { kind: "ready"; snapshot: Snapshot };

function initialContext(): BusinessContext {
  try {
    const saved = localStorage.getItem("headroom-context-v1");
    if (saved) {
      const parsed = contextSchema.safeParse(JSON.parse(saved));
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* A disabled or full storage area should not prevent local planning. */
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
        : "The local Seapoint server could not load the data.",
    );
  }
  return body;
}

function money(value: number, currency: string, compact = false): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    ...(compact ? { notation: "compact" } : {}),
  }).format(value);
}
function months(value: number | null) {
  return value === null ? "No cash-zero date" : `${value.toFixed(1)} months`;
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function App() {
  const [view, setView] = useState<View>("plan");
  const [context, setContext] = useState(initialContext);
  const [draft, setDraft] = useState(context);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [actions, setActions] = useState<Action[]>(actionsForPlan("growth"));
  const [planId, setPlanId] = useState<PlanId>("growth");
  const [custom, setCustom] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [upside, setUpside] = useState(0);
  const [upsideOpen, setUpsideOpen] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [exportError, setExportError] = useState("");
  const loadSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getJson("/api/organisations")
      .then((body) => {
        if (cancelled) return;
        const entries = z.array(organisationSchema).parse(body);
        setOrganisations(entries);
        if (entries.length === 1 && entries[0])
          setOrganisationId(entries[0].id);
        else if (entries.length > 1) setState({ kind: "select" });
        else
          setState({
            kind: "error",
            message: "Your Seapoint account has no accessible organisations.",
          });
      })
      .catch((error) => {
        if (!cancelled)
          setState({
            kind: "error",
            message:
              error instanceof Error ? error.message : "The connection failed.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!organisationId) return;
    const sequence = ++loadSequence.current;
    setState({ kind: "loading" });
    getJson(`/api/snapshot?organisation=${encodeURIComponent(organisationId)}`)
      .then((body) => {
        if (sequence === loadSequence.current)
          setState({ kind: "ready", snapshot: snapshotSchema.parse(body) });
      })
      .catch((error) => {
        if (sequence === loadSequence.current)
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "The financial baseline could not load.",
          });
      });
  }, [organisationId]);

  async function refresh() {
    if (!organisationId) return;
    const sequence = ++loadSequence.current;
    setRefreshing(true);
    setRefreshError("");
    try {
      const body = await getJson(
        `/api/snapshot?organisation=${encodeURIComponent(organisationId)}&refresh=1`,
      );
      if (sequence === loadSequence.current)
        setState({ kind: "ready", snapshot: snapshotSchema.parse(body) });
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : "Refresh failed. The previous snapshot is still shown.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function changeView(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }
  function choosePlan(id: PlanId) {
    setPlanId(id);
    setActions(actionsForPlan(id));
    setCustom(false);
  }
  function editAction(
    id: string,
    patch: Partial<
      Pick<Action, "enabled" | "annualCost" | "setupCost" | "startMonth">
    >,
  ) {
    setActions((current) =>
      current.map((action) =>
        action.id === id ? { ...action, ...patch } : action,
      ),
    );
    setCustom(true);
  }
  function saveContext(event: FormEvent) {
    event.preventDefault();
    const parsed = contextSchema.safeParse(draft);
    if (!parsed.success) return;
    setContext(parsed.data);
    try {
      localStorage.setItem("headroom-context-v1", JSON.stringify(parsed.data));
    } catch {
      /* In-memory planning remains available. */
    }
    if (state.kind === "ready")
      choosePlan(recommend(parsed.data, state.snapshot).plan);
    changeView("plan");
  }

  const snapshot = state.kind === "ready" ? state.snapshot : null;
  const currency = snapshot?.currency ?? "GBP";
  const result = snapshot
    ? project({ snapshot, context, actions, upside })
    : null;
  const recommendation = snapshot ? recommend(context, snapshot) : null;
  const chosenPlan = plans.find((plan) => plan.id === planId);
  const baseline = snapshot
    ? project({ snapshot, context, actions: [] })
    : null;

  function exportBrief() {
    if (!snapshot || !result) return;
    try {
      const lines = [
        "# Headroom — decision brief",
        "",
        "Fictional business context; live Seapoint financial snapshot.",
        `Company: ${context.company}`,
        `Product: ${context.product}`,
        `Goal: ${context.goal}`,
        `Team: ${context.team}`,
        `Bottleneck: ${context.bottleneck}`,
        `Notes: ${context.notes}`,
        "",
        `Seapoint organisation: ${snapshot.organisation.name}`,
        `Retrieved: ${snapshot.fetchedAt}`,
        `Financial period: ${snapshot.period.label}`,
        `Cash: ${money(snapshot.cash, currency)}`,
        `Monthly net burn: ${money(snapshot.netBurn, currency)}`,
        `Planning budget: ${money(context.budget, currency)}`,
        `Minimum runway: ${context.minimumRunway} months`,
        "",
        `Plan: ${custom ? "Custom plan" : chosenPlan?.title}`,
        `12-month new commitments: ${money(result.annualAllocation, currency)}`,
        `Cash after 12 months: ${money(result.cashAfter12, currency)}`,
        `Projected runway: ${months(result.runway)}`,
        "",
        "## Selected actions",
        ...actions
          .filter((action) => action.enabled)
          .map(
            (action) =>
              `- ${action.name}: ${money(actionCost(action, context), currency)} over 12 months; start month ${action.startMonth}. ${action.why}`,
          ),
        "",
        "## Assumptions",
        `Employer costs: ${Math.round(context.employerOverhead * 100)}% above salary. Existing net burn repeats. New recurring costs continue after month 12.`,
        `Additional net cash contribution assumption: ${money(upside, currency)} per month from month 6, after extra delivery costs. This is unproven.`,
        "Hiring costs and business outcomes are fictional planning assumptions. Recommendations use local rules, not an LLM.",
        "Open invoices are shown separately and are not deducted again from the spending baseline.",
        "",
        "## Data caveats",
        ...snapshot.warnings.map((warning) => `- ${warning}`),
      ];
      const url = URL.createObjectURL(
        new Blob([lines.join("\n")], { type: "text/markdown" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "headroom-decision-brief.md";
      anchor.click();
      URL.revokeObjectURL(url);
      setExportError("");
    } catch {
      setExportError(
        "The brief could not download. Check browser download permissions.",
      );
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to planning room
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => changeView("plan")}
          aria-label="Headroom planning room"
        >
          <span className="brand-mark">
            <Leaf size={21} strokeWidth={1.8} />
          </span>
          headroom<span className="brand-period">.</span>
        </button>
        <div className="workspace">
          <span className="workspace-avatar">N</span>
          <div>
            <strong>{context.company}</strong>
            <small>Hackathon workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">Workspace</span>
        <nav aria-label="Main navigation">
          <button
            className={view === "plan" ? "nav-item active" : "nav-item"}
            aria-label="Decision room"
            aria-current={view === "plan" ? "page" : undefined}
            onClick={() => changeView("plan")}
          >
            <Layers3 size={17} />
            <span className="nav-label-full">Decision room</span>
            <span className="nav-label-short">Plans</span>
            <span className="nav-dot" />
          </button>
          <button
            className={view === "context" ? "nav-item active" : "nav-item"}
            aria-label="Business context"
            aria-current={view === "context" ? "page" : undefined}
            onClick={() => {
              setDraft(context);
              changeView("context");
            }}
          >
            <Building2 size={17} />
            <span className="nav-label-full">Business context</span>
            <span className="nav-label-short">Context</span>
          </button>
          <button
            className={view === "evidence" ? "nav-item active" : "nav-item"}
            aria-label="Financial evidence"
            aria-current={view === "evidence" ? "page" : undefined}
            onClick={() => changeView("evidence")}
          >
            <Wallet size={17} />
            <span className="nav-label-full">Financial evidence</span>
            <span className="nav-label-short">Evidence</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <GitBranch size={17} />
          <strong>
            One next move.
            <br />A clearer picture.
          </strong>
          <p>Compare the decisions that shape your company.</p>
        </div>
        <div className="sidebar-bottom">
          <div className="source-lock">
            <ShieldCheck size={17} />
            <span>
              Financial reads only<small>Nothing moves money.</small>
            </span>
          </div>
          <a
            href="https://github.com/connorfors/seapoint-cfo-os"
            target="_blank"
            rel="noreferrer"
          >
            Team repository
            <ArrowUpRight size={14} />
          </a>
          <span className="hackathon-credit">
            Built at the Seapoint hackathon
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace<span>/</span>
            <strong>
              {view === "plan"
                ? "Decision room"
                : view === "context"
                  ? "Business context"
                  : "Financial evidence"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className={`connection-badge ${snapshot ? "" : "pending"}`}>
              <i />
              {snapshot
                ? "Seapoint connected"
                : state.kind === "error"
                  ? "Connection needs attention"
                  : "Connecting Seapoint"}
            </span>
            <button
              className="icon-button"
              title="Refresh Seapoint data"
              aria-label="Refresh Seapoint data"
              onClick={() => {
                void refresh();
              }}
              disabled={refreshing || !organisationId}
            >
              <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            </button>
            <span className="avatar">CF</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {refreshError && (
            <div className="error-banner" role="alert">
              Refresh failed: {refreshError} The previous snapshot remains
              visible.
            </div>
          )}
          {exportError && (
            <div className="error-banner" role="alert">
              {exportError}
            </div>
          )}
          {organisations.length > 1 && (
            <label className="organisation-picker">
              Seapoint organisation
              <select
                value={organisationId}
                onChange={(event) => setOrganisationId(event.target.value)}
              >
                <option value="">Select an organisation</option>
                {organisations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {state.kind !== "ready" && view !== "context" && (
            <section className="connection-state" aria-live="polite">
              {state.kind === "loading" ? (
                <>
                  <LoaderCircle className="spin" size={28} />
                  <h1>Reading the financial picture.</h1>
                  <p>
                    Fetching account balances, spending and the Seapoint
                    calculation rules.
                  </p>
                </>
              ) : state.kind === "select" ? (
                <>
                  <Building2 size={28} />
                  <h1>Choose the company.</h1>
                  <p>
                    Select one organisation above. Its data stays separate from
                    other businesses.
                  </p>
                </>
              ) : (
                <>
                  <CircleHelp size={28} />
                  <h1>Seapoint needs attention.</h1>
                  <p>{state.message}</p>
                  <code>codex mcp login seapoint-staging</code>
                  <button
                    className="button primary"
                    onClick={() => location.reload()}
                  >
                    Try connection again
                    <RefreshCw size={16} />
                  </button>
                </>
              )}
            </section>
          )}
          {view === "plan" &&
            snapshot &&
            result &&
            recommendation &&
            baseline && (
              <>
                <div className="page-intro">
                  <div>
                    <span className="eyebrow">Your next chapter</span>
                    <h1>
                      Make the next <br />
                      <span>{money(context.budget, currency, true)}</span>{" "}
                      count.
                    </h1>
                    <p>
                      Big decisions deserve more than a gut feeling.
                      <br className="desktop-break" /> Put your next move
                      against the numbers.
                    </p>
                  </div>
                  <div className="context-preview">
                    <div className="context-preview-top">
                      <span className="small-icon">
                        <Building2 size={18} />
                      </span>
                      <span className="fiction-label">
                        Fictional business brief
                      </span>
                    </div>
                    <h2>{context.company}</h2>
                    <p>{context.goal}</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setDraft(context);
                        changeView("context");
                      }}
                    >
                      Review business context
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="stat-strip">
                  <Stat
                    label="Cash available"
                    value={money(snapshot.cash, currency, true)}
                    note={`${snapshot.accounts.length} accounts · Seapoint`}
                    icon={<Wallet size={16} />}
                  />
                  <Stat
                    label="Monthly net burn"
                    value={money(snapshot.netBurn, currency, true)}
                    note={`${snapshot.period.label} · ${snapshot.period.months === 1 ? "last full month" : "monthly average"}`}
                    icon={<ArrowDownLeft size={16} />}
                  />
                  <Stat
                    label="Baseline runway"
                    value={
                      baseline.runway === null
                        ? "No cash-zero date"
                        : `${baseline.runway.toFixed(1)} months`
                    }
                    note="Before new commitments"
                    icon={<TrendingUp size={16} />}
                  />
                  <Stat
                    label="Deployment budget"
                    value={money(context.budget, currency, true)}
                    note="Your editable planning limit"
                    icon={<Target size={16} />}
                  />
                </div>
                <section className="recommendation">
                  <span className="recommendation-icon">
                    <Sparkles size={21} />
                  </span>
                  <div>
                    <div className="recommendation-title">
                      <span>Suggested direction</span>
                      <span className="small-tag">
                        Context + financial constraints
                      </span>
                    </div>
                    <h2>
                      {
                        plans.find((plan) => plan.id === recommendation.plan)
                          ?.title
                      }
                    </h2>
                    <p>{recommendation.rationale}</p>
                  </div>
                  {recommendation.plan !== planId && (
                    <button
                      className="button secondary"
                      onClick={() => choosePlan(recommendation.plan)}
                    >
                      Compare this plan
                      <ArrowRight size={15} />
                    </button>
                  )}
                </section>
                <div className="planning-grid">
                  <section className="panel cash-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">
                          The financial consequence
                        </span>
                        <h2>Cash, with a plan.</h2>
                      </div>
                      <button
                        className={`button small ${upsideOpen ? "selected" : "secondary"}`}
                        onClick={() => setUpsideOpen(!upsideOpen)}
                        aria-expanded={upsideOpen}
                      >
                        <SlidersHorizontal size={14} />
                        Test upside
                      </button>
                    </div>
                    <div className="cash-headline">
                      <strong>
                        {money(result.cashAfter12, currency, true)}
                      </strong>
                      <span>projected cash in 12 months</span>
                    </div>
                    <CashChart
                      points={result.points}
                      currency={currency}
                      fetchedAt={snapshot.fetchedAt}
                    />
                    <div className="chart-legend">
                      <span>
                        <i className="legend-line baseline-line" />
                        Current trajectory
                      </span>
                      <span>
                        <i className="legend-line plan-line" />
                        {custom ? "Your custom plan" : chosenPlan?.title}
                      </span>
                    </div>
                    {upsideOpen && (
                      <div className="upside-controls">
                        <label htmlFor="upside">
                          Additional monthly cash contribution from month 6
                          <strong>{money(upside, currency)}</strong>
                        </label>
                        <input
                          id="upside"
                          type="range"
                          min="0"
                          max="50000"
                          step="1000"
                          value={upside}
                          onChange={(event) =>
                            setUpside(Number(event.target.value))
                          }
                        />
                        <p>
                          Unproven assumption, after extra delivery costs. No
                          uplift is included until you set it.
                        </p>
                      </div>
                    )}
                    <div className="chart-footer">
                      <p>
                        {upside === 0
                          ? "Base case: no extra cash contribution assumed."
                          : `Assumed upside: ${money(upside, currency)}/month from month 6.`}{" "}
                        Existing net burn repeats.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setShowNumbers(!showNumbers)}
                        aria-expanded={showNumbers}
                      >
                        {showNumbers ? "Hide" : "Show"} numbers
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    {showNumbers && (
                      <div className="table-scroll">
                        <table>
                          <caption className="sr-only">
                            Monthly cash projection
                          </caption>
                          <thead>
                            <tr>
                              <th>Month</th>
                              <th>Current trajectory</th>
                              <th>Selected plan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.points.map((point) => (
                              <tr key={point.month}>
                                <th>
                                  {point.month === 0
                                    ? "Now"
                                    : `Month ${point.month}`}
                                </th>
                                <td>{money(point.baseline, currency)}</td>
                                <td>{money(point.cash, currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                  <section className="panel allocation-panel">
                    <div className="panel-heading">
                      <h2>Your allocation</h2>
                      <span className="small-icon">
                        <ArrowUpRight size={16} />
                      </span>
                    </div>
                    <span className="muted">
                      New commitments · next 12 months
                    </span>
                    <div className="allocation-total" aria-live="polite">
                      {money(result.annualAllocation, currency)}
                    </div>
                    <progress
                      className={!result.withinBudget ? "over-budget" : ""}
                      value={Math.min(result.annualAllocation, context.budget)}
                      max={Math.max(context.budget, 1)}
                      aria-label="Planning budget allocated"
                    />
                    <div className="budget-remaining">
                      <span>Still uncommitted</span>
                      <strong>{money(result.remainingBudget, currency)}</strong>
                    </div>
                    <div className="allocation-breakdown">
                      {(["hire", "operating", "capital"] as const).map(
                        (kind) => (
                          <div key={kind}>
                            <span>
                              <i className={`category-dot ${kind}`} />
                              {kind === "hire"
                                ? "People, including overhead"
                                : kind === "operating"
                                  ? "Growth & operating spend"
                                  : "One-time capital spend"}
                            </span>
                            <strong>
                              {money(
                                actions
                                  .filter((action) => action.kind === kind)
                                  .reduce(
                                    (sum, action) =>
                                      sum + actionCost(action, context),
                                    0,
                                  ),
                                currency,
                              )}
                            </strong>
                          </div>
                        ),
                      )}
                    </div>
                    <div className="runway-result">
                      <span>Runway with this plan</span>
                      <strong>{months(result.runway)}</strong>
                    </div>
                    <div
                      className={`constraint ${result.withinBudget ? "" : "failed"}`}
                    >
                      <span>
                        {result.withinBudget ? (
                          <Check size={14} />
                        ) : (
                          <X size={14} />
                        )}
                      </span>
                      {result.withinBudget
                        ? "Within deployment budget"
                        : "Exceeds deployment budget"}
                    </div>
                    <div
                      className={`constraint ${result.protectsRunway ? "" : "failed"}`}
                    >
                      <span>
                        {result.protectsRunway ? (
                          <Check size={14} />
                        ) : (
                          <X size={14} />
                        )}
                      </span>
                      {result.protectsRunway
                        ? `Protects ${context.minimumRunway} months of runway`
                        : `Below the ${context.minimumRunway}-month runway target`}
                    </div>
                    <p className="footnote">
                      Recurring commitments continue after month 12. Remaining
                      budget is not additional cash. Recurring costs need{" "}
                      {money(result.recurringCost, currency)}/month in
                      additional net cash contribution to break even.
                    </p>
                  </section>
                </div>
                <section className="comparison-section">
                  <div className="section-heading">
                    <div>
                      <h2>There’s more than one way forward.</h2>
                      <p>
                        Compare the trade-offs. Every cost below is an editable
                        demo assumption.
                      </p>
                    </div>
                    <button className="button secondary" onClick={exportBrief}>
                      <Download size={15} />
                      Export brief
                    </button>
                  </div>
                  <div className="plan-comparison">
                    <div className="comparison-labels">
                      <span>Approach</span>
                      <span>12-month commitment</span>
                      <span>Projected runway</span>
                      <span />
                    </div>
                    {plans.map((plan) => {
                      const comparison = project({
                        snapshot,
                        context,
                        actions: actionsForPlan(plan.id),
                        upside,
                      });
                      return (
                        <button
                          key={plan.id}
                          className={`plan-option ${planId === plan.id ? "chosen" : ""}`}
                          aria-pressed={planId === plan.id && !custom}
                          onClick={() => choosePlan(plan.id)}
                        >
                          <span className="plan-name">
                            <span className="radio-indicator">
                              {planId === plan.id && <span />}
                            </span>
                            <span>
                              <strong>
                                {plan.title}
                                {recommendation.plan === plan.id && (
                                  <span className="recommended-tag">
                                    Suggested
                                  </span>
                                )}
                              </strong>
                              <small>{plan.description}</small>
                            </span>
                          </span>
                          <span className="comparison-value">
                            {money(comparison.annualAllocation, currency)}
                            <small>incremental</small>
                          </span>
                          <span
                            className={`comparison-value ${!comparison.protectsRunway ? "negative" : ""}`}
                          >
                            {months(comparison.runway)}
                            <small>
                              {comparison.withinBudget
                                ? "within budget"
                                : "over budget"}
                            </small>
                          </span>
                          <ArrowUpRight size={17} />
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="customize-section">
                  <div className="section-heading">
                    <div>
                      <h2>Make the plan yours.</h2>
                      <p>
                        Adjust the people, spending and timing. The forecast
                        updates immediately.
                      </p>
                    </div>
                    <span className="small-tag">
                      {custom ? "Custom plan" : chosenPlan?.title}
                    </span>
                  </div>
                  <div className="action-list">
                    <div className="action-labels">
                      <span>New investment</span>
                      <span>Annual cost</span>
                      <span>One-time cost</span>
                      <span>Starts</span>
                    </div>
                    {actions.map((action) => (
                      <div
                        className={`action-row ${action.enabled ? "enabled" : ""}`}
                        key={action.id}
                      >
                        <label className="action-toggle">
                          <input
                            type="checkbox"
                            checked={action.enabled}
                            onChange={(event) =>
                              editAction(action.id, {
                                enabled: event.target.checked,
                              })
                            }
                          />
                          <span>
                            <strong>{action.name}</strong>
                            <small>
                              {action.kind === "hire"
                                ? `Salary + ${Math.round(context.employerOverhead * 100)}% employer costs`
                                : action.kind === "capital"
                                  ? "One-time investment"
                                  : "Recurring operating expense"}
                            </small>
                          </span>
                        </label>
                        <label className="amount-field">
                          <span className="sr-only">
                            {action.name} annual cost in {currency}
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="1000000"
                            step="1000"
                            value={action.annualCost}
                            disabled={action.kind === "capital"}
                            onChange={(event) =>
                              editAction(action.id, {
                                annualCost: Math.max(
                                  0,
                                  Math.min(
                                    1_000_000,
                                    Number(event.target.value),
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="amount-field">
                          <span className="sr-only">
                            {action.name} one-time cost in {currency}
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="1000000"
                            step="500"
                            value={action.setupCost}
                            onChange={(event) =>
                              editAction(action.id, {
                                setupCost: Math.max(
                                  0,
                                  Math.min(
                                    1_000_000,
                                    Number(event.target.value),
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span className="sr-only">
                            {action.name} start month
                          </span>
                          <select
                            value={action.startMonth}
                            onChange={(event) =>
                              editAction(action.id, {
                                startMonth: Number(event.target.value),
                              })
                            }
                          >
                            {Array.from({ length: 12 }, (_, index) => (
                              <option value={index + 1} key={index}>
                                Month {index + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="footnote">
                    All amounts in {currency}. Annual costs are spread monthly
                    from the start date. One-time costs apply once at the start.
                  </p>
                </section>
                <section className="playbook">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">From decision to action</span>
                      <h2>Your first 90 days.</h2>
                    </div>
                    <span className="muted">A proposed operating workflow</span>
                  </div>
                  {actions.filter((action) => action.enabled).length ? (
                    <div className="workflow-list">
                      {actions
                        .filter((action) => action.enabled)
                        .map((action, index) => (
                          <article key={action.id}>
                            <span className="workflow-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <h3>
                                {action.name}
                                <span>
                                  Month {action.startMonth} ·{" "}
                                  {money(actionCost(action, context), currency)}{" "}
                                  in year one
                                </span>
                              </h3>
                              <p>{action.why}</p>
                              <div className="success-condition">
                                <Target size={14} />
                                <span>{action.success}</span>
                              </div>
                            </div>
                          </article>
                        ))}
                    </div>
                  ) : (
                    <div className="lean-workflow">
                      <strong>Keep the baseline. Buy more evidence.</strong>
                      <p>
                        Use the current team to validate the business
                        bottleneck. Review the plan in 30 days before making a
                        new commitment.
                      </p>
                    </div>
                  )}
                </section>
                <div className="assumptions-bar">
                  <button
                    className="text-button"
                    onClick={() => setShowAssumptions(!showAssumptions)}
                    aria-expanded={showAssumptions}
                  >
                    <CircleHelp size={15} />
                    What this plan assumes
                    <ChevronDown size={14} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => changeView("evidence")}
                  >
                    Inspect financial evidence
                    <ArrowRight size={14} />
                  </button>
                </div>
                {showAssumptions && (
                  <div className="assumptions-copy">
                    <p>
                      Business context, hiring costs and success targets are
                      fictional demo inputs. Suggestions use local rules based
                      on the selected bottleneck, budget and runway target.
                    </p>
                    <p>
                      The forecast repeats {snapshot.period.label} net burn. It
                      adds new costs, with no new funding, inflation or extra
                      cash contribution unless you set an upside assumption.
                      Upside must be net of extra delivery costs.
                    </p>
                    <p>
                      Open supplier invoices are disclosed separately. They are
                      not deducted again from a baseline that already repeats
                      existing payments. Cash combines eligible bank and
                      treasury balances; treasury liquidity is not modelled.
                    </p>
                    {snapshot.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          {view === "context" && (
            <section className="context-page">
              <div className="page-heading">
                <span className="eyebrow">The business behind the balance</span>
                <h1>
                  A good next move
                  <br />
                  starts with context.
                </h1>
                <p>
                  Tell the planning model what the business needs to achieve.
                </p>
                <span className="fiction-label">
                  Fictional hackathon context · editable · stored only in this
                  browser
                </span>
              </div>
              <form onSubmit={saveContext}>
                <div className="context-form-grid">
                  <div className="panel form-panel">
                    <h2>The company</h2>
                    <label>
                      Company name
                      <input
                        required
                        maxLength={100}
                        value={draft.company}
                        onChange={(event) =>
                          setDraft({ ...draft, company: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      What does the company do?
                      <textarea
                        required
                        maxLength={600}
                        rows={3}
                        value={draft.product}
                        onChange={(event) =>
                          setDraft({ ...draft, product: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      The next 12-month goal
                      <textarea
                        required
                        maxLength={300}
                        rows={2}
                        value={draft.goal}
                        onChange={(event) =>
                          setDraft({ ...draft, goal: event.target.value })
                        }
                      />
                    </label>
                    <fieldset>
                      <legend>What is holding the business back?</legend>
                      <div className="bottleneck-options">
                        {[
                          {
                            value: "growth",
                            title: "Pipeline & growth",
                            detail:
                              "We need a repeatable route to new customers.",
                          },
                          {
                            value: "founder",
                            title: "Founder capacity",
                            detail:
                              "Too much operating work still runs through the CEO.",
                          },
                          {
                            value: "delivery",
                            title: "Product & delivery",
                            detail:
                              "We cannot deliver quickly enough for the demand.",
                          },
                        ].map((option) => (
                          <label
                            key={option.value}
                            className={
                              draft.bottleneck === option.value
                                ? "bottleneck-option picked"
                                : "bottleneck-option"
                            }
                          >
                            <input
                              type="radio"
                              name="bottleneck"
                              value={option.value}
                              checked={draft.bottleneck === option.value}
                              onChange={() =>
                                setDraft({
                                  ...draft,
                                  bottleneck: z
                                    .enum(["growth", "founder", "delivery"])
                                    .parse(option.value),
                                })
                              }
                            />
                            <span>
                              <strong>{option.title}</strong>
                              <small>{option.detail}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label>
                      The team today
                      <textarea
                        required
                        rows={2}
                        maxLength={300}
                        value={draft.team}
                        onChange={(event) =>
                          setDraft({ ...draft, team: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Other context & assumptions
                      <textarea
                        rows={4}
                        maxLength={1200}
                        value={draft.notes}
                        onChange={(event) =>
                          setDraft({ ...draft, notes: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <aside className="panel guardrails-panel">
                    <span className="small-icon">
                      <ShieldCheck size={21} />
                    </span>
                    <h2>Set the guardrails.</h2>
                    <p>
                      These constraints shape the suggested plan. The budget is
                      part of your cash, not extra funding.
                    </p>
                    <label>
                      Capital available to deploy ({currency})
                      <input
                        type="number"
                        min="0"
                        max="100000000"
                        required
                        step="1000"
                        value={draft.budget}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            budget: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Minimum runway (months)
                      <input
                        type="number"
                        min="1"
                        max="60"
                        required
                        value={draft.minimumRunway}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            minimumRunway: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Employer costs above salary (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        required
                        value={Math.round(draft.employerOverhead * 100)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            employerOverhead: Number(event.target.value) / 100,
                          })
                        }
                      />
                    </label>
                    <p className="footnote">
                      Employer costs are a simplified scenario assumption.
                      Recruitment and equipment are separate one-time inputs.
                    </p>
                    <button
                      className="button primary full-width"
                      type="submit"
                      disabled={!contextSchema.safeParse(draft).success}
                    >
                      Build my plan
                      <ArrowRight size={17} />
                    </button>
                    <button
                      className="text-button reset-context"
                      type="button"
                      onClick={() => setDraft(demoContext)}
                    >
                      Restore demo context
                      <RefreshCw size={13} />
                    </button>
                  </aside>
                </div>
              </form>
            </section>
          )}
          {view === "evidence" && snapshot && (
            <Evidence
              snapshot={snapshot}
              onRefresh={() => {
                void refresh();
              }}
              refreshing={refreshing}
            />
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={14} />
              headroom.
            </span>
            <p>
              Fictional strategy. Seapoint financial evidence. Your decision.
            </p>
            <span>Local hackathon prototype</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function CashChart({
  points,
  currency,
  fetchedAt,
}: {
  points: ReturnType<typeof project>["points"];
  currency: string;
  fetchedAt: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => [point.cash, point.baseline]),
  );
  const minimum = Math.min(
    0,
    ...points.flatMap((point) => [point.cash, point.baseline]),
  );
  const spread = maximum - minimum;
  const x = (month: number) => 66 + (month / 12) * 570;
  const y = (amount: number) => 24 + ((maximum - amount) / spread) * 194;
  const line = (key: "cash" | "baseline") =>
    points.map((point) => `${x(point.month)},${y(point[key])}`).join(" ");
  const selected = hover === null ? undefined : points[hover];
  const start = new Date(fetchedAt);
  const label = (month: number) =>
    month === 0
      ? "Now"
      : new Intl.DateTimeFormat("en-GB", { month: "short" }).format(
          new Date(start.getFullYear(), start.getMonth() + month, 1),
        );
  return (
    <div className="cash-chart">
      <svg
        viewBox="0 0 660 266"
        role="img"
        aria-label="Twelve-month cash projection comparing existing spending with the selected plan. Exact values are available through Show numbers."
      >
        {[0, 1, 2, 3].map((index) => {
          const amount = minimum + (spread * index) / 3;
          return (
            <g key={index}>
              <line
                x1="66"
                y1={y(amount)}
                x2="636"
                y2={y(amount)}
                className="gridline"
              />
              <text
                x="53"
                y={y(amount) + 4}
                textAnchor="end"
                className="chart-label"
              >
                {money(amount, currency, true)}
              </text>
            </g>
          );
        })}
        <polygon
          points={`${x(0)},${y(minimum)} ${line("cash")} ${x(12)},${y(minimum)}`}
          className="chart-area"
        />
        <polyline points={line("baseline")} className="baseline-path" />
        <polyline points={line("cash")} className="plan-path" />
        {points
          .filter((point) => point.month % 3 === 0)
          .map((point) => (
            <text
              key={point.month}
              x={x(point.month)}
              y="250"
              textAnchor="middle"
              className="chart-label"
            >
              {label(point.month)}
            </text>
          ))}
        <circle
          cx={x(12)}
          cy={y(points[12]?.cash ?? 0)}
          r="4"
          className="chart-end"
        />
        {selected && (
          <g>
            <line
              x1={x(selected.month)}
              y1="20"
              x2={x(selected.month)}
              y2="220"
              className="hover-line"
            />
            <circle
              cx={x(selected.month)}
              cy={y(selected.cash)}
              r="5"
              className="chart-end"
            />
          </g>
        )}
        {points.map((point) => (
          <rect
            key={point.month}
            x={x(point.month) - 22}
            y="15"
            width="44"
            height="210"
            className="chart-hit"
            onMouseEnter={() => setHover(point.month)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {selected && (
        <div className="chart-tooltip">
          Month {selected.month}: {money(selected.cash, currency)}
          <small>
            Current trajectory: {money(selected.baseline, currency)}
          </small>
        </div>
      )}
    </div>
  );
}

function Evidence({
  snapshot,
  onRefresh,
  refreshing,
}: {
  snapshot: Snapshot;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const currency = snapshot.currency;
  return (
    <section className="evidence-page">
      <div className="section-heading evidence-title">
        <div>
          <span className="eyebrow">Follow the evidence</span>
          <h1>
            The numbers
            <br />
            behind the next move.
          </h1>
          <p>
            Read directly from <strong>{snapshot.organisation.name}</strong>.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={15} className={refreshing ? "spin" : ""} />
          Refresh evidence
        </button>
      </div>
      <div className="evidence-summary">
        <span className="live-label">
          <i />
          Authenticated Seapoint MCP
        </span>
        <span>
          Retrieved {new Date(snapshot.fetchedAt).toLocaleString("en-GB")}
        </span>
        <span>Reporting currency: {currency}</span>
      </div>
      <section className="panel evidence-panel">
        <div className="panel-heading">
          <div>
            <h2>Current eligible cash</h2>
            <p>
              Bank cash position + treasury total, converted into {currency}.
            </p>
          </div>
          <strong className="evidence-total">
            {money(snapshot.cash, currency)}
          </strong>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Institution</th>
                <th>Reporting balance</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.accounts.map((account) => (
                <tr key={account.name}>
                  <th>
                    {account.name}
                    <small>
                      {account.kind === "BANKING"
                        ? "Banking"
                        : "Treasury investment"}
                    </small>
                  </th>
                  <td>{account.institution}</td>
                  <td>{money(account.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Source: query_accounts. Retrieval time does not establish the bank
          provider’s last sync time. Treasury liquidity is not modelled.
        </p>
      </section>
      <div className="evidence-grid">
        <section className="panel evidence-panel">
          <div className="panel-heading">
            <div>
              <h2>Monthly cash flow</h2>
              <p>
                {snapshot.period.label} · {snapshot.transactionCount} included
                transactions
              </p>
            </div>
          </div>
          <dl className="financial-facts">
            <div>
              <dt>Outgoing payments, less refunds</dt>
              <dd>{money(snapshot.grossBurn, currency)}</dd>
            </div>
            <div>
              <dt>Non-capital revenue credits</dt>
              <dd>{money(snapshot.revenue, currency)}</dd>
            </div>
            <div className="fact-total">
              <dt>Monthly net burn</dt>
              <dd>{money(snapshot.netBurn, currency)}</dd>
            </div>
          </dl>
          <p className="footnote">
            Source: query_transactions aggregates. Excludes internal transfers,
            failed, cancelled and reversed transactions, excluded-from-runway
            transactions, and funding from revenue credits. Uses transaction-day
            FX rates.
          </p>
        </section>
        <section className="panel evidence-panel">
          <h2>Other commitments</h2>
          <dl className="financial-facts">
            <div>
              <dt>Open supplier invoices</dt>
              <dd>
                {snapshot.unpaidInvoices === null
                  ? "Unavailable"
                  : money(snapshot.unpaidInvoices, currency)}
              </dd>
            </div>
            <div>
              <dt>Unpaid invoice count</dt>
              <dd>{snapshot.unpaidInvoiceCount ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Last available payroll</dt>
              <dd>
                {snapshot.payroll ? date(snapshot.payroll.date) : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Employees on that pay run</dt>
              <dd>{snapshot.payroll?.employeeCount ?? "Unavailable"}</dd>
            </div>
          </dl>
          <p className="footnote">
            Sources: query_invoices and query_payroll. Open invoices are not
            deducted again from the repeated spending baseline. Payroll does not
            establish current headcount.
          </p>
        </section>
      </div>
      <section className="panel evidence-panel">
        <div className="panel-heading">
          <div>
            <h2>Where outgoing payments went</h2>
            <p>{snapshot.period.label} · monthly average before refunds</p>
          </div>
        </div>
        <div className="spend-list">
          {snapshot.spending.map((item) => (
            <div key={item.category}>
              <span>{item.category}</span>
              <progress
                value={item.amount}
                max={Math.max(snapshot.grossBurn, item.amount, 1)}
                aria-label={`${item.category} share of outgoing payments`}
              />
              <strong>{money(item.amount, currency)}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="data-caveats">
        <h2>Known limits</h2>
        {snapshot.warnings.map((warning) => (
          <p key={warning}>
            <CircleHelp size={15} />
            <span>{warning}</span>
          </p>
        ))}
        <p>
          <CircleHelp size={15} />
          <span>
            The business narrative and all proposed hiring costs are fictional.
            They do not come from Seapoint.
          </span>
        </p>
        <p>
          <CircleHelp size={15} />
          <span>
            The forecast is a scenario, not a prediction. No financial or
            bookkeeping records are changed.
          </span>
        </p>
      </section>
    </section>
  );
}

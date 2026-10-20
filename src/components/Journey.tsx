import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Mail,
  RefreshCw,
} from "lucide-react";
import {
  contextSchema,
  currencies,
  demoContext,
  type BusinessContext,
  type Organisation,
  type Snapshot,
} from "../contracts";
import type { Move } from "../signals";
import { money } from "../format";
import "./journey.css";

export type AlertResult = { sent: number; red: number; to: string };

export type JourneyProps = {
  /** The current business context. Step 1 starts from it. */
  context: BusinessContext;
  /** The Seapoint snapshot, or null while it loads or after it fails. */
  snapshot: Snapshot | null;
  /** Moves built from the live flags. Only read once `flagsReady` is true. */
  moves: Move[];
  /** True once the flags request for the current context has settled. */
  flagsReady: boolean;
  /** Set when the flags request failed. The journey can still finish. */
  flagError: string;
  /** Set when the snapshot failed to load. */
  loadError: string | null;
  /** True while a retry runs. */
  retrying: boolean;
  onRetry: () => void;
  /** More than one organisation and none chosen: the journey asks for one. */
  organisations: Organisation[];
  organisationId: string;
  onSelectOrganisation: (id: string) => void;
  /** Applies the edited context so step 2 reads with it. Returns an error message, or null. */
  onContextChange: (context: BusinessContext) => string | null;
  onEnableAlerts: (email: string) => Promise<AlertResult>;
  onComplete: (context: BusinessContext) => void;
};

type Step = 1 | 2 | 3;
const steps: { id: Step; label: string }[] = [
  { id: 1, label: "Your business" },
  { id: 2, label: "Your finances" },
  { id: 3, label: "Alerts" },
];

const bottlenecks: {
  id: BusinessContext["bottleneck"];
  label: string;
  hint: string;
}[] = [
  {
    id: "growth",
    label: "Winning customers",
    hint: "Pipeline depends on you.",
  },
  { id: "founder", label: "Founder time", hint: "Too much runs through you." },
  {
    id: "delivery",
    label: "Shipping product",
    hint: "The team cannot build fast enough.",
  },
];

const fieldMessages: Record<string, string> = {
  company: "Add your company name.",
  goal: "Add your goal in one line.",
  minimumRunway: "Minimum runway must be 1 to 60 months.",
  bufferMonths: "Cash buffer must be 0 to 24 months.",
  newJoiner: "Check the new joiner: name, start date and salary.",
  customerTerms: "Payment terms need a customer and a due day from 1 to 28.",
};

function storedEmail() {
  try {
    return localStorage.getItem("headroom-alert-email") ?? "";
  } catch {
    return "";
  }
}

/** Step 1 starts empty so the import from Notion and Slack can fill it in. */
function blankForImport(context: BusinessContext): BusinessContext {
  return { ...context, company: "", goal: "", newJoiner: null, customerTerms: [], payrollWallet: null };
}

type Source = {
  app: "notion" | "slack" | "deel";
  place: string;
  found: string;
  fill: (context: BusinessContext) => BusinessContext;
};
/** Dummy integrations for the demo: what each tool "finds", and the fields it fills. */
const sources: Source[] = [
  {
    app: "notion",
    place: "Company wiki",
    found: "Northstar Labs · goal: win 10 new retail customers",
    fill: (c) => ({ ...c, company: demoContext.company, goal: demoContext.goal, bottleneck: demoContext.bottleneck }),
  },
  {
    app: "notion",
    place: "Hiring plan · Q4",
    found: "Maya Chen, Head of Sales, joined 1 Oct on £90k",
    fill: (c) => ({ ...c, newJoiner: demoContext.newJoiner }),
  },
  {
    app: "slack",
    place: "#finance",
    found: "“Cormorant’s invoices are due on the 8th, they always pay on the 18th”",
    fill: (c) => ({ ...c, customerTerms: demoContext.customerTerms }),
  },
  {
    app: "deel",
    place: "Payroll wallet",
    found: "Pays the UK team · balance £412",
    fill: (c) => ({ ...c, payrollWallet: demoContext.payrollWallet }),
  },
  {
    app: "notion",
    place: "Finance policy",
    found: "12-month runway floor · 3 months of cash on hand",
    fill: (c) => ({ ...c, minimumRunway: demoContext.minimumRunway, bufferMonths: demoContext.bufferMonths }),
  },
];

function ImportPanel({
  draft,
  setDraft,
}: {
  draft: BusinessContext;
  setDraft: (context: BusinessContext) => void;
}) {
  const [done, setDone] = useState(-1);
  const [running, setRunning] = useState(false);
  const latest = useRef(draft);
  latest.current = draft;
  function run() {
    setRunning(true);
    setDone(-1);
    sources.forEach((source, index) => {
      window.setTimeout(() => {
        setDraft(source.fill(latest.current));
        setDone(index);
        if (index === sources.length - 1) setRunning(false);
      }, 700 + index * 750);
    });
  }
  return (
    <div className="journey-import" aria-live="polite">
      <div className="journey-import-head">
        <div>
          <strong>Pull it from your tools</strong>
          <span>Headroom reads your wiki, hiring plan, finance channel and payroll.</span>
        </div>
        <div className="journey-import-apps" aria-hidden="true">
          <i className="app-notion">N</i>
          <i className="app-slack">#</i>
          <i className="app-deel">d</i>
        </div>
      </div>
      {done < 0 && !running ? (
        <button type="button" className="primary" onClick={run}>
          Import from Notion and Slack <ArrowRight size={14} />
        </button>
      ) : (
        <ul>
          {sources.map((source, index) => (
            <li key={source.place} className={index <= done ? "found" : index === done + 1 ? "reading" : ""}>
              <i className={`app-${source.app}`} aria-hidden="true">
                {source.app === "notion" ? "N" : source.app === "slack" ? "#" : "d"}
              </i>
              <span>
                <b>
                  {source.app === "notion" ? "Notion" : source.app === "slack" ? "Slack" : "Deel"} · {source.place}
                </b>
                <small>{index <= done ? source.found : index === done + 1 ? "Reading…" : "Waiting"}</small>
              </span>
              {index <= done ? (
                <Check size={16} strokeWidth={2.5} />
              ) : index === done + 1 ? (
                <LoaderCircle size={16} className="spin" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {done === sources.length - 1 && (
        <p className="journey-import-done">
          <Check size={14} /> Filled in from {sources.length} sources. Check it, then continue.
        </p>
      )}
    </div>
  );
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function Journey(props: JourneyProps) {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState(() => blankForImport(props.context));
  const heading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo({ top: 0 });
    heading.current?.focus();
  }, [step]);

  return (
    <section className="journey" aria-labelledby="journey-heading">
      <ol className="journey-steps" aria-label="Setup progress">
        {steps.map((item) => (
          <li
            key={item.id}
            className={
              item.id === step ? "current" : item.id < step ? "done" : ""
            }
            aria-current={item.id === step ? "step" : undefined}
          >
            <span className="journey-step-mark" aria-hidden="true">
              {item.id < step ? <Check size={12} strokeWidth={2.5} /> : item.id}
            </span>
            <span className="journey-step-label">{item.label}</span>
            <span className="sr-only">
              {item.id < step
                ? " (done)"
                : item.id === step
                  ? " (current)"
                  : ""}
            </span>
          </li>
        ))}
      </ol>
      <div className="journey-panel" key={step}>
        {step === 1 && (
          <BusinessStep
            heading={heading}
            draft={draft}
            setDraft={setDraft}
            onNext={() => {
              const problem = props.onContextChange(draft);
              if (!problem) setStep(2);
              return problem;
            }}
          />
        )}
        {step === 2 && (
          <FinancesStep
            heading={heading}
            {...props}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <AlertsStep
            heading={heading}
            onEnableAlerts={props.onEnableAlerts}
            onBack={() => setStep(2)}
            onFinish={() => props.onComplete(draft)}
          />
        )}
      </div>
    </section>
  );
}

type HeadingRef = RefObject<HTMLHeadingElement | null>;

function BusinessStep({
  heading,
  draft,
  setDraft,
  onNext,
}: {
  heading: HeadingRef;
  draft: BusinessContext;
  setDraft: (context: BusinessContext) => void;
  onNext: () => string | null;
}) {
  const [problem, setProblem] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = contextSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const key = String(issue?.path[0] ?? "");
      setProblem(fieldMessages[key] ?? issue?.message ?? "Check your answers.");
      return;
    }
    setProblem(onNext() ?? "");
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="eyebrow">Step 1 of 3</p>
      <h1 id="journey-heading" ref={heading} tabIndex={-1}>
        Tell us about your business.
      </h1>
      <p className="journey-lede">
        Seapoint shows the numbers. This tells Headroom which numbers matter to
        you.
      </p>
      <ImportPanel draft={draft} setDraft={setDraft} />
      <div className="journey-fields">
        <label className="journey-field">
          Company name
          <input
            value={draft.company}
            maxLength={100}
            required
            autoComplete="organization"
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
          />
          <small>Headroom puts it on every alert it sends you.</small>
        </label>
        <label className="journey-field">
          Goal for the next 12 months
          <input
            value={draft.goal}
            maxLength={300}
            required
            onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
          />
          <small>Headroom explains each flag against this goal.</small>
        </label>
        <fieldset className="journey-field journey-choices">
          <legend>Biggest bottleneck</legend>
          <div className="journey-options">
            {bottlenecks.map((option) => (
              <label
                key={option.id}
                className={`journey-option${draft.bottleneck === option.id ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="bottleneck"
                  value={option.id}
                  checked={draft.bottleneck === option.id}
                  onChange={() => setDraft({ ...draft, bottleneck: option.id })}
                />
                <span className="journey-option-check" aria-hidden="true">
                  <Check size={12} strokeWidth={2.5} />
                </span>
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </label>
            ))}
          </div>
          <small>Headroom shapes its spending plan around this.</small>
        </fieldset>
        <fieldset className="journey-field journey-group">
          <legend>Anyone joining soon?</legend>
          {draft.newJoiner ? (
            <>
              <div className="journey-pair">
                <label className="journey-field">
                  Name
                  <input
                    value={draft.newJoiner.name}
                    maxLength={80}
                    onChange={(e) =>
                      setDraft({ ...draft, newJoiner: { ...draft.newJoiner!, name: e.target.value } })
                    }
                  />
                </label>
                <label className="journey-field">
                  Role
                  <input
                    value={draft.newJoiner.role}
                    maxLength={80}
                    onChange={(e) =>
                      setDraft({ ...draft, newJoiner: { ...draft.newJoiner!, role: e.target.value } })
                    }
                  />
                </label>
              </div>
              <div className="journey-triple">
                <label className="journey-field">
                  Start date
                  <input
                    type="date"
                    value={draft.newJoiner.startDate}
                    onChange={(e) =>
                      setDraft({ ...draft, newJoiner: { ...draft.newJoiner!, startDate: e.target.value } })
                    }
                  />
                </label>
                <label className="journey-field">
                  Salary · a year
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    value={Number.isNaN(draft.newJoiner.annualSalary) ? "" : draft.newJoiner.annualSalary}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        newJoiner: { ...draft.newJoiner!, annualSalary: e.target.valueAsNumber },
                      })
                    }
                  />
                </label>
                <label className="journey-field">
                  Paid in
                  <select
                    value={draft.newJoiner.currency}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        newJoiner: {
                          ...draft.newJoiner!,
                          currency: e.target.value as (typeof currencies)[number],
                        },
                      })
                    }
                  >
                    {currencies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <small>
                Headroom checks their first payday against the cash you hold in that currency.{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDraft({ ...draft, newJoiner: null })}
                >
                  No one is joining
                </button>
              </small>
            </>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setDraft({ ...draft, newJoiner: demoContext.newJoiner })
              }
            >
              Add a new joiner
            </button>
          )}
        </fieldset>
        {draft.payrollWallet && (
          <fieldset className="journey-field journey-group">
            <legend>Payroll is paid from</legend>
            <div className="journey-pair">
              <label className="journey-field">
                Account
                <input
                  value={draft.payrollWallet.name}
                  maxLength={80}
                  onChange={(e) =>
                    setDraft({ ...draft, payrollWallet: { ...draft.payrollWallet!, name: e.target.value } })
                  }
                />
              </label>
              <label className="journey-field">
                Balance · £
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={Number.isNaN(draft.payrollWallet.balance) ? "" : draft.payrollWallet.balance}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payrollWallet: { ...draft.payrollWallet!, balance: e.target.valueAsNumber },
                    })
                  }
                />
              </label>
            </div>
            <small>From Deel. Headroom checks this balance against the next pay run.</small>
          </fieldset>
        )}
        <fieldset className="journey-field journey-group">
          <legend>Customer payment terms</legend>
          {draft.customerTerms.map((term, index) => (
            <div className="journey-pair" key={index}>
              <label className="journey-field">
                Customer
                <input
                  value={term.customer}
                  maxLength={80}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      customerTerms: draft.customerTerms.map((t, i) =>
                        i === index ? { ...t, customer: e.target.value } : t,
                      ),
                    })
                  }
                />
              </label>
              <label className="journey-field">
                Invoices due on day
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  value={Number.isNaN(term.dueDay) ? "" : term.dueDay}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      customerTerms: draft.customerTerms.map((t, i) =>
                        i === index ? { ...t, dueDay: e.target.valueAsNumber } : t,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <small>Headroom compares each payment with these terms to spot customers who pay late.</small>
        </fieldset>
        <div className="journey-pair">
          <label className="journey-field">
            Minimum runway · months
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              required
              value={
                Number.isNaN(draft.minimumRunway) ? "" : draft.minimumRunway
              }
              onChange={(e) =>
                setDraft({ ...draft, minimumRunway: e.target.valueAsNumber })
              }
            />
            <small>Runway below this turns red.</small>
          </label>
          <label className="journey-field">
            Cash buffer · months
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={24}
              required
              value={Number.isNaN(draft.bufferMonths) ? "" : draft.bufferMonths}
              onChange={(e) =>
                setDraft({ ...draft, bufferMonths: e.target.valueAsNumber })
              }
            />
            <small>Cash above this is idle and could earn interest.</small>
          </label>
        </div>
      </div>
      <p className="journey-error" role="alert">
        {problem}
      </p>
      <div className="journey-actions">
        <button type="submit" className="primary">
          Next <ArrowRight size={14} />
        </button>
      </div>
    </form>
  );
}

type Row = { label: string; ready: boolean; result: string };

function FinancesStep({
  heading,
  snapshot,
  moves,
  flagsReady,
  flagError,
  loadError,
  retrying,
  onRetry,
  organisations,
  organisationId,
  onSelectOrganisation,
  onBack,
  onNext,
}: JourneyProps & {
  heading: HeadingRef;
  onBack: () => void;
  onNext: () => void;
}) {
  const red = moves.filter((move) => move.rag === "red").length;
  const bills = snapshot
    ? (snapshot.unpaidInvoiceCount ?? snapshot.supplierBills?.length ?? null)
    : null;
  const rows: Row[] = [
    {
      label: "Accounts",
      ready: !!snapshot,
      result: snapshot
        ? `${plural(snapshot.accounts.length, "account")} · ${money(snapshot.cash, snapshot.currency)} cash`
        : "",
    },
    {
      label: "Supplier bills",
      ready: !!snapshot,
      result: bills === null ? "No bill data" : plural(bills, "unpaid bill"),
    },
    {
      label: "Payroll",
      ready: !!snapshot,
      result: snapshot?.payroll
        ? `${plural(snapshot.payroll.employeeCount, "person", "people")} on payroll`
        : "No payroll run found",
    },
    {
      label: "Transactions",
      ready: !!snapshot,
      result: snapshot
        ? `${plural(snapshot.transactionCount, "transaction")} · ${snapshot.period.label}`
        : "",
    },
    {
      label: "Finding what needs you",
      ready: !!snapshot && flagsReady,
      result: flagError
        ? "Live flags could not load"
        : red === 0
          ? "Nothing is red today"
          : `Found ${plural(red, "thing")} for today`,
    },
  ];
  const [shown, setShown] = useState(0);
  const nextReady = rows[shown]?.ready ?? false;
  useEffect(() => {
    if (shown >= rows.length || !nextReady) return;
    const timer = window.setTimeout(
      () => setShown((count) => count + 1),
      shown === 0 ? 450 : 350,
    );
    return () => window.clearTimeout(timer);
  }, [shown, nextReady, rows.length]);
  const done = shown >= rows.length;
  const choosing =
    !snapshot && !loadError && organisations.length > 1 && !organisationId;

  return (
    <div>
      <p className="eyebrow">Step 2 of 3</p>
      <h1 id="journey-heading" ref={heading} tabIndex={-1}>
        Reading your finances.
      </h1>
      <p className="journey-lede">
        Headroom reads your live Seapoint data and checks it against your
        business.
      </p>
      {choosing && (
        <label className="journey-field journey-organisation">
          Organisation
          <select
            value={organisationId}
            onChange={(e) => onSelectOrganisation(e.target.value)}
          >
            <option value="">Choose an organisation</option>
            {organisations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {loadError ? (
        <div className="journey-failure" role="alert">
          <strong>Seapoint could not load.</strong>
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCw size={13} className={retrying ? "spin" : ""} />
            {retrying ? "Trying again…" : "Try again"}
          </button>
        </div>
      ) : (
        <ul className="journey-checklist" aria-label="Loading progress">
          {rows.map((row, index) => {
            const complete = index < shown;
            return (
              <li key={row.label} className={complete ? "complete" : ""}>
                <span className="journey-check" aria-hidden="true">
                  {complete ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : index === shown && !choosing ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <span className="journey-pending" />
                  )}
                </span>
                <span className="journey-check-label">{row.label}</span>
                <span className="journey-check-result">
                  {complete ? row.result : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sr-only" role="status">
        {loadError
          ? ""
          : done
            ? `Finished. ${rows[rows.length - 1]!.result}.`
            : `Reading ${rows[shown]?.label ?? ""}.`}
      </p>
      <div className="journey-actions">
        <button type="button" className="quiet" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <button
          type="button"
          className="primary"
          disabled={!done}
          aria-disabled={!done}
          onClick={onNext}
        >
          Next <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

type Sending =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; result: AlertResult }
  | { kind: "failed"; message: string };

function sentMessage({ sent, red, to }: AlertResult) {
  if (sent > 0)
    return `Alert sent to ${to}. Check your inbox. It lists ${plural(sent, "red flag")}.`;
  if (red > 0)
    return `Alerts are on for ${to}. Your ${plural(red, "red flag")} went out earlier, so there is nothing new to send.`;
  return `Alerts are on for ${to}. Nothing is red now. Headroom emails you when something turns red.`;
}

function AlertsStep({
  heading,
  onEnableAlerts,
  onBack,
  onFinish,
}: {
  heading: HeadingRef;
  onEnableAlerts: JourneyProps["onEnableAlerts"];
  onBack: () => void;
  onFinish: () => void;
}) {
  const [email, setEmail] = useState(storedEmail);
  const [state, setState] = useState<Sending>({ kind: "idle" });
  const finish = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state.kind === "sent") finish.current?.focus();
  }, [state.kind]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      setState({ kind: "sent", result: await onEnableAlerts(email.trim()) });
    } catch (error) {
      setState({
        kind: "failed",
        message:
          error instanceof Error ? error.message : "The alert could not send.",
      });
    }
  }
  const sending = state.kind === "sending";
  return (
    <div>
      <p className="eyebrow">Step 3 of 3</p>
      <h1 id="journey-heading" ref={heading} tabIndex={-1}>
        Get an email when something turns red.
      </h1>
      <p className="journey-lede">
        Headroom checks your finances every few minutes. When a flag turns red,
        it emails you what happened and what to do. Nothing moves money until
        you approve it.
      </p>
      {state.kind === "sent" ? (
        <div className="journey-success" role="status">
          <span className="journey-success-mark" aria-hidden="true">
            <Mail size={18} />
          </span>
          <p>{sentMessage(state.result)}</p>
        </div>
      ) : (
        <form className="journey-alert-form" onSubmit={submit}>
          <label className="journey-field">
            Work email
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              disabled={sending}
              aria-invalid={state.kind === "failed" || undefined}
              aria-describedby="journey-alert-error"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="primary"
            disabled={sending || !email.trim()}
          >
            {sending ? (
              <>
                <LoaderCircle size={14} className="spin" /> Sending…
              </>
            ) : (
              "Turn on alerts"
            )}
          </button>
        </form>
      )}
      <p className="journey-error" id="journey-alert-error" role="alert">
        {state.kind === "failed" ? state.message : ""}
      </p>
      <div className="journey-actions">
        <button
          type="button"
          className="quiet"
          onClick={onBack}
          disabled={sending}
        >
          <ArrowLeft size={14} /> Back
        </button>
        {state.kind === "sent" ? (
          <button
            type="button"
            className="primary"
            ref={finish}
            onClick={onFinish}
          >
            Open my decision room <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={onFinish}
            disabled={sending}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

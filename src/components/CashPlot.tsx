import type { project } from "../model";
import { money } from "../format";

export function CashPlot({
  forecast,
  currency,
}: {
  forecast: ReturnType<typeof project>;
  currency: string;
}) {
  const points = forecast.points;
  const low = Math.min(0, ...points.map((p) => p.cash));
  const high = Math.max(1, ...points.map((p) => Math.max(p.cash, p.baseline)));
  const y = (value: number) => 140 - ((value - low) / (high - low)) * 110;
  const path = (field: "cash" | "baseline") =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${45 + (point.month / 12) * 530},${y(point[field])}`,
      )
      .join(" ");
  return (
    <section className="panel cash-plot">
      <div className="section-heading">
        <div>
          <span className="tiny-label">
            FORWARD MODEL · NO NEW SALES OR FUNDING
          </span>
          <h2>What this does to your cash</h2>
        </div>
        <div className="plot-legend">
          <span>Existing burn</span>
          <span>Working plan</span>
        </div>
      </div>
      <svg
        viewBox="0 0 620 185"
        role="img"
        aria-label={`Projected cash over twelve months. The working plan ends at ${money(forecast.cashAfter12, currency)}.`}
      >
        <line x1="45" y1="140" x2="575" y2="140" stroke="var(--color-rule)" />
        <path
          d={path("baseline")}
          fill="none"
          stroke="var(--color-baseline)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <path
          d={path("cash")}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
        />
        <text x="45" y="16">
          {money(high, currency, true)}
        </text>
        <text x="45" y="174">
          Now
        </text>
        <text x="310" y="174" textAnchor="middle">
          6 months
        </text>
        <text x="575" y="174" textAnchor="end">
          12 months
        </text>
        <text
          x="575"
          y={Math.min(155, y(forecast.cashAfter12) + 17)}
          textAnchor="end"
        >
          {money(forecast.cashAfter12, currency, true)}
        </text>
      </svg>
      <p className="footnote">
        Cash equivalent in {currency}. This plot does not prove account or
        currency readiness. Review individual payment timing separately.
      </p>
    </section>
  );
}

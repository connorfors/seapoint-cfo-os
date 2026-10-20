export function money(amount: number, currency: string, compact = false) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    ...(compact ? { notation: "compact" } : {}),
  }).format(amount);
}
export function date(value: string, weekday = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(weekday ? { weekday: "short" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(value));
}
export function runway(value: number | null) {
  return value === null ? "No cash-zero date" : `${value.toFixed(1)} months`;
}

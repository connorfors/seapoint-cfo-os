import type { Flag } from "../src/flags";

const appUrl = process.env.HEADROOM_PUBLIC_URL ?? "https://headroom.cb-63a.workers.dev";
const from = process.env.HEADROOM_ALERT_FROM ?? "Headroom <notification@mycloop.com>";
/** Alerts go only to these domains, so a public link cannot mail strangers. */
const domains = (process.env.HEADROOM_ALERT_DOMAINS ?? "mycloop.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
const every = 5 * 60_000;

type Subscription = {
  to: string;
  organisation: string;
  company: string;
  bufferMonths: number;
  sent: Set<string>;
};
const subscriptions = new Map<string, Subscription>();
let lastSend = 0;

export function alertRecipientError(to: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return "Enter a valid email address.";
  const domain = to.split("@")[1]!.toLowerCase();
  if (!domains.includes(domain))
    return `This demo sends alerts to ${domains.map((d) => `@${d}`).join(", ")} addresses only.`;
  if (!process.env.RESEND_API_KEY)
    return "Email is not configured on this server. Set RESEND_API_KEY.";
  return null;
}

function escape(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function html(company: string, flags: Flag[]) {
  const cards = flags
    .map(
      (f) => `
      <tr><td style="padding:0 0 12px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0d4cf;border-left:4px solid #c2412d;border-radius:10px;background:#fffaf9">
          <tr><td style="padding:16px 18px">
            <div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#a33a26">${escape(f.title)} · today</div>
            <div style="font:700 22px/1.3 Arial,sans-serif;color:#1d2a22;margin:6px 0 2px">${escape(f.headline)}</div>
            <div style="font:400 14px/1.5 Arial,sans-serif;color:#5b6b60">${escape(f.metric)}</div>
            <div style="font:400 14px/1.5 Arial,sans-serif;color:#1d2a22;margin-top:10px"><b>The decision:</b> ${escape(f.decision)}</div>
          </td></tr>
        </table>
      </td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f7f2;padding:24px 12px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px">
    <tr><td style="font:700 18px/1.2 Arial,sans-serif;color:#24563c;padding-bottom:18px">headroom</td></tr>
    <tr><td style="font:700 24px/1.3 Arial,sans-serif;color:#1d2a22;padding-bottom:6px">${flags.length === 1 ? "One thing needs you today" : `${flags.length} things need you today`}</td></tr>
    <tr><td style="font:400 14px/1.5 Arial,sans-serif;color:#5b6b60;padding-bottom:20px">Headroom checked ${escape(company)}'s live Seapoint data and found ${flags.length === 1 ? "a red flag" : "red flags"}.</td></tr>
    ${cards}
    <tr><td style="padding-top:8px"><a href="${appUrl}" style="display:inline-block;background:#24563c;color:#ffffff;font:600 15px/1 Arial,sans-serif;padding:14px 22px;border-radius:8px;text-decoration:none">Take action now</a></td></tr>
    <tr><td style="font:400 12px/1.5 Arial,sans-serif;color:#8a968d;padding-top:22px">You get this email once per new red flag. Nothing moves money until you approve it.</td></tr>
  </table></td></tr></table></body></html>`;
}

async function send(sub: Subscription, flags: Flag[]) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [sub.to],
      subject:
        flags.length === 1
          ? `🔴 ${flags[0]!.title}: ${flags[0]!.headline}`
          : `🔴 ${flags.length} things need you today: ${flags.map((f) => f.title).join(", ")}`,
      html: html(sub.company, flags),
    }),
  });
  if (!response.ok)
    throw new Error(`The alert email failed: Resend answered ${response.status}.`);
  lastSend = Date.now();
  for (const f of flags) sub.sent.add(`${f.id}:${f.headline}`);
  process.stdout.write(`[alerts] sent ${flags.length} red flags to ${sub.to}\n`);
}

type Load = (organisation: string, bufferMonths: number) => Promise<Flag[]>;

/** Email the red flags not yet sent. `force` resends every current red flag. */
export async function checkAlerts(sub: Subscription, load: Load, force = false) {
  const reds = (await load(sub.organisation, sub.bufferMonths)).filter((f) => f.rag === "red");
  const due = force ? reds : reds.filter((f) => !sub.sent.has(`${f.id}:${f.headline}`));
  if (!due.length) return { sent: 0, red: reds.length };
  if (force && Date.now() - lastSend < 20_000)
    throw new Error("An alert went out a moment ago. Wait 20 seconds and try again.");
  await send(sub, due);
  return { sent: due.length, red: reds.length };
}

export async function subscribe(
  details: Omit<Subscription, "sent">,
  load: Load,
  force: boolean,
) {
  const existing = subscriptions.get(details.organisation);
  const sub: Subscription = {
    ...details,
    sent: existing && existing.to === details.to ? existing.sent : new Set(),
  };
  subscriptions.set(details.organisation, sub);
  return { ...(await checkAlerts(sub, load, force)), to: sub.to };
}

export function watchAlerts(load: Load) {
  return setInterval(() => {
    for (const sub of subscriptions.values())
      checkAlerts(sub, load).catch((error) =>
        process.stdout.write(`[alerts] check failed: ${error instanceof Error ? error.message : error}\n`),
      );
  }, every);
}

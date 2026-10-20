import {createFxDesk,FxError} from "./fx";
import {fxQuoteRequestSchema,fxAcceptSchema} from "../src/fx-contracts";
import { createServer, type ServerResponse } from "node:http";
import { connectSeapoint, type SeapointConnection } from "./mcp";
import { financialSnapshot, organisations } from "./finance";
import { flagsFor } from "./flags";
import { alertRecipientError, lastEmailPage, sendResolved, subscribe, watchAlerts } from "./alerts";
import { flagContextSchema, snapshotSchema, type FlagContext, type Snapshot } from "../src/contracts";

let connection: Promise<SeapointConnection> | undefined;
async function getConnection() {
  const existing = connection ? await connection : undefined;
  if (existing?.isAlive()) return existing;
  connection = connectSeapoint().catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}
async function accessible(client: SeapointConnection, id: string) {
  return (await organisations(client)).some((item) => item.id === id);
}
async function loadFlags(organisation: string, context: FlagContext) {
  return (await flagsFor(await getConnection(), organisation, context)).flags;
}
/** The business context the flags read, or the defaults when it is missing or invalid. */
function flagContext(value: unknown): FlagContext {
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : (value ?? {});
    return flagContextSchema.parse(raw);
  } catch {
    return flagContextSchema.parse({});
  }
}
async function readJson(request: import("node:http").IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error("The request is too large.");
  }
  return JSON.parse(body || "{}") as Record<string, unknown>;
}
const fxDesk=createFxDesk();
const publicOrigins = (
  process.env.HEADROOM_PUBLIC_ORIGINS ?? "https://headroom.cb-63a.workers.dev"
)
  .split(",")
  .map((o) => o.trim());
const cache = new Map<string, { data: Snapshot; expires: number }>();
const requests = new Map<string, Promise<Snapshot>>();
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const host = request.headers.host;
  if (
    host !== "127.0.0.1:4318" &&
    host !== "localhost:4318" &&
    host !== "127.0.0.1:4317" &&
    host !== "localhost:4317"
  ) {
    json(response, 403, { error: "This demo accepts local requests only." });
    return;
  }
  const origin = request.headers.origin;
  if (
    origin &&
    !["http://127.0.0.1:4317", "http://localhost:4317", ...publicOrigins].includes(origin)
  ) {
    json(response, 403, {
      error: "This demo accepts requests from its local interface only.",
    });
    return;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4318");
  const resolvedPost = request.method === "POST" && url.pathname === "/api/alerts/resolved";
  const alertPost = request.method === "POST" && url.pathname === "/api/alerts";
  const fxPost=request.method==="POST" && (url.pathname==="/api/fx/quotes" || url.pathname==="/api/fx/accept");
  if (request.method !== "GET" && !alertPost && !resolvedPost && !fxPost) {
    json(response, 405, { error: "The demo only reads financial data." });
    return;
  }
  try {
    if (fxPost) {
      const body=await readJson(request);
      const parsed=(url.pathname==="/api/fx/quotes" ? fxQuoteRequestSchema : fxAcceptSchema).safeParse(body);
      if (!parsed.success) {json(response,400,{error:parsed.error.issues[0]?.message ?? "Check the FX request."});return;}
      const client=await getConnection();
      if (!(await accessible(client,parsed.data.organisation))) {json(response,403,{error:"That organisation is not accessible to this Seapoint account."});return;}
      const result=url.pathname==="/api/fx/quotes" ? await fxDesk.quote(client,fxQuoteRequestSchema.parse(body)) : await fxDesk.accept(client,parsed.data.organisation,fxAcceptSchema.parse(body).quoteId);
      json(response,200,result);return;
    }
    if (resolvedPost) {
      const body = await readJson(request);
      const to = String(body.to ?? "").trim();
      const problem = alertRecipientError(to);
      if (problem) {
        json(response, 400, { error: problem });
        return;
      }
      const text = (key: string, max: number) => String(body[key] ?? "").slice(0, max);
      const sent = await sendResolved({
        to,
        company: text("company", 100) || "your company",
        title: text("title", 80),
        headline: text("headline", 120),
        receipt: text("receipt", 200),
      });
      json(response, 200, { sent, to });
      return;
    }
    if (alertPost) {
      const body = await readJson(request);
      const to = String(body.to ?? "").trim();
      const organisation = String(body.organisation ?? "");
      const problem = alertRecipientError(to);
      if (problem) {
        json(response, 400, { error: problem });
        return;
      }
      if (!(await accessible(await getConnection(), organisation))) {
        json(response, 403, {
          error: "That organisation is not accessible to this Seapoint account.",
        });
        return;
      }
      json(
        response,
        200,
        await subscribe(
          {
            to,
            organisation,
            company: String(body.company ?? "your company").slice(0, 100),
            context: flagContext(body.context),
          },
          loadFlags,
          body.force === true,
        ),
      );
      return;
    }
    if (url.pathname === "/api/alerts/last") {
      const page = lastEmailPage(url.searchParams.get("kind") === "resolved" ? "resolved" : "alert");
      response.writeHead(page ? 200 : 404, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(page ?? "<p>No email has been sent yet.</p>");
      return;
    }
    if (url.pathname === "/api/health") {
      const entries = await organisations(await getConnection());
      json(response, 200, {
        status: "ready",
        reason: "Seapoint authenticated read succeeded",
        organisations: entries.length,
      });
    } else if (url.pathname === "/api/organisations") {
      json(response, 200, await organisations(await getConnection()));
    } else if (url.pathname === "/api/flags") {
      const id = url.searchParams.get("organisation");
      if (!id) {
        json(response, 400, { error: "Select a Seapoint organisation first." });
        return;
      }
      const client = await getConnection();
      if (!(await accessible(client, id))) {
        json(response, 403, {
          error: "That organisation is not accessible to this Seapoint account.",
        });
        return;
      }
      json(response, 200, await flagsFor(client, id, flagContext(url.searchParams.get("context"))));
    } else if (url.pathname === "/api/snapshot") {
      const id = url.searchParams.get("organisation");
      if (!id) {
        json(response, 400, { error: "Select a Seapoint organisation first." });
        return;
      }
      const cached = cache.get(id);
      if (
        cached &&
        cached.expires > Date.now() &&
        !url.searchParams.has("refresh")
      ) {
        json(response, 200, cached.data);
        return;
      }
      let pending = requests.get(id);
      if (!pending) {
        pending = (async () => {
          const client = await getConnection();
          const available = await organisations(client);
          const organisation = available.find((item) => item.id === id);
          if (!organisation)
            throw new Error(
              "That organisation is not accessible to this Seapoint account.",
            );
          const data = snapshotSchema.parse(
            await financialSnapshot(client, organisation),
          );
          cache.set(id, { data, expires: Date.now() + 300_000 });
          return data;
        })().finally(() => requests.delete(id));
        requests.set(id, pending);
      }
      json(response, 200, await pending);
    } else
      json(response, 404, { error: "That local endpoint does not exist." });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The Seapoint connection failed.";
    json(response, error instanceof FxError ? error.status : 502, { error: message });
  }
});

watchAlerts(loadFlags);
server.listen(4318, "127.0.0.1", () =>
  process.stdout.write("Seapoint local API ready at http://127.0.0.1:4318\n"),
);
async function shutdown() {
  server.close();
  if (connection) {
    try {
      (await connection).close();
    } catch {
      /* A failed connection owns no live process. */
    }
  }
  process.exit(0);
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

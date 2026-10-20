import { createServer, type ServerResponse } from "node:http";
import { connectSeapoint, type SeapointConnection } from "./mcp";
import { financialSnapshot, organisations } from "./finance";
import { flagsFor } from "./flags";
import { snapshotSchema, type Snapshot } from "../src/contracts";

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
    !["http://127.0.0.1:4317", "http://localhost:4317"].includes(origin)
  ) {
    json(response, 403, {
      error: "This demo accepts requests from its local interface only.",
    });
    return;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4318");
  if (request.method !== "GET") {
    json(response, 405, { error: "The demo only reads financial data." });
    return;
  }
  try {
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
      if (!(await organisations(client)).some((item) => item.id === id)) {
        json(response, 403, {
          error: "That organisation is not accessible to this Seapoint account.",
        });
        return;
      }
      json(response, 200, await flagsFor(client, id));
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
    json(response, 502, { error: message });
  }
});

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

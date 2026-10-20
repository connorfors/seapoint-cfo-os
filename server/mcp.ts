import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { z } from "zod";

const serverName = process.env.SEAPOINT_MCP_SERVER ?? "seapoint-staging";
const run = promisify(execFile);
const rpcSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
});
const toolResultSchema = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});
const allowedTools = new Set([
  "get_current_user",
  "query_accounts",
  "query_transactions",
  "query_categories",
  "query_invoices",
  "query_payroll",
]);

export async function connectSeapoint() {
  const inventory = await run("codex", ["mcp", "list", "--json"]);
  const servers = z
    .array(
      z.object({
        name: z.string(),
        enabled: z.boolean(),
        transport: z.discriminatedUnion("type", [
          z.object({ type: z.literal("stdio"), command: z.string() }),
          z.object({ type: z.literal("streamable_http"), url: z.string() }),
        ]),
      }),
    )
    .parse(JSON.parse(inventory.stdout));
  if (!servers.some((server) => server.name === serverName && server.enabled)) {
    throw new Error(
      `Add the connection first: codex mcp add ${serverName} --url https://mcp.seapoint.dev/mcp`,
    );
  }
  const args = ["app-server", "--stdio"];
  for (const server of servers) {
    if (server.name !== serverName) {
      const transport =
        server.transport.type === "stdio"
          ? `command=${JSON.stringify(server.transport.command)}`
          : `url=${JSON.stringify(server.transport.url)}`;
      args.push(
        "-c",
        `mcp_servers.${JSON.stringify(server.name)}={enabled=false,${transport}}`,
      );
    }
  }
  const child = spawn("codex", args, { stdio: ["pipe", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-2_000);
  });
  let sequence = 0;
  const pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  const input = createInterface({ input: child.stdout });
  function rejectPending(error: Error) {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
  }
  child.on("error", rejectPending);
  child.stdin.on("error", rejectPending);
  child.on("exit", (code) =>
    rejectPending(
      new Error(
        `The local Codex connection stopped (exit ${code}). ${diagnostics || "Restart the local server."}`,
      ),
    ),
  );
  input.on("line", (line) => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      rejectPending(
        new Error(
          "Codex returned an unreadable protocol response. Restart the local server.",
        ),
      );
      child.kill();
      return;
    }
    const decoded = rpcSchema.safeParse(message);
    if (!decoded.success || typeof decoded.data.id !== "number") return;
    const request = pending.get(decoded.data.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(decoded.data.id);
    if (decoded.data.error)
      request.reject(new Error(decoded.data.error.message));
    else request.resolve(decoded.data.result);
  });
  function request(method: string, params: unknown): Promise<unknown> {
    if (child.exitCode !== null || child.killed)
      return Promise.reject(
        new Error("The local Codex connection stopped. Refresh to reconnect."),
      );
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            "Seapoint did not respond within 45 seconds. Try refreshing the connection.",
          ),
        );
      }, 45_000);
      pending.set(id, { resolve, reject, timeout });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  try {
    await request("initialize", {
      clientInfo: { name: "seapoint_cfo_demo", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
    const started = z
      .object({ thread: z.object({ id: z.string() }) })
      .parse(
        await request("thread/start", { cwd: process.cwd(), ephemeral: true }),
      );
    const threadId = started.thread.id;
    return {
      isAlive() {
        return child.exitCode === null && !child.killed;
      },
      async tool(name: string, args: unknown): Promise<unknown> {
        if (!allowedTools.has(name))
          throw new Error("This demo only permits financial reads.");
        const result = toolResultSchema.parse(
          await request("mcpServer/tool/call", {
            threadId,
            server: serverName,
            tool: name,
            arguments: args,
          }),
        );
        const text = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text ?? "")
          .join("\n");
        if (result.isError)
          throw new Error(text || "Seapoint rejected this query.");
        return JSON.parse(text);
      },
      async resource(uri: string): Promise<string> {
        const result = z
          .object({ contents: z.array(z.object({ text: z.string() })) })
          .parse(
            await request("mcpServer/resource/read", {
              threadId,
              server: serverName,
              uri,
            }),
          );
        return result.contents.map((item) => item.text).join("\n");
      },
      close() {
        input.close();
        child.kill();
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

export type SeapointConnection = Awaited<ReturnType<typeof connectSeapoint>>;

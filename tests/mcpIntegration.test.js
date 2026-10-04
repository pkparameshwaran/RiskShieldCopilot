import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function waitForHealth(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error("RiskShield test server exited during startup.");
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`RiskShield test server did not start: ${lastError?.message || "timeout"}`);
}

test("configured MCP endpoint lists tools and returns live tool output", { timeout: 30000 }, async () => {
  const mcpRequests = [];
  const sessions = new Map();
  const mcpHttpServer = createServer(async (request, response) => {
    const record = { method: request.method, url: request.url, host: request.headers.host, origin: request.headers.origin, contentType: request.headers["content-type"], accept: request.headers.accept };
    mcpRequests.push(record);
    const sessionId = request.headers["mcp-session-id"];
    let session = sessionId ? sessions.get(sessionId) : null;
    if (!session) {
      const mcpServer = new McpServer({ name: "riskshield-test-source", version: "1.0.0" });
      mcpServer.registerTool(
        "regulatory_policy_search",
        {
          description: "Search regulatory policy and Basel sources",
          inputSchema: { query: z.string() },
        },
        async ({ query }) => ({
          content: [{ type: "text", text: `Mock official policy response for: ${query}` }],
        }),
      );
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
      await mcpServer.connect(transport);
      session = { mcpServer, transport };
    }
    response.on("finish", () => {
      record.status = response.statusCode;
      if (session.transport.sessionId) sessions.set(session.transport.sessionId, session);
    });
    try {
      await session.transport.handleRequest(request, response);
    } catch (error) {
      mcpRequests.push({ error: error.message });
      if (!response.headersSent) response.writeHead(500);
      response.end(error.message);
    }
  });
  const mcpPort = await listen(mcpHttpServer);
  const apiServer = createServer();
  const apiPort = await listen(apiServer);
  await close(apiServer);
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  const child = spawn(process.execPath, ["server/index.js", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(apiPort),
      MCP_SERVER_URL: `http://127.0.0.1:${mcpPort}/mcp`,
      MCP_AUTH_TOKEN: "",
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth(baseUrl, child);
    const toolsResponse = await fetch(`${baseUrl}/api/mcp/tools`);
    const toolsPayload = await toolsResponse.json();
    if (!toolsResponse.ok) throw new Error(`MCP tool listing failed (${toolsResponse.status}): ${JSON.stringify(toolsPayload)}; MCP requests: ${JSON.stringify(mcpRequests)}`);
    assert.equal(toolsPayload.tools[0].name, "regulatory_policy_search");

    const lookupResponse = await fetch(`${baseUrl}/api/mcp/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Basel capital requirements" }),
    });
    const lookupPayload = await lookupResponse.json();
    if (!lookupResponse.ok) throw new Error(`MCP lookup failed (${lookupResponse.status}): ${JSON.stringify(lookupPayload)}`);
    assert.equal(lookupPayload.source, "external-mcp");
    assert.match(lookupPayload.result, /Mock official policy response for: Basel capital requirements/);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await Promise.all([...sessions.values()].map((session) => session.mcpServer.close()));
    await close(mcpHttpServer);
  }
});

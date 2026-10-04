import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer as createViteServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDevelopment = process.argv.includes("--dev");
const port = Number(process.env.PORT || 5173);
const maxBodyLength = 16 * 1024;

async function loadEnvironmentFile() {
  let contents;
  try {
    contents = await readFile(path.join(root, ".env"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) throw new Error(`Invalid .env syntax on line ${index + 1}.`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

function getMcpConfig() {
  const serverUrl = process.env.MCP_SERVER_URL;
  if (!serverUrl) return null;
  const url = new URL(serverUrl);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("MCP_SERVER_URL must use HTTP or HTTPS.");
  }
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""));
  if (url.protocol !== "https:" && !isLoopback) {
    throw new Error("Use HTTPS for remote MCP servers; plain HTTP is permitted only for loopback testing.");
  }
  const headers = {};
  if (process.env.MCP_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.MCP_AUTH_TOKEN}`;
  return { url, headers };
}

async function withMcpClient(callback) {
  const config = getMcpConfig();
  if (!config) {
    const error = new Error("MCP is not configured. Set MCP_SERVER_URL on the server.");
    error.statusCode = 503;
    throw error;
  }
  const client = new Client({ name: "riskshield-regulatory-lookup", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(config.url, {
    requestInit: { headers: config.headers },
  });
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyLength) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    return sendJson(response, 200, { status: "ok", mode: isDevelopment ? "development" : "production" });
  }
  if (url.pathname === "/api/mcp/status" && request.method === "GET") {
    const configured = Boolean(process.env.MCP_SERVER_URL);
    return sendJson(response, 200, {
      configured,
      status: configured ? "configured" : "not-configured",
      message: configured
        ? "An MCP endpoint is configured. Test the connection to verify availability."
        : "Set MCP_SERVER_URL on the server to enable external policy lookups.",
    });
  }
  if (url.pathname === "/api/mcp/tools" && request.method === "GET") {
    try {
      const tools = await withMcpClient((client) => client.listTools());
      return sendJson(response, 200, { tools: tools.tools.map((tool) => ({ name: tool.name, description: tool.description || "" })) });
    } catch (error) {
      return sendJson(response, error.statusCode || 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/mcp/search" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query || query.length > 500) {
        return sendJson(response, 400, { error: "Provide a query between 1 and 500 characters." });
      }
      const result = await withMcpClient(async (client) => {
        const listed = await client.listTools();
        const candidates = listed.tools.filter((tool) => /search|lookup|regulat|policy|law|basel/i.test(`${tool.name} ${tool.description || ""}`));
        if (!candidates.length) {
          const error = new Error("The configured MCP server exposes no policy or regulatory search tool.");
          error.statusCode = 422;
          throw error;
        }
        const tool = candidates[0];
        const properties = tool.inputSchema?.properties || {};
        const queryKey = Object.keys(properties).find((key) => /query|search|term|keyword|question/i.test(key));
        if (!queryKey) {
          const error = new Error(`MCP tool "${tool.name}" has no recognized query input field.`);
          error.statusCode = 422;
          throw error;
        }
        const required = tool.inputSchema?.required || [];
        const missing = required.filter((key) => key !== queryKey);
        if (missing.length) {
          const error = new Error(`MCP tool "${tool.name}" requires unsupported input fields: ${missing.join(", ")}.`);
          error.statusCode = 422;
          throw error;
        }
        const toolResult = await client.callTool({ name: tool.name, arguments: { [queryKey]: query } });
        const content = (toolResult.content || []).filter((item) => item.type === "text").map((item) => item.text);
        if (toolResult.isError) {
          const error = new Error(content.join("\n") || `MCP tool "${tool.name}" returned an error.`);
          error.statusCode = 502;
          throw error;
        }
        return {
          source: "external-mcp",
          tool: tool.name,
          result: content.join("\n") || JSON.stringify(toolResult.structuredContent || toolResult),
        };
      });
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, error.statusCode || 502, { error: error.message });
    }
  }
  return sendJson(response, 404, { error: "API route not found." });
}

function contentType(filePath) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
  })[path.extname(filePath)] || "application/octet-stream";
}

async function serveProductionFile(request, response, url) {
  const dist = path.join(root, "dist");
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("Invalid URL path.");
    return;
  }
  let filePath = path.resolve(dist, `.${requestedPath}`);
  if (filePath !== dist && !filePath.startsWith(`${dist}${path.sep}`)) {
    response.writeHead(403).end("Forbidden.");
    return;
  }
  if (filePath === dist) filePath = path.join(dist, "index.html");
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, "index.html");
    await access(filePath);
  } catch {
    filePath = path.join(dist, "index.html");
  }
  response.writeHead(200, { "content-type": contentType(filePath), "x-content-type-options": "nosniff" });
  createReadStream(filePath).pipe(response);
}

async function main() {
  await loadEnvironmentFile();
  let vite;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (isDevelopment && vite) {
      vite.middlewares(request, response, (error) => {
        if (error) {
          response.writeHead(500).end("Development server request failed.");
        }
      });
      return;
    }
    await serveProductionFile(request, response, url);
  });

  if (isDevelopment) {
    vite = await createViteServer({
      configFile: path.join(root, "vite.config.js"),
      server: { middlewareMode: true, hmr: { server } },
    });
  } else {
    await access(path.join(root, "dist", "index.html"));
  }

  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`RiskShield ${isDevelopment ? "development" : "production"} server listening on http://localhost:${port}\n`);
  });
  const close = async () => {
    await vite?.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

main().catch((error) => {
  process.stderr.write(`Server startup failed: ${error.message}\n`);
  process.exitCode = 1;
});

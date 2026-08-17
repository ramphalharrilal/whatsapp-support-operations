import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRuntime } from "./runtime.js";
import {
  extractInboundTextMessages,
  verifyWebhookSignature,
  verifyWebhookSubscription
} from "./infrastructure/whatsappWebhook.js";

const PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));
const MAX_BODY_BYTES = 1024 * 1024;

export function createHttpServer({
  engine,
  appSecret = "",
  verifyToken = "",
  demoMode = true
}) {
  return createServer(async (request, response) => {
    setSecurityHeaders(response);
    const url = new URL(request.url, "http://localhost");

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "relaydesk-support-operations",
          mode: demoMode ? "demo" : "webhook",
          timestamp: new Date().toISOString()
        });
      }

      if (request.method === "GET" && url.pathname === "/api/dashboard") {
        return sendJson(response, 200, engine.getDashboard());
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1));
        return sendJson(response, 200, engine.getConversation(id));
      }

      if (request.method === "POST" && url.pathname === "/api/simulate/inbound") {
        ensureDemoMode(demoMode);
        const body = await readJson(request);
        const result = engine.receiveMessage({
          customerId: body.customerId || "browser_demo_customer",
          customerName: body.customerName || "Demo Customer",
          text: body.text,
          sourceMessageId: `sim_${Date.now()}`
        });
        return sendJson(response, 201, result);
      }

      const ticketAssign = url.pathname.match(/^\/api\/tickets\/([^/]+)\/assign$/);
      if (request.method === "POST" && ticketAssign) {
        const body = await readJson(request);
        const result = engine.assignTicket(decodeURIComponent(ticketAssign[1]), body.agentName);
        return sendJson(response, 200, result);
      }

      const agentReply = url.pathname.match(/^\/api\/conversations\/([^/]+)\/agent-message$/);
      if (request.method === "POST" && agentReply) {
        const body = await readJson(request);
        const result = engine.agentReply(
          decodeURIComponent(agentReply[1]),
          body.agentName,
          body.text
        );
        return sendJson(response, 201, result);
      }

      const resolve = url.pathname.match(/^\/api\/conversations\/([^/]+)\/resolve$/);
      if (request.method === "POST" && resolve) {
        const body = await readJson(request);
        const result = engine.resolveConversation(
          decodeURIComponent(resolve[1]),
          body.agentName || "system"
        );
        return sendJson(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/webhooks/whatsapp") {
        const challenge = verifyWebhookSubscription(url.searchParams, verifyToken);
        if (!challenge) {
          return sendJson(response, 403, { error: "Webhook verification failed" });
        }
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return response.end(challenge);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/whatsapp") {
        const rawBody = await readBody(request);
        if (
          appSecret &&
          !verifyWebhookSignature({
            rawBody,
            signature: request.headers["x-hub-signature-256"],
            appSecret
          })
        ) {
          return sendJson(response, 401, { error: "Invalid webhook signature" });
        }
        const payload = parseJson(rawBody);
        const inboundMessages = extractInboundTextMessages(payload);
        const results = inboundMessages.map((message) => engine.receiveMessage(message));
        return sendJson(response, 200, {
          status: "accepted",
          processed: results.length,
          outbound: results.map((result) => ({
            conversationId: result.conversation.id,
            text: result.outboundMessage.text
          }))
        });
      }

      if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
        return serveStatic(url.pathname, response);
      }

      return sendJson(response, 404, { error: "Route not found" });
    } catch (error) {
      const status = error instanceof RangeError
        ? 413
        : error instanceof SyntaxError || error instanceof TypeError
          ? 400
          : error.message?.includes("not found")
            ? 404
            : 409;
      return sendJson(response, status, { error: error.message });
    }
  });
}

async function readJson(request) {
  return parseJson(await readBody(request));
}

function parseJson(buffer) {
  if (!buffer.length) {
    return {};
  }
  return JSON.parse(buffer.toString("utf8"));
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      throw new RangeError("Request body exceeds 1 MB limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = join(PUBLIC_DIRECTORY, safePath);
  if (!fullPath.startsWith(PUBLIC_DIRECTORY)) {
    return sendJson(response, 404, { error: "Asset not found" });
  }
  try {
    const content = await readFile(fullPath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[extname(fullPath)] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    return response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendJson(response, 404, { error: "Asset not found" });
    }
    throw error;
  }
}

function ensureDemoMode(demoMode) {
  if (!demoMode) {
    throw new Error("Simulator endpoint is disabled outside demo mode");
  }
}

function setSecurityHeaders(response) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function start() {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const demoMode = process.env.DEMO_MODE !== "false";
  const { engine } = createRuntime({ seedDemo: demoMode });
  const server = createHttpServer({
    engine,
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    demoMode
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`RelayDesk listening on http://localhost:${port}`);
    console.log(`Mode: ${demoMode ? "demo simulator" : "verified webhook"}`);
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedPath) {
  start();
}

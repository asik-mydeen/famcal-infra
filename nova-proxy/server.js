/**
 * Nova Voice Proxy — WebSocket relay for Amazon Nova 2 Sonic.
 *
 * Browsers can't set Authorization headers on WebSocket connections.
 * This proxy accepts browser WS connections, adds the Bearer token,
 * and relays all messages bidirectionally to Nova's Realtime API.
 *
 * Browser ↔ this proxy ↔ wss://api.nova.amazon.com/v1/realtime
 *
 * Environment variables:
 *   NOVA_API_KEY — Amazon Nova API key (required)
 *   PORT — server port (default 8080, Railway sets this automatically)
 *   ALLOWED_ORIGINS — comma-separated allowed origins (default: allow all)
 */

const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");

const PORT = process.env.PORT || 8080;
const NOVA_API_KEY = process.env.NOVA_API_KEY;
const NOVA_WS_URL = "wss://api.nova.amazon.com/v1/realtime?model=nova-2-sonic-v1";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : null; // null = allow all

if (!NOVA_API_KEY) {
  console.error("ERROR: NOVA_API_KEY environment variable is required");
  process.exit(1);
}

// Simple HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", connections: wss.clients.size }));
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Nova Voice Proxy — connect via WebSocket");
  }
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs, req) => {
  const origin = req.headers.origin || "";
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Origin check
  if (ALLOWED_ORIGINS && !ALLOWED_ORIGINS.includes(origin)) {
    console.log(`[proxy] Rejected connection from origin: ${origin}`);
    clientWs.close(4403, "Origin not allowed");
    return;
  }

  console.log(`[proxy] Client connected from ${origin} (${clientIp})`);

  // Connect to Nova with auth headers
  const novaWs = new WebSocket(NOVA_WS_URL, {
    headers: {
      Authorization: `Bearer ${NOVA_API_KEY}`,
      Origin: "https://api.nova.amazon.com",
    },
  });

  let novaReady = false;
  const pendingMessages = [];

  // Nova → Client
  novaWs.on("open", () => {
    console.log("[proxy] Connected to Nova");
    novaReady = true;
    // Flush any messages queued while connecting
    pendingMessages.forEach((msg) => novaWs.send(msg));
    pendingMessages.length = 0;
  });

  novaWs.on("message", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data.toString());
    }
  });

  novaWs.on("error", (err) => {
    console.error("[proxy] Nova error:", err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: "error",
        error: { message: "Nova connection error: " + err.message },
      }));
    }
  });

  novaWs.on("close", (code, reason) => {
    console.log(`[proxy] Nova disconnected: ${code} ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason.toString());
    }
  });

  // Client → Nova
  clientWs.on("message", (data) => {
    if (novaReady && novaWs.readyState === WebSocket.OPEN) {
      novaWs.send(data.toString());
    } else {
      // Queue messages until Nova connection is ready
      pendingMessages.push(data.toString());
    }
  });

  clientWs.on("close", () => {
    console.log("[proxy] Client disconnected");
    if (novaWs.readyState === WebSocket.OPEN) {
      novaWs.close();
    }
  });

  clientWs.on("error", (err) => {
    console.error("[proxy] Client error:", err.message);
    if (novaWs.readyState === WebSocket.OPEN) {
      novaWs.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Nova Voice Proxy running on port ${PORT}`);
  console.log(`Origins: ${ALLOWED_ORIGINS ? ALLOWED_ORIGINS.join(", ") : "all"}`);
});

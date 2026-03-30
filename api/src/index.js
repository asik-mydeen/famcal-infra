import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import cron from "node-cron";
import { ALLOWED_ORIGINS } from "./lib/cors.js";

// Import routes
import { dashboardRoutes } from "./routes/dashboard.js";
import { dashboardWriteRoutes } from "./routes/dashboard-write.js";
import { googleTokenRoutes } from "./routes/google-token.js";
import { googleSyncRoutes, syncAllFamilies } from "./routes/google-sync.js";
import { chatRoutes } from "./routes/chat.js";
import { photosRoutes } from "./routes/photos.js";
import { voiceTranscribeRoutes } from "./routes/voice-transcribe.js";
import { voiceTtsRoutes } from "./routes/voice-tts.js";
import { voiceNovaKeyRoutes } from "./routes/voice-nova-key.js";

const app = new Hono();

// Global CORS
app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

// Mount routes
app.route("/api", dashboardRoutes);
app.route("/api", dashboardWriteRoutes);
app.route("/api", googleTokenRoutes);
app.route("/api", googleSyncRoutes);
app.route("/api", chatRoutes);
app.route("/api", photosRoutes);
app.route("/api", voiceTranscribeRoutes);
app.route("/api", voiceTtsRoutes);
app.route("/api", voiceNovaKeyRoutes);

// Cron: Google Calendar sync every 15 minutes
cron.schedule("*/15 * * * *", () => {
  console.log("[cron] Running Google Calendar sync...");
  syncAllFamilies().catch((err) =>
    console.error("[cron] Sync failed:", err.message)
  );
});

// Start server
const PORT = process.env.PORT || 3000;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`FamCal API running on port ${PORT}`);
  console.log(`CORS origins: ${ALLOWED_ORIGINS.join(", ")}`);
});

export default app;

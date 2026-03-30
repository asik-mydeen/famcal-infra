import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { ALLOWED_ORIGINS } from "./lib/cors.js";

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

// Routes will be mounted here as they are migrated
// app.route("/api", dashboardRoutes);
// etc.

const PORT = process.env.PORT || 3000;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`FamCal API running on port ${PORT}`);
  console.log(`CORS origins: ${ALLOWED_ORIGINS.join(", ")}`);
});

export default app;

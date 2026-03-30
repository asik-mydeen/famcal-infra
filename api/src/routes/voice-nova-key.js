import { Hono } from "hono";

export const voiceNovaKeyRoutes = new Hono();

voiceNovaKeyRoutes.get("/voice-nova-key", (c) => {
  const key = process.env.NOVA_API_KEY;
  if (!key) {
    return c.json({ error: "NOVA_API_KEY not configured" }, 500);
  }

  // Return key (in production, add auth check here)
  return c.json({ key });
});

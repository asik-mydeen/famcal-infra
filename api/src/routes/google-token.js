/**
 * /google-token — Exchange Google auth code for access + refresh tokens.
 * Called by the client after GIS initCodeClient returns an authorization code.
 * Stores refresh_token in Supabase family_members for server-side sync.
 *
 * Requires env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY (service role for writes)
 */
import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";

export const googleTokenRoutes = new Hono();

googleTokenRoutes.post("/google-token", async (c) => {
  const { code, memberId, redirectUri } = await c.req.json();
  if (!code || !memberId) {
    return c.json({ error: "Missing code or memberId" }, 400);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.json({ error: "Google OAuth not configured on server (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)" }, 500);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri || "postmessage",
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("[google-token] Token exchange error:", tokenData.error, tokenData.error_description);
      return c.json({ error: tokenData.error_description || tokenData.error }, 400);
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Store refresh_token in Supabase for server-side sync
    let refreshTokenStored = false;
    if (refresh_token) {
      if (!process.env.SUPABASE_SERVICE_KEY) {
        console.warn("[google-token] SUPABASE_SERVICE_KEY not set — using anon key. Refresh token write may fail due to RLS.");
      }
      const { error: dbErr } = await supabaseAdmin
        .from("family_members")
        .update({ google_refresh_token: refresh_token })
        .eq("id", memberId);

      if (dbErr) {
        console.error("[google-token] Failed to store refresh token for", memberId, ":", dbErr.message, "| Key type:", process.env.SUPABASE_SERVICE_KEY ? "service" : "anon");
      } else {
        console.log("[google-token] Refresh token stored for member:", memberId);
        refreshTokenStored = true;
      }
    }

    // Fetch the calendar ID (email) for this account
    let calendarId = "primary";
    try {
      const calRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const calData = await calRes.json();
      calendarId = calData.id || "primary";
    } catch {
      // Non-fatal — use "primary" as fallback
    }

    return c.json({
      access_token,
      expires_in,
      refresh_token: !!refresh_token, // Boolean only — don't expose actual token to client
      refresh_token_stored: refreshTokenStored, // Whether DB write succeeded
      calendarId,
    });
  } catch (err) {
    console.error("[google-token] Exchange failed:", err);
    return c.json({ error: "Token exchange failed: " + err.message }, 500);
  }
});

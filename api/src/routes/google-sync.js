/**
 * /google-sync — Server-side Google Calendar sync using stored refresh tokens.
 * Can be called by Vercel cron or manually by the dashboard.
 *
 * Syncs all members with google_refresh_token in a given family.
 * Uses refresh tokens to get fresh access tokens — no browser needed.
 *
 * Query params:
 *   familyId (required) — which family to sync
 *   token (required) — dashboard_token for auth
 *
 * Requires env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";

export const googleSyncRoutes = new Hono();

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function fetchGoogleEvents(accessToken, calendarId) {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();

  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?` +
    `timeMin=${timeMin}&timeMax=${timeMax}&maxResults=250&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google API ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.items || [];
}

function googleEventToDb(gEvent, memberId, familyId) {
  const isAllDay = !!gEvent.start?.date;
  return {
    family_id: familyId,
    member_id: memberId,
    title: gEvent.summary || "(No title)",
    start_time: isAllDay ? gEvent.start.date : gEvent.start.dateTime,
    end_time: isAllDay ? (gEvent.end?.date || gEvent.start.date) : (gEvent.end?.dateTime || gEvent.start.dateTime),
    all_day: isAllDay,
    color: "primary",
    source: "google",
    google_event_id: gEvent.id,
    updated_at: gEvent.updated || new Date().toISOString(),
  };
}

async function syncFamily(members, familyId) {
  const results = [];

  for (const member of members) {
    if (!member.google_refresh_token || !member.google_calendar_id) continue;

    try {
      // Refresh the access token
      const accessToken = await refreshAccessToken(member.google_refresh_token);

      // Fetch events from Google
      const gEvents = await fetchGoogleEvents(accessToken, member.google_calendar_id);

      // Get ALL existing events for this member (any source) to prevent duplicates
      const memberFamilyId = member.family_id || familyId;
      const { data: existingEvents } = await supabaseAdmin
        .from("events")
        .select("id, google_event_id, updated_at, source, title, start_time")
        .eq("family_id", memberFamilyId)
        .eq("member_id", member.id);

      // Build lookup maps: by google_event_id + by title+start (fallback dedup)
      const byGoogleId = new Map();
      const byTitleStart = new Map();
      for (const e of (existingEvents || [])) {
        if (e.google_event_id) byGoogleId.set(e.google_event_id, e);
        const key = `${e.title}||${e.start_time}`;
        if (!byTitleStart.has(key)) byTitleStart.set(key, e);
      }

      let added = 0, updated = 0, removed = 0;

      // Upsert Google events
      const googleEventIds = new Set();
      for (const gEvent of gEvents) {
        if (gEvent.status === "cancelled") continue;
        googleEventIds.add(gEvent.id);

        const dbEvent = googleEventToDb(gEvent, member.id, memberFamilyId);
        // Check by google_event_id first, then fallback to title+start match
        let existing = byGoogleId.get(gEvent.id);
        if (!existing) {
          const fallbackKey = `${dbEvent.title}||${dbEvent.start_time}`;
          const titleMatch = byTitleStart.get(fallbackKey);
          if (titleMatch && !titleMatch.google_event_id) {
            // Manual event with same title+time — link it instead of duplicating
            existing = titleMatch;
          }
        }

        if (existing) {
          // Update: set google_event_id + source if missing, or update if Google is newer
          const needsLink = !existing.google_event_id || existing.source === "manual";
          const isNewer = gEvent.updated && existing.updated_at && new Date(gEvent.updated) > new Date(existing.updated_at);
          if (needsLink || isNewer) {
            await supabaseAdmin.from("events").update({ ...dbEvent, source: existing.source === "manual" ? "synced" : dbEvent.source }).eq("id", existing.id);
            updated++;
          }
        } else {
          // Insert new event from Google
          const { error: insertErr } = await supabaseAdmin.from("events").insert(dbEvent);
          if (insertErr && insertErr.code === "23505") {
            // Unique constraint violation — event already exists, skip
            console.log(`[google-sync] Skipped duplicate for google_event_id=${gEvent.id}`);
          } else {
            added++;
          }
        }
      }

      // Remove events deleted from Google (only google/synced source, not manual)
      for (const [googleId, existing] of byGoogleId) {
        if (googleId && !googleEventIds.has(googleId) && (existing.source === "google" || existing.source === "synced")) {
          await supabaseAdmin.from("events").delete().eq("id", existing.id);
          removed++;
        }
      }

      // PUSH: Send local manual events TO Google Calendar
      let pushed = 0;
      const { data: localEvents } = await supabaseAdmin
        .from("events")
        .select("*")
        .eq("family_id", memberFamilyId)
        .eq("member_id", member.id)
        .eq("source", "manual")
        .is("google_event_id", null);

      for (const evt of (localEvents || [])) {
        try {
          const isAllDay = evt.all_day;
          const gEvent = isAllDay
            ? { summary: evt.title, start: { date: evt.start_time.split("T")[0] }, end: { date: (evt.end_time || evt.start_time).split("T")[0] } }
            : { summary: evt.title, start: { dateTime: evt.start_time }, end: { dateTime: evt.end_time || evt.start_time } };

          const createRes = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(member.google_calendar_id)}/events`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(gEvent),
          });

          if (createRes.ok) {
            const created = await createRes.json();
            // Update Supabase with google_event_id so we don't push it again
            await supabaseAdmin.from("events").update({ google_event_id: created.id, source: "synced" }).eq("id", evt.id);
            pushed++;
          }
        } catch (pushErr) {
          console.warn(`[google-sync] Push failed for event "${evt.title}":`, pushErr.message);
        }
      }

      results.push({ member: member.name, added, updated, removed, pushed, total: gEvents.length });
    } catch (err) {
      console.error(`[google-sync] Failed for ${member.name}:`, err.message);
      results.push({ member: member.name, error: err.message });
    }
  }

  return results;
}

googleSyncRoutes.get("/google-sync", async (c) => {
  const familyId = c.req.query("familyId");
  const token = c.req.query("token");

  if (!familyId) return c.json({ error: "Missing familyId" }, 400);

  // Auth: verify dashboard token or cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = c.req.header("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (isCron) {
    // Cron job — authorized for all families
  } else if (token && familyId !== "all") {
    // Dashboard token auth for specific family
    const { data: family } = await supabaseAdmin
      .from("families")
      .select("id, dashboard_token")
      .eq("id", familyId)
      .single();

    if (!family || family.dashboard_token !== token) {
      return c.json({ error: "Invalid token" }, 401);
    }
  } else {
    return c.json({ error: "Unauthorized — provide token or cron secret" }, 401);
  }

  // For cron: sync ALL families that have members with refresh tokens
  // For dashboard: sync only the specified family
  let memberQuery = supabaseAdmin
    .from("family_members")
    .select("id, name, family_id, google_calendar_id, google_refresh_token")
    .not("google_refresh_token", "is", null);

  if (familyId !== "all") {
    memberQuery = memberQuery.eq("family_id", familyId);
  }

  const { data: members, error: membersErr } = await memberQuery;

  if (membersErr) {
    return c.json({ error: "Failed to fetch members: " + membersErr.message }, 500);
  }

  if (!members || members.length === 0) {
    return c.json({ synced: 0, message: "No members with refresh tokens" });
  }

  const results = await syncFamily(members, familyId);

  return c.json({ synced: results.length, results });
});

// Export function for cron to use
export async function syncAllFamilies() {
  const { data: members, error: membersErr } = await supabaseAdmin
    .from("family_members")
    .select("id, name, family_id, google_calendar_id, google_refresh_token")
    .not("google_refresh_token", "is", null);

  if (membersErr) {
    console.error("[google-sync] Failed to fetch members:", membersErr.message);
    return { error: membersErr.message };
  }

  if (!members || members.length === 0) {
    return { synced: 0, message: "No members with refresh tokens" };
  }

  // Group members by family
  const familyMap = new Map();
  for (const member of members) {
    if (!familyMap.has(member.family_id)) {
      familyMap.set(member.family_id, []);
    }
    familyMap.get(member.family_id).push(member);
  }

  // Sync each family
  const allResults = [];
  for (const [familyId, familyMembers] of familyMap) {
    const results = await syncFamily(familyMembers, familyId);
    allResults.push(...results);
  }

  return { synced: allResults.length, results: allResults };
}

import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/dashboard", async (c) => {
  const slug = c.req.query("slug");
  const token = c.req.query("token");

  if (!slug || !token) {
    return c.json({ error: "slug and token required" }, 400);
  }

  try {
    // Validate token against families table
    const { data: family, error: famError } = await supabaseAdmin
      .from("families")
      .select("*")
      .eq("dashboard_slug", slug)
      .eq("dashboard_token", token)
      .single();

    if (famError || !family) {
      return c.json({ error: "Invalid access token" }, 401);
    }

    // Log which key we're using (helps debug RLS issues)
    const usingServiceKey = Boolean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log("[dashboard] Using service role key:", usingServiceKey, "Family:", family.id, family.name);

    // Fetch all family data in parallel
    const [members, events, tasks, meals, lists, rewards, notes, countdowns] = await Promise.all([
      supabaseAdmin.from("family_members").select("*").eq("family_id", family.id),
      supabaseAdmin.from("events").select("*").eq("family_id", family.id),
      supabaseAdmin.from("tasks").select("*").eq("family_id", family.id),
      supabaseAdmin.from("meals").select("*").eq("family_id", family.id),
      supabaseAdmin.from("lists").select("*").eq("family_id", family.id),
      supabaseAdmin.from("rewards").select("*").eq("family_id", family.id),
      supabaseAdmin.from("notes").select("*").eq("family_id", family.id),
      supabaseAdmin.from("countdowns").select("*").eq("family_id", family.id),
    ]);

    // Log any RLS errors
    [members, events, tasks, meals, lists, rewards, notes, countdowns].forEach((r, i) => {
      const names = ["members", "events", "tasks", "meals", "lists", "rewards", "notes", "countdowns"];
      if (r.error) console.error(`[dashboard] ${names[i]} query failed:`, r.error.message);
      else console.log(`[dashboard] ${names[i]}: ${r.data?.length || 0} rows`);
    });

    // Fetch list items for the loaded lists
    let allListItems = [];
    if (lists.data && lists.data.length > 0) {
      const listIds = lists.data.map((l) => l.id);
      const { data: items } = await supabaseAdmin
        .from("list_items")
        .select("*")
        .in("list_id", listIds);
      allListItems = items || [];
    }

    // Merge items into lists
    const listsWithItems = (lists.data || []).map((l) => ({
      ...l,
      items: allListItems.filter((i) => i.list_id === l.id),
    }));

    // Sanitize members — don't expose refresh tokens to client, add boolean flag
    const sanitizedMembers = (members.data || []).map(({ google_refresh_token, ...m }) => ({
      ...m,
      has_server_sync: !!google_refresh_token,
    }));

    return c.json({
      family,
      members: sanitizedMembers,
      events: events.data || [],
      tasks: tasks.data || [],
      meals: meals.data || [],
      lists: listsWithItems,
      rewards: rewards.data || [],
      notes: notes.data || [],
      countdowns: countdowns.data || [],
    });
  } catch (err) {
    console.error("[dashboard] Error:", err.message);
    return c.json({ error: "Failed to load dashboard data" }, 500);
  }
});

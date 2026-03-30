import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";

/**
 * Dashboard Write API — persists mutations from the kiosk/dashboard.
 * Validates dashboard_token before allowing any writes.
 *
 * POST /api/dashboard-write
 * Body: { slug, token, action, table, payload }
 */
export const dashboardWriteRoutes = new Hono();

dashboardWriteRoutes.post("/dashboard-write", async (c) => {
  const { slug, token, action, table, payload } = await c.req.json();

  if (!slug || !token || !action || !table) {
    return c.json({ error: "slug, token, action, table required" }, 400);
  }

  // Allowed tables
  const ALLOWED_TABLES = ["events", "tasks", "meals", "lists", "list_items", "rewards", "notes", "countdowns", "family_members"];
  if (!ALLOWED_TABLES.includes(table)) {
    return c.json({ error: "Invalid table" }, 400);
  }

  // Allowed actions
  if (!["insert", "update", "delete"].includes(action)) {
    return c.json({ error: "Invalid action (insert|update|delete)" }, 400);
  }

  try {
    // Validate token
    const { data: family, error: famError } = await supabaseAdmin
      .from("families")
      .select("id")
      .eq("dashboard_slug", slug)
      .eq("dashboard_token", token)
      .single();

    if (famError || !family) {
      return c.json({ error: "Invalid access token" }, 401);
    }

    let result;

    if (action === "insert") {
      // Ensure family_id is set for top-level tables
      const row = { ...payload };
      if (table !== "list_items") {
        row.family_id = family.id;
      }
      // Remove temp IDs (let Supabase generate UUID)
      if (row.id && (row.id.startsWith("evt-") || row.id.startsWith("task-") || row.id.startsWith("meal-") || row.id.startsWith("list-") || row.id.startsWith("item-") || row.id.startsWith("note-") || row.id.startsWith("cd-") || row.id.startsWith("reward-"))) {
        delete row.id;
      }
      const { data, error } = await supabaseAdmin.from(table).insert(row).select();
      if (error) throw error;
      result = data?.[0];

    } else if (action === "update") {
      const { id, ...rest } = payload;
      if (!id) return c.json({ error: "id required for update" }, 400);
      const { data, error } = await supabaseAdmin.from(table).update(rest).eq("id", id).select();
      if (error) throw error;
      result = data?.[0];

    } else if (action === "delete") {
      const id = typeof payload === "string" ? payload : payload?.id;
      if (!id) return c.json({ error: "id required for delete" }, 400);
      const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
      if (error) throw error;
      result = { deleted: id };
    }

    return c.json({ success: true, data: result });
  } catch (err) {
    console.error("[dashboard-write]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

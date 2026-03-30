import { Hono } from "hono";

// Proxies Google Photos Library API calls (which don't support CORS from browsers)
export const photosRoutes = new Hono();

const PHOTOS_API = "https://photoslibrary.googleapis.com/v1";

photosRoutes.get("/photos", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  const action = c.req.query("action");

  // Health check — verify the function is reachable
  if (action === "ping") {
    return c.json({ ok: true, message: "Photos API proxy is working" });
  }

  try {
    if (action === "albums") {
      // List albums
      const token = authHeader.replace("Bearer ", "");
      console.log("[photos-api] Fetching albums, token starts with:", token.substring(0, 20));

      // First verify token scopes server-side
      const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
      const tokenInfo = await tokenInfoRes.json();
      console.log("[photos-api] Token scopes:", tokenInfo.scope);
      console.log("[photos-api] Has photoslibrary?", tokenInfo.scope?.includes("photoslibrary"));

      const response = await fetch(`${PHOTOS_API}/albums?pageSize=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("[photos-api] Google Photos response status:", response.status);
      const data = await response.json();
      console.log("[photos-api] Response body:", JSON.stringify(data).substring(0, 500));
      if (!response.ok) {
        return c.json(data, response.status);
      }
      return c.json(data);
    }

    return c.json({ error: "Invalid action. Use ?action=albums or ?action=photos" }, 400);
  } catch (err) {
    console.error("[photos-api]", err);
    return c.json({ error: "Photos API request failed" }, 500);
  }
});

photosRoutes.post("/photos", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  try {
    // Search photos in album
    const { albumId } = await c.req.json();
    if (!albumId) {
      return c.json({ error: "albumId required in body" }, 400);
    }
    const response = await fetch(`${PHOTOS_API}/mediaItems:search`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ albumId, pageSize: 50 }),
    });
    const data = await response.json();
    if (!response.ok) {
      return c.json(data, response.status);
    }
    return c.json(data);
  } catch (err) {
    console.error("[photos-api]", err);
    return c.json({ error: "Photos API request failed" }, 500);
  }
});

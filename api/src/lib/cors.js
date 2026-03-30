export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  ALLOWED_ORIGINS.push(
    "https://calendar.asikmydeen.com",
    "tauri://localhost",
    "https://tauri.localhost",
    "http://localhost:3000"
  );
}

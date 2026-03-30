import { Hono } from "hono";

/**
 * /api/voice-tts — Text-to-Speech using OpenAI TTS API.
 * Returns audio/mpeg stream for natural-sounding voice output.
 *
 * POST /api/voice-tts
 * Body: { text: "Hello!", voice?: "nova", speed?: 1.0 }
 * Returns: audio/mpeg binary stream
 *
 * Voices: alloy, echo, fable, onyx, nova (recommended - warm female), shimmer
 * Requires: OPENAI_API_KEY
 */
export const voiceTtsRoutes = new Hono();

voiceTtsRoutes.post("/voice-tts", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  const { text, voice, speed } = await c.req.json();
  if (!text || text.length === 0) {
    return c.json({ error: "text required" }, 400);
  }

  // Limit text length to prevent abuse (OpenAI TTS max is 4096 chars)
  const truncated = text.slice(0, 4096);

  try {
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: truncated,
        voice: voice || "coral",
        instructions: "You are Amara, a warm and friendly family assistant on a wall-mounted calendar. Speak in a cheerful, natural, conversational tone. Be concise and enthusiastic but not over the top. Pronounce names carefully.",
        speed: speed || 1.0,
        response_format: "mp3",
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.json().catch(() => ({}));
      console.error("[tts] OpenAI error:", err);
      return c.json({ error: err.error?.message || "TTS failed" }, ttsRes.status);
    }

    // Stream the audio response directly to the client
    const arrayBuffer = await ttsRes.arrayBuffer();
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache"
      },
    });
  } catch (err) {
    console.error("[tts] Error:", err);
    return c.json({ error: "TTS failed. Please try again." }, 500);
  }
});

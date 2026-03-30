/**
 * /voice-transcribe — Transcribe audio using OpenAI Whisper API.
 *
 * Accepts: multipart/form-data with "audio" file field + optional "prompt" text field
 * The "prompt" field guides Whisper toward expected vocabulary (family names, wake words).
 * Returns: { text: "transcribed text" }
 *
 * Requires env: OPENAI_API_KEY (same key used for /api/chat)
 */
import { Hono } from "hono";

export const voiceTranscribeRoutes = new Hono();

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PROMPT_LENGTH = 500;

voiceTranscribeRoutes.post("/voice-transcribe", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  try {
    // Parse multipart form data using Hono's native parser
    const body = await c.req.parseBody();
    const audioFile = body["audio"] || body["file"];
    const promptText = typeof body["prompt"] === "string"
      ? body["prompt"].slice(0, MAX_PROMPT_LENGTH).trim()
      : "";

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json({ error: "No audio file in request" }, 400);
    }

    if (audioFile.size < 100) {
      return c.json({ error: "Audio too short or empty" }, 400);
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      return c.json({ error: "Audio too large (max 10MB)" }, 413);
    }

    // Send to OpenAI Whisper API
    const formData = new FormData();
    formData.append("file", audioFile, audioFile.name || "audio.webm");
    formData.append("model", "whisper-1");
    formData.append("language", "en");
    formData.append("response_format", "json");

    // Pass prompt to guide Whisper toward expected vocabulary (family names, etc.)
    if (promptText) {
      formData.append("prompt", promptText);
    }

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.json().catch(() => ({}));
      console.error("[whisper] API error:", err);
      return c.json({ error: err.error?.message || "Whisper transcription failed" }, whisperRes.status);
    }

    const result = await whisperRes.json();
    return c.json({ text: result.text || "" });
  } catch (err) {
    console.error("[whisper] Error:", err);
    return c.json({ error: "Transcription failed. Please try again." }, 500);
  }
});

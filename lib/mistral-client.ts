import OpenAI from "openai";

// ponytail: Mistral's OpenAI-compatible endpoint, so the official OpenAI SDK
// drives it with no adapter layer — same chat.completions/tools/streaming shapes.
let client: OpenAI | null = null;

export function getLlmClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: process.env.MISTRAL_BASE_URL ?? "https://api.mistral.ai/v1",
    });
  }
  return client;
}

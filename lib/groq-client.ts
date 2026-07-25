import Groq from "groq-sdk";
import type { Stream } from "groq-sdk/lib/streaming";
import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "groq-sdk/resources/chat/completions";

let client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

/** Default first, fallback second. Override with GROQ_MODELS="a,b". */
export const GROQ_MODELS = (
  process.env.GROQ_MODELS ??
  "llama-3.3-70b-versatile,qwen/qwen3.6-27b"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

type NonStreamingBody = Omit<ChatCompletionCreateParamsNonStreaming, "model">;
type StreamingBody = Omit<ChatCompletionCreateParamsStreaming, "model">;

export function groqChat(body: NonStreamingBody): Promise<Groq.Chat.ChatCompletion>;
export function groqChat(body: StreamingBody): Promise<Stream<Groq.Chat.ChatCompletionChunk>>;
// ponytail: fallback covers the create() call only — a failure mid-stream is not
// retried (would mean replaying already-yielded tokens). Add a buffering wrapper
// if mid-stream drops actually show up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function groqChat(body: NonStreamingBody | StreamingBody): Promise<any> {
  const groq = getGroqClient();
  let lastError: unknown;
  for (const model of GROQ_MODELS) {
    // qwen/gpt-oss spend 100-300 tokens on reasoning that counts against
    // max_tokens (short-budget calls otherwise return empty content) and leak
    // <think> blocks into content unless reasoning_format is hidden.
    const reasoning = /qwen|gpt-oss/.test(model);
    const max_tokens = body.max_tokens && reasoning ? body.max_tokens + 512 : body.max_tokens;
    try {
      return await groq.chat.completions.create({
        ...body,
        max_tokens,
        model,
        ...(reasoning ? { reasoning_format: "hidden" } : {}),
      } as ChatCompletionCreateParams);
    } catch (e) {
      lastError = e;
      console.warn(`groq model ${model} failed, trying next:`, e);
    }
  }
  throw lastError;
}

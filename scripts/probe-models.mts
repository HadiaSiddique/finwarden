// One tiny structured call per candidate model, to see which work on the free tier.
// Usage: npx tsx --env-file=.env.local scripts/probe-models.ts
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { generateText, Output } from "ai";
import { z } from "zod";

const schema = z.object({ urgency: z.boolean(), claimedSender: z.string().nullable() });
const prompt = 'Message: "This is the CEO, pay this now!" Extract: is it urgent, and who does it claim to be from?';

const candidates = [
  ["google", "gemini-3.8-flash"],
  ["google", "gemini-3.5-flash-lite"],
  ["google", "gemini-flash-lite-latest"],
  ["google", "gemini-2.5-flash"],
  ["groq", "openai/gpt-oss-120b"],
  ["groq", "qwen/qwen3.8-27b"],
] as const;

for (const [provider, id] of candidates) {
  const model = provider === "google" ? google(id) : groq(id);
  const t = Date.now();
  try {
    const r = await generateText({ model, output: Output.object({ schema }), prompt, maxRetries: 0 });
    console.log(`OK   ${provider}/${id} ${Date.now() - t}ms`, JSON.stringify(r.output));
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    console.log(`FAIL ${provider}/${id} ${err.statusCode ?? ""} ${(err.message ?? String(e)).slice(0, 160)}`);
  }
}

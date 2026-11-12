// AI calls: provider fallback, result cache, spend caps, Zod validation.
// Anything here returns null on failure; callers fall back to rules only (fail closed).
import { createHash } from "node:crypto";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { generateText, Output, type LanguageModel } from "ai";
import { and, count, eq, gte } from "drizzle-orm";
import type { ZodType } from "zod";
import { getDb, schema } from "@/db";

type Kind = "main" | "fast";

interface Candidate {
  provider: "google" | "groq";
  id: string;
  model: LanguageModel;
  vision: boolean;
}

// Defaults chosen by probing the free tiers on Nov 9, 2026 (see NOTES.md). Env overrides them.
// Gemini's free tier often answers 503 "high demand", so text-only fast tasks try Groq first.
function candidates(kind: Kind, needsVision: boolean): Candidate[] {
  const list = byProvider(kind);
  if (needsVision) return list.filter((c) => c.vision);
  if (kind === "fast") return [...list.filter((c) => c.provider === "groq"), ...list.filter((c) => c.provider !== "groq")];
  return list;
}

function byProvider(kind: Kind): Candidate[] {
  const list: Candidate[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const id = kind === "main" ? (process.env.AI_MODEL ?? "gemini-2.5-flash") : (process.env.AI_FAST_MODEL ?? "gemini-3.5-flash-lite");
    list.push({ provider: "google", id, model: google(id), vision: true });
    // Second Gemini model before leaving the provider, since free quotas are per model.
    const other = kind === "main" ? (process.env.AI_FAST_MODEL ?? "gemini-3.5-flash-lite") : (process.env.AI_MODEL ?? "gemini-2.5-flash");
    list.push({ provider: "google", id: other, model: google(other), vision: true });
  }
  if (process.env.GROQ_API_KEY) {
    const id = process.env.AI_FALLBACK_MODEL ?? "openai/gpt-oss-120b";
    list.push({ provider: "groq", id, model: groq(id), vision: false });
  }
  return list;
}

export function aiConfigured(): boolean {
  return !!(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GROQ_API_KEY);
}

export interface AiResult<T> {
  output: T;
  provider: string;
  model: string;
  cached: boolean;
}

export interface AiRequest<T> {
  task: string;
  schema: ZodType<T>;
  system: string;
  prompt: string;
  images?: { data: Uint8Array; mediaType: string }[];
  kind?: Kind;
  sessionId?: string;
}

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

async function underCaps(sessionId: string): Promise<boolean> {
  const db = await getDb();
  const hourAgo = new Date(Date.now() - 3_600_000);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [{ n: session }] = await db
    .select({ n: count() })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.sessionId, sessionId), eq(schema.aiUsage.cached, false), gte(schema.aiUsage.at, hourAgo)));
  const [{ n: day }] = await db
    .select({ n: count() })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.cached, false), gte(schema.aiUsage.at, dayAgo)));
  return session < Number(process.env.AI_MAX_CALLS_PER_SESSION_PER_HOUR ?? 30) && day < Number(process.env.AI_MAX_CALLS_PER_DAY ?? 200);
}

export async function aiObject<T>(req: AiRequest<T>): Promise<AiResult<T> | null> {
  const db = await getDb();
  const sessionId = req.sessionId ?? "system";
  const key = sha([req.task, req.system, req.prompt, ...(req.images ?? []).map((i) => sha(i.data))].join("\u0000"));

  const [hit] = await db.select().from(schema.aiCache).where(eq(schema.aiCache.key, key));
  if (hit) {
    const parsed = req.schema.safeParse(hit.output);
    if (parsed.success) {
      await db.insert(schema.aiUsage).values({ sessionId, task: req.task, provider: "cache", model: hit.model, cached: true });
      return { output: parsed.data, provider: "cache", model: hit.model, cached: true };
    }
  }

  if (!aiConfigured() || !(await underCaps(sessionId))) return null;

  for (const c of candidates(req.kind ?? "fast", !!req.images?.length)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await generateText({
          model: c.model,
          system: req.system,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: req.prompt }, ...(req.images ?? []).map((i) => ({ type: "image" as const, image: i.data, mediaType: i.mediaType }))],
            },
          ],
          output: Output.object({ schema: req.schema }),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(12_000),
        });
        const parsed = req.schema.safeParse(r.output);
        if (!parsed.success) continue; // retry once, then next provider
        await db.insert(schema.aiCache).values({ key, task: req.task, model: `${c.provider}/${c.id}`, output: parsed.data as object }).onConflictDoNothing();
        await db.insert(schema.aiUsage).values({ sessionId, task: req.task, provider: c.provider, model: c.id, cached: false });
        return { output: parsed.data, provider: c.provider, model: c.id, cached: false };
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        console.warn(`[ai] ${req.task} via ${c.provider}/${c.id} failed${status ? ` (${status})` : ""}: ${(e as Error).message?.slice(0, 120)}`);
        break; // rate limit, timeout or outage: move on to the next candidate
      }
    }
  }
  return null;
}

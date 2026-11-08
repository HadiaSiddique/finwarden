import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { TrustError } from "@/services/core";
import { HttpError } from "./session";

type Ctx = { params: Promise<Record<string, string>> };

// Wraps a route handler: parses JSON with a Zod schema and turns errors into clear responses.
export function handler<T>(schema: ZodType<T> | null, fn: (body: T, req: Request, params: Record<string, string>) => Promise<unknown>) {
  return async (req: Request, ctx?: Ctx) => {
    try {
      const raw = schema ? await req.json().catch(() => ({})) : undefined;
      const body = schema ? schema.parse(raw) : (undefined as T);
      const result = await fn(body, req, (await ctx?.params) ?? {});
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof TrustError) return NextResponse.json({ error: e.message, reasons: e.reasons }, { status: 409 });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request.", issues: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong. Nothing was sent." }, { status: 500 });
    }
  };
}

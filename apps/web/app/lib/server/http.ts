import { NextResponse } from "next/server";
import type { RuleResult } from "../rules";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export function ruleError(result: Exclude<RuleResult, { ok: true }>) {
  return jsonError(result.httpStatus, result.error);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Fall through: treat a missing or invalid body as empty.
  }
  return {};
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

import { NextResponse } from "next/server";
import { CONSENT_TEXT, isInIndia } from "../../../lib/rules";
import {
  clearCustomerCookie,
  getCustomerSessionId,
  setCustomerCookie,
} from "../../../lib/server/auth";
import { createSession, getSession } from "../../../lib/server/db";
import { jsonError, readJson } from "../../../lib/server/http";
import { toCustomerView } from "../../../lib/server/views";

// The customer's current session (polled by the customer screen).
export async function GET() {
  const sessionId = await getCustomerSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  return NextResponse.json(
    { session: session ? toCustomerView(session) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

// Step 1: consent + location. Both are saved with a server timestamp.
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body.consent !== true) {
    return jsonError(400, "Consent is required before the video call");
  }

  const location = body.location as Record<string, unknown> | undefined;
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  const accuracy = location?.accuracy;
  if (!isCoordinate(latitude, 90) || !isCoordinate(longitude, 180)) {
    return jsonError(400, "A valid browser location is required");
  }

  const now = new Date().toISOString();
  const session = await createSession({
    consent_text: CONSENT_TEXT,
    consent_given_at: now,
    latitude,
    longitude,
    location_accuracy_m: typeof accuracy === "number" ? accuracy : null,
    location_captured_at: now,
    in_india: isInIndia(latitude, longitude),
  });

  await setCustomerCookie(session.id);
  return NextResponse.json({ session: toCustomerView(session) }, { status: 201 });
}

// "Start again" after a rejection: forget this browser's session.
export async function DELETE() {
  await clearCustomerCookie();
  return NextResponse.json({ ok: true });
}

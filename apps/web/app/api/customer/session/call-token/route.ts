import { NextResponse } from "next/server";
import { getSession } from "@repo/db";
import { canCustomerJoinCall } from "@repo/kyc";
import { signRoomToken } from "@repo/signaling/token";
import { getCustomerSessionId } from "../../../../lib/server/auth";
import { requireEnv } from "../../../../lib/server/env";
import { jsonError, ruleError } from "../../../../lib/server/http";

export async function POST() {
  const sessionId = await getCustomerSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) return jsonError(401, "Start a KYC session first");

  const rule = canCustomerJoinCall(session);
  if (!rule.ok) return ruleError(rule);

  const token = signRoomToken(requireEnv("SIGNAL_SECRET"), session.id, "customer");
  return NextResponse.json({ token });
}
